const bcrypt = require('bcryptjs');
const { verifyToken } = require('../utils/token');
const userModel = require('../models/userModel');

/**
 * Used by every onboarding-step endpoint (profile, avatar, faction,
 * interests, preferences, onboarding/complete). These have to work in two
 * situations:
 *  - BEFORE login: right after signup, no token exists yet, and no
 *    server-generated id is handed out to use as a stand-in credential
 *    either - onboarding is identified using the `email` the client already
 *    has (the same one just typed into the signup form).
 *  - AFTER login: editing profile/faction/interests later (the front-end
 *    allows changing faction/interests after onboarding) - identified the
 *    normal way, via Authorization: Bearer <token>.
 * A Bearer token always wins if both are somehow present.
 */
async function identifyUser(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme === 'Bearer' && token) {
    try {
      const decoded = verifyToken(token);
      const user = await userModel.findById(decoded.sub);
      if (!user) {
        return res.status(401).json({ error: 'Token is valid but the user no longer exists.' });
      }
      if (decoded.tokenVersion !== user.tokenVersion) {
        return res.status(401).json({ error: 'This session has been logged out. Please log in again.' });
      }
      req.userId = user.id;
      req.user = user;
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
  }

  const identifier = req.body?.identifier || req.body?.email || req.body?.username || req.query?.identifier || req.query?.email || req.query?.username;
  if (!identifier) {
    return res.status(401).json({
      error: 'Provide the email or username you signed up with (before login) or an Authorization Bearer token (after login).',
    });
  }

  const user = typeof identifier === 'string' && identifier.includes('@')
    ? await userModel.findByEmail(identifier)
    : await userModel.findByUsername(identifier);
  if (!user) {
    return res.status(404).json({ error: 'No account found for that email or username.' });
  }
  req.userId = user.id;
  req.user = user;
  return next();
}

async function findByPassword(identifier, password) {
  if (!identifier || !password) return null;
  const user = typeof identifier === 'string' && identifier.includes('@')
    ? await userModel.findByEmail(identifier)
    : await userModel.findByUsername(identifier);
  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) return null;
  return user;
}

/**
 * Same two situations as identifyUser (pre-login by identifier, post-login by
 * Bearer), but for endpoints carrying more sensitive PII (contact options:
 * phone number, business address) - plain identifyUser would let anyone who
 * merely knows a signup email read or overwrite that data before the owner
 * ever logs in. Here the pre-login branch additionally requires the
 * account's password (already set at signup) as a lightweight ownership
 * check, without issuing a full JWT. Mirrors login's error style - a wrong
 * identifier and a wrong password look identical to the caller.
 *
 * Two ways to send identifier+password pre-login:
 *  - PATCH/POST (has a body): `{ identifier, password, ... }` in the JSON body.
 *  - GET (no body): standard HTTP Basic Auth - `Authorization: Basic
 *    <base64(identifier:password)>`. This exists specifically so a GET never
 *    needs the password in the URL, where it would leak into browser
 *    history, server access logs, and any proxy in between.
 */
async function identifyUserWithPassword(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme === 'Bearer' && token) {
    try {
      const decoded = verifyToken(token);
      const user = await userModel.findById(decoded.sub);
      if (!user) {
        return res.status(401).json({ error: 'Token is valid but the user no longer exists.' });
      }
      if (decoded.tokenVersion !== user.tokenVersion) {
        return res.status(401).json({ error: 'This session has been logged out. Please log in again.' });
      }
      req.userId = user.id;
      req.user = user;
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
  }

  if (scheme === 'Basic' && token) {
    let decoded;
    try {
      decoded = Buffer.from(token, 'base64').toString('utf8');
    } catch (err) {
      return res.status(401).json({ error: 'Malformed Basic Authorization header.' });
    }
    // Split on the FIRST colon only (per RFC 7617) - this app's own password
    // policy requires a special character, which can be a colon, so a naive
    // split(':') would silently truncate a real password at that colon.
    const separatorIndex = decoded.indexOf(':');
    const identifier = separatorIndex === -1 ? decoded : decoded.slice(0, separatorIndex);
    const password = separatorIndex === -1 ? '' : decoded.slice(separatorIndex + 1);
    const user = await findByPassword(identifier, password);
    if (!user) return res.status(401).json({ error: 'Invalid email/username or password.' });
    req.userId = user.id;
    req.user = user;
    return next();
  }

  const identifier = req.body?.identifier || req.body?.email || req.body?.username;
  const password = req.body?.password;
  if (!identifier || !password) {
    return res.status(401).json({
      error: 'Provide identifier + password (JSON body, or an Authorization: Basic header for GET) before login, or an Authorization Bearer token after login.',
    });
  }

  const user = await findByPassword(identifier, password);
  if (!user) return res.status(401).json({ error: 'Invalid email/username or password.' });
  req.userId = user.id;
  req.user = user;
  return next();
}

module.exports = { identifyUser, identifyUserWithPassword };
