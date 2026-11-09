const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const OAuthIdentity = require('../models/OAuthIdentity');
const OAuthCompletionCode = require('../models/OAuthCompletionCode');
const userModel = require('../models/userModel');
const notificationModel = require('../models/notificationModel');
const { signToken, generateSessionId } = require('./token');
const { revokeSession } = require('../realtime/socket');

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const WELCOME_MESSAGE = 'Welcome to CosQuest! Your account is officially live.';
const codeLifetimeMs = 10 * 60 * 1000;
let joseModulePromise;
let googleJwks;
let appleJwks;

function configError(provider) {
  const required = provider === 'google'
    ? ['GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_OAUTH_CALLBACK_URL', 'OAUTH_SUCCESS_REDIRECT_URL']
    : ['APPLE_OAUTH_CLIENT_ID', 'APPLE_OAUTH_TEAM_ID', 'APPLE_OAUTH_KEY_ID', 'APPLE_OAUTH_PRIVATE_KEY', 'APPLE_OAUTH_CALLBACK_URL', 'OAUTH_SUCCESS_REDIRECT_URL'];
  const missing = required.filter((name) => !process.env[name]);
  return missing.length ? `OAuth is not configured. Missing: ${missing.join(', ')}` : null;
}

function randomValue() {
  return crypto.randomBytes(32).toString('base64url');
}

function cookieOptions(provider) {
  return {
    httpOnly: true,
    secure: provider === 'apple' || process.env.NODE_ENV === 'production',
    sameSite: provider === 'apple' ? 'none' : 'lax',
    signed: true,
    maxAge: codeLifetimeMs,
    path: '/api/auth/oauth',
  };
}

// The app/website passes where to send the person back to as ?redirectUri=.
// Only the native app scheme and the CosQuest website are accepted, so this
// can never be turned into an open redirect that leaks the one-time code.
function safeRedirectTarget(value) {
  if (typeof value !== 'string' || !value) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    return null;
  }
  const nativeApp = parsed.protocol === 'cosquest:';
  const website = parsed.protocol === 'https:' && parsed.hostname === 'cosquest.vercel.app' && !parsed.username && !parsed.password;
  return nativeApp || website ? parsed.toString() : null;
}

function startAuthorization(req, res, provider) {
  const state = randomValue();
  const nonce = randomValue();
  const redirectTo = safeRedirectTarget(req.query?.redirectUri);
  res.cookie(`oauth_${provider}`, JSON.stringify({ state, nonce, redirectTo }), cookieOptions(provider));
  return { state, nonce };
}

// Reads and clears the OAuth cookie. Returns null if it is missing or unreadable.
function takeAuthorizationSession(req, res, provider) {
  const cookie = req.signedCookies?.[`oauth_${provider}`];
  res.clearCookie(`oauth_${provider}`, cookieOptions(provider));
  if (!cookie) return null;
  try {
    return JSON.parse(cookie);
  } catch (error) {
    return null;
  }
}

function verifyAuthorization(session, state) {
  if (!session) throw new Error('OAuth session expired or was blocked. Please try again.');
  if (!state || typeof session.state !== 'string' || state.length !== session.state.length || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(session.state))) {
    throw new Error('OAuth state check failed. Please try again.');
  }
  return session.nonce;
}

async function jose() {
  if (!joseModulePromise) joseModulePromise = import('jose');
  return joseModulePromise;
}

async function verifyIdentityToken(provider, idToken, nonce) {
  const { createRemoteJWKSet, jwtVerify } = await jose();
  if (provider === 'google') {
    if (!googleJwks) googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
    const verified = await jwtVerify(idToken, googleJwks, {
      issuer: GOOGLE_ISSUERS,
      audience: process.env.GOOGLE_OAUTH_CLIENT_ID,
    });
    if (verified.payload.nonce !== nonce) throw new Error('Google OAuth nonce check failed.');
    return verified.payload;
  }

  if (!appleJwks) appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
  const verified = await jwtVerify(idToken, appleJwks, {
    issuer: 'https://appleid.apple.com',
    audience: process.env.APPLE_OAUTH_CLIENT_ID,
  });
  if (verified.payload.nonce !== nonce) throw new Error('Apple OAuth nonce check failed.');
  return verified.payload;
}

async function exchangeGoogleCode(code) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirect_uri: process.env.GOOGLE_OAUTH_CALLBACK_URL,
    grant_type: 'authorization_code',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const data = await response.json();
  if (!response.ok || !data.id_token) throw new Error('Google could not complete sign-in.');
  return data.id_token;
}

