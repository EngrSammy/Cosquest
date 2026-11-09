const { verifyToken, isCurrentSession } = require('../utils/token');
const userModel = require('../models/userModel');

/**
 * Expects: Authorization: Bearer <token>
 * On success, attaches req.userId and req.user (full Mongoose doc, incl.
 * passwordHash - controllers must sanitize before sending anything back).
 *
 * Also enforces logout: a token is only valid if the tokenVersion embedded
 * in it at sign-time still matches the user's current tokenVersion. Logging
 * out (POST /api/auth/logout) bumps that number, which instantly invalidates
 * this and every other previously-issued token for the account.
 *
 * Also enforces single-device sign-in: a token is only valid if the
 * sessionId embedded in it still matches user.currentSessionId. Every fresh
 * sign-in rotates that value (see generateSessionId in src/utils/token.js),
 * so logging in on a new device immediately invalidates whatever token an
 * older device was holding.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header. Expected: Bearer <token>' });
  }

  try {
    const decoded = verifyToken(token);
    const user = await userModel.findById(decoded.sub);
    if (!user) {
      return res.status(401).json({ error: 'Token is valid but the user no longer exists.' });
    }
    if (decoded.tokenVersion !== user.tokenVersion) {
      return res.status(401).json({ error: 'This session has been logged out. Please log in again.' });
    }
    if (!isCurrentSession(decoded, user)) {
      return res.status(401).json({ error: 'This account was signed in on another device. Please log in again.' });
    }
    req.userId = user.id;
    req.user = user;

    // Throttled, fire-and-forget presence touch - never blocks or fails the request.
    const ACTIVE_THROTTLE_MS = 5 * 60 * 1000;
    if (Date.now() - new Date(user.lastActiveAt || 0).getTime() > ACTIVE_THROTTLE_MS) {
      userModel.updateUser(user.id, (doc) => { doc.lastActiveAt = new Date(); }).catch(() => {});
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

/**
 * For routes that stay public (no token required) but now need to know
 * *who's asking* to enforce profile visibility/blocking - e.g. a public
 * profile is still readable by anyone, but "friends only" needs to check if
 * this particular viewer qualifies. Never rejects: a missing or invalid
 * token just leaves req.userId/req.user unset, same as an anonymous visitor.
 */
async function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next();

  try {
    const decoded = verifyToken(token);
    const user = await userModel.findById(decoded.sub);
    if (user && decoded.tokenVersion === user.tokenVersion && isCurrentSession(decoded, user)) {
      req.userId = user.id;
      req.user = user;
    }
  } catch (err) {
    // Invalid/expired token on an optional-auth route: treat as anonymous, don't fail the request.
  }
  next();
}

function requireCompletedOnboarding(req, res, next) {
  if (!req.user?.onboardingComplete) {
    return res.status(403).json({ error: 'Please complete onboarding before accessing this feature.' });
  }
  return next();
}

module.exports = { requireAuth, optionalAuth, requireCompletedOnboarding };
