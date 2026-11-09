/**
 * Who is in a chat, as the Sparks module sees it (ports.chatMembers,
 * ports.isAdmin, ports.canRead). Same access rules as the REST layer
 * (loadConversationForUser / memberFilterFor in chatController.js).
 *
 * Membership by chat type:
 *  - dm:        the two participants; BOTH count as admins of their own DM
 *               (there is nobody else to protect, so either may pin, merge
 *               or delete the DM's Sparks).
 *  - group:     explicit members (owner/admin/member); faction groups also
 *               pull in the faction. Admins = owner and admin. Banned people
 *               are out.
 *  - community, faction rooms (implicit membership: everyone onboarded /
 *               everyone in the faction): the module needs a concrete list
 *               (it seals it into AI jobs and picks worker phones from it),
 *               so these use the ENGAGED members: people who opened the
 *               chat (a ConversationMember row) or wrote in it in the last
 *               30 days, most recent first, capped at SPARKS_IMPLICIT_MEMBER_CAP
 *               (default 300), still filtered by the room's access rule.
 *               Nobody is an admin there (same as before: nobody can pin,
 *               merge or delete Sparks in Community or faction rooms).
 *               Everyone viewing the room still sees Sparks (the REST API and
 *               the conversation room broadcast are not limited by the cap).
 *
 * Roles (for role pings) are the user's expertise label, exactly as
 * expertiseModel.js spells it ("Front-end", "Costume crafting"): readable,
 * one spelling, exact match. Ranks: CosQuest users have none yet, so `rank`
 * is omitted.
 */
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const ConversationMember = require('../models/ConversationMember');
const GroupBan = require('../models/GroupBan');
const Message = require('../models/Message');
const User = require('../models/User');
const { expertiseLabel } = require('../models/expertiseModel');

const GROUP_ROLES = ['owner', 'admin', 'member'];
const CACHE_MS = 5_000;
const USER_FIELDS = 'profile.username profile.displayName profile.firstName profile.lastName expertise faction onboardingComplete';

const cache = new Map(); // key -> { at, value }
function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = fn().catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 5000) cache.delete(cache.keys().next().value);
  return value;
}
function invalidate(chatId) {
  for (const key of cache.keys()) if (key.includes(String(chatId))) cache.delete(key);
}

function implicitCap() {
  const n = Number(process.env.SPARKS_IMPLICIT_MEMBER_CAP);
  return Number.isInteger(n) && n > 0 ? n : 300;
}

function displayNameOf(user) {
  const p = user.profile || {};
  return p.displayName || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.username || 'Someone';
}

function toMember(user, isAdmin) {
  const label = expertiseLabel(user.expertise);
  return { userId: String(user._id), displayName: displayNameOf(user), roles: label ? [label] : [], isAdmin: Boolean(isAdmin) };
}

async function loadConversation(chatId) {
  if (!mongoose.isValidObjectId(chatId)) return null;
  return cached(`conv:${chatId}`, () => Conversation.findById(chatId).lean());
}

// People recently engaged with an implicit-membership room.
async function engagedUserIds(conversation) {
  const cap = implicitCap();
  const [rows, senders] = await Promise.all([
    ConversationMember.find({ conversation: conversation._id }, 'user').sort({ updatedAt: -1 }).limit(cap).lean(),
    Message.aggregate([
      { $match: { conversation: conversation._id, createdAt: { $gte: new Date(Date.now() - 30 * 86_400_000) } } },
      { $sort: { createdAt: -1 } },
      { $limit: 2000 },
      { $group: { _id: '$sender', last: { $max: '$createdAt' } } },
      { $sort: { last: -1 } },
      { $limit: cap },
    ]),
  ]);
  const ids = [];
  const seen = new Set();
  for (const id of [...senders.map((s) => s._id), ...rows.map((r) => r.user)]) {
    const key = String(id);
    if (!seen.has(key)) {
      seen.add(key);
      ids.push(id);
    }
  }
  return ids.slice(0, cap);
}

