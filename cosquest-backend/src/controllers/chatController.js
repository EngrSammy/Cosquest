const fs = require('fs');
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const ConversationMember = require('../models/ConversationMember');
const Message = require('../models/Message');
const MessageReaction = require('../models/MessageReaction');
const Spark = require('../models/Spark');
const PollVote = require('../models/PollVote');
const sparks = require('../utils/sparks'); // legacy engine (SPARKS_ENGINE=legacy)
const sparksHost = require('../sparks'); // @cosquest/sparks-backend (default)
const sparksCompat = require('../sparks/compat');
const GroupBan = require('../models/GroupBan');
const User = require('../models/User');
const userModel = require('../models/userModel');
const notificationModel = require('../models/notificationModel');
const { getFaction } = require('../models/factionModel');
const { expertiseLabel } = require('../models/expertiseModel');
const { storeChatMedia } = require('../utils/imageHost');
const { validateChatMedia } = require('../utils/chatMedia');
const { transcribeAudio } = require('../utils/transcribeAudio');
const { buildContentShare } = require('../utils/shareLinks');
const { isBlockedEitherWay } = require('./publicProfileController');
const { emitToConversation, emitToConversationExcept, emitToUsers } = require('../realtime/socket');
const { pushNewMessage } = require('../utils/messagePush');
const { isOnline } = require('../realtime/presence');

const EPOCH = new Date(0);
const DELETE_FOR_EVERYONE_WINDOW_MS = 5 * 60 * 1000;
const PIN_DURATIONS = { '24h': 24 * 60 * 60 * 1000, '7d': 7 * 24 * 60 * 60 * 1000, '30d': 30 * 24 * 60 * 60 * 1000 };
const CLEAR_PIN = { pinnedMessage: null, pinnedAt: null, pinnedUntil: null, pinnedBy: null, pinDuration: null };
const MAX_MENTIONS = 50;
const MAX_EDIT_HISTORY = 20;

function parseLimit(value, fallback = 30) {
  const limit = Number(value);
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : fallback;
}

function parsePage(value) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? Math.min(page, 1000) : 1;
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function userPreview(user) {
  return {
    id: String(user._id),
    username: user.profile.username,
    name: user.profile.displayName || [user.profile.firstName, user.profile.lastName].filter(Boolean).join(' ') || user.profile.username,
    avatarKey: user.profile.avatarKey,
    avatarPhotoUrl: user.profile.avatarPhotoUrl,
    faction: user.faction,
    lastActiveAt: user.privacy?.showOnlineStatus === false ? null : user.lastActiveAt,
    // Expertise role shown under the name ("Front-end"), or null.
    expertise: expertiseLabel(user.expertise),
  };
}

function cleanUpLocalFile(file) {
  if (file?.path) fs.unlink(file.path, () => {});
}

// ==========================================================================
// READ RECEIPTS (optional, like WhatsApp)
// ==========================================================================
// Turning read receipts off only affects reading FROM THEN ON:
//  - if the OTHER person turned theirs off, I see their reads only up to the
//    moment they did (ConversationMember.receiptsFrozenAt);
//  - if I turned mine off, I see their reads only up to the moment I did
//    (User.privacy.readReceiptsOffAt).
// Messages already read before that keep showing as read.

function readReceiptsOn(user) {
  return user?.privacy?.readReceipts !== false;
}

// How far `otherMember` has read, as far as `viewer` is allowed to see.
function visibleReadAt(otherMember, otherUser, viewer) {
  if (!otherMember) return null;

  let readAt = readReceiptsOn(otherUser) ? otherMember.lastReadAt : otherMember.receiptsFrozenAt || null;

  if (readAt && !readReceiptsOn(viewer)) {
    const offAt = viewer?.privacy?.readReceiptsOffAt;
    readAt = offAt ? new Date(Math.min(new Date(readAt).getTime(), new Date(offAt).getTime())) : null;
  }

  return readAt && readAt > EPOCH ? readAt : null;
}

// For a DM: how far the OTHER person has read, as far as the viewer is
// allowed to see (or null if it isn't a DM).
async function otherLastReadFor(conversation, viewer) {
  if (conversation.type !== 'dm') return null;

  const viewerId = viewer?._id || viewer;
  const otherId = conversation.participants.find((id) => String(id) !== String(viewerId));
  if (!otherId) return null;

  const [viewerDoc, otherUser, otherMember] = await Promise.all([
    viewer?.privacy ? viewer : User.findById(viewerId).select('privacy.readReceipts privacy.readReceiptsOffAt'),
    User.findById(otherId).select('privacy.readReceipts privacy.readReceiptsOffAt'),
    ConversationMember.findOne({ conversation: conversation._id, user: otherId }),
  ]);

  return visibleReadAt(otherMember, otherUser, viewerDoc);
}

// ==========================================================================
// @ MENTIONS
// ==========================================================================

// `mentions` can arrive as an array, a JSON string (multipart form), or a
// comma-separated string; `mentionsEveryone` as a boolean or "true".
function parseMentions(body) {
  let raw = body?.mentions;

  if (typeof raw === 'string') {
    const text = raw.trim();
    if (text.startsWith('[')) {
      try {
        raw = JSON.parse(text);
      } catch {
        raw = [];
      }
    } else {
      raw = text ? text.split(',') : [];
    }
  }

  const ids = Array.isArray(raw)
    ? [...new Set(raw.map((id) => String(id).trim()).filter((id) => mongoose.isValidObjectId(id)))]
    : [];

  const everyone = body?.mentionsEveryone === true || body?.mentionsEveryone === 'true';
  return { ids: ids.slice(0, MAX_MENTIONS), everyone };
}

// ==========================================================================
// GROUPS (user-created - see Conversation.js)
// ==========================================================================

const GROUP_ROLES = ['owner', 'admin', 'member'];

// Is this person in the group? Faction groups pull in that faction's members
// automatically; other groups use explicit membership (a row with a role).
async function isGroupMember(conversation, user) {
  if (conversation.type !== 'group' || conversation.group?.archived) return false;
  if (conversation.group?.kind === 'faction' && user?.faction && user.faction === conversation.factionKey) {
    // Banned people are kept out even though they're in the faction.
    return !(await GroupBan.exists({ conversation: conversation._id, user: user._id || user }));
  }
  return Boolean(
    await ConversationMember.exists({ conversation: conversation._id, user: user._id || user, role: { $in: GROUP_ROLES } })
  );
}

async function bannedUserIds(conversation) {
  const bans = await GroupBan.find({ conversation: conversation._id }, 'user');
  return bans.map((ban) => ban.user);
}

// owner / admin / member, or null if not in the group.
async function groupRoleOf(conversation, userOrId) {
  const userId = userOrId?._id || userOrId;
  const row = await ConversationMember.findOne({ conversation: conversation._id, user: userId }, 'role');
  if (row && GROUP_ROLES.includes(row.role)) return row.role;
  if (conversation.group?.kind === 'faction') {
    const user = userOrId?.faction !== undefined ? userOrId : await User.findById(userId).select('faction');
    if (user?.faction === conversation.factionKey && !(await GroupBan.exists({ conversation: conversation._id, user: userId }))) {
      return 'member';
    }
  }
  return null;
}

function isAdminRole(role) {
  return role === 'owner' || role === 'admin';
}

// Can `actor` act on `target` (delete their message, mute, remove, ban)?
// Admins act on members; only the owner acts on admins; nobody acts on the owner.
function canActOn(actorRole, targetRole) {
  if (!isAdminRole(actorRole)) return false;
  if (targetRole === 'owner') return false;
  if (targetRole === 'admin') return actorRole === 'owner';
  return true;
}

async function explicitGroupMemberIds(conversation) {
  const rows = await ConversationMember.find(
    { conversation: conversation._id, role: { $in: GROUP_ROLES } },
    'user'
  );
  return rows.map((row) => row.user);
}

// A User query for "everyone who can be in this chat" - the same rule
// loadConversationForUser() uses.
async function memberFilterFor(conversation) {
  if (conversation.type === 'dm') return { _id: { $in: conversation.participants } };
  if (conversation.type === 'faction') return { faction: conversation.factionKey, onboardingComplete: true };
  if (conversation.type === 'group') {
    const explicit = await explicitGroupMemberIds(conversation);
    const banned = await bannedUserIds(conversation);
    if (conversation.group?.kind === 'faction') {
      return {
        onboardingComplete: true,
        $or: [{ faction: conversation.factionKey }, { _id: { $in: explicit } }],
        _id: { $nin: banned },
      };
    }
    return { _id: { $in: explicit, $nin: banned } };
  }
  return { onboardingComplete: true };
}

async function countGroupMembers(conversation) {
  return User.countDocuments(await memberFilterFor(conversation));
}

// Keeps only real people who can actually see this chat (never the sender).
async function resolveMentions(conversation, senderId, ids) {
  if (!ids.length) return [];
  const users = await User.find({ ...(await memberFilterFor(conversation)), _id: { $in: ids } }, '_id');
  return users.map((user) => String(user._id)).filter((id) => id !== String(senderId));
}

function conversationLabel(conversation) {
  if (conversation.type === 'community') return 'Community';
  if (conversation.type === 'group') return conversation.group?.name || 'a group';
  if (conversation.type === 'faction') return getFaction(conversation.factionKey)?.name || 'your faction';
  return 'a chat';
}

