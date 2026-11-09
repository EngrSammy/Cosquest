async function run(baseUrl) {
  let pass = 0;
  let fail = 0;

  function check(ok, name, value) {
    if (ok) {
      pass += 1;
      console.log(`  ok  - ${name}`);
    } else {
      fail += 1;
      console.log(`FAIL - ${name}`, JSON.stringify(value));
    }
  }

  const FALLBACK = 'cosquest://onboarding/oauthGoogle';
  const saved = {
    GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    GOOGLE_OAUTH_CALLBACK_URL: process.env.GOOGLE_OAUTH_CALLBACK_URL,
    OAUTH_SUCCESS_REDIRECT_URL: process.env.OAUTH_SUCCESS_REDIRECT_URL,
  };
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
  process.env.GOOGLE_OAUTH_CALLBACK_URL = 'https://api.example.test/api/auth/oauth/google/callback';
  process.env.OAUTH_SUCCESS_REDIRECT_URL = FALLBACK;

  // Starts Google sign-in, then simulates Google sending the person back
  // having cancelled - the simplest callback that still exercises the
  // cookie-carried redirect address without a real Google account.
  async function roundTrip(redirectUri) {
    const query = redirectUri === undefined ? '' : `?redirectUri=${encodeURIComponent(redirectUri)}`;
    const start = await fetch(`${baseUrl}/api/auth/oauth/google${query}`, { redirect: 'manual' });
    const cookie = start.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    const callback = await fetch(`${baseUrl}/api/auth/oauth/google/callback?error=access_denied&state=x`, {
      redirect: 'manual',
      headers: { Cookie: cookie },
    });
    return { start, callback, location: callback.headers.get('location') };
  }

  try {
    console.log('\n--- OAuth redirect address ---');

    const website = await roundTrip('https://cosquest.vercel.app/onboarding/oauthGoogle');
    const googleUrl = new URL(website.start.headers.get('location'));
    check(website.start.status === 302 && googleUrl.hostname === 'accounts.google.com', 'sign-in start redirects to Google', website.start.status);
    check(googleUrl.searchParams.get('prompt') === 'select_account', 'Google always shows the account list');
    check(googleUrl.searchParams.get('redirect_uri') === process.env.GOOGLE_OAUTH_CALLBACK_URL, 'Google is sent the full callback address');
    check(website.location?.startsWith('https://cosquest.vercel.app/onboarding/oauthGoogle?oauthError='), 'website address is used after sign-in', website.location);

    const app = await roundTrip('cosquest://onboarding/oauthGoogle');
    check(app.location?.startsWith('cosquest://onboarding/oauthGoogle?oauthError='), 'app address is used after sign-in', app.location);

    const none = await roundTrip(undefined);
    check(none.location?.startsWith(`${FALLBACK}?oauthError=`), 'no redirectUri falls back to the configured address', none.location);

    for (const bad of [
      'https://evil.example/steal',
      'https://cosquest.vercel.app.evil.example/x',
      'https://cosquest.vercel.app@evil.example/x',
      'http://cosquest.vercel.app/onboarding',
      'javascript:alert(1)',
      'not a url',
    ]) {
      const result = await roundTrip(bad);
      check(result.location?.startsWith(`${FALLBACK}?oauthError=`), `disallowed redirectUri falls back (${bad})`, result.location);
    }

    console.log('\n--- OAuth account linking (findOrCreateUser) ---');
    const mongoose = require('mongoose');
    const User = require('../src/models/User');
    const OAuthIdentity = require('../src/models/OAuthIdentity');
    const { findOrCreateUser } = require('../src/utils/oauth');
    const unique = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
    const email = `oauth_${unique}@example.com`;

    const first = await findOrCreateUser('google', { sub: `g-${unique}`, email, email_verified: true }, { firstName: ' Gia ', lastName: 'Lee' });
    check(first && first.email === email && first.profile.firstName === 'Gia' && first.profile.lastName === 'Lee', 'first Google sign-in creates an account with the Google name', first?.profile);
    const again = await findOrCreateUser('google', { sub: `g-${unique}`, email, email_verified: true });
    check(String(again.id) === String(first.id), 'signing in again returns the same account');
    check(await OAuthIdentity.countDocuments({ provider: 'google', subject: `g-${unique}` }) === 1, 'only one link is stored');

    const apple = await findOrCreateUser('apple', { sub: `a-${unique}`, email });
    check(String(apple.id) === String(first.id), 'a verified email links a second provider to the same account');

    const unverified = await findOrCreateUser('google', { sub: `g2-${unique}`, email: `other_${unique}@example.com`, email_verified: false });
    check(unverified && !unverified.email, 'an unverified Google email is not trusted or stored', unverified?.email);

    // The CosQuest account behind an existing link was deleted: sign-in must still work.
    const doomed = await findOrCreateUser('google', { sub: `g3-${unique}`, email: `gone_${unique}@example.com`, email_verified: true });
    await User.deleteOne({ _id: doomed.id });
    const revived = await findOrCreateUser('google', { sub: `g3-${unique}`, email: `gone_${unique}@example.com`, email_verified: true });
    check(revived && String(revived.id) !== String(doomed.id), 'a deleted account gets a fresh one instead of an error', revived?.id);
    const link = await OAuthIdentity.findOne({ provider: 'google', subject: `g3-${unique}` });
    check(String(link.user) === String(revived.id), 'the broken link now points at the new account');

    // Two requests for a brand-new person at once must end up on one account.
    const racers = await Promise.all([0, 1].map(() => findOrCreateUser('google', { sub: `g4-${unique}`, email: `race_${unique}@example.com`, email_verified: true })));
    check(racers.every(Boolean) && await OAuthIdentity.countDocuments({ provider: 'google', subject: `g4-${unique}` }) === 1, 'simultaneous first sign-ins leave a single link');
    check(mongoose.isValidObjectId(racers[0]?.id), 'each simultaneous request still gets a valid account');

    const noCookie = await fetch(`${baseUrl}/api/auth/oauth/google/callback?code=abc&state=x`, { redirect: 'manual' });
    check(noCookie.headers.get('location')?.startsWith(`${FALLBACK}?oauthError=`), 'callback without the sign-in cookie is rejected to the fallback', noCookie.headers.get('location'));
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  return { pass, fail };
}

module.exports = { run };