async function computeMembers(chatId) {
  const conversation = await loadConversation(chatId);
  if (!conversation || conversation.group?.archived) return [];

  if (conversation.type === 'dm') {
    const users = await User.find({ _id: { $in: conversation.participants } }, USER_FIELDS).lean();
    return users.map((u) => toMember(u, true));
  }

  if (conversation.type === 'group') {
    const [rows, bans] = await Promise.all([
      ConversationMember.find({ conversation: conversation._id, role: { $in: GROUP_ROLES } }, 'user role').lean(),
      GroupBan.find({ conversation: conversation._id }, 'user').lean(),
    ]);
    const banned = new Set(bans.map((b) => String(b.user)));
    const roleOf = new Map(rows.map((r) => [String(r.user), r.role]));
    let ids = rows.map((r) => r.user);
    if (conversation.group?.kind === 'faction') {
      const engaged = await engagedUserIds(conversation);
      ids = [...ids, ...engaged];
    }
    const filter = { _id: { $in: ids }, onboardingComplete: true };
    const users = await User.find(filter, USER_FIELDS).lean();
    return users
      .filter((u) => !banned.has(String(u._id)))
      .filter((u) => roleOf.has(String(u._id)) || u.faction === conversation.factionKey)
      .map((u) => toMember(u, ['owner', 'admin'].includes(roleOf.get(String(u._id)))));
  }

  // community / faction room
  const ids = await engagedUserIds(conversation);
  const filter = { _id: { $in: ids }, onboardingComplete: true, ...(conversation.type === 'faction' ? { faction: conversation.factionKey } : {}) };
  const users = await User.find(filter, USER_FIELDS).lean();
  return users.map((u) => toMember(u, false));
}

function chatMembers(chatId) {
  return cached(`members:${chatId}`, () => computeMembers(chatId));
}

async function isAdmin(userId, chatId) {
  const conversation = await loadConversation(chatId);
  if (!conversation) return false;
  if (conversation.type === 'dm') return conversation.participants.some((p) => String(p) === String(userId));
  if (conversation.type !== 'group' || conversation.group?.archived) return false;
  const row = await ConversationMember.findOne({ conversation: conversation._id, user: userId }, 'role').lean();
  if (!['owner', 'admin'].includes(row?.role)) return false;
  return !(await GroupBan.exists({ conversation: conversation._id, user: userId }));
}

// The REST layer's access rule for one user and one chat.
async function hasAccess(userId, chatId) {
  if (!mongoose.isValidObjectId(userId)) return false;
  return cached(`access:${userId}:${chatId}`, async () => {
    const conversation = await loadConversation(chatId);
    if (!conversation) return false;
    if (conversation.type === 'dm') return conversation.participants.some((p) => String(p) === String(userId));
    const user = await User.findById(userId, 'faction onboardingComplete').lean();
    if (!user) return false;
    if (conversation.type === 'community') return Boolean(user.onboardingComplete);
    if (conversation.type === 'faction') return Boolean(user.faction) && user.faction === conversation.factionKey;
    if (conversation.group?.archived) return false;
    if (await GroupBan.exists({ conversation: conversation._id, user: userId })) return false;
    if (conversation.group?.kind === 'faction' && user.faction && user.faction === conversation.factionKey) return true;
    return Boolean(await ConversationMember.exists({ conversation: conversation._id, user: userId, role: { $in: GROUP_ROLES } }));
  });
}

/**
 * History visibility: may this user read message `seq` of this chat?
 * They must have access to the chat (as for GET /messages), and must not
 * have deleted that message "for me" (Message.deletedFor). CosQuest groups
 * show new members the whole history, so there is no join-date cut-off.
 */
async function canRead(userId, chatId, seq) {
  if (!(await hasAccess(userId, chatId))) return false;
  const conversation = oid(chatId);
  if (!conversation || !mongoose.isValidObjectId(userId)) return false;
  const hidden = await Message.exists({ conversation, seq, deletedFor: new mongoose.Types.ObjectId(String(userId)) });
  return !hidden;
}

/**
 * canRead for many messages at once (module 1.2, ports.canReadMany): one
 * access check and one query instead of one per message. Same answer as
 * canRead for each seq, in the same order.
 */
async function canReadMany(userId, chatId, seqs) {
  if (!seqs.length) return [];
  const conversation = oid(chatId);
  if (!conversation || !mongoose.isValidObjectId(userId) || !(await hasAccess(userId, chatId))) return seqs.map(() => false);
  const hidden = await Message.find({ conversation, seq: { $in: seqs }, deletedFor: new mongoose.Types.ObjectId(String(userId)) }, 'seq').lean();
  const hiddenSeqs = new Set(hidden.map((m) => m.seq));
  return seqs.map((seq) => !hiddenSeqs.has(seq));
}

function oid(id) {
  return mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(String(id)) : null;
}

module.exports = { chatMembers, isAdmin, canRead, canReadMany, hasAccess, invalidate, displayNameOf };
