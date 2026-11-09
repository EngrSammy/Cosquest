/**
 * End-to-end smoke test for the onboarding steps 1-4 API, plus auth/logout.
 * Two ways to run it:
 *   1. `npm start` in one terminal, then `node test/smoke.js` in another
 *      (talks to whatever BASE_URL/PORT your real server is on).
 *   2. `npm test` - spins up an ephemeral in-memory MongoDB and a throwaway
 *      server instance automatically (see test/runWithMemoryMongo.js), no
 *      real MongoDB or manually-running server needed.
 *
 * Flow tested here matches the real rule: signup is just step 0 of one
 * continuous onboarding process. There's no token yet at that point, and no
 * server-generated id is handed out as a stand-in credential either - every
 * onboarding-step call below is identified by the plain `email` the client
 * already has. Login refuses to issue a token until onboardingComplete is
 * true - so login only ever succeeds *after* onboarding is finished, not before.
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const sendNotification = require('../scripts/sendNotification');
const Quest = require('../src/models/Quest');
const Message = require('../src/models/Message');
const User = require('../src/models/User');
const PasswordReset = require('../src/models/PasswordReset');
const { createCompletionCode } = require('../src/utils/oauth');
const mailer = require('../src/utils/mailer');

// Real, valid, minimal media - not just placeholder bytes. `npm test`'s
// ephemeral Cloudinary stub (see src/utils/imageHost.js, NODE_ENV=test)
// accepts any bytes, but a real Cloudinary account actually decodes
// uploads and correctly rejects garbage - these fixtures work against both.
const REAL_PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

function makeSilentWav(durationSeconds = 1) {
  const sampleRate = 8000;
  const dataSize = sampleRate * durationSeconds * 2; // 16-bit mono
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  // Sample bytes are left at 0 (silence) from Buffer.alloc's zero-fill.
  return buffer;
}
const userModel = require('../src/models/userModel');

async function call(baseUrl, method, path, { token, basicAuth, body, isForm } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (basicAuth) headers.Authorization = `Basic ${Buffer.from(`${basicAuth.identifier}:${basicAuth.password}`).toString('base64')}`;
  let fetchBody = body;
  if (body && !isForm) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}${path}`, { method, headers, body: fetchBody });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    /* no body */
  }
  return { status: res.status, json };
}