// Notifies everyone mentioned (or everyone in the chat for @everyone).
async function notifyMentions(conversation, message, sender) {
  const senderId = String(sender._id);
  let targetIds = message.mentions.map(String);

  if (message.mentionsEveryone) {
    const everyone = await User.find({ ...(await memberFilterFor(conversation)), _id: { $ne: sender._id } }, '_id');
    targetIds = everyone.map((user) => String(user._id));
  }

  targetIds = targetIds.filter((id) => id !== senderId);
  if (!targetIds.length) return;

  // Don't notify people who blocked the sender (or whom the sender blocked).
  const allowed = [];
  for (const id of targetIds) {
    if (!(await isBlockedEitherWay(senderId, id))) allowed.push(id);
  }
  if (!allowed.length) return;

  const name = sender.profile?.username || sender.profile?.firstName || 'Someone';
  const where = conversation.type === 'dm' ? 'a message' : conversationLabel(conversation);
  const text = message.mentionsEveryone
    ? `${name} mentioned everyone in ${where}`
    : `${name} mentioned you in ${where}`;

  await notificationModel.createMentionNotifications(allowed, {
    message: text,
    actor: sender._id,
    conversation: conversation._id,
    chatMessage: message._id,
  });
}

// ==========================================================================
// CONVERSATIONS
// ==========================================================================

async function getOrCreateCommunityConversation() {
  const existing = await Conversation.findOne({ type: 'community' });
  if (existing) return existing;
  try {
    return await Conversation.create({ type: 'community' });
  } catch (error) {
    if (error?.code === 11000) return Conversation.findOne({ type: 'community' });
    throw error;
  }
}

async function getOrCreateFactionConversation(factionKey) {
  const existing = await Conversation.findOne({ type: 'faction', factionKey });
  if (existing) return existing;
  try {
    return await Conversation.create({ type: 'faction', factionKey });
  } catch (error) {
    if (error?.code === 11000) return Conversation.findOne({ type: 'faction', factionKey });
    throw error;
  }
}

async function getOrCreateDmConversation(userIdA, userIdB) {
  const dmKey = [String(userIdA), String(userIdB)].sort().join('_');
  let conversation = await Conversation.findOne({ type: 'dm', dmKey });
  if (!conversation) {
    try {
      conversation = await Conversation.create({ type: 'dm', dmKey, participants: [userIdA, userIdB] });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      conversation = await Conversation.findOne({ type: 'dm', dmKey });
    }
  }
  // Both sides need a membership row up front so the DM shows up in each
  // person's `GET /api/chats` list even before either has read anything.
  await Promise.all(
    [userIdA, userIdB].map((userId) =>
      ConversationMember.updateOne(
        { conversation: conversation._id, user: userId },
        { $setOnInsert: { lastReadAt: EPOCH } },
        { upsert: true }
      )
    )
  );
  return conversation;
}

// Access rules: community is open to any onboarded user, faction rooms follow
// the user's *current* faction (switching factions moves you automatically),
// DMs are restricted to their two participants, and groups to their members
// (faction groups: everyone in that faction, plus anyone added).
async function loadConversationForUser(conversationId, user) {
  if (!mongoose.isValidObjectId(conversationId)) return { error: { status: 404, message: 'Conversation not found.' } };
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) return { error: { status: 404, message: 'Conversation not found.' } };

  if (conversation.type === 'group' && conversation.group?.archived) {
    return { error: { status: 404, message: 'Conversation not found.' } };
  }

  const allowed =
    conversation.type === 'community' ||
    (conversation.type === 'faction' && conversation.factionKey === user.faction) ||
    (conversation.type === 'dm' && conversation.participants.some((participantId) => String(participantId) === String(user._id))) ||
    (conversation.type === 'group' && (await isGroupMember(conversation, user)));
  if (!allowed) return { error: { status: 403, message: 'You do not have access to this conversation.' } };

  return { conversation };
}

// Chat-list preview for a call entry, worded for the person LOOKING at it
// (like WhatsApp):
//
//   what happened   caller sees                  other person sees
//   answered        Voice call                   Voice call
//   rang out        Voice call - No answer       Missed voice call
//   declined        Voice call - Declined        You declined a voice call
//   cancelled       Voice call - Cancelled       Missed voice call
//
// viewerId is optional: without it (e.g. reply previews with no viewer
// context) it reads as the other person's side.
function callLogPreview(callLog, viewerId) {
  const video = callLog?.type === 'video';
  const icon = video ? '🎥' : '📞';
  const name = video ? 'Video call' : 'Voice call';
  const lower = video ? 'video call' : 'voice call';
  const isCaller = Boolean(viewerId) && String(callLog?.callerId) === String(viewerId);

  switch (callLog?.status) {
    case 'ended':
      return `${icon} ${name}`;
    case 'declined':
      return isCaller ? `${icon} ${name} · Declined` : `${icon} You declined a ${lower}`;
    case 'missed':
      return isCaller ? `${icon} ${name} · No answer` : `${icon} Missed ${lower}`;
    case 'cancelled':
      return isCaller ? `${icon} ${name} · Cancelled` : `${icon} Missed ${lower}`;
    default:
      return `${icon} ${name}`;
  }
}

function previewMessage(message, viewerId) {
  if (!message) return null;
  if (message.deletedForEveryone) return 'This message was deleted';
  if (message.kind === 'call') return callLogPreview(message.callLog, viewerId);
  if (message.kind === 'poll') return `📊 Poll: ${message.poll?.question || message.content}`;
  if (message.kind === 'game_invite') return gameInvitePreview(message.gameInvite);
  if (message.kind === 'game_result') return gameResultPreview(message.gameResult);
  if (message.kind === 'album') return albumPreview(message.album);
  if (message.kind === 'image') return 'Sent a photo';
  if (message.kind === 'video') return 'Sent a video';
  if (message.kind === 'sticker') return 'Sent a sticker';
  if (message.kind === 'audio') return 'Sent a voice note';
  if (message.kind === 'file') return 'Sent a file';
  return message.content;
}

async function summarizeConversation(conversation, me) {
  const [lastMessage, member] = await Promise.all([
    Message.findOne({ conversation: conversation._id, deletedFor: { $ne: me._id } })
      .sort({ createdAt: -1 })
      .populate('sender', 'profile.username profile.firstName'),
    ConversationMember.findOne({ conversation: conversation._id, user: me._id }),
  ]);
  const lastReadAt = member?.lastReadAt || EPOCH;
  const unreadCount = await Message.countDocuments({
    conversation: conversation._id,
    createdAt: { $gt: lastReadAt },
    sender: { $ne: me._id },
    deletedFor: { $ne: me._id },
    // "Mute only Sparks / thread activity": replies inside Sparks don't count.
    ...(member?.sparksMuted ? { postedInSpark: { $ne: true } } : {}),
  });

  const summary = {
    id: String(conversation._id),
    type: conversation.type,
    factionKey: null,
    title: null,
    memberCount: null,
    otherParticipant: null,
    messageCount: conversation.messageCount,
    unreadCount,
    // "Mute only Sparks / thread activity" is on for me.
    sparksMuted: Boolean(member?.sparksMuted),
    lastMessage: lastMessage
      ? {
          senderName: lastMessage.sender?.profile?.username || lastMessage.sender?.profile?.firstName || 'Someone',
          // me._id: call entries are worded for whoever is looking.
          preview: previewMessage(lastMessage, me._id),
          createdAt: lastMessage.createdAt,
        }
      : null,
    updatedAt: lastMessage ? lastMessage.createdAt : conversation.updatedAt,
  };

  if (conversation.type === 'community') {
    summary.title = 'Community';
    summary.memberCount = await User.countDocuments({ onboardingComplete: true });
  } else if (conversation.type === 'group') {
    const group = conversation.group || {};
    summary.title = group.name || 'Group';
    summary.factionKey = conversation.factionKey || null;
    summary.memberCount = await countGroupMembers(conversation);
    const now = new Date();
    const myRole = GROUP_ROLES.includes(member?.role) ? member.role : 'member';
    const slowModeSeconds = group.slowModeSeconds || 0;
    const nextSendAt =
      slowModeSeconds && !isAdminRole(myRole) && member?.lastMessageAt
        ? new Date(member.lastMessageAt.getTime() + slowModeSeconds * 1000)
        : null;
    summary.group = {
      kind: group.kind,
      // local (member-made) or regional (orchestrator-made)
      scope: group.scope || 'local',
      description: group.description || '',
      photoUrl: group.photoUrl || null,
      myRole,
      muted: Boolean(member?.mutedUntil && member.mutedUntil > now),
      mutedUntil: member?.mutedUntil || null,
      // Admins can mute people: they can read but not send until then.
      mutedByAdminUntil: member?.mutedByAdminUntil && member.mutedByAdminUntil > now ? member.mutedByAdminUntil : null,
      slowModeSeconds,
      // Slow mode: when I can send my next message (null = now).
      nextSendAt: nextSendAt && nextSendAt > now ? nextSendAt : null,
    };
  } else if (conversation.type === 'faction') {
    const faction = getFaction(conversation.factionKey);
    summary.factionKey = conversation.factionKey;
    summary.title = faction ? faction.name : conversation.factionKey;
    summary.memberCount = await User.countDocuments({ faction: conversation.factionKey });
  } else {
    const otherId = conversation.participants.find((participantId) => String(participantId) !== String(me._id));

    const [otherUser, otherMember] = otherId
      ? await Promise.all([
          User.findById(otherId),
          ConversationMember.findOne({ conversation: conversation._id, user: otherId }),
        ])
      : [null, null];

    if (otherUser) {
      // Same opt-out userPreview() already uses for lastActiveAt.
      const showsStatus = otherUser.privacy?.showOnlineStatus !== false;
      // Read receipts off on either side: only reads from before then.
      const otherLastReadAt = visibleReadAt(otherMember, otherUser, me);

      summary.otherParticipant = {
        ...userPreview(otherUser),
        isOnline: showsStatus ? await isOnline(otherUser._id) : false,
        lastReadAt: otherLastReadAt,
      };
    }

    summary.title = summary.otherParticipant?.name || summary.otherParticipant?.username || 'Direct Message';
  }

  return summary;
}

