const mongoose = require('mongoose');
const VoiceRoom = require('../models/VoiceRoom');
const { createCallToken, getLivekitUrl } = require('../utils/livekit');
const { loadConversationForUser } = require('./chatController');
const { emitToConversation, emitToUsers } = require('../realtime/socket');

const MAX_MEMBERS = VoiceRoom.MAX_MEMBERS;
const STALE_AFTER_MS = VoiceRoom.STALE_AFTER_MS;
const USER_FIELDS =
  'profile.username profile.displayName profile.firstName profile.lastName profile.avatarKey profile.avatarPhotoUrl';

// ==========================================================================
// HELPERS
// ==========================================================================

function idOf(value) {
  return String(value?._id || value || '');
}

function displayName(user) {
  const profile = user?.profile || {};
  return (
    profile.displayName ||
    [profile.firstName, profile.lastName].filter(Boolean).join(' ') ||
    profile.username ||
    'User'
  );
}

function userPreview(user) {
  if (!user?.profile) {
    return { id: idOf(user), username: null, name: 'User', avatarKey: null, avatarPhotoUrl: null };
  }
  return {
    id: idOf(user),
    username: user.profile.username,
    name: displayName(user),
    avatarKey: user.profile.avatarKey,
    avatarPhotoUrl: user.profile.avatarPhotoUrl,
  };
}

function isMember(room, userId) {
  return room.members.some((member) => idOf(member.user) === String(userId));
}

// Removes anyone whose app hasn't checked in for 90 seconds.
function pruneStale(room, now = new Date()) {
  const cutoff = now.getTime() - STALE_AFTER_MS;
  const before = room.members.length;
  room.members = room.members.filter((member) => new Date(member.lastSeenAt).getTime() > cutoff);
  return room.members.length !== before;
}

// The voice chat closes when the last person leaves.
function closeIfEmpty(room, now = new Date()) {
  if (room.active && room.members.length === 0) {
    room.active = false;
    room.endedAt = now;
    return true;
  }
  return false;
}

function toVoiceJson(room) {
  return {
    id: idOf(room),
    conversationId: idOf(room.conversation),
    conversationType: room.conversationType,
    factionKey: room.factionKey || null,
    active: Boolean(room.active),
    startedBy: userPreview(room.startedBy),
    startedAt: room.createdAt,
    endedAt: room.endedAt,
    members: room.members.map((member) => ({
      user: userPreview(member.user),
      joinedAt: member.joinedAt,
    })),
    memberCount: room.members.length,
    maxMembers: MAX_MEMBERS,
  };
}

async function populateRoom(room) {
  if (!room) return room;
  await room.populate([
    { path: 'startedBy', select: USER_FIELDS },
    { path: 'members.user', select: USER_FIELDS },
  ]);
  return room;
}

// Loads a voice chat, applies a change and saves it, retrying if someone
// else changed it at the same moment. Same idea as mutateCall().
async function mutateRoom(roomId, mutator) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const room = await VoiceRoom.findById(roomId);
    if (!room) return { room: null };

    const result = mutator(room);
    if (result?.error) return { room: await populateRoom(room), error: result.error };
    if (result === false) return { room: await populateRoom(room), changed: false };

    try {
      await room.save();
      return { room: await populateRoom(room), changed: true, result };
    } catch (error) {
      if (error?.name === 'VersionError') continue;
      throw error;
    }
  }

  const error = new Error('The voice chat changed too quickly. Please try again.');
  error.status = 409;
  throw error;
}

// Tells everyone looking at that chat (and everyone in the voice chat) who's
// in it now. `voiceRoom: null` means it has closed.
function broadcastVoiceUpdate(room, extraUserIds = []) {
  const conversationId = idOf(room.conversation);
  const payload = { conversationId, voiceRoom: room.active ? toVoiceJson(room) : null };

  emitToConversation(conversationId, 'voice:updated', payload);

  const memberIds = room.members.map((member) => idOf(member.user));
  emitToUsers([...new Set([...memberIds, ...extraUserIds.map(String)])], 'voice:updated', payload);
}

// Removes stale members (and closes the room if it's empty), right now.
async function refreshRoom(roomId) {
  const { room, changed } = await mutateRoom(roomId, (current) => {
    if (!current.active) return false;
    const now = new Date();
    const pruned = pruneStale(current, now);
    const closed = closeIfEmpty(current, now);
    return pruned || closed ? true : false;
  });

  if (room && changed) broadcastVoiceUpdate(room);
  return room;
}

// Voice chats are for the Community room and faction rooms only.
async function loadVoiceConversation(conversationId, user) {
  const { conversation, error } = await loadConversationForUser(conversationId, user);
  if (error) return { error };
  if (!['community', 'faction'].includes(conversation.type)) {
    return {
      error: {
        status: 400,
        message: 'Voice chats are for Community and faction chats. Use a call in direct messages.',
      },
    };
  }
  return { conversation };
}

async function tokenFor(room, user) {
  return createCallToken({
    userId: user._id,
    name: displayName(user),
    roomName: room.roomName,
  });
}

// Takes this person out of any other voice chat they're still in, so they
// are only ever in one at a time.
async function leaveOtherRooms(userId, keepRoomId = null) {
  const filter = { active: true, 'members.user': userId };
  if (keepRoomId) filter._id = { $ne: keepRoomId };

  const others = await VoiceRoom.find(filter, '_id');
  for (const other of others) {
    const { room, changed } = await mutateRoom(other._id, (current) => {
      if (!isMember(current, userId)) return false;
      current.members = current.members.filter((member) => idOf(member.user) !== String(userId));
      closeIfEmpty(current);
      return true;
    });
    if (room && changed) broadcastVoiceUpdate(room, [userId]);
  }
}