async function run(baseUrlArg) {
  const baseUrl = baseUrlArg || process.env.BASE_URL || 'http://localhost:4000';
  let pass = 0;
  let fail = 0;

  function assert(cond, label, extra) {
    if (cond) {
      pass++;
      console.log(`  ok  - ${label}`);
    } else {
      fail++;
      console.log(`FAIL  - ${label}`);
      if (extra) console.log('        ', JSON.stringify(extra));
    }
  }

  const c = (method, path, opts) => call(baseUrl, method, path, opts);
  const email = `hero_${Date.now()}@example.com`;
  const password = 'Quest@1234';

  console.log('\n--- health ---');
  {
    const r = await c('GET', '/health');
    assert(r.status === 200 && r.json.ok === true, 'GET /health -> 200 { ok: true }', r);
  }

  console.log('\n--- signup (session starts immediately) ---');
  {
    const r = await c('POST', '/api/auth/signup', { body: { email: `weak_${Date.now()}@example.com`, password: 'quest1234', confirmPassword: 'quest1234' } });
    assert(r.status === 400, 'POST /api/auth/signup (weak password) -> 400', r);
  }
  {
    const r = await c('POST', '/api/auth/signup', { body: { email, password, confirmPassword: password } });
    assert(r.status === 201 && r.json.token && r.json.onboardingRequired === true, 'POST /api/auth/signup -> 201, token and onboardingRequired', r);
  }
  {
    // Onboarding isn't complete yet for this email - a repeat signup is the
    // same person coming back, not a real conflict, so it resumes (200)
    // instead of dead-ending them with a duplicate-email error.
    const r = await c('POST', '/api/auth/signup', { body: { email, password, confirmPassword: password } });
    assert(
      r.status === 200 && r.json.resumed === true && r.json.user.email === email,
      'POST /api/auth/signup (email, onboarding not finished yet) -> 200, resumes the same incomplete account',
      r
    );
  }
  {
    const username = `Nova${Date.now()}`.slice(0, 20);
    const r = await c('POST', '/api/auth/signup', {
      body: { identifier: username, password, confirmPassword: password },
    });
    assert(
      r.status === 201 && r.json.user.profile.username === username,
      'POST /api/auth/signup (username + password) -> 201 and username becomes the profile username',
      r
    );
    const readByUsername = await c('GET', `/api/users/me?identifier=${username}`);
    assert(
      readByUsername.status === 200 && readByUsername.json.user.profile.username === username,
      'GET /api/users/me?identifier=username works before sign-in',
      readByUsername
    );
    const duplicate = await c('POST', '/api/auth/signup', {
      body: { identifier: username, password, confirmPassword: password },
    });
    assert(
      duplicate.status === 200 && duplicate.json.resumed === true,
      'POST /api/auth/signup (username, onboarding not finished yet) -> 200, resumes the same incomplete account',
      duplicate
    );
  }
  {
    const r = await c('POST', '/api/auth/login', { body: { email, password: 'wrong' } });
    assert(r.status === 401, 'POST /api/auth/login (wrong password) -> 401', r);
  }
  {
    // Login now succeeds even mid-onboarding, so a returning user can pick
    // up a real token and continue - requireCompletedOnboarding is what
    // actually protects every real feature, not login itself.
    const r = await c('POST', '/api/auth/login', { body: { email, password } });
    assert(
      r.status === 200 && r.json.token && r.json.onboardingRequired === true && r.json.user.onboardingComplete === false,
      'POST /api/auth/login (onboarding not complete yet) -> 200 + token + onboardingRequired: true',
      r
    );
    // The token works to continue onboarding, but requireCompletedOnboarding
    // still blocks every real feature - a mid-onboarding token is not a
    // backdoor into the app.
    const points = await c('GET', '/api/users/me/points', { token: r.json.token });
    assert(points.status === 403, 'GET /api/users/me/points with a mid-onboarding token -> still 403', points);
  }
  {
    const r = await c('GET', '/api/users/me');
    assert(r.status === 401, 'GET /api/users/me with NO email and NO token -> 401', r);
  }

  console.log('\n--- step 1: profile (identified by email - no token exists yet) ---');
  {
    const r = await c('GET', `/api/users/me?email=${email}`);
    assert(r.status === 200 && r.json.user.email === email, 'GET /api/users/me?email=... -> matches signed-up email', r);
  }
  {
    const r = await c('GET', `/api/users/check-username?username=Ravencaller&email=${email}`);
    assert(r.status === 200 && r.json.available === true, 'GET check-username (free) -> available:true', r);
  }
  {
    const r = await c('PATCH', '/api/users/me/profile', {
      body: { email, firstName: 'Alex', lastName: 'Rivera', username: 'Ravencaller', age: 24, gender: 'Female' },
    });
    assert(
      r.status === 200 && r.json.user.profile.username === 'Ravencaller',
      'PATCH /api/users/me/profile -> profile saved',
      r
    );
  }
  {
    const emailDuplicateUsername = `duplicate_${Date.now()}@example.com`;
    await c('POST', '/api/auth/signup', { body: { email: emailDuplicateUsername, password, confirmPassword: password } });
    const r = await c('PATCH', '/api/users/me/profile', {
      body: { email: emailDuplicateUsername, username: 'Ravencaller' },
    });
    assert(r.status === 409, 'PATCH /api/users/me/profile (duplicate username) -> 409', r);
  }
  {
    const r = await c('PATCH', '/api/users/me/avatar', { body: { email, avatar: 'green-knight' } });
    assert(
      r.status === 200 && r.json.user.profile.avatarKey === 'green-knight',
      'PATCH /api/users/me/avatar -> saved',
      r
    );
  }
  {
    const r = await c('PATCH', '/api/users/me/avatar', { body: { email, avatar: 'not-a-real-avatar' } });
    assert(r.status === 400, 'PATCH /api/users/me/avatar (invalid key) -> 400', r);
  }
  {
    // multipart/form-data - email travels as a form field, not JSON, since
    // there's no token yet; confirms identifyUser reading it after multer parses the body.
    const form = new FormData();
    form.append('email', email);
    form.append('photo', new Blob([REAL_PNG_BYTES], { type: 'image/png' }), 'test.png');
    const r = await c('POST', '/api/users/me/avatar/photo', { body: form, isForm: true });
    assert(
        r.status === 200 &&
        typeof r.json.user.profile.avatarPhotoUrl === 'string' &&
        r.json.user.profile.avatarPhotoUrl.includes('res.cloudinary.com'),
      'POST /api/users/me/avatar/photo (email as a form field, no token) -> Cloudinary URL set',
      r
    );
  }
  {
    // Regression: some real clients (including some Postman/OS combinations)
    // send the non-standard 'image/jpg' instead of the correct 'image/jpeg'
    // for a plain .jpg file - a real JPEG must not be rejected over this.
    const form = new FormData();
    form.append('email', email);
    form.append('photo', new Blob([REAL_PNG_BYTES], { type: 'image/jpg' }), 'passport.jpg');
    const r = await c('POST', '/api/users/me/avatar/photo', { body: form, isForm: true });
    assert(r.status === 200, 'POST /api/users/me/avatar/photo (.jpg sent as image/jpg, not image/jpeg) -> accepted', r);
  }
  {
    // A genuinely unsupported type is a client mistake, not a server failure -
    // 400 with the actual received mimetype named, not a bare 500.
    const form = new FormData();
    form.append('email', email);
    form.append('photo', new Blob([REAL_PNG_BYTES], { type: 'application/pdf' }), 'passport.pdf');
    const r = await c('POST', '/api/users/me/avatar/photo', { body: form, isForm: true });
    assert(
      r.status === 400 && typeof r.json.error === 'string' && r.json.error.includes('application/pdf'),
      'POST /api/users/me/avatar/photo (unsupported type) -> 400, names the received mimetype',
      r
    );
  }
  {
    // 'application/octet-stream' is a client's "couldn't detect the type"
    // fallback (some Postman/OS combinations send this for a real photo) -
    // it must pass through to Cloudinary's real content check, not get
    // blocked purely for carrying a generic label.
    const form = new FormData();
    form.append('email', email);
    form.append('photo', new Blob([REAL_PNG_BYTES], { type: 'application/octet-stream' }), 'photo');
    const r = await c('POST', '/api/users/me/avatar/photo', { body: form, isForm: true });
    assert(r.status === 200, 'POST /api/users/me/avatar/photo (generic application/octet-stream label) -> accepted', r);
  }
  {
    // A mobile image picker mislabeling a real photo asset as 'text/plain' is
    // still a genuine file part (it has a filename, which is why it reaches
    // this filter at all) - it must pass through to Cloudinary's real check.
    const form = new FormData();
    form.append('email', email);
    form.append('photo', new Blob([REAL_PNG_BYTES], { type: 'text/plain' }), 'photo.jpg');
    const r = await c('POST', '/api/users/me/avatar/photo', { body: form, isForm: true });
    assert(r.status === 200, 'POST /api/users/me/avatar/photo (mislabeled text/plain) -> accepted', r);
  }
  {
    // Regression: the preset avatar (a small badge) and the uploaded photo
    // (the main picture) coexist by design - setting one must not wipe the
    // other, in either direction.
    const r = await c('PATCH', '/api/users/me/avatar', { body: { email, avatar: 'pink-idol' } });
    assert(
      r.status === 200 &&
        r.json.user.profile.avatarKey === 'pink-idol' &&
        typeof r.json.user.profile.avatarPhotoUrl === 'string' &&
        r.json.user.profile.avatarPhotoUrl.includes('res.cloudinary.com'),
      'PATCH /api/users/me/avatar -> sets the badge without clearing the existing uploaded photo',
      r
    );
  }
  {
    const r = await c('GET', '/api/meta/avatars');
    assert(
      r.status === 200 &&
        Array.isArray(r.json.avatars) &&
        r.json.avatars.length === 100 &&
        r.json.avatars[0].key &&
        r.json.avatars[0].imageUrl.startsWith('http'),
      'GET /api/meta/avatars -> 100 illustrated options with full image URLs',
      r
    );
  }

  console.log('\n--- contact options (pre-login, identifier + password required either way) ---');
  {
    // Missing password entirely - the plain identifyUser pattern (email
    // alone) is NOT enough for contact, since it holds more sensitive PII
    // (phone, business address) than the other onboarding-step fields.
    const r = await c('PATCH', '/api/users/me/contact', { body: { email, phone: '+2348148327836' } });
    assert(r.status === 401, 'PATCH contact (pre-login, no password) -> 401', r);
  }
  {
    const r = await c('PATCH', '/api/users/me/contact', { body: { email, password: 'wrong-password', phone: '+2348148327836' } });
    assert(r.status === 401, 'PATCH contact (pre-login, wrong password) -> 401', r);
  }
  {
    const r = await c('PATCH', '/api/users/me/contact', {
      body: { email, password, phone: '+2348148327836', businessAddress: '14 CosQuest Way, Lagos' },
    });
    assert(r.status === 200 && r.json.contact.phone === '+2348148327836', 'PATCH contact (pre-login, correct email + password) -> saved', r);
  }
  {
    // GET has no body to carry identifier+password in, so it uses standard
    // HTTP Basic Auth instead of a JSON body - this way the password never
    // has to sit in the URL (which would leak into logs/history).
    const r = await c('GET', '/api/users/me/contact');
    assert(r.status === 401, 'GET contact (pre-login, no credentials at all) -> 401', r);
  }
  {
    const r = await c('GET', '/api/users/me/contact', { basicAuth: { identifier: email, password: 'wrong-password' } });
    assert(r.status === 401, 'GET contact (pre-login, Basic auth with wrong password) -> 401', r);
  }
  {
    const r = await c('GET', '/api/users/me/contact', { basicAuth: { identifier: email, password } });
    assert(r.status === 200 && r.json.contact.phone === '+2348148327836', 'GET contact (pre-login, Basic auth with correct email + password) -> saved values', r);
  }
  {
    // Regression: this app's own password policy allows a colon as the
    // "special character" (e.g. "Quest@12:34"). Basic Auth packs
    // identifier:password into one base64 blob, so decoding must split on
    // the FIRST colon only - a naive split(':') would silently truncate the
    // password right here and always fail a legitimate user.
    const colonEmail = `colonpw_${Date.now()}@example.com`;
    const colonPassword = 'Quest@12:34';
    await c('POST', '/api/auth/signup', { body: { email: colonEmail, password: colonPassword, confirmPassword: colonPassword } });
    const r = await c('GET', '/api/users/me/contact', { basicAuth: { identifier: colonEmail, password: colonPassword } });
    assert(r.status === 200, 'GET contact (pre-login, Basic auth, password contains a colon) -> still authenticates correctly', r);
  }

  console.log('\n--- step 2: faction ---');
  {
    const r = await c('GET', '/api/factions');
    assert(r.status === 200 && r.json.factions.length === 6 && !r.json.factionless, 'GET /api/factions -> 6 required factions', r);
  }
  {
    const r = await c('POST', '/api/users/me/faction', { body: { email, factionKey: 'ascendants' } });
    assert(r.status === 200 && r.json.user.faction === 'ascendants', 'POST faction "ascendants" -> saved', r);
  }
  {
    const r = await c('POST', '/api/users/me/faction', { body: { email, factionKey: 'bogus' } });
    assert(r.status === 400, 'POST faction (invalid key) -> 400', r);
  }
  {
    const r = await c('POST', '/api/users/me/faction', { body: { email, factionKey: 'none' } });
    assert(r.status === 400, 'POST faction "none" -> 400 (a faction is required)', r);
  }

  console.log('\n--- step 3: interests ---');
  {
    const r = await c('GET', '/api/interests');
    assert(r.status === 200 && r.json.interests.length === 12, 'GET /api/interests -> 12 interests', r);
  }
  {
    const r = await c('PUT', '/api/users/me/interests', {
      body: { email, interests: ['anime', 'comic', 'cosplay'] },
    });
    assert(r.status === 200 && r.json.user.interests.length === 3, 'PUT interests -> saved 3', r);
  }
  {
    const r = await c('PUT', '/api/users/me/interests', { body: { email, interests: ['not-a-real-key'] } });
    assert(r.status === 400, 'PUT interests (invalid key) -> 400', r);
  }

  console.log('\n--- step 4: notification preferences ---');
  {
    const r = await c('PATCH', '/api/users/me/preferences/notifications', {
      body: { email, notificationsEnabled: true },
    });
    assert(
      r.status === 200 && r.json.user.preferences.notificationsEnabled === true,
      'PATCH preferences/notifications -> saved',
      r
    );
  }
  {
    const r = await c('POST', '/api/users/me/devices', {
      body: { email, pushToken: 'fake-fcm-token-123', platform: 'web' },
    });
    assert(r.status === 200 && r.json.user.devices.length === 1, 'POST devices -> registered 1 device', r);
  }

  console.log('\n--- finish onboarding, then login (only now does login succeed) ---');
  let token;
  {
    const r = await c('POST', '/api/users/me/onboarding/complete', {
      body: { email, location: { locationEnabled: true, radiusMiles: 50, lat: 6.5244, lng: 3.3792 } },
    });
    assert(r.status === 200 && r.json.user.onboardingComplete === true, 'POST onboarding/complete -> true', r);
  }
  {
    // Now that onboarding is genuinely finished, a repeat signup is a real
    // conflict again - not a resume.
    const r = await c('POST', '/api/auth/signup', { body: { email, password, confirmPassword: password } });
    assert(r.status === 409, 'POST /api/auth/signup (email, onboarding already finished) -> 409, a real duplicate', r);
  }
  {
    const r = await c('GET', `/api/users/me?email=${email}`);
    const u = r.json.user;
    assert(
      u.profile.username === 'Ravencaller' &&
        u.faction === 'ascendants' &&
        u.interests.length === 3 &&
        u.onboardingComplete === true &&
        u.passwordHash === undefined,
      'GET /api/users/me?email=... (final) -> full onboarded state, no passwordHash leaked',
      u
    );
  }
  {
    const r = await c('POST', '/api/auth/login', { body: { email, password } });
    assert(
      r.status === 200 && r.json.token && r.json.message === 'Logged in successfully.',
      'POST /api/auth/login (onboarding now complete) -> 200 + token + success message',
      r
    );
    token = r.json.token;
  }
  {
    assert(jwt.decode(token).exp === undefined, 'login token has no time-based expiration', jwt.decode(token));
  }
  {
    const r = await c('GET', '/api/factions');
    const ascendants = r.json.factions?.find((f) => f.key === 'ascendants');
    assert(
      r.status === 200 && ascendants?.memberCount >= 1 && Array.isArray(ascendants?.perks) && ascendants.perks.length > 0,
      'GET /api/factions -> live memberCount and a perks list per faction',
      r
    );
  }
  {
    const r = await c('GET', '/api/factions/ascendants/members');
    assert(r.status === 200 && r.json.users.some((u) => u.username === 'Ravencaller'), 'GET /api/factions/:key/members -> includes an onboarded member of that faction', r);
  }
  {
    const r = await c('GET', '/api/factions/not-a-real-faction/members');
    assert(r.status === 404, 'GET /api/factions/:key/members (invalid key) -> 404', r);
  }
  {
    const previousToken = token;
    const r = await c('POST', '/api/auth/login', { body: { identifier: 'Ravencaller', password } });
    assert(r.status === 200 && r.json.token, 'POST /api/auth/login (username + password) -> 200 + token', r);
    token = r.json.token;
    const stale = await c('GET', '/api/users/me/notifications', { token: previousToken });
    assert(stale.status === 401, 'signing in again invalidates the previous token (one active session per account)', stale);
  }

  console.log('\n--- forgot / reset password ---');
  {
    // A throwaway account, not the shared `email` fixture - later blocks in
    // this file keep logging into that one with its original password.
    const resetEmail = `reset_${Date.now()}@example.com`;
    const originalPassword = 'Quest@1234';
    const newPassword = 'NewPass@1234';
    await c('POST', '/api/auth/signup', { body: { email: resetEmail, password: originalPassword, confirmPassword: originalPassword } });
    const userDoc = await User.findOne({ email: resetEmail });

    const unknown = await c('POST', '/api/auth/forgot-password', { body: { email: 'no-such-account@example.com' } });
    assert(unknown.status === 200, 'POST /api/auth/forgot-password (unknown email) -> 200, same generic response either way (no account enumeration)', unknown);
    assert(mailer.testSentEmails.length === 0, 'no email sent for an unknown account', mailer.testSentEmails);

    const forgot = await c('POST', '/api/auth/forgot-password', { body: { email: resetEmail } });
    assert(forgot.status === 200, 'POST /api/auth/forgot-password (known email) -> 200', forgot);
    const sent = mailer.testSentEmails.at(-1);
    const code = sent?.text.match(/(\d{6})/)?.[1];
    assert(sent?.to === resetEmail && /^\d{6}$/.test(code || ''), 'a six-digit code is emailed to the address on file (captured here in test mode, never actually sent)', sent);

    const wrongCode = await c('POST', '/api/auth/reset-password', { body: { email: resetEmail, code: code === '000000' ? '111111' : '000000', newPassword, confirmPassword: newPassword } });
    assert(wrongCode.status === 400, 'POST /api/auth/reset-password (wrong code) -> 400', wrongCode);

    const badConfirm = await c('POST', '/api/auth/reset-password', { body: { email: resetEmail, code, newPassword, confirmPassword: 'Different@1234' } });
    assert(badConfirm.status === 400, 'POST /api/auth/reset-password (confirmPassword mismatch) -> 400', badConfirm);

    const success = await c('POST', '/api/auth/reset-password', { body: { email: resetEmail, code, newPassword, confirmPassword: newPassword } });
    assert(success.status === 200 && success.json.token, 'POST /api/auth/reset-password (correct code) -> 200, signs the caller straight in', success);

    const reuse = await c('POST', '/api/auth/reset-password', { body: { email: resetEmail, code, newPassword: 'Another@1234', confirmPassword: 'Another@1234' } });
    assert(reuse.status === 400, 'a consumed reset code cannot be reused', reuse);

    const oldLogin = await c('POST', '/api/auth/login', { body: { email: resetEmail, password: originalPassword } });
    assert(oldLogin.status === 401, 'the old password no longer works after a reset', oldLogin);
    const newLogin = await c('POST', '/api/auth/login', { body: { email: resetEmail, password: newPassword } });
    assert(newLogin.status === 200 && newLogin.json.token, 'the new password works after a reset', newLogin);

    await c('POST', '/api/auth/forgot-password', { body: { email: resetEmail } });
    const secondCode = mailer.testSentEmails.at(-1).text.match(/(\d{6})/)?.[1];
    assert(secondCode && secondCode !== code, 'requesting again issues a fresh code (almost certainly different from the first)', { code, secondCode });
    const rowsForAccount = await PasswordReset.countDocuments({ user: userDoc._id });
    assert(rowsForAccount === 1, 'a second request replaces the outstanding code instead of adding a second one', { rowsForAccount });

    // Simulate the 5-minute expiry without waiting for it - same technique
    // chatAttachments.js already uses for pin/message age (backdate a
    // timestamp directly rather than sleeping in the test).
    await PasswordReset.updateOne({ user: userDoc._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await c('POST', '/api/auth/reset-password', { body: { email: resetEmail, code: secondCode, newPassword: 'Expired@1234', confirmPassword: 'Expired@1234' } });
    assert(expired.status === 400, 'an expired code is rejected even though it is otherwise correct', expired);

    // Enough wrong guesses locks the code out (brute-force protection) -
    // loop rather than hardcode the exact attempt cap, so this doesn't break
    // if that number is later tuned.
    await PasswordReset.updateOne(
      { user: userDoc._id },
      { $set: { expiresAt: new Date(Date.now() + 5 * 60 * 1000), attempts: 0, codeHash: crypto.createHash('sha256').update('999999').digest('hex') } }
    );
    let lockedOut = null;
    for (let i = 0; i < 10 && !lockedOut; i++) {
      const attempt = await c('POST', '/api/auth/reset-password', { body: { email: resetEmail, code: '111222', newPassword, confirmPassword: newPassword } });
      if (attempt.status === 429) lockedOut = attempt;
    }
    assert(lockedOut !== null, 'enough wrong guesses locks the code out (429) instead of allowing unlimited brute-force attempts', lockedOut);

    // Two different accounts can never hold the same active code at the same
    // time - enforced by PasswordReset's unique codeHash index (see
    // issueResetCode's retry loop in authController.js). Proven directly at
    // the data layer here, since forcing two real requests to collide on a
    // random 6-digit code (1-in-a-million) isn't something a test can trigger
    // on demand.
    const otherEmail = `reset2_${Date.now()}@example.com`;
    await c('POST', '/api/auth/signup', { body: { email: otherEmail, password: originalPassword, confirmPassword: originalPassword } });
    const otherUserDoc = await User.findOne({ email: otherEmail });
    const sharedHash = crypto.createHash('sha256').update('424242').digest('hex');
    await PasswordReset.findOneAndUpdate(
      { user: otherUserDoc._id },
      { $set: { codeHash: sharedHash, expiresAt: new Date(Date.now() + 5 * 60 * 1000), attempts: 0 } },
      { upsert: true }
    );
    let collision = null;
    try {
      await PasswordReset.findOneAndUpdate(
        { user: userDoc._id },
        { $set: { codeHash: sharedHash, expiresAt: new Date(Date.now() + 5 * 60 * 1000), attempts: 0 } },
        { upsert: true }
      );
    } catch (error) {
      collision = error;
    }
    assert(collision?.code === 11000, 'the database itself refuses to let two accounts hold the same active code (what issueResetCode retries against)', collision);
  }
  {
    // The welcome notification was created at signup - only visible now, after onboarding + login.
    const r = await c('GET', '/api/users/me/notifications', { token });
    assert(
      r.status === 200 &&
        r.json.notifications.length === 1 &&
        r.json.notifications[0].message.includes('Welcome to CosQuest') &&
        r.json.notifications[0].read === false,
      'GET /api/users/me/notifications (right after first login) -> welcome message waiting, unread',
      r.json
    );
  }
  {
    // Bearer token also works for post-login edits (e.g. changing faction later), not just email.
    const r = await c('GET', '/api/users/me', { token });
    assert(r.status === 200 && r.json.user.email === email, 'GET /api/users/me with Bearer token (post-login) -> works too', r);
  }
  console.log('\n--- location preferences (required at onboarding, updatable afterward) ---');
  {
    const r = await c('PATCH', '/api/users/me/preferences/location', { token, body: { locationEnabled: true, lat: 200, lng: 3.3792 } });
    assert(r.status === 400, 'PATCH preferences/location (lat out of range) -> 400', r);
  }
  {
    const r = await c('PATCH', '/api/users/me/preferences/location', {
      token,
      body: { locationEnabled: true, lat: 6.5244, lng: 3.3792, radiusMiles: 500 },
    });
    assert(r.status === 400, 'PATCH preferences/location (radiusMiles out of range) -> 400', r);
  }
  {
    const r = await c('PATCH', '/api/users/me/preferences/location', { token, body: { locationEnabled: false } });
    assert(
      r.status === 200 && r.json.user.preferences.locationEnabled === false && r.json.user.location.lat === null,
      'PATCH preferences/location (disable) -> clears saved coordinates',
      r
    );
  }
  {
    const r = await c('PATCH', '/api/users/me/preferences/location', {
      token,
      body: { locationEnabled: true, radiusMiles: 75, lat: 6.5244, lng: 3.3792 },
    });
    assert(
      r.status === 200 &&
        r.json.user.preferences.locationEnabled === true &&
        r.json.user.preferences.radiusMiles === 75 &&
        r.json.user.location.lat === 6.5244,
      'PATCH preferences/location (enable) -> saved coordinates and radius',
      r
    );
  }

  console.log('\n--- Home Dashboard quests ---');
  if (mongoose.connection.readyState === 1) {
    const now = Date.now();
    const questBase = {
      description: 'A test quest for the Home Dashboard.',
      location: { name: 'Test Square', address: 'Lagos', lat: 6.5244, lng: 3.3792 },
      prizePool: { amount: 50000, currency: 'NGN' },
      entryFee: { amount: 500, currency: 'NGN' },
      maxParticipants: 2,
      interests: ['anime', 'cosplay'],
      isPublished: true,
    };
    const liveQuest = await Quest.create({
      ...questBase, slug: `live-test-${Date.now()}`, title: 'Live Test Quest', status: 'live',
      startsAt: new Date(now - 60 * 60 * 1000), endsAt: new Date(now + 60 * 60 * 1000),
    });
    await Quest.create({
      ...questBase, slug: `upcoming-test-${Date.now()}`, title: 'Upcoming Test Quest', status: 'upcoming',
      startsAt: new Date(now + 24 * 60 * 60 * 1000), endsAt: new Date(now + 26 * 60 * 60 * 1000),
    });
    const ascendantsQuest = await Quest.create({
      ...questBase, slug: `ascendants-test-${Date.now()}`, title: 'Ascendants Test Quest', status: 'upcoming', faction: 'ascendants',
      startsAt: new Date(now + 24 * 60 * 60 * 1000), endsAt: new Date(now + 26 * 60 * 60 * 1000),
    });
    {
      const r = await c('GET', `/api/quests/${ascendantsQuest._id}`);
      assert(r.status === 200 && r.json.quest.faction === 'ascendants', 'GET one quest -> carries its faction tag', r);
    }
    {
      const r = await c('GET', '/api/quests?status=upcoming&faction=ascendants&lat=6.5244&lng=3.3792&radiusMiles=30');
      assert(
        r.status === 200 && r.json.quests.every((q) => q.faction === 'ascendants') && r.json.quests.some((q) => q.id === String(ascendantsQuest._id)),
        'GET /api/quests?faction= -> filters to just that faction\'s quests',
        r
      );
    }
    {
      const r = await c('GET', '/api/factions');
      const ascendants = r.json.factions?.find((f) => f.key === 'ascendants');
      assert(r.status === 200 && ascendants?.activeQuestCount >= 1, 'GET /api/factions -> activeQuestCount reflects the tagged quest', r);
    }
    {
      const controllers = (await c('GET', '/api/factions')).json.factions?.find((f) => f.key === 'controllers');
      assert(controllers?.activeQuestCount === 0, 'GET /api/factions -> untagged faction has activeQuestCount 0, not a made-up number', controllers);
    }
    {
      const r = await c('GET', '/api/home/dashboard', { token });
      assert(r.status === 200 && r.json.location.source === 'user' && r.json.liveQuest?.id === String(liveQuest._id) && r.json.upcomingQuests.length >= 1, 'GET /api/home/dashboard -> greeting anchored to the user\'s own saved location, live quest, and upcoming quests', r);
    }
    {
      const r = await c('GET', '/api/quests?status=live&lat=6.5244&lng=3.3792&radiusMiles=30');
      assert(r.status === 200 && r.json.quests.some((quest) => quest.id === String(liveQuest._id)), 'GET /api/quests -> finds nearby live quests', r);
    }
    {
      const r = await c('GET', `/api/quests/${liveQuest._id}`);
      assert(r.status === 200 && r.json.quest.id === String(liveQuest._id), 'GET one quest -> public quest details', r);
    }
    {
      const r = await c('POST', `/api/quests/${liveQuest._id}/registrations`, { token });
      assert(r.status === 201 && r.json.quest.registrationCount === 1 && r.json.quest.isRegistered, 'POST quest registration -> joined and count updated', r);
    }
    {
      const r = await c('POST', `/api/quests/${liveQuest._id}/registrations`, { token });
      assert(r.status === 409, 'POST duplicate quest registration -> 409', r);
    }
    {
      const r = await c('DELETE', `/api/quests/${liveQuest._id}/registrations`, { token });
      assert(r.status === 200 && r.json.quest.registrationCount === 0 && !r.json.quest.isRegistered, 'DELETE quest registration -> cancelled and count updated', r);
    }
    {
      const r = await c('GET', '/api/users/Ravencaller/quests?status=cancelled');
      assert(r.status === 200 && r.json.quests.some((item) => item.quest.id === String(liveQuest._id)), 'GET public quest history -> registered quest is listed', r);
    }
  } else {
    console.log('  skip - Home Dashboard API fixture requires the in-process test database');
  }

  console.log('\n--- OAuth completion-code exchange ---');
  if (mongoose.connection.readyState === 1) {
    const oauthUser = await userModel.createUser({ username: `Oauth${Date.now()}`.slice(0, 20) });
    const oauthCode = await createCompletionCode(oauthUser.id);
    const r = await c('POST', '/api/auth/oauth/exchange', { body: { oauthCode } });
    assert(r.status === 200 && r.json.token && r.json.onboardingRequired === true, 'POST OAuth exchange -> token + onboarding required for new OAuth user', r);
    const dashboard = await c('GET', '/api/home/dashboard', { token: r.json.token });
    assert(dashboard.status === 403, 'incomplete OAuth user cannot open the Home Dashboard', dashboard);
    const usedAgain = await c('POST', '/api/auth/oauth/exchange', { body: { oauthCode } });
    assert(usedAgain.status === 400, 'POST OAuth exchange (used code) -> 400', usedAgain);
  }

  console.log('\n--- one-shot onboarding (matches the front-end: everything submitted together at finishOnb()) ---');
  let token2;
  let username2;
  {
    const email2 = `hero2_${Date.now()}@example.com`;
    username2 = `Jamie${Date.now()}`.slice(0, 20);
    await c('POST', '/api/auth/signup', { body: { email: email2, password, confirmPassword: password } });

    const r = await c('POST', '/api/users/me/onboarding/complete', {
      body: {
        email: email2,
        profile: { firstName: 'Jamie', lastName: 'Cruz', username: username2, age: 29, gender: 'Male', avatar: 'caped-champion' },
        faction: 'icons',
        interests: ['game', 'scifi'],
        preferences: { notificationsEnabled: true },
        location: { locationEnabled: true, radiusMiles: 50, lat: 6.5244, lng: 3.3792 },
      },
    });
    assert(
      r.status === 200 &&
        r.json.user.faction === 'icons' &&
        r.json.user.interests.length === 2 &&
        r.json.user.profile.avatarKey === 'caped-champion' &&
        r.json.user.onboardingComplete === true,
      'POST onboarding/complete (one-shot, full payload, via email) -> everything set + onboardingComplete true in a single call',
      r.json
    );

    const login2 = await c('POST', '/api/auth/login', { body: { email: email2, password } });
    assert(login2.status === 200 && login2.json.token, 'POST /api/auth/login (one-shot user, onboarding done) -> 200 + token', login2);
    token2 = login2.json.token;
  }
  {
    const email3 = `hero3_${Date.now()}@example.com`;
    await c('POST', '/api/auth/signup', { body: { email: email3, password, confirmPassword: password } });

    const r = await c('POST', '/api/users/me/onboarding/complete', {
      body: { email: email3, profile: { username: 'ab' }, faction: 'not-a-real-faction' }, // username too short + bad faction key
    });
    assert(
      r.status === 400 && Array.isArray(r.json.errors) && r.json.errors.length >= 2,
      'POST onboarding/complete (invalid combined payload) -> 400 with all errors listed',
      r.json
    );

    const check = await c('GET', `/api/users/me?email=${email3}`);
    assert(
      check.json.user.onboardingComplete === false && check.json.user.faction === null,
      'invalid combined payload applied NOTHING - onboarding stays incomplete, faction untouched',
      check.json
    );

    const login3 = await c('POST', '/api/auth/login', { body: { email: email3, password } });
    assert(
      login3.status === 200 && login3.json.token && login3.json.onboardingRequired === true,
      'POST /api/auth/login (onboarding still incomplete after failed attempt) -> 200 + token, still needs onboarding',
      login3
    );
  }

  console.log('\n--- public profile, follows, points, posts, likes, and comments ---');
  {
    const r = await c('PATCH', '/api/users/me/profile', { token, body: { bio: 'Building a community around cosplay, props, and creative experiments.' } });
    assert(r.status === 200 && r.json.user.profile.bio.includes('community'), 'PATCH profile bio -> saved', r);
  }
  {
    const r = await c('GET', '/api/meta/profile-categories');
    assert(r.status === 200 && r.json.categories.some((category) => category.key === 'digital-creator'), 'GET profile categories -> public category list', r);
  }
  {
    const r = await c('PATCH', '/api/users/me/profile', { token, body: { category: 'digital-creator', showCategoryOnProfile: false } });
    assert(r.status === 200 && r.json.user.profile.category === 'digital-creator' && r.json.user.profile.showCategoryOnProfile === false, 'PATCH profile category -> saved with display off', r);
  }
  {
    const r = await c('GET', '/api/users/Ravencaller/profile');
    assert(r.status === 200 && r.json.profile.category === null, 'GET public profile -> hidden category stays private', r);
  }
  {
    const r = await c('PATCH', '/api/users/me/profile', { token, body: { showCategoryOnProfile: true } });
    assert(r.status === 200 && r.json.user.profile.showCategoryOnProfile === true, 'PATCH profile category visibility -> enabled', r);
  }
  {
    const r = await c('PATCH', '/api/users/me/contact', {
      token,
      body: { email: 'contact.raven@example.com', phone: '+2348148327836', businessAddress: '14 CosQuest Way, Lagos' },
    });
    assert(r.status === 200 && r.json.contact.phone === '+2348148327836', 'PATCH contact options -> saved', r);
  }
  {
    const r = await c('GET', '/api/users/me/contact', { token });
    assert(r.status === 200 && r.json.contact.email === 'contact.raven@example.com', 'GET my contact options -> saved values', r);
  }
  {
    const r = await c('GET', '/api/users/Ravencaller/profile');
    assert(
      r.status === 200 &&
        r.json.profile.bio.includes('community') &&
        r.json.profile.category === 'digital-creator' &&
        r.json.profile.contact.phone === '+2348148327836' &&
        r.json.profile.stats.points === 0,
      'GET public profile -> bio, category, contact, and stats',
      r
    );
  }
  {
    const r = await c('GET', '/api/users/Ravencaller/share');
    assert(
      r.status === 200 &&
        typeof r.json.url === 'string' &&
        r.json.url.endsWith('/u/Ravencaller') &&
        r.json.title.includes('Ravencaller') &&
        typeof r.json.text === 'string',
      'GET /api/users/:username/share -> ready-made link/title/text for a native share sheet',
      r
    );
  }
  {
    const r = await fetch(`${baseUrl}/u/Ravencaller`);
    const html = await r.text();
    assert(
      r.status === 200 &&
        r.headers.get('content-type')?.includes('text/html') &&
        html.includes('og:title') &&
        html.includes('og:image') &&
        html.includes('Ravencaller') &&
        html.includes('community'),
      'GET /u/:username -> real HTML page with Open Graph tags for social previews',
      { status: r.status, contentType: r.headers.get('content-type') }
    );
  }
  {
    const r = await fetch(`${baseUrl}/u/no-such-user-${Date.now()}`);
    assert(r.status === 404 && r.headers.get('content-type')?.includes('text/html'), 'GET /u/:username (unknown user) -> 404 HTML, not a broken page', { status: r.status });
  }
  {
    const r = await c('GET', '/api/users/me/points', { token });
    assert(r.status === 200 && r.json.points === 0, 'GET my points -> balance', r);
  }
  {
    const r = await c('POST', `/api/users/${username2}/follow`, { token });
    assert(r.status === 201 && r.json.following === true, 'POST follow -> following', r);
  }
  {
    const r = await c('GET', `/api/users/${username2}/followers`);
    assert(r.status === 200 && r.json.users.some((user) => user.username === 'Ravencaller'), 'GET followers -> public follower list', r);
  }
  {
    const r = await c('GET', '/api/users/Ravencaller/following');
    assert(r.status === 200 && r.json.users.some((user) => user.username === username2), 'GET following -> public following list', r);
  }
  {
    const r = await c('GET', `/api/users/${username2}/followers?search=raven`);
    assert(r.status === 200 && r.json.users.some((user) => user.username === 'Ravencaller'), 'GET followers?search= -> case-insensitive username substring match', r);
  }
  {
    const r = await c('GET', `/api/users/${username2}/followers?search=zzz-no-such-name`);
    assert(r.status === 200 && r.json.users.length === 0 && r.json.pagination.total === 0, 'GET followers?search= (no match) -> empty list, not an error', r);
  }
  {
    const r = await c('GET', `/api/users/Ravencaller/following?search=jamie`);
    assert(r.status === 200 && r.json.users.some((user) => user.username === username2), 'GET following?search= -> matches on the populated user, not the Follow row', r);
  }
  {
    const r = await c('GET', '/api/users/me/notifications', { token: token2 });
    assert(r.status === 200 && r.json.notifications.some((notification) => notification.type === 'follow' && notification.actor?.username === 'Ravencaller'), 'follow -> notification appears for the followed user', r);
  }
  let thoughtId;
  {
    const r = await c('POST', '/api/posts', { token, body: { type: 'thought', content: 'Cosplay ideas for the next CosQuest.' } });
    assert(r.status === 201 && r.json.post.type === 'thought' && r.json.post.content.length > 0, 'POST thought -> created', r);
    thoughtId = r.json.post.id;
  }
  {
    const r = await c('GET', '/api/posts?type=thought&page=1&limit=20');
    assert(r.status === 200 && r.json.posts.some((post) => post.id === thoughtId), 'GET public posts -> public thought', r);
  }
  {
    const r = await c('GET', `/api/posts/${thoughtId}`);
    assert(r.status === 200 && r.json.post.id === thoughtId, 'GET one post -> post details', r);
  }
  {
    const r = await c('PATCH', `/api/posts/${thoughtId}`, { token, body: { content: 'Updated CosQuest thought.' } });
    assert(
      r.status === 200 && r.json.post.content === 'Updated CosQuest thought.' && Boolean(r.json.post.editedAt),
      'PATCH my post -> content updated and editedAt stamped',
      r
    );
  }
  {
    const form = new FormData();
    form.append('type', 'image');
    form.append('content', 'A one-image CosQuest post.');
    form.append('media', new Blob([REAL_PNG_BYTES], { type: 'image/png' }), 'look.png');
    const r = await c('POST', '/api/posts', { token, body: form, isForm: true });
    assert(r.status === 201 && r.json.post.type === 'image' && r.json.post.media.length === 1, 'POST image post -> 1 image stored through media host', r);
  }
  {
    // Unlike the PNG/WAV fixtures above, this is still placeholder bytes, not
    // a real decodable video - constructing one by hand reliably enough for a
    // real Cloudinary account to accept isn't practical here. This assertion
    // is expected to pass under `npm test` (test-mode Cloudinary stub) and
    // may legitimately fail with a real Cloudinary account rejecting the
    // fixture as an invalid video - that's a fixture limitation, not a bug.
    const form = new FormData();
    form.append('type', 'reel');
    form.append('content', 'A short CosQuest reel.');
    form.append('media', new Blob(['video-bytes'], { type: 'video/mp4' }), 'quest.mp4');
    const r = await c('POST', '/api/posts', { token, body: form, isForm: true });
    assert(r.status === 201 && r.json.post.type === 'reel' && r.json.post.media[0].durationSeconds <= 30, 'POST reel -> short video stored through media host', r);
  }
  {
    const r = await c('GET', '/api/users/Ravencaller/posts?type=thought');
    assert(r.status === 200 && r.json.posts.some((post) => post.id === thoughtId), 'GET user posts -> public thought', r);
  }
  {
    const r = await c('POST', `/api/posts/${thoughtId}/likes`, { token: token2 });
    assert(r.status === 201 && r.json.liked === true && r.json.likeCount === 1, 'POST post like -> public count updated', r);
  }
  {
    const r = await c('POST', `/api/posts/${thoughtId}/shares`, { token: token2 });
    assert(r.status === 201 && r.json.shared === true && r.json.shareCount === 1, 'POST post share -> public count updated', r);
  }
  {
    const r = await c('POST', `/api/posts/${thoughtId}/shares`, { token: token2 });
    assert(r.status === 409, 'POST post share again -> 409', r);
  }
  {
    const r = await c('DELETE', `/api/posts/${thoughtId}/shares`, { token: token2 });
    assert(r.status === 200 && r.json.shared === false && r.json.shareCount === 0, 'DELETE post share -> removed', r);
  }
  {
    const r = await c('POST', `/api/posts/${thoughtId}/bookmarks`, { token: token2 });
    assert(r.status === 201 && r.json.bookmarked === true && r.json.bookmarkCount === 1, 'POST post bookmark -> public count updated', r);
  }
  {
    const r = await c('GET', '/api/users/me/bookmarks', { token: token2 });
    assert(r.status === 200 && r.json.posts.some((post) => post.id === thoughtId), 'GET my bookmarks -> saved post listed', r);
  }
  {
    const r = await c('DELETE', `/api/posts/${thoughtId}/bookmarks`, { token: token2 });
    assert(r.status === 200 && r.json.bookmarked === false && r.json.bookmarkCount === 0, 'DELETE post bookmark -> removed', r);
  }
  let commentId;
  {
    const r = await c('POST', `/api/posts/${thoughtId}/comments`, { token: token2, body: { body: 'This sounds amazing!' } });
    assert(r.status === 201 && r.json.comment.body === 'This sounds amazing!' && r.json.commentCount === 1, 'POST comment -> created', r);
    commentId = r.json.comment.id;
  }
  {
    const r = await c('GET', `/api/posts/${thoughtId}/comments`);
    assert(r.status === 200 && r.json.comments.some((comment) => comment.id === commentId), 'GET comments -> public list', r);
  }
  let replyId;
  {
    const r = await c('POST', `/api/posts/${thoughtId}/comments`, { token, body: { body: 'Thanks, glad you like it!', parentComment: commentId } });
    assert(r.status === 201 && r.json.comment.parentComment === commentId && r.json.commentCount === 2, 'POST reply -> created under the top-level comment', r);
    replyId = r.json.comment.id;
  }
  {
    const r = await c('POST', `/api/posts/${thoughtId}/comments`, { token: token2, body: { body: 'Replying to a reply', parentComment: replyId } });
    assert(r.status === 201 && r.json.comment.parentComment === commentId && r.json.comment.replyToComment === replyId, 'POST reply to a reply -> stays in root thread and identifies replied-to comment', r);
  }
  {
    const r = await c('GET', `/api/posts/${thoughtId}/comments`);
    assert(
      r.status === 200 &&
        r.json.comments.some((comment) => comment.id === commentId && comment.replyCount === 2) &&
        !r.json.comments.some((comment) => comment.id === replyId),
      'GET comments (top-level only) -> shows replyCount, excludes the reply itself',
      r
    );
  }
  {
    const r = await c('GET', `/api/posts/${thoughtId}/comments?parentComment=${commentId}`);
    assert(
      r.status === 200 && r.json.comments.length === 2 && r.json.comments.some((comment) => comment.id === replyId),
      'GET comments?parentComment= -> just the replies under that comment',
      r
    );
  }
  {
    const r = await c('DELETE', `/api/posts/${thoughtId}/comments/${commentId}`, { token: token2 });
    assert(r.status === 200 && r.json.commentCount === 0, 'DELETE top-level comment -> cascades to remove its reply too', r);
  }
  {
    const r = await c('DELETE', `/api/posts/${thoughtId}/likes`, { token: token2 });
    assert(r.status === 200 && r.json.liked === false && r.json.likeCount === 0, 'DELETE post like -> removed', r);
  }
  {
    const r = await c('DELETE', `/api/posts/${thoughtId}`, { token });
    assert(r.status === 200, 'DELETE my post -> removed', r);
  }
  {
    const r = await c('DELETE', `/api/users/${username2}/follow`, { token });
    assert(r.status === 200 && r.json.following === false, 'DELETE follow -> unfollowed', r);
  }

  console.log('\n--- privacy, visibility, and blocking ---');
  let tokenP;
  let tokenS;
  let tokenF;
  let usernameP;
  let usernameS;
  let usernameF;
  {
    const stamp = Date.now();
    usernameP = `Priv${stamp}`.slice(0, 20);
    usernameS = `Stranger${stamp}`.slice(0, 20);
    usernameF = `Friend${stamp}`.slice(0, 20);
    const emailP = `privacy_p_${stamp}@example.com`;
    const emailS = `privacy_s_${stamp}@example.com`;
    const emailF = `privacy_f_${stamp}@example.com`;
    const onboardBody = (email, username) => ({
      email,
      profile: { firstName: 'Test', lastName: 'User', username, age: 25, gender: 'Female', avatar: 'adventurer' },
      faction: 'ascendants',
      interests: ['anime'],
      // Deliberately false - these accounts are unrelated to the
      // notification-broadcast section's fixed opted-in-user count later.
      preferences: { notificationsEnabled: false },
      location: { locationEnabled: true, radiusMiles: 50, lat: 6.5244, lng: 3.3792 },
    });
    for (const email of [emailP, emailS, emailF]) {
      await c('POST', '/api/auth/signup', { body: { email, password, confirmPassword: password } });
    }
    await c('POST', '/api/users/me/onboarding/complete', { body: onboardBody(emailP, usernameP) });
    await c('POST', '/api/users/me/onboarding/complete', { body: onboardBody(emailS, usernameS) });
    await c('POST', '/api/users/me/onboarding/complete', { body: onboardBody(emailF, usernameF) });
    tokenP = (await c('POST', '/api/auth/login', { body: { email: emailP, password } })).json.token;
    tokenS = (await c('POST', '/api/auth/login', { body: { email: emailS, password } })).json.token;
    tokenF = (await c('POST', '/api/auth/login', { body: { email: emailF, password } })).json.token;
  }
  {
    const r = await c('GET', '/api/users/me/privacy', { token: tokenP });
    assert(
      r.status === 200 &&
        r.json.privacy.profileVisibility === 'public' &&
        r.json.privacy.showActivityFeed === true &&
        r.json.privacy.allowDirectMessages === true,
      'GET /api/users/me/privacy -> defaults match existing fully-public behavior',
      r
    );
  }
  {
    const r = await c('PATCH', '/api/users/me/privacy', { token: tokenP, body: { profileVisibility: 'not-a-real-level' } });
    assert(r.status === 400, 'PATCH privacy (invalid visibility level) -> 400', r);
  }
  {
    const r = await c('PATCH', '/api/users/me/privacy', { token: tokenP, body: { profileVisibility: 'private' } });
    assert(r.status === 200 && r.json.privacy.profileVisibility === 'private', 'PATCH privacy -> set to private', r);
  }
  {
    const r = await c('GET', `/api/users/${usernameP}/profile`);
    assert(r.status === 404, 'GET private profile as a stranger (no token) -> 404', r);
  }
  {
    const r = await c('GET', `/api/users/${usernameP}/profile`, { token: tokenS });
    assert(r.status === 404, 'GET private profile as a stranger (with token) -> 404', r);
  }
  {
    const r = await c('GET', `/api/users/${usernameP}/profile`, { token: tokenP });
    assert(r.status === 200, 'GET private profile as its own owner -> 200', r);
  }
  {
    const r = await c('PATCH', '/api/users/me/privacy', { token: tokenP, body: { profileVisibility: 'friends' } });
    assert(r.status === 200 && r.json.privacy.profileVisibility === 'friends', 'PATCH privacy -> set to friends-only', r);
  }
  {
    const r = await c('GET', `/api/users/${usernameP}/profile`, { token: tokenS });
    assert(r.status === 404, 'GET friends-only profile as a non-friend -> 404', r);
  }
  {
    await c('POST', `/api/users/${usernameP}/follow`, { token: tokenF });
    await c('POST', `/api/users/${usernameF}/follow`, { token: tokenP });
    const r = await c('GET', `/api/users/${usernameP}/profile`, { token: tokenF });
    assert(r.status === 200, 'GET friends-only profile as a mutual follow ("friend") -> 200', r);
  }
  {
    const r = await c('GET', `/api/users/${usernameP}/profile`, { token: tokenS });
    assert(r.status === 404, 'GET friends-only profile as a still-non-friend stranger -> 404', r);
  }
  {
    // Profile visible to everyone again, but the activity feed specifically
    // stays hidden from strangers - a stricter, independent gate.
    await c('PATCH', '/api/users/me/privacy', { token: tokenP, body: { profileVisibility: 'public', showActivityFeed: false } });
    const post = await c('POST', '/api/posts', { token: tokenP, body: { type: 'thought', content: 'A thought only friends should see in the feed list.' } });
    assert(post.status === 201, 'owner can still create posts regardless of their own showActivityFeed setting', post);
  }
  {
    const r = await c('GET', `/api/users/${usernameP}/posts`);
    assert(r.status === 200 && r.json.posts.length === 0, 'GET posts (showActivityFeed off) as a stranger -> hidden, empty list', r);
  }
  {
    const r = await c('GET', `/api/users/${usernameP}/posts`, { token: tokenF });
    assert(r.status === 200 && r.json.posts.length === 1, 'GET posts (showActivityFeed off) as a friend -> still visible', r);
  }
  {
    const r = await c('GET', `/api/users/${usernameP}/posts`, { token: tokenP });
    assert(r.status === 200 && r.json.posts.length === 1, 'GET posts (showActivityFeed off) as the owner -> still visible', r);
  }
  {
    const r = await c('POST', `/api/users/${usernameS}/block`, { token: tokenP });
    assert(r.status === 201 && r.json.blocked === true, 'POST block -> blocked', r);
  }
  {
    const r = await c('POST', `/api/users/${usernameS}/block`, { token: tokenP });
    assert(r.status === 409, 'POST block again -> 409', r);
  }
  {
    const r = await c('GET', '/api/users/me/blocked', { token: tokenP });
    assert(r.status === 200 && r.json.users.some((u) => u.username === usernameS), 'GET my blocked list -> includes the blocked user', r);
  }
  {
    // Public visibility, but a block overrides it independent of the visibility level.
    const r = await c('GET', `/api/users/${usernameP}/profile`, { token: tokenS });
    assert(r.status === 404, 'GET profile across a block (public visibility) -> still 404', r);
  }
  {
    const r = await c('POST', `/api/users/${usernameP}/follow`, { token: tokenS });
    assert(r.status === 404, 'POST follow across a block -> 404', r);
  }
  {
    const r = await c('POST', '/api/chats/dm', { token: tokenS, body: { username: usernameP } });
    assert(r.status === 404, 'POST DM across a block -> 404', r);
  }
  {
    const r = await c('DELETE', `/api/users/${usernameS}/block`, { token: tokenP });
    assert(r.status === 200 && r.json.blocked === false, 'DELETE block -> unblocked', r);
  }
  {
    const r = await c('GET', `/api/users/${usernameP}/profile`, { token: tokenS });
    assert(r.status === 200, 'GET profile after unblocking -> visible again', r);
  }
  {
    await c('PATCH', '/api/users/me/privacy', { token: tokenP, body: { allowDirectMessages: false } });
    const r = await c('POST', '/api/chats/dm', { token: tokenS, body: { username: usernameP } });
    assert(r.status === 403, 'POST DM (allowDirectMessages off) -> 403', r);
  }
  {
    await c('PATCH', '/api/users/me/privacy', { token: tokenP, body: { allowDirectMessages: true } });
    const r = await c('POST', '/api/chats/dm', { token: tokenS, body: { username: usernameP } });
    assert(r.status === 200, 'POST DM (allowDirectMessages back on) -> 200', r);
  }
  {
    const r = await c('PATCH', '/api/users/me/preferences/notifications', { token: tokenP, body: {} });
    assert(r.status === 400, 'PATCH notification prefs with nothing to change -> 400', r);
  }
  {
    const r = await c('PATCH', '/api/users/me/preferences/notifications', { token: tokenP, body: { eventReminders: false } });
    assert(
      r.status === 200 && r.json.user.notificationCategories.eventReminders === false && r.json.user.preferences.notificationsEnabled === false,
      'PATCH notification prefs (eventReminders alone) -> updates just that category, leaves the master switch untouched',
      r
    );
  }
  {
    const r = await c('PATCH', '/api/users/me/preferences/notifications', { token: tokenP, body: { emailWeeklyNewsletter: true } });
    assert(
      r.status === 200 && r.json.user.preferences.emailWeeklyNewsletter === true,
      'PATCH notification prefs (emailWeeklyNewsletter alone) -> saved',
      r
    );
  }

  console.log('\n--- chats: community, faction rooms, and direct messages ---');
  let communityChatId;
  let factionChatId;
  let dmChatId;
  let communityMessageId;
  {
    const r = await c('GET', '/api/chats');
    assert(r.status === 401, 'GET /api/chats with NO token -> 401', r);
  }
  {
    const r = await c('GET', '/api/chats', { token });
    const community = r.json.chats?.find((chat) => chat.type === 'community');
    const faction = r.json.chats?.find((chat) => chat.type === 'faction');
    assert(
      r.status === 200 && community && faction && faction.factionKey === 'ascendants',
      'GET /api/chats -> "Your Space" includes the community room and my faction room',
      r.json
    );
    communityChatId = community.id;
    factionChatId = faction.id;
  }
  {
    const r = await c('POST', '/api/chats/dm', { token, body: { username: username2 } });
    assert(
      r.status === 200 && r.json.chat.type === 'dm' && r.json.chat.otherParticipant.username === username2,
      'POST /api/chats/dm -> creates a DM with the target user',
      r
    );
    dmChatId = r.json.chat.id;
  }
  {
    const r = await c('POST', '/api/chats/dm', { token, body: { username: username2 } });
    assert(r.status === 200 && r.json.chat.id === dmChatId, 'POST /api/chats/dm again -> same DM, not a duplicate', r);
  }
  {
    const r = await c('POST', `/api/chats/${factionChatId}/messages`, { token: token2, body: { content: 'Hi Ascendants' } });
    assert(r.status === 403, 'POST message into a faction room you do not belong to -> 403', r);
  }
  {
    const r = await c('POST', `/api/chats/${communityChatId}/messages`, { token, body: { content: 'Yooo, anyone at Waterfront?' } });
    assert(
      r.status === 201 && r.json.message.kind === 'text' && r.json.message.sender.username === 'Ravencaller',
      'POST community message -> created',
      r
    );
    communityMessageId = r.json.message.id;
  }
  {
    const r = await c('POST', `/api/chats/${communityChatId}/messages`, {
      token: token2,
      body: { content: 'I can see you', replyTo: communityMessageId },
    });
    assert(r.status === 201 && r.json.message.replyTo?.id === communityMessageId, 'POST reply -> carries a replyTo preview of the original message', r);
  }
  {
    const r = await c('GET', `/api/chats/${communityChatId}/messages`, { token });
    assert(
      r.status === 200 && r.json.messages.length === 2 && r.json.messages[0].content === 'I can see you',
      'GET community messages -> newest first, includes the reply',
      r
    );
  }
  {
    const r = await c('POST', `/api/chats/${communityChatId}/messages/${communityMessageId}/reactions`, { token: token2, body: { emoji: '😂' } });
    assert(
      r.status === 201 && r.json.reactions.some((reaction) => reaction.emoji === '😂' && reaction.count === 1 && reaction.mine === true),
      'POST reaction -> added',
      r
    );
  }
  {
    const r = await c('DELETE', `/api/chats/${communityChatId}/messages/${communityMessageId}/reactions`, { token: token2 });
    assert(r.status === 200 && r.json.reactions.length === 0, 'DELETE reaction -> removed', r);
  }
  {
    const r = await c('PATCH', `/api/chats/${communityChatId}/pinned-message`, { token, body: { messageId: communityMessageId } });
    assert(r.status === 200 && r.json.pinnedMessage?.id === communityMessageId, 'PATCH pinned-message -> pinned', r);
  }
  {
    const r = await c('GET', `/api/chats/${communityChatId}`, { token: token2 });
    assert(
      r.status === 200 && r.json.chat.pinnedMessage?.id === communityMessageId && r.json.chat.messageCount === 2,
      'GET chat detail -> shows the pinned message and running message count',
      r
    );
  }
  {
    const form = new FormData();
    form.append('media', new Blob([makeSilentWav(1)], { type: 'audio/wav' }), 'note.wav');
    const r = await c('POST', `/api/chats/${dmChatId}/messages`, { token, body: form, isForm: true });
    assert(
      r.status === 201 && r.json.message.kind === 'audio' && r.json.message.media.resourceType === 'video',
      'POST voice note into a DM -> stored as an audio message',
      r
    );
  }
  {
    const r = await c('GET', '/api/chats', { token: token2 });
    const dm = r.json.chats.find((chat) => chat.type === 'dm' && chat.id === dmChatId);
    assert(r.status === 200 && dm && dm.unreadCount === 1, 'GET /api/chats (recipient) -> unread count reflects the unread voice note', r);
  }
  {
    const r = await c('PATCH', `/api/chats/${dmChatId}/read`, { token: token2 });
    assert(r.status === 200, 'PATCH /api/chats/:id/read -> marks the DM read', r);
  }
  {
    const r = await c('GET', `/api/chats/${dmChatId}/messages`, { token });
    assert(r.status === 200 && r.json.messages[0]?.read === true, 'GET DM messages (sender) -> read receipt true after recipient read it', r);
  }
  {
    // token2 replied into the community room after communityMessageId was
    // sent, so their membership row's lastReadAt already covers it.
    const r = await c('GET', `/api/chats/${communityChatId}/messages/${communityMessageId}/seen`, { token });
    assert(
      r.status === 200 && r.json.seenBy.some((user) => user.username === username2) && !r.json.seenBy.some((user) => user.username === 'Ravencaller'),
      'GET message seen-by -> lists other members whose read receipt covers this message, excludes the sender',
      r
    );
  }
  let forwardedMessageId;
  {
    const r = await c('POST', `/api/chats/${communityChatId}/messages/${communityMessageId}/forward`, {
      token,
      body: { targetConversationId: dmChatId },
    });
    assert(
      r.status === 201 && r.json.message.forwarded === true && r.json.message.content.includes('Waterfront'),
      'POST forward message -> copied into another conversation the user belongs to',
      r
    );
    forwardedMessageId = r.json.message.id;
  }
  {
    const r = await c('GET', `/api/chats/${dmChatId}/messages`, { token });
    assert(
      r.status === 200 && r.json.messages.some((message) => message.id === forwardedMessageId && message.forwarded === true),
      'GET DM messages -> forwarded copy appears there, marked forwarded',
      r
    );
  }
  {
    // token2 is not in the Ascendants faction room - forwarding there is the
    // same access check as posting there, so it's refused the same way.
    const r = await c('POST', `/api/chats/${communityChatId}/messages/${communityMessageId}/forward`, {
      token: token2,
      body: { targetConversationId: factionChatId },
    });
    assert(r.status === 403, 'POST forward into a conversation you do not belong to -> 403', r);
  }
  {
    const r = await c('POST', `/api/chats/${communityChatId}/messages/${communityMessageId}/forward`, {
      token,
      body: { targetConversationId: dmChatId, targetUsername: usernameS },
    });
    assert(r.status === 400, 'POST forward with BOTH targetConversationId and targetUsername -> 400', r);
  }
  {
    const r = await c('POST', `/api/chats/${communityChatId}/messages/${communityMessageId}/forward`, { token, body: {} });
    assert(r.status === 400, 'POST forward with NEITHER target -> 400', r);
  }

  console.log('\n--- search people to start a DM/forward with, by name ---');
  {
    const r = await c('GET', `/api/users/search?search=${usernameS.slice(0, 6).toLowerCase()}`, { token });
    assert(r.status === 200 && r.json.users.some((u) => u.username === usernameS), 'GET /api/users/search -> matches by partial, case-insensitive username', r);
  }
  {
    const r = await c('GET', '/api/users/search?search=zzz-no-such-name');
    assert(r.status === 401, 'GET /api/users/search with NO token -> 401', r);
  }
  {
    const r = await c('GET', '/api/users/search', { token });
    assert(r.status === 400, 'GET /api/users/search with no search term -> 400', r);
  }
  {
    // Ravencaller has no DM with the "Stranger" fixture user yet - forwarding
    // by name should find-or-create it, exactly like tapping "+" first.
    const r = await c('POST', `/api/chats/${communityChatId}/messages/${communityMessageId}/forward`, {
      token,
      body: { targetUsername: usernameS },
    });
    assert(r.status === 201 && r.json.message.forwarded === true, 'POST forward by targetUsername -> auto-creates the DM and forwards into it', r);
  }
  {
    const r = await c('POST', '/api/chats/dm', { token, body: { username: usernameS } });
    const messages = await c('GET', `/api/chats/${r.json.chat.id}/messages`, { token });
    assert(
      r.status === 200 && messages.json.messages.some((m) => m.forwarded === true && m.content.includes('Waterfront')),
      'GET the auto-created DM -> contains the forwarded message',
      { chat: r.json, messages: messages.json }
    );
  }

  console.log('\n--- chat message editing and delete-for-me / delete-for-everyone ---');
  {
    const r = await c('PATCH', `/api/chats/${communityChatId}/messages/${communityMessageId}`, {
      token,
      body: { content: 'Yooo, anyone at Waterfront? (updated)' },
    });
    assert(
      r.status === 200 && r.json.message.content === 'Yooo, anyone at Waterfront? (updated)' && Boolean(r.json.message.editedAt),
      'PATCH message -> content updated and editedAt stamped',
      r
    );
  }
  {
    const r = await c('PATCH', `/api/chats/${communityChatId}/messages/${communityMessageId}`, { token: token2, body: { content: 'hijacked' } });
    assert(r.status === 403, 'PATCH message by non-sender -> 403', r);
  }
  let toDeleteForMeId;
  {
    const r = await c('POST', `/api/chats/${communityChatId}/messages`, {
      token: token2,
      body: { content: 'A message token2 will delete for just themself.' },
    });
    toDeleteForMeId = r.json.message.id;
  }
  {
    const r = await c('DELETE', `/api/chats/${communityChatId}/messages/${toDeleteForMeId}?scope=me`, { token: token2 });
    assert(r.status === 200 && r.json.scope === 'me', 'DELETE message ?scope=me -> hidden for just that user', r);
  }
  {
    const r = await c('GET', `/api/chats/${communityChatId}/messages`, { token: token2 });
    assert(!r.json.messages.some((m) => m.id === toDeleteForMeId), 'GET messages (deleter) -> deleted-for-me message no longer shown to them', r);
  }
  {
    const r = await c('GET', `/api/chats/${communityChatId}/messages`, { token });
    assert(
      r.json.messages.some((m) => m.id === toDeleteForMeId),
      'GET messages (other member) -> still sees a message someone else deleted-for-me',
      r
    );
  }
  let toDeleteForEveryoneId;
  {
    const r = await c('POST', `/api/chats/${communityChatId}/messages`, { token, body: { content: 'Oops, wrong chat.' } });
    toDeleteForEveryoneId = r.json.message.id;
  }
  {
    const r = await c('DELETE', `/api/chats/${communityChatId}/messages/${toDeleteForEveryoneId}?scope=everyone`, { token: token2 });
    assert(r.status === 403, 'DELETE ?scope=everyone by a non-sender -> 403', r);
  }
  {
    const r = await c('DELETE', `/api/chats/${communityChatId}/messages/${toDeleteForEveryoneId}?scope=everyone`, { token });
    assert(r.status === 200 && r.json.scope === 'everyone', 'DELETE ?scope=everyone (sender, within 5 minutes) -> deleted for everyone', r);
  }
  {
    const r = await c('GET', `/api/chats/${communityChatId}/messages`, { token: token2 });
    const deleted = r.json.messages.find((m) => m.id === toDeleteForEveryoneId);
    assert(
      deleted?.deleted === true && deleted.content === 'This message was deleted.' && deleted.media === null,
      'GET messages (other member) -> sees a tombstone, not the original content, after delete-for-everyone',
      r.json
    );
  }
  if (mongoose.connection.readyState === 1) {
    let oldMessageId;
    {
      const r = await c('POST', `/api/chats/${communityChatId}/messages`, { token, body: { content: 'An old message, about to be backdated.' } });
      oldMessageId = r.json.message.id;
    }
    // Message.updateOne (Mongoose) silently ignores writes to createdAt - it's
    // marked immutable by the timestamps option. Going through the native
    // driver collection bypasses that, which is exactly what backdating this
    // fixture for the test needs.
    await Message.collection.updateOne({ _id: new mongoose.Types.ObjectId(oldMessageId) }, { $set: { createdAt: new Date(Date.now() - 10 * 60 * 1000) } });
    {
      const r = await c('DELETE', `/api/chats/${communityChatId}/messages/${oldMessageId}?scope=everyone`, { token });
      assert(r.status === 403, 'DELETE ?scope=everyone after the 5-minute window -> 403, too late for everyone', r);
    }
    {
      const r = await c('DELETE', `/api/chats/${communityChatId}/messages/${oldMessageId}?scope=me`, { token });
      assert(r.status === 200, 'DELETE ?scope=me after the 5-minute window -> still allowed any time', r);
    }
  } else {
    console.log('  skip - delete-for-everyone time-window test requires the in-process test database');
  }

  console.log('\n--- notifications (in-app broadcast to everyone opted in) ---');
  if (mongoose.connection.readyState === 1) {
    // `token`'s user has notificationsEnabled=true (step 4 above); the one-shot user does too;
    // this 4th user completes onboarding with notifications disabled - a real negative case.
    const email4 = `hero4_${Date.now()}@example.com`;
    await c('POST', '/api/auth/signup', { body: { email: email4, password, confirmPassword: password } });
    await c('POST', '/api/users/me/onboarding/complete', {
      body: {
        email: email4,
        profile: { firstName: 'Taylor', lastName: 'Reed', username: `Taylor${Date.now()}`.slice(0, 20), age: 28, gender: 'Female', avatar: 'adventurer' },
        faction: 'celestials',
        interests: ['music'],
        preferences: { notificationsEnabled: false },
        location: { locationEnabled: true, radiusMiles: 50, lat: 6.5244, lng: 3.3792 },
      },
    });
    const login4 = await c('POST', '/api/auth/login', { body: { email: email4, password } });
    const token4 = login4.json.token;

    const sentCount = await sendNotification.run('A CosQuest just opened near you!');
    assert(sentCount === 2, 'sendNotification.run() -> delivered to exactly the 2 opted-in users', sentCount);

    // Every user already has 1 welcome notification from signup - the
    // broadcast adds a 2nd for opted-in users only (newest first).
    const r1 = await c('GET', '/api/users/me/notifications', { token });
    assert(
      r1.status === 200 &&
        r1.json.notifications.length === 2 &&
        r1.json.notifications[0].message === 'A CosQuest just opened near you!' &&
        r1.json.notifications[0].read === false,
      'GET /api/users/me/notifications (opted-in user) -> welcome + broadcast, broadcast unread',
      r1.json
    );

    const r2 = await c('GET', '/api/users/me/notifications', { token: token4 });
    assert(
      r2.status === 200 &&
        r2.json.notifications.length === 1 &&
        r2.json.notifications[0].message.includes('Welcome to CosQuest'),
      'GET /api/users/me/notifications (opted-out user) -> only the welcome message, no broadcast',
      r2.json
    );

    const markRead = await c('PATCH', '/api/users/me/notifications/read', { token });
    assert(markRead.status === 200, 'PATCH /api/users/me/notifications/read -> 200', markRead);

    const r3 = await c('GET', '/api/users/me/notifications', { token });
    assert(
      r3.json.notifications.length === 2 && r3.json.notifications.every((n) => n.read === true),
      'GET /api/users/me/notifications (after marking read) -> both entries read:true',
      r3.json
    );
  } else {
    console.log('  skip - no direct DB connection in this process (running against a separately-started server)');
  }

  console.log('\n--- logout ---');
  const tokenBeforeLogout = token;
  {
    const r = await c('POST', '/api/auth/logout');
    assert(r.status === 401, 'POST /api/auth/logout with NO token -> 401', r);
  }
  {
    const r = await c('POST', '/api/auth/logout', { token });
    assert(r.status === 200 && r.json.message === 'Logged out successfully.', 'POST /api/auth/logout -> 200', r);
  }
  {
    const r = await c('GET', '/api/users/me', { token });
    assert(r.status === 401, 'GET /api/users/me with the just-logged-out token -> 401', r);
  }
  {
    const r = await c('POST', '/api/auth/login', { body: { email, password } });
    assert(r.status === 200 && r.json.token && r.json.token !== tokenBeforeLogout, 'POST /api/auth/login again after logout -> 200 + fresh token', r);
    token = r.json.token;
  }
  {
    const r = await c('GET', '/api/users/me', { token });
    assert(r.status === 200, 'GET /api/users/me with the fresh post-logout token -> 200', r);
  }

  console.log(`\n${pass} passed, ${fail} failed\n`);
  return { pass, fail };
}

module.exports = { run };

if (require.main === module) {
  run().then(({ fail }) => process.exit(fail > 0 ? 1 : 0));
}
