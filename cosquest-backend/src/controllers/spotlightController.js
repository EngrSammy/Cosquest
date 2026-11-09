const User = require('../models/User');
const Block = require('../models/Block');
const { INTERESTS, isValidInterestKey } = require('../models/interestModel');

function entry(user, rank) {
  return {
    rank, points: user.pointsBalance,
    user: {
      id: String(user._id), username: user.profile.username,
      name: user.profile.displayName || [user.profile.firstName, user.profile.lastName].filter(Boolean).join(' ') || user.profile.username,
      avatarKey: user.profile.avatarKey, avatarPhotoUrl: user.profile.avatarPhotoUrl,
      faction: user.faction, interests: user.interests,
    },
  };
}

async function leaderboard(req, res) {
  const { interest } = req.query;
  if (interest !== undefined && !isValidInterestKey(interest)) return res.status(400).json({ error: 'Unknown interest. See GET /api/interests.' });
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 20);
  if (!Number.isInteger(page) || page < 1 || page > 1000 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({ error: 'page must be 1-1000 and limit must be 1-100.' });
  }
  const blocks = await Block.find({ $or: [{ blocker: req.userId }, { blocked: req.userId }] });
  const excluded = blocks.map((block) => String(block.blocker) === String(req.userId) ? block.blocked : block.blocker);
  const query = { onboardingComplete: true, _id: { $nin: excluded }, ...(interest ? { interests: interest } : {}) };
  const fields = 'profile.username profile.displayName profile.firstName profile.lastName profile.avatarKey profile.avatarPhotoUrl faction interests pointsBalance';
  const sort = { pointsBalance: -1, _id: 1 };
  const [users, top, total, self] = await Promise.all([
    User.find(query).select(fields).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
    User.find(query).select(fields).sort(sort).limit(3).lean(),
    User.countDocuments(query),
    User.findOne({ ...query, _id: req.userId }).select(fields).lean(),
  ]);
  // Competition ranking: tied scores share a rank (1, 1, 3). IDs stabilize paging.
  const scores = [...new Set([...users, ...top, ...(self ? [self] : [])].map((user) => user.pointsBalance))];
  const ranks = new Map(await Promise.all(scores.map(async (points) => [points, 1 + await User.countDocuments({ ...query, pointsBalance: { $gt: points } })])));
  const ranked = (user) => entry(user, ranks.get(user.pointsBalance));
  return res.json({
    title: 'Bounty Board', interest: interest || null,
    level: null, levelsConfigured: false, pointsEarningEnabled: false,
    podium: top.map(ranked), leaders: users.map(ranked), me: self ? ranked(self) : null,
    pagination: { page, limit, total, hasMore: page * limit < total },
  });
}

function realms(req, res) { return res.json({ realms: INTERESTS }); }

module.exports = { leaderboard, realms };
