const Conversation = require('../models/Conversation');
const ConversationMember = require('../models/ConversationMember');
const Message = require('../models/Message');
const {
  loadConversationForUser,
  loadMessageInConversation,
  serializeMessage,
  canSendToConversation,
  explicitGroupMemberIds,
  hiddenFor,
  forBroadcast,
  SENDER_FIELDS,
} = require('./chatController');
const { emitToConversationExcept, emitToUsers } = require('../realtime/socket');
const sparksHost = require('../sparks'); // @cosquest/sparks-backend

// The merged CosQuest app: the chat and the CostQuest game in one app.
//
// 1. Game invites (kind 'game_invite'). A message card that says "join me at
//    this raid / shrine / duel", with a place and maybe a time. Tapping Join
//    in the app swipes into the game and opens it at that spot. It is a
//    Message like any other, so replies, reactions, pinning, deleting, read
//    state and live updates all work as they do for polls.
// 2. GET /api/game/session: the game backend's single sign-on asks this,
//    with the person's own token, whether their chat session is still the
//    live one. requireAuth is the only check that knows about logouts
//    (tokenVersion) and sign-ins on another phone (sessionId), and chat
//    tokens never expire, so the game backend must not trust a token without
//    asking. Answers who the person is and nothing else.

const TYPES = ['raid', 'shrine', 'duel'];
const TARGET_ID = /^[A-Za-z0-9:_.-]{1,80}$/;
// An invite for a time long past or far away is a typo, not a plan.
const MAX_PAST_MS = 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 60 * 24 * 60 * 60 * 1000;

function parseInvite(body) {
  const type = body?.type;
  if (!TYPES.includes(type)) return { error: 'type must be raid, shrine or duel.' };

  const targetId = typeof body?.targetId === 'string' ? body.targetId.trim() : '';
  if (!TARGET_ID.test(targetId)) {
    return { error: 'targetId must be 1-80 letters, digits or : _ . -' };
  }

  const place = typeof body?.place === 'string' ? body.place.trim() : '';
  if (place.length > 80) return { error: 'place can be up to 80 characters.' };

  const hasLat = body?.lat !== undefined && body?.lat !== null;
  const hasLng = body?.lng !== undefined && body?.lng !== null;
  if (hasLat !== hasLng) return { error: 'Send both lat and lng, or neither.' };
  let lat = null;
  let lng = null;
  if (hasLat) {
    lat = Number(body.lat);
    lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return { error: 'lat must be -90..90 and lng -180..180.' };
    }
  }

  let startsAt = null;
  if (body?.startsAt !== undefined && body?.startsAt !== null && body?.startsAt !== '') {
    startsAt = new Date(body.startsAt);
    const now = Date.now();
    if (Number.isNaN(startsAt.getTime())) return { error: 'startsAt must be a date.' };
    if (startsAt.getTime() < now - MAX_PAST_MS || startsAt.getTime() > now + MAX_FUTURE_MS) {
      return { error: 'startsAt must be within the next 60 days.' };
    }
  }

  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  if (note.length > 300) return { error: 'note can be up to 300 characters.' };

  return { invite: { type, targetId, place, lat, lng, startsAt }, note };
}

async function previewToMembers(conversation) {
  const id = String(conversation._id);
  if (conversation.type === 'dm') {
    emitToUsers(conversation.participants.map(String), 'chat:preview', { conversationId: id });
  } else if (conversation.type === 'group' && conversation.group?.kind !== 'faction') {
    const memberIds = await explicitGroupMemberIds(conversation);
    emitToUsers(memberIds.map(String), 'chat:preview', { conversationId: id });
  }
}