function groupReactions(reactionDocs, viewerId) {
  const byMessage = new Map();
  for (const reaction of reactionDocs) {
    const key = String(reaction.message);
    if (!byMessage.has(key)) byMessage.set(key, new Map());
    const emojiMap = byMessage.get(key);
    if (!emojiMap.has(reaction.emoji)) emojiMap.set(reaction.emoji, { emoji: reaction.emoji, count: 0, mine: false });
    const entry = emojiMap.get(reaction.emoji);
    entry.count += 1;
    if (String(reaction.user) === String(viewerId)) entry.mine = true;
  }
  const result = new Map();
  for (const [key, emojiMap] of byMessage) result.set(key, Array.from(emojiMap.values()));
  return result;
}

function replyPreview(original, viewerId) {
  if (!original) return null;
  if (viewerId && original.deletedFor?.some((id) => String(id) === String(viewerId))) {
    return { id: String(original._id), senderName: null, preview: 'Message unavailable' };
  }
  return {
    id: String(original._id),
    senderName: original.sender?.profile?.username || original.sender?.profile?.firstName || 'Someone',
    preview: previewMessage(original, viewerId),
  };
}

// ==========================================================================
// POLLS (kind 'poll')
// ==========================================================================

function pollIsClosed(poll) {
  return Boolean(poll?.closedAt) || Boolean(poll?.closesAt && new Date(poll.closesAt) <= new Date());
}

// What the app shows: options with vote counts, total voters, open/closed,
// and (for this viewer) which options they picked.
function buildPollSummary(message, votes = [], viewerId = null) {
  const poll = message.poll || {};
  const counts = new Map((poll.options || []).map((option) => [option.id, 0]));
  for (const vote of votes) {
    for (const optionId of vote.optionIds || []) {
      if (counts.has(optionId)) counts.set(optionId, counts.get(optionId) + 1);
    }
  }
  const mine = viewerId ? votes.find((vote) => String(vote.user) === String(viewerId)) : null;

  return {
    question: poll.question || message.content || '',
    options: (poll.options || []).map((option) => ({ id: option.id, text: option.text, votes: counts.get(option.id) || 0 })),
    multiple: Boolean(poll.multiple),
    anonymous: Boolean(poll.anonymous),
    closesAt: poll.closesAt || null,
    closedAt: poll.closedAt || null,
    closed: pollIsClosed(poll),
    totalVoters: votes.length,
    // Only meaningful for one viewer (REST); live updates leave it out.
    myVotes: mine ? [...mine.optionIds] : [],
  };
}

// Results for every poll in a page of messages (one query).
async function pollSummaries(messages, viewerId) {
  const polls = messages.filter((message) => message.kind === 'poll' && message.poll && !message.deletedForEveryone);
  if (!polls.length) return new Map();

  const votes = await PollVote.find({ message: { $in: polls.map((message) => message._id) } }, 'message user optionIds');
  const byMessage = new Map();
  for (const vote of votes) {
    const key = String(vote.message);
    if (!byMessage.has(key)) byMessage.set(key, []);
    byMessage.get(key).push(vote);
  }

  return new Map(polls.map((message) => [String(message._id), buildPollSummary(message, byMessage.get(String(message._id)) || [], viewerId)]));
}

// "📷 3 photos", "🎥 2 videos", "📷 4 photos & videos"
// GAME INVITES (kind 'game_invite', the merged app's CostQuest game)
const GAME_INVITE_LABELS = { raid: 'Raid', shrine: 'Shrine', duel: 'Duel' };

function gameInvitePreview(invite) {
  const label = GAME_INVITE_LABELS[invite?.type] || 'Game';
  return invite?.place ? `🎮 ${label} at ${invite.place}` : `🎮 ${label} invite`;
}

// Polish (task 059): kind 'game_result'.
function gameResultPreview(result) {
  if (!result) return '🎮 Game result';
  return `${result.win ? '🏆' : '⚔️'} ${result.headline}${result.pointName ? ` at ${result.pointName}` : ''}`;
}

function serializeGameResult(result) {
  if (!result) return null;
  return {
    headline: result.headline,
    pointName: result.pointName || '',
    realm: result.realm || '',
    win: Boolean(result.win),
    xp: Number(result.xp) || 0,
    coins: Number(result.coins) || 0,
    level: typeof result.level === 'number' ? result.level : null,
    rank: result.rank || '',
  };
}

function serializeGameInvite(invite) {
  if (!invite) return null;
  return {
    type: invite.type,
    targetId: invite.targetId,
    place: invite.place || '',
    lat: typeof invite.lat === 'number' ? invite.lat : null,
    lng: typeof invite.lng === 'number' ? invite.lng : null,
    startsAt: invite.startsAt || null,
  };
}

function albumPreview(album) {
  const items = Array.isArray(album) ? album : [];
  const videos = items.filter((item) => item?.kind === 'video').length;
  const photos = items.length - videos;
  if (!videos) return `📷 ${photos} ${photos === 1 ? 'photo' : 'photos'}`;
  if (!photos) return `🎥 ${videos} ${videos === 1 ? 'video' : 'videos'}`;
  return `📷 ${items.length} photos & videos`;
}

// `editedAt`, `canRollback` and `previousContent` are only filled in for the
// AUTHOR: nobody else knows a message was edited (per the group chat spec).
function serializeMessage(message, { viewerId, conversationType, otherLastReadAt, reactions, poll }) {
  const senderId = message.sender?._id || message.sender;
  const isMine = String(senderId) === String(viewerId);
  const read = conversationType === 'dm' && isMine ? Boolean(otherLastReadAt && message.createdAt <= otherLastReadAt) : undefined;
  const mentions = (message.mentions || []).map(String);

  if (message.deletedForEveryone) {
    return {
      id: String(message._id),
      kind: message.kind,
      content: message.deletedByAdmin ? 'This message was deleted by an admin.' : 'This message was deleted.',
      deletedByAdmin: Boolean(message.deletedByAdmin),
      media: null,
      callLog: null,
      sender: message.sender?.profile ? userPreview(message.sender) : undefined,
      replyTo: null,
      reactions: reactions || [],
      read,
      deleted: true,
      deletedAt: message.deletedAt,
      editedAt: null,
      canRollback: false,
      mentions: [],
      mentionsEveryone: false,
      forwarded: Boolean(message.forwardedFrom),
      spark: null,
      seq: typeof message.seq === 'number' ? message.seq : null,
      createdAt: message.createdAt,
    };
  }

  return {
    id: String(message._id),
    kind: message.kind,
    content: message.content,
    media: message.media || null,
    callLog: message.callLog || null,
    sender: message.sender?.profile ? userPreview(message.sender) : undefined,
    replyTo: replyPreview(message.replyTo, viewerId),
    reactions: reactions || [],
    read,
    deleted: false,
    deletedAt: null,
    editedAt: isMine ? message.editedAt || null : null,
    canRollback: isMine && Boolean(message.editHistory?.length),
    // "Before your change": the wording an undo would restore (author only).
    previousContent:
      isMine && message.editHistory?.length ? message.editHistory[message.editHistory.length - 1].content : null,
    // kind 'album': the photos/videos (the caption is `content`).
    album: message.kind === 'album' ? message.album || [] : null,
    // kind 'poll': question, options with vote counts, my votes.
    poll: message.kind === 'poll' && message.poll ? poll || buildPollSummary(message, [], null) : null,
    // kind 'game_invite': what to open in the game, where and when.
    gameInvite: message.kind === 'game_invite' ? serializeGameInvite(message.gameInvite) : null,
    gameResult: message.kind === 'game_result' ? serializeGameResult(message.gameResult) : null,
    mentions,
    mentionsEveryone: Boolean(message.mentionsEveryone),
    forwarded: Boolean(message.forwardedFrom),
    // Sparks: the sub-conversation this message is part of (marker in the
    // main chat; `era` drives the past/present colour).
    // The marker of whichever engine is on: module Sparks (sparkId) by
    // default, the stand-in's tags (spark/sparkEra) with SPARKS_ENGINE=legacy.
    spark: sparksHost.isModule()
      ? sparksCompat.messageMarker(message)
      : message.spark
        ? { id: String(message.spark), era: message.sparkEra || 0, postedInSpark: Boolean(message.postedInSpark) }
        : null,
    // Per-chat sequence number (Sparks; the app passes it to sdk.sparks.ingest).
    seq: typeof message.seq === 'number' ? message.seq : null,
    createdAt: message.createdAt,
  };
}

// The copy of a message sent live to EVERYONE in the room: never shows that
// it was edited (the author's own app gets that from the REST response).
function forBroadcast(serialized) {
  return { ...serialized, editedAt: null, canRollback: false, previousContent: null };
}

const SENDER_FIELDS = 'profile.username profile.displayName profile.firstName profile.lastName profile.avatarKey profile.avatarPhotoUrl faction lastActiveAt privacy.showOnlineStatus expertise';

