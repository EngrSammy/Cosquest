const userModel = require('../models/userModel');
const Block = require('../models/Block');
const Follow = require('../models/Follow');
const { previewUser } = require('./publicProfileController');

function parseLimit(value, fallback = 20) {
  const limit = Number(value);
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : fallback;
}

function parsePage(value) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? Math.min(page, 1000) : 1;
}

// POST /api/users/:username/block - blocking also removes any existing
// follow relationship in either direction, since staying "friends" or
// following someone you've just blocked (or who blocked you) makes no sense.
async function blockUser(req, res) {
  const target = await userModel.findByUsername(req.params.username);
  if (!target) return res.status(404).json({ error: 'Profile not found.' });
  if (String(target._id) === String(req.userId)) {
    return res.status(400).json({ error: 'You cannot block your own profile.' });
  }

  try {
    await Block.create({ blocker: req.userId, blocked: target._id });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'You already blocked this profile.' });
    throw error;
  }

  await Follow.deleteMany({
    $or: [
      { follower: req.userId, following: target._id },
      { follower: target._id, following: req.userId },
    ],
  });

  return res.status(201).json({ message: 'Profile blocked.', blocked: true });
}

// DELETE /api/users/:username/block
async function unblockUser(req, res) {
  const target = await userModel.findByUsername(req.params.username);
  if (!target) return res.status(404).json({ error: 'Profile not found.' });

  const result = await Block.deleteOne({ blocker: req.userId, blocked: target._id });
  if (!result.deletedCount) return res.status(404).json({ error: 'You have not blocked this profile.' });
  return res.json({ message: 'Profile unblocked.', blocked: false });
}

// GET /api/users/me/blocked - only the blocker can see their own list.
async function listBlockedUsers(req, res) {
  const limit = parseLimit(req.query.limit);
  const page = parsePage(req.query.page);
  const query = { blocker: req.userId };
  const [rows, total] = await Promise.all([
    Block.find(query)
      .populate('blocked', 'profile.username profile.firstName profile.lastName profile.avatarKey profile.avatarPhotoUrl faction')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Block.countDocuments(query),
  ]);
  return res.json({
    users: rows.filter((row) => row.blocked).map((row) => previewUser(row.blocked)),
    pagination: { page, limit, total, hasMore: page * limit < total },
  });
}

module.exports = { blockUser, unblockUser, listBlockedUsers };
