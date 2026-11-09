const User = require('./User');
const { normalizeUsername } = require('../utils/validation');
const { expertiseLabel } = require('./expertiseModel');

/**
 * Same public function names/signatures as the old JSON-file version (see
 * README "Swapping in a real database later") - every controller calls
 * these exactly as before. The only difference callers must account for:
 * these are now all `async` (they hit MongoDB), so every call site needs
 * `await`.
 */

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function createUser({ email, username, passwordHash }) {
  const user = { passwordHash };
  if (email) user.email = email.toLowerCase().trim();
  if (username) {
    user.profile = {
      username: String(username).trim(),
      usernameNormalized: normalizeUsername(username),
    };
  }
  return User.create(user);
}

async function findByEmail(email) {
  if (typeof email !== 'string' || !email.trim()) return null;
  return User.findOne({ email: email.toLowerCase().trim() });
}

async function findByUsername(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;

  const currentUser = await User.findOne({ 'profile.usernameNormalized': normalized });
  if (currentUser) return currentUser;

  // Supports usernames assigned before usernameNormalized was introduced.
  return User.findOne({ 'profile.username': new RegExp(`^${escapeRegex(String(username).trim())}$`, 'i') });
}

async function findById(id) {
  try {
    return await User.findById(id);
  } catch (err) {
    return null; // malformed id (e.g. not a valid ObjectId) - treat like "not found"
  }
}

async function isUsernameTaken(username, excludeUserId) {
  const normalized = normalizeUsername(username);
  if (!normalized) return false;
  // The regex also protects accounts created before usernameNormalized existed.
  const query = {
    $or: [
      { 'profile.usernameNormalized': normalized },
      { 'profile.username': new RegExp(`^${escapeRegex(String(username).trim())}$`, 'i') },
    ],
  };
  if (excludeUserId) query._id = { $ne: excludeUserId };
  const existing = await User.findOne(query);
  return Boolean(existing);
}

/**
 * Loads the user, hands the live Mongoose document to patchFn to mutate
 * in place (e.g. `user.profile.firstName = 'x'`), then saves it. This
 * preserves the exact same call pattern every controller already used
 * against the old JSON store.
 */
async function updateUser(id, patchFn) {
  const user = await User.findById(id);
  if (!user) return null;
  await patchFn(user);
  await user.save();
  return user;
}

function sanitize(user) {
  if (!user) return null;
  const obj = user.toObject ? user.toObject() : user;
  const { passwordHash, tokenVersion, currentSessionId, __v, _id, onboarding, account, ...safe } = obj;
  if (safe.profile) delete safe.profile.usernameNormalized;
  safe.id = String(_id);
  // Expertise role ("Front-end") - see expertiseModel.js.
  safe.expertiseLabel = expertiseLabel(obj.expertise);
  // Polish: whether deleting the account asks for a password (Google / Apple
  // accounts have none) - never the password itself.
  safe.hasPassword = Boolean(passwordHash);
  return safe;
}

module.exports = {
  createUser,
  findByEmail,
  findByUsername,
  findById,
  isUsernameTaken,
  updateUser,
  sanitize,
};
