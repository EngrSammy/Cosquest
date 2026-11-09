const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { getRedisClient } = require('../config/redis');

/**
 * Brute-force protection for auth endpoints, keyed by IP.
 * NOTE: if this ever runs behind a reverse proxy/load balancer (Heroku,
 * Nginx, etc.) you MUST set `app.set('trust proxy', 1)` in server.js first,
 * otherwise every request appears to come from the proxy's single IP and
 * one real user could lock out everyone else.
 *
 * Counts live in Redis, not this process's memory: express-rate-limit's
 * default MemoryStore only sees requests handled by the one process it's
 * running in, so with more than one server instance behind a load balancer
 * a "10 attempts per IP" limit would silently become "10 x however many
 * instances are running," since each instance counts independently and a
 * brute-forcer's requests land across all of them. RedisStore makes every
 * instance share one counter, so the limit means what it says regardless of
 * how many processes are running.
 */

// The automated smoke suite legitimately makes far more than 10 signups/logins
// in a single run (many isolated test fixtures, all from one IP) - that's
// nothing like real traffic, so it's exempted the same way Cloudinary calls
// already are in imageHost.js. Production behavior is completely unaffected.
const skipInTest = () => process.env.NODE_ENV === 'test';

// One store per limiter, each with its own key prefix - without distinct
// prefixes, both limiters would default to the same Redis key per IP and
// login attempts would count against the signup limit (and vice versa),
// since express-rate-limit's default keyGenerator is IP-only. The in-memory
// store never had this problem because each rateLimit() call got its own
// separate Map; Redis is shared, so the namespacing has to be explicit.
function redisStore(prefix) {
  return new RedisStore({
    prefix,
    sendCommand: (...args) => getRedisClient().call(...args),
  });
}

const loginLimiter = rateLimit({
  windowMs: 2 * 60 * 60 * 1000, // 2 hours
  max: 10, // 10 attempts per IP per window
  standardHeaders: true, // RateLimit-* response headers
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in a couple of hours.' },
  skip: skipInTest,
  store: redisStore('rl:login:'),
});

const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 account creations per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many accounts created from this address. Please try again later.' },
  skip: skipInTest,
  store: redisStore('rl:signup:'),
});

// Keyed by the account being targeted, not the caller's IP - forgot-password
// sends an email per request, so this caps how many an account can trigger
// per day regardless of how many different IPs ask for it. Falls back to IP
// only if the request has no identifier at all, so a malformed request still
// counts against something rather than bypassing the limiter entirely; the
// route handler itself 400s a missing identifier before anything is sent.
function accountKey(req) {
  const identifier = String(req.body?.identifier || req.body?.email || req.body?.username || '').trim().toLowerCase();
  return identifier || req.ip;
}

const forgotPasswordLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 30, // 30 reset codes per account per day
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests for this account today. Please try again tomorrow.' },
  skip: skipInTest,
  keyGenerator: accountKey,
  store: redisStore('rl:forgot:'),
});

module.exports = { loginLimiter, signupLimiter, forgotPasswordLimiter };