// POST /api/chats/:conversationId/game-invites
// Body: { type: "raid" | "shrine" | "duel", targetId, place?, lat?, lng?,
//         startsAt? (ISO date), note? (shown with the card), replyTo? }
async function createGameInvite(req, res) {
  const { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) return res.status(error.status).json({ error: error.message });

  // Same rules as sending a message: blocked DMs, muted by an admin, slow mode.
  const sendError = await canSendToConversation(conversation, req.userId);
  if (sendError) return res.status(sendError.status).json({ error: sendError.message, ...(sendError.extra || {}) });

  const { invite, note, error: inviteError } = parseInvite(req.body);
  if (inviteError) return res.status(400).json({ error: inviteError });

  let replyTo = null;
  if (req.body?.replyTo) {
    const original = await loadMessageInConversation(conversation, req.body.replyTo);
    if (!original || original.deletedForEveryone || hiddenFor(original, req.userId)) {
      return res.status(400).json({ error: 'replyTo must reference a message in this conversation.' });
    }
    replyTo = original._id;
  }

  const now = new Date();
  const message = await Message.create({
    conversation: conversation._id,
    sender: req.userId,
    kind: 'game_invite',
    content: note,
    replyTo,
    gameInvite: invite,
  });

  await Promise.all([
    Conversation.updateOne({ _id: conversation._id }, { $inc: { messageCount: 1 } }),
    ConversationMember.updateOne(
      { conversation: conversation._id, user: req.userId },
      { $set: { lastReadAt: now, ...(conversation.type === 'group' ? { lastMessageAt: now } : {}) } },
      { upsert: true }
    ),
    message.populate('sender', SENDER_FIELDS),
  ]);
  if (replyTo) {
    await message.populate({ path: 'replyTo', populate: { path: 'sender', select: 'profile.username profile.firstName' } });
  }

  const serialized = serializeMessage(message, {
    viewerId: req.userId,
    conversationType: conversation.type,
    otherLastReadAt: null,
    reactions: [],
  });

  emitToConversationExcept(String(conversation._id), (message.replyTo?.deletedFor || []).map(String), 'message:new', {
    conversationId: String(conversation._id),
    message: forBroadcast(serialized),
  });
  previewToMembers(conversation).catch(() => {});

  // Sparks sees it as a system line (src/sparks/messageRow.js).
  if (sparksHost.isModule()) sparksHost.onMessage(message);

  return res.status(201).json({ message: serialized });
}

// Polish (task 059): POST /api/chats/:conversationId/game-results
// Body: { headline, pointName?, realm?, win?, xp?, coins?, level?, rank?, note? }
// A result card ("Won the duel at Trafalgar Square, +120 XP"). The message's
// content is the same line as text, for apps that do not draw the card.
function parseResult(body) {
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const num = (v, max) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), max) : 0;
  };
  const headline = str(body?.headline, 80);
  if (!headline) return { error: 'headline is required (up to 80 characters).' };
  const result = {
    headline,
    pointName: str(body?.pointName, 80),
    realm: str(body?.realm, 24),
    win: body?.win === true,
    xp: num(body?.xp, 100000),
    coins: num(body?.coins, 100000),
    level: body?.level === undefined || body?.level === null ? null : num(body.level, 1000),
    rank: str(body?.rank, 40),
  };
  const note = str(body?.note, 300);
  const line = `${result.win ? '🏆' : '⚔️'} ${headline.replace(/[!.]+$/, '')}${result.pointName ? ` at ${result.pointName}` : ''}${result.xp ? ` · +${result.xp} XP` : ''} in CosQuest`;
  return { result, content: note ? `${line}\n${note}` : line };
}

async function createGameResult(req, res) {
  const { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) return res.status(error.status).json({ error: error.message });
  const sendError = await canSendToConversation(conversation, req.userId);
  if (sendError) return res.status(sendError.status).json({ error: sendError.message, ...(sendError.extra || {}) });
  const { result, content, error: resultError } = parseResult(req.body);
  if (resultError) return res.status(400).json({ error: resultError });

  const now = new Date();
  const message = await Message.create({ conversation: conversation._id, sender: req.userId, kind: 'game_result', content, gameResult: result });
  await Promise.all([
    Conversation.updateOne({ _id: conversation._id }, { $inc: { messageCount: 1 } }),
    ConversationMember.updateOne(
      { conversation: conversation._id, user: req.userId },
      { $set: { lastReadAt: now, ...(conversation.type === 'group' ? { lastMessageAt: now } : {}) } },
      { upsert: true }
    ),
    message.populate('sender', SENDER_FIELDS),
  ]);
  const serialized = serializeMessage(message, { viewerId: req.userId, conversationType: conversation.type, otherLastReadAt: null, reactions: [] });
  emitToConversationExcept(String(conversation._id), [], 'message:new', { conversationId: String(conversation._id), message: forBroadcast(serialized) });
  previewToMembers(conversation).catch(() => {});
  if (sparksHost.isModule()) sparksHost.onMessage(message);
  return res.status(201).json({ message: serialized });
}

// GET /api/game/session (requireAuth)
async function getGameSession(req, res) {
  const user = req.user;
  return res.json({
    user: {
      id: String(user._id),
      username: user.profile?.username || null,
      displayName: user.profile?.displayName || null,
      faction: user.faction || null,
      avatarKey: user.profile?.avatarKey || null,
      avatarPhotoUrl: user.profile?.avatarPhotoUrl || null,
      onboardingComplete: Boolean(user.onboardingComplete),
    },
  });
}

module.exports = { createGameInvite, createGameResult, getGameSession, parseInvite, parseResult };