// GET /api/chats - "Your Space" (community + faction room) plus every DM.
// chat:preview for a DM, with each participant's own summary (unread count,
// last message, the other person). Falls back to the bare event on any error.
async function emitDmPreviews(conversation) {
  const ids = conversation.participants.map(String);
  try {
    const users = await User.find({ _id: { $in: ids } });
    await Promise.all(
      users.map(async (user) => {
        const chat = await summarizeConversation(conversation, user);
        emitToUsers([String(user._id)], 'chat:preview', { conversationId: conversation.id, chat });
      })
    );
  } catch (err) {
    console.error('DM preview summaries failed:', err);
    emitToUsers(ids, 'chat:preview', { conversationId: conversation.id });
  }
}

// GET /api/chats[?ids=a,b,c]
// With `ids` (polish, docs/polish/BACKEND-PORT.md): only those of my chats are
// summarised and returned, for the app's reconnect catch-up and preview
// bursts (one request instead of one per chat). Without it, every chat, as
// before. Ids that aren't mine are simply left out.
function parseIdList(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return new Set(value.split(',').map((id) => id.trim()).filter((id) => mongoose.isValidObjectId(id)).slice(0, 200));
}

async function listChats(req, res) {
  const me = req.user;
  const only = parseIdList(req.query.ids);
  const rooms = [await getOrCreateCommunityConversation()];
  if (me.faction) rooms.push(await getOrCreateFactionConversation(me.faction));

  const memberships = await ConversationMember.find({ user: me._id }).populate('conversation');
  const seen = new Set(rooms.map((room) => String(room._id)));
  for (const membership of memberships) {
    const conversation = membership.conversation;
    if (!conversation || seen.has(String(conversation._id))) continue;
    const isDm = conversation.type === 'dm';
    const isMyGroup =
      conversation.type === 'group' && !conversation.group?.archived && GROUP_ROLES.includes(membership.role);
    if (isDm || isMyGroup) {
      rooms.push(conversation);
      seen.add(String(conversation._id));
    }
  }

  // Faction groups for my faction (members are pulled in automatically).
  if (me.faction) {
    const factionGroups = await Conversation.find({
      type: 'group',
      'group.kind': 'faction',
      factionKey: me.faction,
      'group.archived': { $ne: true },
    });
    const bans = factionGroups.length
      ? await GroupBan.find({ user: me._id, conversation: { $in: factionGroups.map((group) => group._id) } }, 'conversation')
      : [];
    const bannedFrom = new Set(bans.map((ban) => String(ban.conversation)));
    for (const conversation of factionGroups) {
      if (bannedFrom.has(String(conversation._id))) continue;
      if (!seen.has(String(conversation._id))) {
        rooms.push(conversation);
        seen.add(String(conversation._id));
      }
    }
  }

  const wanted = only ? rooms.filter((conversation) => only.has(String(conversation._id))) : rooms;
  const chats = await Promise.all(wanted.map((conversation) => summarizeConversation(conversation, me)));
  return res.json({ chats });
}

// Shared by "start a DM" and "forward to a user by name" - same rules either
// way: can't message yourself, a block hides the user entirely (404, same as
// everywhere else), and the target's own allowDirectMessages setting is the
// last gate.
async function resolveDmTarget(userId, username) {
  const target = await userModel.findByUsername(username);
  if (!target) return { error: { status: 404, message: 'User not found.' } };
  if (String(target._id) === String(userId)) return { error: { status: 400, message: 'You cannot message yourself.' } };
  if (await isBlockedEitherWay(userId, target._id)) return { error: { status: 404, message: 'User not found.' } };
  if (target.privacy?.allowDirectMessages === false) {
    return { error: { status: 403, message: 'This user is not accepting direct messages.' } };
  }
  return { target };
}

// POST /api/chats/dm - find-or-create a DM by target username.
async function startDirectMessage(req, res) {
  const { target, error } = await resolveDmTarget(req.userId, req.body?.username);
  if (error) return res.status(error.status).json({ error: error.message });

  const conversation = await getOrCreateDmConversation(req.userId, target._id);
  return res.json({ chat: await summarizeConversation(conversation, req.user) });
}

// GET /api/chats/:conversationId
async function getConversationDetail(req, res) {
  let { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) return res.status(error.status).json({ error: error.message });

  // Existing untimed pins receive a single 7-day window on their first read.
  if (conversation.pinnedMessage && !conversation.pinnedUntil) {
    const now = new Date();
    conversation = await Conversation.findOneAndUpdate(
      { _id: conversation._id, pinnedMessage: conversation.pinnedMessage, pinnedUntil: null },
      { $set: { pinnedAt: now, pinnedUntil: new Date(now.getTime() + PIN_DURATIONS['7d']), pinDuration: '7d' } },
      { new: true }
    ) || await Conversation.findById(conversation._id);
  }

  const summary = await summarizeConversation(conversation, req.user);
  let pinnedMessage = null;
  if (conversation.pinnedMessage && conversation.pinnedUntil > new Date()) {
    const pinned = await Message.findById(conversation.pinnedMessage).populate('sender', 'profile.username profile.firstName');
    if (pinned && !pinned.deletedForEveryone && !hiddenFor(pinned, req.userId)) {
      pinnedMessage = pinPreview(pinned, conversation);
    }
  }
  return res.json({ chat: { ...summary, pinnedMessage } });
}

