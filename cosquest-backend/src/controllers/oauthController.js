const {
  configError, startAuthorization, takeAuthorizationSession, verifyAuthorization, exchangeGoogleCode, exchangeAppleCode,
  verifyIdentityToken, findOrCreateUser, createCompletionCode, exchangeCompletionCode,
  redirectSuccess, redirectFailure,
} = require('../utils/oauth');
const userModel = require('../models/userModel');

function requireConfig(res, provider) {
  const error = configError(provider);
  if (!error) return false;
  res.status(503).json({ error });
  return true;
}

function authorizationUrl(provider, { state, nonce }) {
  const google = provider === 'google';
  const url = new URL(google ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://appleid.apple.com/auth/authorize');
  url.searchParams.set('client_id', google ? process.env.GOOGLE_OAUTH_CLIENT_ID : process.env.APPLE_OAUTH_CLIENT_ID);
  url.searchParams.set('redirect_uri', google ? process.env.GOOGLE_OAUTH_CALLBACK_URL : process.env.APPLE_OAUTH_CALLBACK_URL);
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  if (google) {
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('prompt', 'select_account');
  } else {
    url.searchParams.set('response_type', 'code id_token');
    url.searchParams.set('response_mode', 'form_post');
    url.searchParams.set('scope', 'name email');
  }
  return url.toString();
}

function startGoogle(req, res) {
  if (requireConfig(res, 'google')) return;
  return res.redirect(authorizationUrl('google', startAuthorization(req, res, 'google')));
}

function startApple(req, res) {
  if (requireConfig(res, 'apple')) return;
  return res.redirect(authorizationUrl('apple', startAuthorization(req, res, 'apple')));
}

function appleName(value) {
  if (!value) return {};
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return { firstName: parsed?.name?.firstName, lastName: parsed?.name?.lastName };
  } catch (error) {
    return {};
  }
}

async function finishOAuth(req, res, provider) {
  const session = takeAuthorizationSession(req, res, provider);
  const redirectTo = session?.redirectTo || null;
  try {
    if (configError(provider)) return redirectFailure(res, 'OAuth is not configured.', redirectTo);
    if (req.query.error || req.body?.error) return redirectFailure(res, 'Sign-in was cancelled or denied.', redirectTo);
    const input = provider === 'google' ? req.query : req.body;
    const nonce = verifyAuthorization(session, input.state);
    const idToken = provider === 'google' ? await exchangeGoogleCode(input.code) : await exchangeAppleCode(input.code);
    const payload = await verifyIdentityToken(provider, idToken, nonce);
    const name = provider === 'google'
      ? { firstName: payload.given_name, lastName: payload.family_name }
      : appleName(input.user);
    const user = await findOrCreateUser(provider, payload, name);
    const code = await createCompletionCode(user.id);
    return redirectSuccess(res, code, !user.onboardingComplete, redirectTo);
  } catch (error) {
    return redirectFailure(res, error.message || 'OAuth sign-in failed.', redirectTo);
  }
}

async function googleCallback(req, res) {
  return finishOAuth(req, res, 'google');
}

async function appleCallback(req, res) {
  return finishOAuth(req, res, 'apple');
}

async function exchange(req, res) {
  const result = await exchangeCompletionCode(req.body?.oauthCode);
  if (!result) return res.status(400).json({ error: 'This OAuth code is invalid or has expired. Please sign in again.' });
  return res.json({
    message: result.user.onboardingComplete ? 'Logged in successfully.' : 'OAuth sign-in successful. Complete onboarding to continue.',
    token: result.token,
    onboardingRequired: !result.user.onboardingComplete,
    user: userModel.sanitize(result.user),
  });
}

module.exports = { startGoogle, startApple, googleCallback, appleCallback, exchange };