function appleClientSecret() {
  const privateKey = process.env.APPLE_OAUTH_PRIVATE_KEY.replace(/\\n/g, '\n');
  return jwt.sign({}, privateKey, {
    algorithm: 'ES256', keyid: process.env.APPLE_OAUTH_KEY_ID,
    issuer: process.env.APPLE_OAUTH_TEAM_ID, subject: process.env.APPLE_OAUTH_CLIENT_ID,
    audience: 'https://appleid.apple.com', expiresIn: '180d',
  });
}

async function exchangeAppleCode(code) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.APPLE_OAUTH_CLIENT_ID,
    client_secret: appleClientSecret(),
    redirect_uri: process.env.APPLE_OAUTH_CALLBACK_URL,
    grant_type: 'authorization_code',
  });
  const response = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const data = await response.json();
  if (!response.ok || !data.id_token) throw new Error('Apple could not complete sign-in.');
  return data.id_token;
}

async function findOrCreateUser(provider, payload, name = {}) {
  const subject = String(payload.sub);

  // 1. Already linked to a CosQuest account? Use it - unless that account
  //    no longer exists (deleted user). Then remove the broken link so a
  //    fresh one can be made below.
  const existingIdentity = await OAuthIdentity.findOne({ provider, subject }).populate('user');
  if (existingIdentity?.user) return existingIdentity.user;
  if (existingIdentity && !existingIdentity.user) {
    await OAuthIdentity.deleteOne({ _id: existingIdentity._id });
  }

  // 2. Find an existing account with the same (verified) email, or create one.
  const verifiedGoogleEmail = provider !== 'google' || payload.email_verified === true || payload.email_verified === 'true';
  const email = verifiedGoogleEmail && typeof payload.email === 'string' ? payload.email : undefined;
  let user = email ? await userModel.findByEmail(email) : null;
  let created = false;
  if (!user) {
    try {
      user = await userModel.createUser({ email, passwordHash: undefined });
      created = true;
      const userId = user?.id || user?._id;
      await userModel.updateUser(userId, (document) => {
        if (name.firstName) document.profile.firstName = String(name.firstName).trim();
        if (name.lastName) document.profile.lastName = String(name.lastName).trim();
      });
      user = await userModel.findById(userId);
    } catch (error) {
      // A simultaneous sign-in for the same new email created the account first.
      if (error?.code !== 11000 || !email) throw error;
      user = await userModel.findByEmail(email);
      created = false;
      if (!user) throw error;
    }
  }
  if (!user) throw new Error('Could not create your CosQuest account. Please try again.');

  // 3. Link this Google/Apple account to the CosQuest account.
  try {
    await OAuthIdentity.create({ provider, subject, user: user.id });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    // Someone else created the link at the same moment - use theirs if valid.
    const identity = await OAuthIdentity.findOne({ provider, subject }).populate('user');
    if (identity?.user) return identity.user;
    // The link points to a missing account: replace it with this one.
    await OAuthIdentity.deleteOne({ provider, subject });
    await OAuthIdentity.create({ provider, subject, user: user.id });
  }

  if (created) await notificationModel.createForUser(user.id, WELCOME_MESSAGE);
  return user;
}

async function createCompletionCode(userId) {
  const code = randomValue();
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  await OAuthCompletionCode.create({ codeHash, user: userId, expiresAt: new Date(Date.now() + codeLifetimeMs) });
  return code;
}

async function exchangeCompletionCode(code) {
  if (typeof code !== 'string' || !code) return null;
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  const record = await OAuthCompletionCode.findOneAndDelete({ codeHash, expiresAt: { $gt: new Date() } });
  if (!record) return null;
  const user = await userModel.findById(record.user);
  if (!user) return null;
  const sessionId = generateSessionId();
  user.currentSessionId = sessionId;
  await user.save();
  revokeSession(user.id);
  return { token: signToken(user.id, user.tokenVersion, sessionId), user };
}

// redirectTo (already validated at sign-in start) wins; otherwise the
// OAUTH_SUCCESS_REDIRECT_URL fallback is used.
function redirectSuccess(res, code, onboardingRequired, redirectTo) {
  const destination = new URL(redirectTo || process.env.OAUTH_SUCCESS_REDIRECT_URL);
  destination.searchParams.set('oauthCode', code);
  destination.searchParams.set('onboardingRequired', String(onboardingRequired));
  return res.redirect(destination.toString());
}

function redirectFailure(res, error, redirectTo) {
  const base = redirectTo || process.env.OAUTH_SUCCESS_REDIRECT_URL;
  if (!base) return res.status(400).json({ error });
  const destination = new URL(base);
  destination.searchParams.set('oauthError', error);
  return res.redirect(destination.toString());
}

module.exports = {
  configError, startAuthorization, takeAuthorizationSession, safeRedirectTarget, verifyAuthorization, exchangeGoogleCode, exchangeAppleCode,
  verifyIdentityToken, findOrCreateUser, createCompletionCode, exchangeCompletionCode,
  redirectSuccess, redirectFailure,
};