// GET /api/chats/:conversationId/members?search=&page=&limit=
// The people in this chat, for the @ mention checkbox picker. DMs: the two
// participants. Faction rooms: everyone in that faction. Groups: their
// members. Community: everyone onboarded (use `search` there - it can be a
// lot of people).
async function listChatMembers(req, res) {
  const { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) return res.status(error.status).json({ error: error.message });

  const limit = parseLimit(req.query.limit, 50);
  const page = parsePage(req.query.page);
  const search = typeof req.query.search === 'string' ? req.query.search.trim().replace(/^@/, '') : '';

  const query = { ...(await memberFilterFor(conversation)) };
  query._id = query._id ? { ...query._id, $ne: req.user._id } : { $ne: req.user._id };
  if (conversation.type === 'dm') {
    query._id = { $in: conversation.participants.filter((id) => String(id) !== String(req.user._id)) };
  }
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    // $and, so this never overwrites a faction group's own $or (faction OR added).
    query.$and = [
      ...(query.$and || []),
      {
        $or: [
          { 'profile.username': pattern },
          { 'profile.displayName': pattern },
          { 'profile.firstName': pattern },
          { 'profile.lastName': pattern },
        ],
      },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(query)
      .select(SENDER_FIELDS)
      .sort({ 'profile.username': 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(query),
  ]);

  return res.json({
    members: users.map(userPreview),
    canMentionEveryone: true,
    pagination: { page, limit, total, hasMore: page * limit < total },
  });
}

// GET /api/chats/:conversationId/messages
async function listMessages(req, res) {
  const { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) return res.status(error.status).json({ error: error.message });

  const limit = parseLimit(req.query.limit);
  const page = parsePage(req.query.page);
  // `before` (polish, docs/polish/BACKEND-PORT.md): the page just older than
  // that message (an id in this chat) or that time (ISO). It replaces `page`
  // and doesn't shift when new messages arrive. Unknown values are ignored.
  const cursor = await messageCursor(conversation, req.query.before);
  const visible = { conversation: conversation._id, deletedFor: { $ne: req.userId } };
  const filter = cursor ? { ...visible, ...cursor } : visible;
  const [found, total, otherLastReadAt] = await Promise.all([
    Message.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(cursor ? 0 : (page - 1) * limit)
      .limit(cursor ? limit + 1 : limit)
      .populate('sender', SENDER_FIELDS)
      .populate({ path: 'replyTo', populate: { path: 'sender', select: 'profile.username profile.firstName' } }),
    Message.countDocuments(visible),
    otherLastReadFor(conversation, req.user),
  ]);
  const messages = cursor ? found.slice(0, limit) : found;
  const hasMore = cursor ? found.length > limit : page * limit < total;

  const [reactionDocs, polls] = await Promise.all([
    MessageReaction.find({ message: { $in: messages.map((message) => message._id) } }),
    pollSummaries(messages, req.userId),
  ]);
  const reactionsByMessage = groupReactions(reactionDocs, req.userId);

  return res.json({
    messages: messages.map((message) =>
      serializeMessage(message, {
        viewerId: req.userId,
        conversationType: conversation.type,
        otherLastReadAt,
        reactions: reactionsByMessage.get(String(message._id)) || [],
        poll: polls.get(String(message._id)),
      })
    ),
    pagination: {
      page: cursor ? null : page,
      limit,
      total,
      hasMore,
      // Pass as `before` for the next older page.
      nextBefore: messages.length ? String(messages[messages.length - 1]._id) : null,
    },
  });
}

// The query part for "older than `before`": a message id in this chat (its
// time, then its id for ties) or an ISO time. null when absent or unusable.
async function messageCursor(conversation, before) {
  if (typeof before !== 'string' || !before) return null;
  if (mongoose.isValidObjectId(before)) {
    const anchor = await Message.findOne({ _id: before, conversation: conversation._id }, 'createdAt');
    if (!anchor) return null;
    return {
      $or: [
        { createdAt: { $lt: anchor.createdAt } },
        { createdAt: anchor.createdAt, _id: { $lt: anchor._id } },
      ],
    };
  }
  const at = new Date(before);
  return Number.isNaN(at.getTime()) ? null : { createdAt: { $lt: at } };
}

// POST /api/chats/:conversationId/messages - text and/or one attachment.
// Optional @ mentions: `mentions` (user ids: array, JSON string, or
// comma-separated) and/or `mentionsEveryone` (true / "true").
async function createMessage(req, res) {
  const { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) {
    cleanUpLocalFile(req.file);
    return res.status(error.status).json({ error: error.message });
  }
  const sendError = await canSendToConversation(conversation, req.userId);
  if (sendError) {
    cleanUpLocalFile(req.file);
    return res.status(sendError.status).json({ error: sendError.message, ...(sendError.extra || {}) });
  }

  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  const file = req.file || null;
  if (!content && !file) {
    return res.status(400).json({ error: 'A message needs text or an attachment.' });
  }
  if (content.length > 2000) {
    cleanUpLocalFile(file);
    return res.status(400).json({ error: 'Message content must be at most 2,000 characters.' });
  }

  let replyTo = null;
  if (req.body.replyTo) {
    if (!mongoose.isValidObjectId(req.body.replyTo)) {
      cleanUpLocalFile(file);
      return res.status(400).json({ error: 'replyTo is not a valid message id.' });
    }
    const original = await Message.findById(req.body.replyTo);
    if (!original || String(original.conversation) !== String(conversation._id) || original.deletedForEveryone || hiddenFor(original, req.userId)) {
      cleanUpLocalFile(file);
      return res.status(400).json({ error: 'replyTo must reference a message in this conversation.' });
    }
    replyTo = original._id;
  }

  const validation = validateChatMedia(file, req.body);
  if (validation.error) {
    cleanUpLocalFile(file);
    return res.status(validation.status).json({ error: validation.error });
  }

  // Reply posted inside a Spark's panel.
  let sparkId = null;
  let moduleSpark = null;
  if (req.body.sparkId && sparksHost.isModule()) {
    moduleSpark = await sparksHost.replyFields(conversation._id, String(req.body.sparkId));
    if (!moduleSpark) {
      cleanUpLocalFile(file);
      return res.status(400).json({ error: 'That Spark no longer exists.' });
    }
  } else if (req.body.sparkId) {
    const spark = mongoose.isValidObjectId(req.body.sparkId)
      ? await Spark.findOne({ _id: req.body.sparkId, conversation: conversation._id, deletedAt: null }, '_id')
      : null;
    if (!spark) {
      cleanUpLocalFile(file);
      return res.status(400).json({ error: 'That Spark no longer exists.' });
    }
    sparkId = spark._id;
  }

  const requested = parseMentions(req.body);
  const mentions = await resolveMentions(conversation, req.userId, requested.ids);

  const { kind, waveform } = validation;
  let media = null;
  if (file) {
    media = await storeChatMedia(file, kind);
    if (waveform) media.waveform = waveform;
    if (kind === 'audio') media.transcribing = true;
  }

  const message = await Message.create({
    conversation: conversation._id,
    sender: req.userId,
    kind,
    content,
    media,
    replyTo,
    mentions,
    mentionsEveryone: requested.everyone,
    ...(moduleSpark || {}),
  });
  const populatePaths = [{ path: 'sender', select: SENDER_FIELDS }];
  if (replyTo) populatePaths.push({ path: 'replyTo', populate: { path: 'sender', select: 'profile.username profile.firstName' } });
  await Promise.all([
    Conversation.updateOne({ _id: conversation._id }, { $inc: { messageCount: 1 } }),
    ConversationMember.updateOne(
      { conversation: conversation._id, user: req.userId },
      { $set: { lastReadAt: new Date(), ...(conversation.type === 'group' ? { lastMessageAt: new Date() } : {}) } },
      { upsert: true }
    ),
    message.populate(populatePaths),
  ]);

  // Sparks: a reply from inside a Spark joins it right away (so it's tagged
  // in the live message); every other message goes through topic detection
  // after the response (tags arrive with the "spark:messages" event).
  if (sparkId) {
    const spark = await sparks.handleNewMessage(conversation, message, { sparkId }).catch((err) => {
      console.error('[sparks] reply failed:', err.message);
      return null;
    });
    if (spark) {
      message.spark = spark._id;
      message.sparkEra = Math.max(0, (spark.eras?.length || 1) - 1);
      message.postedInSpark = true;
    }
  }

  // Real-time fan-out: everyone with this conversation open gets the new
  // message instantly. `otherLastReadAt: null` matches the REST response -
  // the sender always sees their own message as unread-by-recipient at the
  // moment it's sent.
  const serialized = serializeMessage(message, { viewerId: req.userId, conversationType: conversation.type, otherLastReadAt: null, reactions: [] });
  // serialized.replyTo carries the reply target's real content, built from
  // the sender's own view (already checked they haven't hidden it - see the
  // replyTo validation above). Anyone else who's "deleted [that message] for
  // me" must not receive it live either; they'll pick the new message up
  // next time REST re-serves this conversation, same as any other offline
  // fallback here.
  emitToConversationExcept(conversation.id, deletedForIds(message.replyTo), 'message:new', { conversationId: conversation.id, message: forBroadcast(serialized) });
  // DMs also get a direct push to both participants' personal rooms, so the
  // chat list (unread badge / last-message preview) updates live even for
  // whoever doesn't currently have this conversation open.
  if (conversation.type === 'dm') {
    // Polish (docs/polish/BACKEND-PORT.md): each of the two gets their own
    // chat summary in the event, so the app needn't fetch the chat again.
    // Apps that only read conversationId are unaffected.
    void emitDmPreviews(conversation);
    // Polish: a phone push to the partner if they are away (PUSH_ENABLED=1).
    void pushNewMessage(conversation, message, req.user);
  } else if (conversation.type === 'group' && conversation.group?.kind !== 'faction') {
    // Group members' chat lists update live too (unread badge / preview).
    const memberIds = await explicitGroupMemberIds(conversation);
    emitToUsers(memberIds.map(String), 'chat:preview', { conversationId: conversation.id });
    void pushNewMessage(conversation, message, req.user, { memberIds });
  }

  if (message.mentions.length || message.mentionsEveryone) {
    notifyMentions(conversation, message, req.user).catch((err) => {
      console.error('Mention notifications failed:', err);
    });
  }

  if (kind === 'audio' && media?.url) {
    transcribeAndSaveVoiceNote(message._id, conversation, media.url).catch((err) => {
      console.error('Voice note transcription failed:', err);
    });
  }

  if (sparksHost.isModule()) {
    // Every chat type, DMs included; seq was assigned at insert.
    sparksHost.onMessage(message);
  } else if (!sparkId && sparks.SPARK_CHAT_TYPES.includes(conversation.type)) {
    sparks.handleNewMessage(conversation, message).catch((err) => {
      console.error('[sparks] detection failed:', err.message);
    });
  }

  return res.status(201).json({ message: serialized });
}

// Runs independently of the send response. Only update transcription fields,
// preserving edits and deletions made while Deepgram was processing the audio.
async function transcribeAndSaveVoiceNote(messageId, conversation, audioUrl) {
  let transcript = '';
  try {
    transcript = await transcribeAudio(audioUrl);
  } catch (err) {
    console.error('Deepgram transcription request failed:', err);
  }

  const message = await Message.findOneAndUpdate(
    { _id: messageId, kind: 'audio', 'media.url': audioUrl },
    { $set: { 'media.transcript': transcript || null, 'media.transcribing': false } },
    { new: true }
  );
  if (!message || message.deletedForEveryone) return;

  const senderId = message.sender;
  await message.populate('sender', SENDER_FIELDS);
  if (message.replyTo) {
    await message.populate({ path: 'replyTo', populate: { path: 'sender', select: 'profile.username profile.firstName' } });
  }
  const serialized = serializeMessage(message, {
    viewerId: senderId,
    conversationType: conversation.type,
    otherLastReadAt: await otherLastReadFor(conversation, senderId),
    reactions: await rawReactions(message._id),
  });
  const excludeFromBroadcast = [...new Set([...deletedForIds(message), ...deletedForIds(message.replyTo)])];
  emitToConversationExcept(conversation.id, excludeFromBroadcast, 'message:edited', {
    conversationId: conversation.id,
    message: forBroadcast(serialized),
  });
}

// Shared by edit and rollback: sends the changed message live (without the
// "edited" information - only the author knows) and builds the author's own
// REST response (with it).
async function respondWithChangedMessage(req, res, conversation, message) {
  await message.populate('sender', SENDER_FIELDS);
  await message.populate({ path: 'replyTo', populate: { path: 'sender', select: 'profile.username profile.firstName' } });

  // REST response keeps the existing per-viewer shape ({emoji, count, mine})
  // for the editor. The broadcast copy swaps in the viewer-agnostic raw list
  // instead (see rawReactions) so other sockets in the room don't receive
  // the editor's own `mine` flag mislabeled as theirs.
  const restReactions = await summarizeReactions(message._id, req.userId);
  const serialized = serializeMessage(message, {
    viewerId: req.userId,
    conversationType: conversation.type,
    otherLastReadAt: await otherLastReadFor(conversation, req.user),
    reactions: restReactions,
  });
  // Exclude anyone who's hidden this message for themselves (they shouldn't
  // see it change live) or hidden its reply target (same reasoning as
  // createMessage above) - union of both, deduped.
  const excludeFromBroadcast = [...new Set([...deletedForIds(message), ...deletedForIds(message.replyTo)])];
  emitToConversationExcept(conversation.id, excludeFromBroadcast, 'message:edited', {
    conversationId: conversation.id,
    message: { ...forBroadcast(serialized), reactions: await rawReactions(message._id) },
  });

  return res.json({ message: serialized });
}

// PATCH /api/chats/:conversationId/messages/:messageId - sender-only, text edits.
// The previous text is kept (editHistory) so the author can undo the edit.
async function editMessage(req, res) {
  const { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) return res.status(error.status).json({ error: error.message });

  const message = await loadMessageInConversation(conversation, req.params.messageId);
  if (!message) return res.status(404).json({ error: 'Message not found.' });
  if (String(message.sender) !== String(req.userId)) return res.status(403).json({ error: 'You can only edit your own message.' });
  if (message.deletedForEveryone) return res.status(400).json({ error: 'This message was deleted and cannot be edited.' });
  // Call entries are a record of what happened - not editable.
  if (message.kind === 'call') return res.status(400).json({ error: 'Call entries cannot be edited.' });
  if (message.kind === 'poll') return res.status(400).json({ error: 'Polls cannot be edited.' });
  if (message.kind === 'game_invite') return res.status(400).json({ error: 'Game invites cannot be edited.' });

  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  if (!content) return res.status(400).json({ error: 'content is required.' });
  if (content.length > 2000) return res.status(400).json({ error: 'Message content must be at most 2,000 characters.' });
  if (content === message.content) return respondWithChangedMessage(req, res, conversation, message);

  message.editHistory.push({ content: message.content, editedAt: new Date() });
  if (message.editHistory.length > MAX_EDIT_HISTORY) {
    message.editHistory = message.editHistory.slice(-MAX_EDIT_HISTORY);
  }
  message.content = content;
  message.editedAt = new Date();
  await message.save();

  return respondWithChangedMessage(req, res, conversation, message);
}

// POST /api/chats/:conversationId/messages/:messageId/rollback - undo the
// last edit (author only). Can be repeated to step back further.
async function rollbackMessage(req, res) {
  const { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) return res.status(error.status).json({ error: error.message });

  const message = await loadMessageInConversation(conversation, req.params.messageId);
  if (!message) return res.status(404).json({ error: 'Message not found.' });
  if (String(message.sender) !== String(req.userId)) return res.status(403).json({ error: 'You can only undo edits on your own message.' });
  if (message.deletedForEveryone) return res.status(400).json({ error: 'This message was deleted.' });
  if (!message.editHistory?.length) return res.status(400).json({ error: 'There is no earlier version to go back to.' });

  const previous = message.editHistory.pop();
  message.content = previous.content;
  message.editedAt = message.editHistory.length ? new Date() : null;
  await message.save();

  return respondWithChangedMessage(req, res, conversation, message);
}

// DELETE /api/chats/:conversationId/messages/:messageId?scope=me|everyone
// "me" (default): hides it from the caller only, any time, and only the
// database row's deletedFor list changes. "everyone": replaces it with a
// tombstone for every viewer, sender-only, within 5 minutes of sending - the
// row is never actually removed either way, only flagged.
async function deleteMessage(req, res) {
  if (req.query.scope !== undefined && !['me', 'everyone'].includes(req.query.scope)) {
    return res.status(400).json({ error: 'scope must be me or everyone.' });
  }
  const { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) return res.status(error.status).json({ error: error.message });

  const message = await loadMessageInConversation(conversation, req.params.messageId);
  if (!message) return res.status(404).json({ error: 'Message not found.' });

  const scope = req.query.scope === 'everyone' ? 'everyone' : 'me';
  const result = await deleteSelectedMessage(conversation, message, req.userId, scope);
  return res.status(result.status).json(result.body);
}

async function deleteSelectedMessage(conversation, message, userId, scope) {
  if (scope === 'everyone') {
    // Group admins can delete members' messages (any time). Only the owner
    // can delete an admin's message; nobody can delete the owner's.
    let byAdmin = false;
    if (String(message.sender) !== String(userId)) {
      if (conversation.type === 'group') {
        const [actorRole, targetRole] = await Promise.all([
          groupRoleOf(conversation, userId),
          groupRoleOf(conversation, message.sender),
        ]);
        byAdmin = canActOn(actorRole, targetRole || 'member');
      }
      if (!byAdmin) {
        return { status: 403, body: { error: 'You can only delete your own message for everyone.' } };
      }
    }
    if (!message.deletedForEveryone) {
      const ageMs = Date.now() - new Date(message.createdAt).getTime();
      if (!byAdmin && ageMs > DELETE_FOR_EVERYONE_WINDOW_MS) {
        return { status: 403, body: { error: 'Messages can only be deleted for everyone within 5 minutes of sending. You can still delete it for yourself.' } };
      }
      message.deletedForEveryone = true;
      message.deletedAt = new Date();
      if (byAdmin) message.deletedByAdmin = true;
      await message.save();
    }
    await Conversation.updateOne({ _id: conversation._id, pinnedMessage: message._id }, { $set: CLEAR_PIN });
    // "Everyone" deletes are visible to every viewer, so this is the one
    // delete scope worth pushing live - a "me" delete only changes what the
    // deleting user sees, so there's no one else to notify.
    emitToConversation(conversation.id, 'message:deleted', {
      conversationId: conversation.id,
      messageId: String(message._id),
      scope: 'everyone',
      byAdmin: Boolean(message.deletedByAdmin),
    });
    return { status: 200, body: { deleted: true, scope: 'everyone', byAdmin: Boolean(message.deletedByAdmin), messageId: String(message._id) } };
  }

  await Message.updateOne({ _id: message._id }, { $addToSet: { deletedFor: userId } });
  return { status: 200, body: { deleted: true, scope: 'me', messageId: String(message._id) } };
}

// PATCH /api/chats/:conversationId/read
async function markRead(req, res) {
  const { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) return res.status(error.status).json({ error: error.message });

  const lastReadAt = new Date();
  await ConversationMember.updateOne(
    { conversation: conversation._id, user: req.userId },
    { $set: { lastReadAt } },
    { upsert: true }
  );

  // Read receipts are optional: if I turned them off, nobody is told I read
  // it. In a DM, if the OTHER person turned them off, they don't get told
  // either (they can't see read receipts).
  let announce = readReceiptsOn(req.user);
  if (announce && conversation.type === 'dm') {
    const otherId = conversation.participants.find((id) => String(id) !== String(req.userId));
    const other = otherId ? await User.findById(otherId).select('privacy.readReceipts') : null;
    announce = readReceiptsOn(other);
  }

  if (announce) {
    emitToConversation(conversation.id, 'chat:read', { conversationId: conversation.id, userId: req.userId, lastReadAt });
  }
  return res.json({ message: 'Marked read.' });
}

// PATCH /api/chats/:conversationId/pinned-message - anyone can pin/unpin in
// DMs, Community and faction rooms; in groups only admins can.
async function setPinnedMessage(req, res) {
  const { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) return res.status(error.status).json({ error: error.message });
  if (conversation.type === 'group' && !isAdminRole(await groupRoleOf(conversation, req.user))) {
    return res.status(403).json({ error: 'Only admins can pin messages in this group.' });
  }

  if (req.body.messageId === undefined) return res.status(400).json({ error: 'messageId is required; use null to unpin.' });
  if (req.body.messageId === null) {
    await Conversation.updateOne({ _id: conversation._id }, { $set: CLEAR_PIN });
    emitToConversation(conversation.id, 'chat:pinned', { conversationId: conversation.id, pinnedMessage: null });
    return res.json({ pinnedMessage: null });
  }

  const duration = req.body.duration === undefined ? '7d' : req.body.duration;
  if (typeof duration !== 'string' || !Object.prototype.hasOwnProperty.call(PIN_DURATIONS, duration)) return res.status(400).json({ error: 'duration must be 24h, 7d, or 30d.' });

  if (!mongoose.isValidObjectId(req.body.messageId)) return res.status(400).json({ error: 'messageId is not valid.' });
  const message = await Message.findById(req.body.messageId).populate('sender', 'profile.username profile.firstName');
  if (!message || String(message.conversation) !== String(conversation._id) || hiddenFor(message, req.userId)) {
    return res.status(404).json({ error: 'Message not found in this conversation.' });
  }
  if (message.deletedForEveryone) return res.status(400).json({ error: 'A deleted message cannot be pinned.' });
  conversation.pinnedMessage = message._id;
  conversation.pinnedAt = new Date();
  conversation.pinnedUntil = new Date(conversation.pinnedAt.getTime() + PIN_DURATIONS[duration]);
  conversation.pinnedBy = req.userId;
  conversation.pinDuration = duration;
  await conversation.save();
  const pinnedMessage = pinPreview(message, conversation);
  // getConversationDetail nulls the pinned message out for anyone who's hidden
  // it (see hiddenFor() above) - the live broadcast has to honor that too,
  // otherwise pinning would hand its content to a viewer who deleted it.
  emitToConversationExcept(conversation.id, deletedForIds(message), 'chat:pinned', { conversationId: conversation.id, pinnedMessage });
  return res.json({ pinnedMessage });
}

function pinPreview(message, conversation) {
  return { ...replyPreview(message), content: message.content, kind: message.kind, createdAt: message.createdAt,
    pinnedAt: conversation.pinnedAt, expiresAt: conversation.pinnedUntil,
    pinnedBy: conversation.pinnedBy ? String(conversation.pinnedBy) : null, duration: conversation.pinDuration };
}

async function summarizeReactions(messageId, viewerId) {
  const docs = await MessageReaction.find({ message: messageId });
  return groupReactions(docs, viewerId).get(String(messageId)) || [];
}

// `summarizeReactions` bakes in a `mine` flag for one specific viewer, which
// is right for a REST response (one requester) but wrong to broadcast - every
// other socket in the room would see someone else's reaction mislabeled as
// "mine". Broadcast the raw {emoji, userId} facts instead and let each
// client derive its own `mine` locally against its own user id.
async function rawReactions(messageId) {
  const docs = await MessageReaction.find({ message: messageId }).select('emoji user');
  return docs.map((r) => ({ emoji: r.emoji, userId: String(r.user) }));
}

async function loadMessageInConversation(conversation, messageId) {
  if (!mongoose.isValidObjectId(messageId)) return null;
  const message = await Message.findById(messageId);
  if (!message || String(message.conversation) !== String(conversation._id)) return null;
  return message;
}

// POST /api/chats/:conversationId/messages/:messageId/reactions - upsert; a new emoji replaces the caller's old one.
async function setReaction(req, res) {
  const { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) return res.status(error.status).json({ error: error.message });

  const message = await loadMessageInConversation(conversation, req.params.messageId);
  if (!message || hiddenFor(message, req.userId)) return res.status(404).json({ error: 'Message not found.' });
  if (message.deletedForEveryone) return res.status(400).json({ error: 'A deleted message cannot receive reactions.' });

  const emoji = typeof req.body.emoji === 'string' ? req.body.emoji.trim() : '';
  if (!emoji || emoji.length > 32) return res.status(400).json({ error: 'emoji is required and must be short.' });

  await MessageReaction.findOneAndUpdate(
    { message: message._id, user: req.userId },
    { $set: { emoji } },
    { upsert: true }
  );
  emitToConversationExcept(conversation.id, deletedForIds(message), 'message:reaction', { conversationId: conversation.id, messageId: String(message._id), reactions: await rawReactions(message._id) });
  return res.status(201).json({ reactions: await summarizeReactions(message._id, req.userId) });
}

// DELETE /api/chats/:conversationId/messages/:messageId/reactions
async function removeReaction(req, res) {
  const { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) return res.status(error.status).json({ error: error.message });

  const message = await loadMessageInConversation(conversation, req.params.messageId);
  if (!message) return res.status(404).json({ error: 'Message not found.' });

  await MessageReaction.deleteOne({ message: message._id, user: req.userId });
  emitToConversationExcept(conversation.id, deletedForIds(message), 'message:reaction', { conversationId: conversation.id, messageId: String(message._id), reactions: await rawReactions(message._id) });
  return res.json({ reactions: await summarizeReactions(message._id, req.userId) });
}

// POST /api/chats/:conversationId/messages/:messageId/forward - body needs
// exactly one of targetConversationId (an existing conversation you're
// already in - Community, your faction room, or a DM) or targetUsername (any
// user, found via GET /api/users/search - the DM is found-or-created for you,
// same as tapping "+" to start a chat and then forwarding into it, subject to
// the same block/allowDirectMessages rules as starting a DM directly).
// Copies content/media into a brand-new message rather than moving or
// re-uploading anything; deleting or editing the original never touches it.
async function forwardMessage(req, res) {
  const { conversation: sourceConversation, error: sourceError } = await loadConversationForUser(req.params.conversationId, req.user);
  if (sourceError) return res.status(sourceError.status).json({ error: sourceError.message });

  const original = await loadMessageInConversation(sourceConversation, req.params.messageId);
  if (!original) return res.status(404).json({ error: 'Message not found.' });
  if (original.deletedForEveryone) return res.status(400).json({ error: 'This message was deleted and cannot be forwarded.' });
  if (original.deletedFor.some((userId) => String(userId) === String(req.userId))) {
    return res.status(404).json({ error: 'Message not found.' });
  }
  // A call entry belongs to the call it records - it can't be copied into
  // another chat.
  if (original.kind === 'call') return res.status(400).json({ error: 'Call entries cannot be forwarded.' });
  if (original.kind === 'poll') return res.status(400).json({ error: 'Polls cannot be forwarded.' });

  const { targetConversationId, targetUsername } = req.body;
  if (Boolean(targetConversationId) === Boolean(targetUsername)) {
    return res.status(400).json({ error: 'Provide exactly one of targetConversationId or targetUsername.' });
  }

  let targetConversation;
  if (targetUsername) {
    const { target, error: dmError } = await resolveDmTarget(req.userId, targetUsername);
    if (dmError) return res.status(dmError.status).json({ error: dmError.message });
    targetConversation = await getOrCreateDmConversation(req.userId, target._id);
  } else {
    const { conversation, error: targetError } = await loadConversationForUser(targetConversationId, req.user);
    if (targetError) return res.status(targetError.status).json({ error: 'You do not have access to that conversation.' });
    targetConversation = conversation;
  }

  const sendError = await canSendToConversation(targetConversation, req.userId);
  if (sendError) return res.status(sendError.status).json({ error: sendError.message });

  return res.status(201).json(await forwardCopy(original, targetConversation, req.userId));
}

// Forwarded copies never carry the original's mentions or edit history.
async function forwardCopy(original, targetConversation, userId) {
  let message = await Message.create({
    conversation: targetConversation._id,
    sender: userId,
    kind: original.kind,
    content: original.content,
    media: original.media,
    // An album's photos live in `album`, not `media` - without this the copy would be empty.
    album: original.kind === 'album' ? (original.album || []).map((item) => ({ ...item })) : undefined,
    // A game invite is forwardable: "come to this raid" passed on to another chat.
    gameInvite: original.kind === 'game_invite' ? serializeGameInvite(original.gameInvite) : undefined,
    forwardedFrom: original._id,
  });
  await Promise.all([
    Conversation.updateOne({ _id: targetConversation._id }, { $inc: { messageCount: 1 } }),
    ConversationMember.updateOne(
      { conversation: targetConversation._id, user: userId },
      { $set: { lastReadAt: new Date(), ...(targetConversation.type === 'group' ? { lastMessageAt: new Date() } : {}) } },
      { upsert: true }
    ),
  ]);
  message = await message.populate('sender', SENDER_FIELDS);
  sparksHost.onMessage(message); // no-op on the legacy engine

  const serialized = serializeMessage(message, { viewerId: userId, conversationType: targetConversation.type, otherLastReadAt: null, reactions: [] });
  emitToConversation(targetConversation.id, 'message:new', { conversationId: targetConversation.id, message: forBroadcast(serialized) });
  if (targetConversation.type === 'dm') {
    emitToUsers(targetConversation.participants.map(String), 'chat:preview', { conversationId: targetConversation.id });
  }

  // A copy made before transcription finishes needs its own completion.
  if (message.kind === 'audio' && message.media?.transcribing && message.media.url) {
    transcribeAndSaveVoiceNote(message._id, targetConversation, message.media.url).catch((err) => {
      console.error('Forwarded voice note transcription failed:', err);
    });
  }

  return {
    conversationId: String(targetConversation._id),
    message: serialized,
  };
}

function selectedIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50 || value.some((id) => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))) return null;
  return [...new Set(value.map((id) => id.toLowerCase()))];
}