async function findVoiceRoomForUser(roomId) {
  if (!mongoose.isValidObjectId(roomId)) return { status: 404, error: 'Voice chat not found.' };
  const room = await VoiceRoom.findById(roomId, '_id conversation');
  if (!room) return { status: 404, error: 'Voice chat not found.' };
  return { room };
}

// ==========================================================================
// ENDPOINTS
// ==========================================================================

// GET /api/chats/:conversationId/voice - is a voice chat live in this room?
async function getVoiceRoom(req, res) {
  const { conversation, error } = await loadVoiceConversation(req.params.conversationId, req.user);
  if (error) return res.status(error.status).json({ error: error.message });

  const live = await VoiceRoom.findOne({ conversation: conversation._id, active: true }, '_id');
  if (!live) return res.json({ voiceRoom: null });

  const room = await refreshRoom(live._id);
  return res.json({ voiceRoom: room?.active ? toVoiceJson(room) : null });
}

// POST /api/chats/:conversationId/voice/join - start the voice chat (if none
// is live) or join the one that is. Returns the LiveKit token to connect.
async function joinVoiceRoom(req, res) {
  const { conversation, error } = await loadVoiceConversation(req.params.conversationId, req.user);
  if (error) return res.status(error.status).json({ error: error.message });

  // Validate configuration before creating anything.
  getLivekitUrl();

  const userId = String(req.userId);
  let live = await VoiceRoom.findOne({ conversation: conversation._id, active: true }, '_id');

  if (live) await refreshRoom(live._id);
  live = await VoiceRoom.findOne({ conversation: conversation._id, active: true }, '_id');

  let room;
  let started = false;

  if (!live) {
    // Nobody's talking yet - start a new voice chat.
    const now = new Date();
    const fresh = new VoiceRoom({
      conversation: conversation._id,
      conversationType: conversation.type,
      factionKey: conversation.type === 'faction' ? conversation.factionKey : null,
      startedBy: req.userId,
      members: [{ user: req.userId, joinedAt: now, lastSeenAt: now }],
    });
    fresh.roomName = `voice_${fresh._id}`;

    try {
      await fresh.save();
      room = await populateRoom(fresh);
      started = true;
    } catch (saveError) {
      if (saveError?.code !== 11000) throw saveError;
      // Someone else started one at the same moment - join theirs instead.
      live = await VoiceRoom.findOne({ conversation: conversation._id, active: true }, '_id');
    }
  }

  if (!room && !live) {
    return res.status(409).json({ error: 'The voice chat changed. Please try again.' });
  }

  if (!room) {
    const result = await mutateRoom(live._id, (current) => {
      if (!current.active) return { error: { status: 410, message: 'This voice chat has ended. Try again.' } };

      const now = new Date();
      pruneStale(current, now);

      const mine = current.members.find((member) => idOf(member.user) === userId);
      if (mine) {
        mine.lastSeenAt = now;
        return true;
      }
      if (current.members.length >= MAX_MEMBERS) {
        return { error: { status: 409, message: `This voice chat is full (${MAX_MEMBERS} people).` } };
      }

      current.members.push({ user: req.userId, joinedAt: now, lastSeenAt: now });
      return true;
    });

    if (result.error) return res.status(result.error.status).json({ error: result.error.message });
    room = result.room;
  }

  await leaveOtherRooms(userId, room._id);
  broadcastVoiceUpdate(room);

  return res.status(started ? 201 : 200).json({
    voiceRoom: toVoiceJson(room),
    token: await tokenFor(room, req.user),
    livekitUrl: getLivekitUrl(),
  });
}

// POST /api/voice/:roomId/ping - "I'm still here" (every 30 seconds).
async function pingVoiceRoom(req, res) {
  const found = await findVoiceRoomForUser(req.params.roomId);
  if (found.error) return res.status(found.status).json({ error: found.error });

  const userId = String(req.userId);
  let membershipChanged = false;

  const { room, changed, error } = await mutateRoom(found.room._id, (current) => {
    if (!current.active) return { error: { status: 410, message: 'This voice chat has ended.' } };

    const now = new Date();
    const mine = current.members.find((member) => idOf(member.user) === userId);
    if (!mine) return { error: { status: 404, message: 'You are not in this voice chat.' } };

    mine.lastSeenAt = now;
    membershipChanged = pruneStale(current, now);
    closeIfEmpty(current, now);
    return true;
  });

  if (error) {
    return res.status(error.status).json({
      error: error.message,
      voiceRoom: room?.active ? toVoiceJson(room) : null,
    });
  }
  if (changed && membershipChanged) broadcastVoiceUpdate(room);
  return res.json({ voiceRoom: room.active ? toVoiceJson(room) : null });
}

// POST /api/voice/:roomId/leave
async function leaveVoiceRoom(req, res) {
  const found = await findVoiceRoomForUser(req.params.roomId);
  if (found.error) return res.status(found.status).json({ error: found.error });

  const userId = String(req.userId);

  const { room, changed } = await mutateRoom(found.room._id, (current) => {
    if (!current.active || !isMember(current, userId)) return false;

    const now = new Date();
    current.members = current.members.filter((member) => idOf(member.user) !== userId);
    pruneStale(current, now);
    closeIfEmpty(current, now);
    return true;
  });

  if (room && changed) broadcastVoiceUpdate(room, [userId]);
  return res.json({ voiceRoom: room?.active ? toVoiceJson(room) : null });
}

module.exports = {
  getVoiceRoom,
  joinVoiceRoom,
  pingVoiceRoom,
  leaveVoiceRoom,
  // Exported for tests.
  _internal: { pruneStale, closeIfEmpty },
};
