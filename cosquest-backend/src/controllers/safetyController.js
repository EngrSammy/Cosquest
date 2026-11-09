/**
 * Polish (task 059, docs/polish/BACKEND-PORT.md): what the App Store asks of
 * a social app, plus push plumbing.
 *
 *   GET    /api/meta/capabilities           what this server supports (the app feature-detects)
 *   POST   /api/reports                     report a user, post, comment, message or group
 *   DELETE /api/users/me                    delete my account
 *   POST   /api/blocks                      block by user id or username (from anywhere)
 *   DELETE /api/blocks/:userId              unblock by id
 *   DELETE /api/users/me/devices            forget a push token (sign out)
 *   POST   /api/notifications/game-events   the game server tells a player something (server key)
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const User = require('../models/User');
const Report = require('../models/Report');
const Block = require('../models/Block');
const Follow = require('../models/Follow');
const Post = require('../models/Post');
const PostLike = require('../models/PostLike');
const PostComment = require('../models/PostComment');
const PostBookmark = require('../models/PostBookmark');
const PostShare = require('../models/PostShare');
const CommentLike = require('../models/CommentLike');
const Message = require('../models/Message');
const MessageReaction = require('../models/MessageReaction');
const ConversationMember = require('../models/ConversationMember');
const Notification = require('../models/Notification');
const OAuthIdentity = require('../models/OAuthIdentity');
const PasswordReset = require('../models/PasswordReset');
const QuestRegistration = require('../models/QuestRegistration');
const GroupJoinRequest = require('../models/GroupJoinRequest');
const PollVote = require('../models/PollVote');
const userModel = require('../models/userModel');
const notificationModel = require('../models/notificationModel');
const push = require('../utils/push');

const isId = (value) => typeof value === 'string' && mongoose.Types.ObjectId.isValid(value);

// GET /api/meta/capabilities (public)
function capabilities(req, res) {
  return res.json({
    capabilities: {
      deleteAccount: true,
      reports: true,
      reportTargets: Report.TARGETS,
      reportReasons: Report.REASONS,
      blockAnywhere: true,
      pushTokens: true,
      push: push.enabled(),
      gameEvents: Boolean(process.env.GAME_EVENTS_KEY),
      gameResults: true,
    },
  });
}

// POST /api/reports { targetType, targetId, reason, details?, snapshot?, conversationId? }
async function createReport(req, res) {
  const { targetType, targetId, reason, details, snapshot, conversationId } = req.body || {};
  if (!Report.TARGETS.includes(targetType)) {
    return res.status(400).json({ error: `targetType must be one of ${Report.TARGETS.join(', ')}.` });
  }
  if (typeof targetId !== 'string' || !targetId.trim() || targetId.length > 64) {
    return res.status(400).json({ error: 'targetId is required.' });
  }
  if (!Report.REASONS.includes(reason)) {
    return res.status(400).json({ error: `reason must be one of ${Report.REASONS.join(', ')}.` });
  }
  if (targetType === 'user' && (targetId === String(req.userId) || targetId.toLowerCase() === String(req.user?.profile?.username || '').toLowerCase())) {
    return res.status(400).json({ error: 'You cannot report yourself.' });
  }
  const fields = {
    reason,
    details: typeof details === 'string' ? details.slice(0, 1000) : '',
    snapshot: typeof snapshot === 'string' ? snapshot.slice(0, 2000) : '',
    conversation: typeof conversationId === 'string' ? conversationId.slice(0, 64) : null,
    status: 'open',
  };
  const existing = await Report.findOne({ reporter: req.userId, targetType, targetId: targetId.trim() });
  if (existing) {
    Object.assign(existing, fields);
    await existing.save();
    return res.json({ report: { id: String(existing._id), status: existing.status }, updated: true });
  }
  const report = await Report.create({ reporter: req.userId, targetType, targetId: targetId.trim(), ...fields });
  return res.status(201).json({ report: { id: String(report._id), status: report.status }, updated: false });
}

// DELETE /api/users/me { password? } - password accounts confirm with it;
// social sign-in accounts confirm with { confirm: "DELETE" }.
async function deleteAccount(req, res) {
  const user = await User.findById(req.userId);
  if (!user || user.deletedAt) return res.status(404).json({ error: 'Account not found.' });
  const { password, confirm } = req.body || {};
  if (user.passwordHash) {
    if (typeof password !== 'string' || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'That password is not right.' });
    }
  } else if (confirm !== 'DELETE') {
    return res.status(400).json({ error: 'Send { "confirm": "DELETE" } to delete this account.' });
  }

  const id = user._id;
  const posts = await Post.find({ author: id }, '_id');
  const postIds = posts.map((p) => p._id);
  await Promise.all([
    Post.deleteMany({ author: id }),
    PostLike.deleteMany({ $or: [{ user: id }, { post: { $in: postIds } }] }),
    PostComment.deleteMany({ $or: [{ author: id }, { post: { $in: postIds } }] }),
    PostBookmark.deleteMany({ $or: [{ user: id }, { post: { $in: postIds } }] }),
    PostShare.deleteMany({ $or: [{ user: id }, { post: { $in: postIds } }] }),
    CommentLike.deleteMany({ user: id }),
    Follow.deleteMany({ $or: [{ follower: id }, { following: id }] }),
    Block.deleteMany({ $or: [{ blocker: id }, { blocked: id }] }),
    MessageReaction.deleteMany({ user: id }),
    PollVote.deleteMany({ user: id }),
    Notification.deleteMany({ $or: [{ user: id }, { actor: id }] }),
    OAuthIdentity.deleteMany({ user: id }),
    PasswordReset.deleteMany({ user: id }),
    QuestRegistration.deleteMany({ user: id }),
    GroupJoinRequest.deleteMany({ user: id }),
    ConversationMember.deleteMany({ user: id }),
    // Their messages read "This message was deleted" for everyone.
    Message.updateMany({ sender: id }, { $set: { content: '', deletedForEveryone: true, deletedAt: new Date() } }),
  ]);

  const tomb = `deleted_${String(id).slice(-10)}_${crypto.randomBytes(3).toString('hex')}`;
  await User.updateOne(
    { _id: id },
    {
      $set: {
        deletedAt: new Date(),
        onboardingComplete: false,
        'profile.displayName': 'Deleted user',
        'profile.firstName': 'Deleted',
        'profile.lastName': 'user',
        'profile.username': tomb,
        'profile.usernameNormalized': tomb,
        'profile.bio': '',
        'profile.age': null,
        'profile.gender': '',
        'profile.avatarPhotoUrl': null,
        'account.phone': '',
        'account.dateOfBirth': null,
        'contact.email': '',
        'contact.phone': '',
        'contact.businessAddress': '',
        'location.lat': null,
        'location.lng': null,
        faction: null,
        interests: [],
        devices: [],
        pointsBalance: 0,
        currentSessionId: null,
      },
      $unset: { email: '', passwordHash: '' },
      // Every token issued before now stops working.
      $inc: { tokenVersion: 1 },
    }
  );
  return res.json({ deleted: true });
}

async function resolveTarget({ userId, username }) {
  if (isId(userId)) return User.findById(userId);
  if (typeof username === 'string' && username.trim()) return userModel.findByUsername(username);
  return null;
}

// POST /api/blocks { userId } or { username }: the profile screen, a group's
// member list, a message's menu, the game's friends list.
async function blockAnywhere(req, res) {
  const target = await resolveTarget(req.body || {});
  if (!target || target.deletedAt) return res.status(404).json({ error: 'Profile not found.' });
  if (String(target._id) === String(req.userId)) return res.status(400).json({ error: 'You cannot block your own profile.' });
  const already = await Block.findOne({ blocker: req.userId, blocked: target._id });
  if (!already) {
    await Block.create({ blocker: req.userId, blocked: target._id });
    await Follow.deleteMany({
      $or: [
        { follower: req.userId, following: target._id },
        { follower: target._id, following: req.userId },
      ],
    });
  }
  return res.status(already ? 200 : 201).json({ blocked: true, userId: String(target._id), username: target.profile?.username || null });
}

// DELETE /api/blocks/:userId
async function unblockAnywhere(req, res) {
  if (!isId(req.params.userId)) return res.status(400).json({ error: 'userId is not valid.' });
  await Block.deleteOne({ blocker: req.userId, blocked: req.params.userId });
  return res.json({ blocked: false, userId: req.params.userId });
}

// DELETE /api/users/me/devices { pushToken }
async function unregisterDevice(req, res) {
  const { pushToken } = req.body || {};
  if (typeof pushToken !== 'string' || !pushToken) return res.status(400).json({ error: 'pushToken is required.' });
  await User.updateOne({ _id: req.userId }, { $pull: { devices: { pushToken } } });
  return res.json({ removed: true });
}

const GAME_KINDS = ['raid_started', 'boss_appeared', 'duel_challenge', 'friend_joined', 'reward_ready', 'live_event', 'invite_accepted'];

// POST /api/notifications/game-events  (header X-Game-Events-Key)
// { userIds?: [], usernames?: [], kind, message, link? } -> one notification
// each (type "game") in the centre, plus a push. The game server's call.
async function gameEvent(req, res) {
  const key = process.env.GAME_EVENTS_KEY;
  if (!key) return res.status(503).json({ error: 'Game events are not configured on this server.' });
  const given = String(req.get('x-game-events-key') || '');
  const ok = given.length === key.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(key));
  if (!ok) return res.status(401).json({ error: 'Not allowed.' });
  const { userIds = [], usernames = [], kind, message, link } = req.body || {};
  if (!GAME_KINDS.includes(kind)) return res.status(400).json({ error: `kind must be one of ${GAME_KINDS.join(', ')}.` });
  if (typeof message !== 'string' || !message.trim() || message.length > 200) return res.status(400).json({ error: 'message is required (200 characters at most).' });
  if (link != null && (typeof link !== 'string' || !/^cosquest:\/\/play(\?|$)/.test(link))) {
    return res.status(400).json({ error: 'link must be a cosquest://play link.' });
  }
  const ids = (Array.isArray(userIds) ? userIds : []).filter(isId).slice(0, 500);
  const names = (Array.isArray(usernames) ? usernames : []).filter((n) => typeof n === 'string').slice(0, 500);
  const byName = names.length ? await User.find({ 'profile.usernameNormalized': { $in: names.map((n) => n.trim().toLowerCase()) } }, '_id') : [];
  const targets = [...new Set([...ids, ...byName.map((u) => String(u._id))])];
  const live = await User.find({ _id: { $in: targets }, deletedAt: null }, '_id');
  for (const u of live) {
    await notificationModel.createForUser(u._id, message.trim(), { type: 'game', link: link || null, gameKind: kind });
  }
  return res.status(201).json({ delivered: live.length });
}

module.exports = { capabilities, createReport, deleteAccount, blockAnywhere, unblockAnywhere, unregisterDevice, gameEvent, GAME_KINDS };