function batchResponse(res, results) {
  const succeeded = results.filter((item) => item.status < 300).length;
  return res.status(succeeded === results.length ? 200 : 207).json({ results, summary: { total: results.length, succeeded, failed: results.length - succeeded } });
}

async function bulkDeleteMessages(req, res) {
  const ids = selectedIds(req.body.messageIds);
  const scope = req.body.scope === undefined ? 'me' : req.body.scope;
  if (!ids || !['me', 'everyone'].includes(scope)) return res.status(400).json({ error: 'Provide 1-50 valid messageIds and scope me or everyone.' });
  const { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) return res.status(error.status).json({ error: error.message });
  const results = [];
  for (const messageId of ids) {
    try {
      const message = await loadMessageInConversation(conversation, messageId);
      const result = message ? await deleteSelectedMessage(conversation, message, req.userId, scope) : { status: 404, body: { error: 'Message not found.' } };
      results.push({ messageId, status: result.status, ...result.body });
    } catch (error) {
      console.error('Bulk delete failed:', error);
      results.push({ messageId, status: 500, error: 'Deletion could not be confirmed. Refresh before retrying.' });
    }
  }
  return batchResponse(res, results);
}

async function bulkForwardMessages(req, res) {
  const ids = selectedIds(req.body.messageIds);
  if (!ids) return res.status(400).json({ error: 'Provide 1-50 valid messageIds.' });
  let targets = req.body.targets;
  if (targets === undefined) targets = [{ targetConversationId: req.body.targetConversationId, targetUsername: req.body.targetUsername }];
  else if (req.body.targetConversationId !== undefined || req.body.targetUsername !== undefined) return res.status(400).json({ error: 'Use targets or a single target, not both.' });
  if (!Array.isArray(targets) || targets.length < 1 || targets.length > 10 || targets.some((target) => !target || typeof target !== 'object' || Boolean(target.targetConversationId) === Boolean(target.targetUsername) || (target.targetConversationId && (typeof target.targetConversationId !== 'string' || !/^[a-f\d]{24}$/i.test(target.targetConversationId))) || (target.targetUsername && typeof target.targetUsername !== 'string'))) {
    return res.status(400).json({ error: 'Provide 1-10 targets, each with exactly one targetConversationId or targetUsername.' });
  }
  const { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) return res.status(error.status).json({ error: error.message });
  const originals = await Message.find({ _id: { $in: ids }, conversation: conversation._id, deletedForEveryone: false, deletedFor: { $ne: req.userId } }).sort({ createdAt: 1, _id: 1 });
  if (originals.length !== ids.length) return res.status(404).json({ error: 'One or more selected messages are unavailable in this conversation.' });
  // Same rule as single forward: call entries stay in their own chat.
  if (originals.some((original) => original.kind === 'call' || original.kind === 'poll')) {
    return res.status(400).json({ error: 'Call entries and polls cannot be forwarded. Unselect them and try again.' });
  }

  // Validate all destinations before creating a DM or sending any copy.
  const destinations = [];
  for (const target of targets) {
    if (target.targetUsername) {
      const resolved = await resolveDmTarget(req.userId, target.targetUsername);
      if (resolved.error) return res.status(resolved.error.status).json({ error: resolved.error.message });
      destinations.push({ user: resolved.target });
    } else {
      const resolved = await loadConversationForUser(target.targetConversationId, req.user);
      if (resolved.error) return res.status(resolved.error.status).json({ error: resolved.error.message });
      const sendError = await canSendToConversation(resolved.conversation, req.userId);
      if (sendError) return res.status(sendError.status).json({ error: sendError.message });
      destinations.push({ conversation: resolved.conversation });
    }
  }
  const conversations = new Map();
  for (const destination of destinations) {
    const target = destination.conversation || await getOrCreateDmConversation(req.userId, destination.user._id);
    conversations.set(target.id, target);
  }
  const results = [];
  for (const target of conversations.values()) {
    for (const original of originals) {
      const result = { sourceMessageId: original.id, conversationId: target.id };
      try {
        // Recheck per copy so a block or deletion during a batch is respected.
        const sendError = await canSendToConversation(target, req.userId);
        const current = await loadMessageInConversation(conversation, original.id);
        if (sendError) results.push({ ...result, status: sendError.status, error: sendError.message });
        else if (!current || current.deletedForEveryone || hiddenFor(current, req.userId)) results.push({ ...result, status: 404, error: 'Message unavailable.' });
        else results.push({ ...result, status: 201, ...await forwardCopy(current, target, req.userId) });
      } catch (error) {
        console.error('Bulk forward failed:', error);
        results.push({ ...result, status: 500, error: 'Forward could not be confirmed. Refresh before retrying.' });
      }
    }
  }
  return batchResponse(res, results);
}

