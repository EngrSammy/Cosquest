const userModel = require('../models/userModel');
const User = require('../models/User');
const Follow = require('../models/Follow');
const Post = require('../models/Post');
const Block = require('../models/Block');
const QuestRegistration = require('../models/QuestRegistration');
const notificationModel = require('../models/notificationModel');
const { serializeQuest } = require('../utils/quest');

// "Friends" for visibility purposes = mutual follow - there's no separate
// friend-request system in this app, only one-way Follow.
async function areFriends(userIdA, userIdB) {
  const [aFollowsB, bFollowsA] = await Promise.all([
    Follow.exists({ follower: userIdA, following: userIdB }),
    Follow.exists({ follower: userIdB, following: userIdA }),
  ]);
  return Boolean(aFollowsB && bFollowsA);
}

async function isBlockedEitherWay(userIdA, userIdB) {
  if (!userIdA || !userIdB) return false;
  const block = await Block.findOne({
    $or: [
      { blocker: userIdA, blocked: userIdB },
      { blocker: userIdB, blocked: userIdA },
    ],
  });
  return Boolean(block);
}

/**
 * Single gate for every profile-adjacent public endpoint (profile,
 * followers, following, quest history, posts, the /u/:username share page).
 * A blocked or not-visible-to-this-viewer profile reads exactly like a
 * missing one (404) - it never confirms whether the account exists.
 */
async function canViewProfile(target, viewerId) {
  if (viewerId && String(viewerId) === String(target._id)) return true;
  if (viewerId && (await isBlockedEitherWay(viewerId, target._id))) return false;

  const visibility = target.privacy?.profileVisibility || 'public';
  if (visibility === 'public') return true;
  if (visibility === 'private') return false;
  // 'friends'
  return viewerId ? areFriends(viewerId, target._id) : false;
}

/**
 * Extra, stricter gate just for the posts/activity list: "Show Activity
 * Feed" off hides posts from strangers even on an otherwise-public profile,
 * leaving them visible to the owner and to friends (mutual follows) only.
 */
async function canViewActivityFeed(target, viewerId) {
  if (viewerId && String(viewerId) === String(target._id)) return true;
  if (!(await canViewProfile(target, viewerId))) return false;
  if (target.privacy?.showActivityFeed === false) {
    return viewerId ? areFriends(viewerId, target._id) : false;
  }
  return true;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const REGISTRATION_STATUSES = ['registered', 'cancelled', 'completed', 'winner'];

function parseLimit(value, fallback = 20) {
  const limit = Number(value);
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : fallback;
}

function parsePage(value) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? Math.min(page, 1000) : 1;
}

function previewUser(user) {
  return {
    id: String(user._id),
    username: user.profile.username,
    name: user.profile.displayName || [user.profile.firstName, user.profile.lastName].filter(Boolean).join(' ') || user.profile.username,
    avatarKey: user.profile.avatarKey,
    avatarPhotoUrl: user.profile.avatarPhotoUrl,
    faction: user.faction,
  };
}

async function statsFor(user) {
  const [followers, following, posts, quests, wins] = await Promise.all([
    Follow.countDocuments({ following: user._id }),
    Follow.countDocuments({ follower: user._id }),
    Post.countDocuments({ author: user._id }),
    // The Profile "Quest" count means quests this person registered for,
    // including a registration they later cancelled.
    QuestRegistration.countDocuments({ user: user._id }),
    QuestRegistration.countDocuments({ user: user._id, status: 'winner' }),
  ]);

  return { followers, following, posts, quests, wins, points: user.pointsBalance || 0 };
}

async function findTarget(username) {
  return userModel.findByUsername(username);
}