function hiddenFor(message, userId) {
  return message.deletedFor?.some((id) => String(id) === String(userId));
}

// Who has "deleted [this message] for me"? Used to keep realtime broadcasts
// honest with the same rule every REST read already enforces via hiddenFor -
// see emitToConversationExcept in src/realtime/socket.js.
function deletedForIds(message) {
  return (message?.deletedFor || []).map(String);
}

async function canSendToConversation(conversation, senderId) {
  if (conversation.type === 'group') {
    const row = await ConversationMember.findOne({ conversation: conversation._id, user: senderId });
    const now = new Date();

    // Muted by an admin: can read, can't send.
    if (row?.mutedByAdminUntil && row.mutedByAdminUntil > now) {
      return {
        status: 403,
        message: 'An admin muted you in this group. You can read messages but not send them for now.',
        extra: { code: 'muted_by_admin', mutedUntil: row.mutedByAdminUntil },
      };
    }

    // Slow mode: one message every N seconds (admins aren't limited).
    const slow = conversation.group?.slowModeSeconds || 0;
    if (slow > 0 && !isAdminRole(row?.role) && row?.lastMessageAt) {
      const nextAt = row.lastMessageAt.getTime() + slow * 1000;
      if (nextAt > now.getTime()) {
        const wait = Math.ceil((nextAt - now.getTime()) / 1000);
        return {
          status: 429,
          message: `Slow mode is on. You can send again in ${wait}s.`,
          extra: { code: 'slow_mode', retryAfterSeconds: wait, nextSendAt: new Date(nextAt) },
        };
      }
    }
    return null;
  }

  if (conversation.type !== 'dm') return null;
  const otherId = conversation.participants.find((id) => String(id) !== String(senderId));
  const [other, blocked] = await Promise.all([User.findById(otherId), isBlockedEitherWay(senderId, otherId)]);
  if (!other || blocked) return { status: 403, message: 'Direct messages are unavailable for this conversation.' };
  if (other.privacy?.allowDirectMessages === false) return { status: 403, message: 'This user is not accepting direct messages.' };
  return null;
}