// GET /api/users/:username/profile - public unless the owner set it to
// friends-only or private (see privacyController.js), and never visible
// across a block in either direction.
async function getPublicProfile(req, res) {
  const user = await findTarget(req.params.username);
  if (!user || !(await canViewProfile(user, req.userId))) return res.status(404).json({ error: 'Profile not found.' });

  const stats = await statsFor(user);
  return res.json({
    profile: {
      ...previewUser(user),
      bio: user.profile.bio || '',
      category: user.profile.showCategoryOnProfile ? user.profile.category : null,
      contact: {
        email: user.contact?.email || '',
        phone: user.contact?.phone || '',
        businessAddress: user.contact?.businessAddress || '',
      },
      stats,
      createdAt: user.createdAt,
    },
  });
}

// GET /api/users/me/points - kept separate for the wallet/points UI.
function getMyPoints(req, res) {
  return res.json({ points: req.user.pointsBalance || 0 });
}

// GET /api/users/:username/quests - the profile's registered quest history.
async function listQuestHistory(req, res) {
  const user = await findTarget(req.params.username);
  if (!user || !(await canViewProfile(user, req.userId))) return res.status(404).json({ error: 'Profile not found.' });

  const { status } = req.query;
  if (status && !REGISTRATION_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${REGISTRATION_STATUSES.join(', ')}.` });
  }

  const limit = parseLimit(req.query.limit);
  const page = parsePage(req.query.page);
  const query = { user: user._id, ...(status ? { status } : {}) };
  const [registrations, total] = await Promise.all([
    QuestRegistration.find(query)
      .populate('quest')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    QuestRegistration.countDocuments(query),
  ]);

  return res.json({
    quests: registrations
      .filter((registration) => registration.quest)
      .map((registration) => ({
        registrationId: String(registration._id),
        status: registration.status,
        registeredAt: registration.createdAt,
        quest: serializeQuest(registration.quest),
      })),
    pagination: { page, limit, total, hasMore: page * limit < total },
  });
}

async function followUser(req, res) {
  const target = await findTarget(req.params.username);
  if (!target) return res.status(404).json({ error: 'Profile not found.' });
  if (String(target._id) === String(req.userId)) {
    return res.status(400).json({ error: 'You cannot follow your own profile.' });
  }
  if (await isBlockedEitherWay(req.userId, target._id)) {
    return res.status(404).json({ error: 'Profile not found.' });
  }

  try {
    await Follow.create({ follower: req.userId, following: target._id });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ error: 'You already follow this profile.' });
    throw error;
  }

  const actorName = req.user.profile.username || req.user.profile.firstName || 'Someone';
  await notificationModel.createForUser(target._id, `${actorName} started following you.`, {
    type: 'follow',
    actor: req.userId,
  });
  return res.status(201).json({ message: 'Following profile.', following: true });
}

async function unfollowUser(req, res) {
  const target = await findTarget(req.params.username);
  if (!target) return res.status(404).json({ error: 'Profile not found.' });

  const result = await Follow.deleteOne({ follower: req.userId, following: target._id });
  if (!result.deletedCount) return res.status(404).json({ error: 'You do not follow this profile.' });
  return res.json({ message: 'Unfollowed profile.', following: false });
}

async function listRelationship(req, res, field) {
  const target = await findTarget(req.params.username);
  if (!target || !(await canViewProfile(target, req.userId))) return res.status(404).json({ error: 'Profile not found.' });

  const limit = parseLimit(req.query.limit);
  const page = parsePage(req.query.page);
  const matchField = field === 'followers' ? 'following' : 'follower';
  const populatedField = field === 'followers' ? 'follower' : 'following';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  // A plain find+populate can't filter by the *populated* side's fields
  // (population happens after the main query matches), so a real name/
  // username search needs an aggregation - $lookup joins in the User data
  // before the $match, exactly like a populate, but filterable.
  if (!search) {
    const query = { [matchField]: target._id };
    const [rows, total] = await Promise.all([
      Follow.find(query)
        .populate(populatedField, 'profile.username profile.displayName profile.firstName profile.lastName profile.avatarKey profile.avatarPhotoUrl faction')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Follow.countDocuments(query),
    ]);
    return res.json({
      users: rows.filter((row) => row[populatedField]).map((row) => previewUser(row[populatedField])),
      pagination: { page, limit, total, hasMore: page * limit < total },
    });
  }

  const regex = new RegExp(escapeRegex(search), 'i');
  const [result] = await Follow.aggregate([
    { $match: { [matchField]: target._id } },
    { $sort: { createdAt: -1 } },
    { $lookup: { from: 'users', localField: populatedField, foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    {
      $match: {
        $or: [
          { 'user.profile.username': regex },
          { 'user.profile.firstName': regex },
          { 'user.profile.lastName': regex },
        ],
      },
    },
    {
      $facet: {
        rows: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        totalCount: [{ $count: 'count' }],
      },
    },
  ]);

  const total = result.totalCount[0]?.count || 0;
  return res.json({
    users: result.rows.map((row) => previewUser(row.user)),
    pagination: { page, limit, total, hasMore: page * limit < total },
  });
}

// GET /api/users/search?search=jamie - find people to start a DM/forward with,
// by username/first/last name (not gated by profileVisibility - it's a
// discoverability search for messaging, the same way most chat apps let you
// find someone by name even with a private profile; the target's own
// allowDirectMessages setting is still checked once you actually try to
// message them). A block hides someone from search in both directions, same
// as everywhere else, and incomplete accounts never show up.
async function searchUsers(req, res) {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (!search) return res.status(400).json({ error: 'search is required.' });

  const limit = parseLimit(req.query.limit);
  const page = parsePage(req.query.page);
  const regex = new RegExp(escapeRegex(search), 'i');

  const blocks = await Block.find({ $or: [{ blocker: req.userId }, { blocked: req.userId }] });
  const excludedIds = [req.userId, ...blocks.map((b) => (String(b.blocker) === String(req.userId) ? b.blocked : b.blocker))];

  const query = {
    _id: { $nin: excludedIds },
    onboardingComplete: true,
    $or: [{ 'profile.username': regex }, { 'profile.firstName': regex }, { 'profile.lastName': regex }],
  };
  const [users, total] = await Promise.all([
    User.find(query)
      .select('profile.username profile.displayName profile.firstName profile.lastName profile.avatarKey profile.avatarPhotoUrl faction')
      .sort({ 'profile.username': 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(query),
  ]);

  return res.json({
    users: users.map(previewUser),
    pagination: { page, limit, total, hasMore: page * limit < total },
  });
}

// GET /api/users/discover - browse people without a search term.
async function discoverUsers(req, res) {
  const limit = parseLimit(req.query.limit);
  const page = parsePage(req.query.page);

  const blocks = await Block.find({ $or: [{ blocker: req.userId }, { blocked: req.userId }] });
  const excludedIds = [req.userId, ...blocks.map((block) => (
    String(block.blocker) === String(req.userId) ? block.blocked : block.blocker
  ))];
  const query = { _id: { $nin: excludedIds }, onboardingComplete: true };

  const [users, total] = await Promise.all([
    User.find(query)
      .select('profile.username profile.displayName profile.firstName profile.lastName profile.avatarKey profile.avatarPhotoUrl faction')
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(query),
  ]);

  return res.json({
    users: users.map(previewUser),
    pagination: { page, limit, total, hasMore: page * limit < total },
  });
}

function listFollowers(req, res) {
  return listRelationship(req, res, 'followers');
}

function listFollowing(req, res) {
  return listRelationship(req, res, 'following');
}

module.exports = {
  getPublicProfile,
  getMyPoints,
  listQuestHistory,
  followUser,
  unfollowUser,
  listFollowers,
  listFollowing,
  searchUsers,
  discoverUsers,
  previewUser,
  statsFor,
  canViewProfile,
  canViewActivityFeed,
  isBlockedEitherWay,
  parseLimit,
  parsePage,
};