// Deep-link resolution checks membership, including for a message outside the first page.
async function getMessage(req, res) {
  const { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) return res.status(error.status).json({ error: error.message });
  const message = await loadMessageInConversation(conversation, req.params.messageId);
  if (!message || hiddenFor(message, req.userId)) return res.status(404).json({ error: 'Message not found.' });
  await message.populate('sender', SENDER_FIELDS);
  await message.populate({ path: 'replyTo', populate: { path: 'sender', select: 'profile.username profile.firstName' } });
  return res.json({ message: serializeMessage(message, {
    viewerId: req.userId, conversationType: conversation.type, otherLastReadAt: await otherLastReadFor(conversation, req.user),
    reactions: await summarizeReactions(message._id, req.userId),
    poll: (await pollSummaries([message], req.userId)).get(String(message._id)),
  }) });
}

async function getChatShareLink(req, res) {
  const { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) return res.status(error.status).json({ error: error.message });
  let path = `/c/${conversation.id}`;
  if (req.params.messageId) {
    const message = await loadMessageInConversation(conversation, req.params.messageId);
    if (!message || message.deletedForEveryone || hiddenFor(message, req.userId)) return res.status(404).json({ error: 'Message not found.' });
    path += `/m/${message.id}`;
  }
  return res.json({ ...buildContentShare(req, path, 'CosQuest chat', 'Open this conversation in CosQuest.'), requiresAuthentication: true });
}

// GET /api/chats/:conversationId/messages/:messageId/seen - who has read up to
// (and including) this message, excluding the sender. In a DM this is
// naturally 0 or 1 person; in community/faction rooms it can be many, hence
// the pagination. Relies on the same ConversationMember.lastReadAt the unread
// badge and DM read-receipt already use - no new schema needed.
//
// Read receipts are optional: if I turned mine off I see nobody, and people
// who turned theirs off are never listed.
async function getMessageSeenBy(req, res) {
  const { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) return res.status(error.status).json({ error: error.message });

  const message = await loadMessageInConversation(conversation, req.params.messageId);
  if (!message) return res.status(404).json({ error: 'Message not found.' });

  const limit = parseLimit(req.query.limit);
  const page = parsePage(req.query.page);

  // I turned mine off: I only see who read it if it was sent before then.
  if (!readReceiptsOn(req.user)) {
    const offAt = req.user.privacy?.readReceiptsOffAt;
    if (!offAt || message.createdAt > offAt) {
      return res.json({ seenBy: [], readReceiptsOff: true, pagination: { page, limit, total: 0, hasMore: false } });
    }
  }

  // People who turned theirs off are listed only if they'd read it before then.
  const hiddenUsers = await User.find({ 'privacy.readReceipts': false }, '_id');
  const hiddenIds = hiddenUsers.map((user) => user._id);
  const query = {
    conversation: conversation._id,
    user: { $ne: message.sender },
    $or: [
      { user: { $nin: hiddenIds }, lastReadAt: { $gte: message.createdAt } },
      { user: { $in: hiddenIds }, receiptsFrozenAt: { $gte: message.createdAt } },
    ],
  };
  const [members, total] = await Promise.all([
    ConversationMember.find(query)
      .populate('user', 'profile.username profile.firstName profile.lastName profile.avatarKey profile.avatarPhotoUrl faction privacy.readReceipts expertise')
      .sort({ lastReadAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    ConversationMember.countDocuments(query),
  ]);

  return res.json({
    seenBy: members.filter((member) => member.user).map((member) => ({
      ...userPreview(member.user),
      seenAt: readReceiptsOn(member.user) ? member.lastReadAt : member.receiptsFrozenAt,
    })),
    pagination: { page, limit, total, hasMore: page * limit < total },
  });
}

// PATCH /api/chats/:conversationId/notifications  { sparksMuted: boolean }
// "Mute only Sparks / thread activity" for me in this chat.
async function setChatNotifications(req, res) {
  const { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) return res.status(error.status).json({ error: error.message });
  if (typeof req.body?.sparksMuted !== 'boolean') {
    return res.status(400).json({ error: 'sparksMuted must be true or false.' });
  }
  // A brand-new row starts "unread from the beginning" (EPOCH), like muteGroup -
  // changing a setting must not quietly mark the whole chat as read.
  await ConversationMember.updateOne(
    { conversation: conversation._id, user: req.userId },
    { $set: { sparksMuted: req.body.sparksMuted }, $setOnInsert: { lastReadAt: EPOCH } },
    { upsert: true }
  );
  return res.json({ sparksMuted: req.body.sparksMuted });
}

module.exports = {
  setChatNotifications,
  listChats,
  startDirectMessage,
  getConversationDetail,
  listChatMembers,
  listMessages,
  createMessage,
  editMessage,
  rollbackMessage,
  deleteMessage,
  markRead,
  setPinnedMessage,
  setReaction,
  removeReaction,
  getMessageSeenBy,
  forwardMessage,
  bulkDeleteMessages,
  bulkForwardMessages,
  getMessage,
  getChatShareLink,
  loadConversationForUser,
  loadMessageInConversation,
  serializeMessage,
  summarizeConversation,
  userPreview,
  isGroupMember,
  countGroupMembers,
  groupRoleOf,
  canActOn,
  isAdminRole,
  hiddenFor,
  groupReactions,
  otherLastReadFor,
  canSendToConversation,
  explicitGroupMemberIds,
  forBroadcast,
  albumPreview,
  gameInvitePreview,
  serializeGameInvite,
  buildPollSummary,
  pollIsClosed,
  pollSummaries,
  GROUP_ROLES,
  SENDER_FIELDS,
};
