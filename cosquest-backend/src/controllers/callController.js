const mongoose = require('mongoose');
const Call = require('../models/Call');
const User = require('../models/User');
const userModel = require('../models/userModel');
const { createCallToken, getLivekitUrl } = require('../utils/livekit');
const { isBlockedEitherWay } = require('./publicProfileController');
const { loadConversationForUser } = require('./chatController');
const { emitToUsers } = require('../realtime/socket');
const { recordCallMessage } = require('../utils/callMessage');

const RING_TIMEOUT_MS = 45 * 1000;
const MAX_IN_CALL = Call.MAX_IN_CALL;
const MAX_INVITES_PER_REQUEST = MAX_IN_CALL - 1;
const TERMINAL_STATUSES = ['declined', 'missed', 'cancelled', 'ended'];
const USER_FIELDS =
  'profile.username profile.displayName profile.firstName profile.lastName profile.avatarKey profile.avatarPhotoUrl';

// ==========================================================================
// SMALL HELPERS
// ==========================================================================

function idOf(value) {
  return String(value?._id || value || '');
}

function ringCutoff(now = new Date()) {
  return new Date(now.getTime() - RING_TIMEOUT_MS);
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

function memberOf(call, userId) {
  return call.members.find((member) => idOf(member.user) === String(userId)) || null;
}

function participantIds(call) {
  return call.participants.map(idOf);
}

function isActive(call) {
  return !TERMINAL_STATUSES.includes(call.status);
}

// Calls started before group calls existed have no `members` - build them
// from the old fields so every call can be handled the same way.
function ensureMembers(call) {
  if (call.members?.length) return;

  const callerId = idOf(call.caller);
  const memberStatusFor = (isCaller) => {
    if (call.status === 'accepted') return 'joined';
    if (call.status === 'ringing') return isCaller ? 'joined' : 'ringing';
    if (call.status === 'ended') return 'left';
    if (call.status === 'declined') return isCaller ? 'left' : 'declined';
    return isCaller ? 'left' : 'missed';
  };

  call.members = call.participants.map((participant) => {
    const isCaller = idOf(participant) === callerId;
    return {
      user: participant,
      status: memberStatusFor(isCaller),
      invitedBy: isCaller ? null : call.caller,
      invitedAt: call.createdAt,
      joinedAt: isCaller ? call.createdAt : call.answeredAt,
      leftAt: call.endedAt,
    };
  });
}

// ==========================================================================
// CALL RULES (the same for one-to-one and group calls)
// ==========================================================================

// Anyone still ringing after 45 seconds has missed it.
function expireRinging(call, now = new Date()) {
  let changed = false;
  const cutoff = ringCutoff(now);

  call.members.forEach((member) => {
    if (member.status === 'ringing' && new Date(member.invitedAt) <= cutoff) {
      member.status = 'missed';
      member.leftAt = now;
      changed = true;
    }
  });

  return changed;
}

// Works out the call's overall status from everyone's own status.
function settle(call, now = new Date()) {
  if (!isActive(call)) return;

  const joined = call.members.filter((member) => member.status === 'joined');
  const ringing = call.members.filter((member) => member.status === 'ringing');

  const finish = (status) => {
    call.status = status;
    call.endedAt = now;
    call.members.forEach((member) => {
      if (member.status === 'ringing') {
        member.status = 'missed';
        member.leftAt = now;
      } else if (member.status === 'joined') {
        member.status = 'left';
        member.leftAt = now;
      }
    });
  };

  if (call.status === 'ringing' && joined.length >= 2) {
    call.status = 'accepted';
    call.answeredAt = call.answeredAt || now;
    return;
  }

  if (call.status === 'ringing') {
    // Nobody has answered yet.
    if (joined.length === 0) return finish('cancelled'); // the caller hung up

    if (ringing.length === 0) {
      // Everyone invited either declined or didn't answer.
      const callerId = idOf(call.caller);
      const others = call.members.filter((member) => idOf(member.user) !== callerId);
      const everyoneDeclined = others.length > 0 && others.every((member) => member.status === 'declined');
      return finish(everyoneDeclined ? 'declined' : 'missed');
    }
    return;
  }

  // Answered: the call ends when nobody (or only one person, with nobody
  // else still ringing) is left in it.
  if (joined.length === 0 || (joined.length === 1 && ringing.length === 0)) {
    finish('ended');
  }
}

// ==========================================================================
// LOADING, SAVING AND SENDING
// ==========================================================================

async function populateCall(call) {
  if (!call) return call;
  await call.populate([
    { path: 'caller', select: USER_FIELDS },
    { path: 'members.user', select: USER_FIELDS },
  ]);
  return call;
}

function toCallJson(call) {
  return {
    id: idOf(call),
    conversationId: idOf(call.conversation),
    conversationType: call.conversationType || 'dm',
    type: call.type,
    status: call.status,
    isGroup: Boolean(call.isGroup),
    caller: userPreview(call.caller),
    members: call.members.map((member) => ({
      user: userPreview(member.user),
      status: member.status,
      invitedBy: member.invitedBy ? idOf(member.invitedBy) : null,
      invitedAt: member.invitedAt || null,
      joinedAt: member.joinedAt || null,
      leftAt: member.leftAt || null,
    })),
    maxParticipants: MAX_IN_CALL,
    createdAt: call.createdAt,
    answeredAt: call.answeredAt,
    endedAt: call.endedAt,
  };
}

// Loads a call, applies a change, and saves it. If someone else changed the
// same call at the same moment, it reloads and tries again.
//
// `mutator(call)` returns:
//   false                     - nothing changed (no save)
//   { error: {status, ...} }  - stop with that error (no save)
//   anything else             - save, and pass it back as `result`
async function mutateCall(callId, mutator) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const call = await Call.findById(callId);
    if (!call) return { call: null };

    ensureMembers(call);
    const result = mutator(call);

    if (result?.error) return { call: await populateCall(call), error: result.error };
    if (result === false) return { call: await populateCall(call), changed: false };

    try {
      await call.save();
      return { call: await populateCall(call), changed: true, result };
    } catch (error) {
      if (error?.name === 'VersionError') continue; // changed by someone else - retry
      throw error;
    }
  }

  const error = new Error('The call changed too quickly. Please try again.');
  error.status = 409;
  throw error;
}

// Tells everyone who was part of the call what changed, and saves the call
// entry in the chat once the call has finished.
function broadcastCallUpdate(call) {
  emitToUsers(participantIds(call), 'call:updated', { call: toCallJson(call) });
  // Sparks: call transcription/outline bookkeeping (no-op on the legacy engine).
  require('../sparks/calls').sync(call);

  if (!isActive(call)) {
    recordCallMessage(call).catch((error) =>
      console.error('[calls] failed to record call message:', error.message)
    );
  }
}

// Applies the 45-second rule to a call right now (and sends any change).
async function refreshCall(callId) {
  const { call, changed } = await mutateCall(callId, (current) => {
    if (!isActive(current)) return false;
    if (!expireRinging(current)) return false;
    settle(current);
    return true;
  });

  if (call && changed) broadcastCallUpdate(call);
  return call;
}

// Refreshes every active call these people are ringing in or part of.
async function refreshCallsFor(userIds) {
  const calls = await Call.find(
    {
      active: true,
      $or: [
        { activeMembers: { $in: userIds } },
        // Calls started before group calls existed.
        { participants: { $in: userIds }, 'members.0': { $exists: false } },
      ],
    },
    '_id'
  );
  await Promise.all(calls.map((call) => refreshCall(call._id)));
}

function scheduleRingTimeout(callId) {
  const timer = setTimeout(() => {
    refreshCall(callId).catch((error) =>
      console.error('[calls] missed-call check failed:', error.message)
    );
  }, RING_TIMEOUT_MS + 1000);
  timer.unref?.();
}

// Is this person ringing in, or part of, another active call?
async function isBusy(userId, exceptCallId = null) {
  const filter = {
    active: true,
    $or: [
      { activeMembers: userId },
      { participants: userId, 'members.0': { $exists: false } },
    ],
  };
  if (exceptCallId) filter._id = { $ne: exceptCallId };
  return Boolean(await Call.exists(filter));
}

async function joinInfo(call, user) {
  const token = await createCallToken({
    userId: user._id,
    name: displayName(user),
    roomName: call.roomName,
  });
  return { call: toCallJson(call), token, livekitUrl: getLivekitUrl() };
}

async function findCallForUser(callId, userId) {
  if (!mongoose.isValidObjectId(callId)) return { status: 404, error: 'Call not found.' };
  const call = await Call.findById(callId, 'participants');
  if (!call) return { status: 404, error: 'Call not found.' };
  if (!participantIds(call).includes(String(userId))) {
    return { status: 403, error: 'You are not part of this call.' };
  }
  return { callId: call._id };
}

// ==========================================================================
// ENDPOINTS
// ==========================================================================

// POST /api/chats/:conversationId/calls - start a one-to-one call in a DM.
async function startCall(req, res) {
  const { type } = req.body || {};

  if (!['audio', 'video'].includes(type)) {
    return res.status(400).json({ error: 'Call type must be audio or video.' });
  }
  const { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) return res.status(error.status).json({ error: error.message });
  if (conversation.type !== 'dm') {
    return res.status(400).json({ error: 'Calls start in direct messages. Use a voice chat in groups.' });
  }

  const memberIds = conversation.participants.map(String);
  if (memberIds.length !== 2) {
    return res.status(400).json({ error: 'A direct-message call needs exactly two participants.' });
  }

  const recipientId = memberIds.find((id) => id !== String(req.userId));
  const recipient = await User.findById(recipientId).select('privacy.allowDirectMessages');
  if (!recipient || await isBlockedEitherWay(req.userId, recipientId)) {
    return res.status(403).json({ error: 'Calls are unavailable for this conversation.' });
  }
  if (recipient.privacy?.allowDirectMessages === false) {
    return res.status(403).json({ error: 'This user is not accepting direct messages or calls.' });
  }

  // Validate configuration before creating a ringing call.
  getLivekitUrl();

  await refreshCallsFor(memberIds);

  const existing = await Call.findOne({
    active: true,
    $or: [
      { conversation: conversation._id },
      { activeMembers: { $in: memberIds } },
      { participants: { $in: memberIds }, 'members.0': { $exists: false } },
    ],
  });
  if (existing) {
    const sameConversation = String(existing.conversation) === String(conversation._id);
    return res.status(409).json({
      error: sameConversation
        ? 'A call is already in progress in this chat.'
        : 'One of you is already on another call.',
    });
  }

  const now = new Date();
  const call = new Call({
    conversation: conversation._id,
    conversationType: 'dm',
    type,
    caller: req.userId,
    participants: memberIds,
    members: [
      { user: req.userId, status: 'joined', invitedAt: now, joinedAt: now },
      { user: recipientId, status: 'ringing', invitedBy: req.userId, invitedAt: now },
    ],
    status: 'ringing',
  });
  call.roomName = `call_${call._id}`;

  try {
    await call.save();
  } catch (saveError) {
    if (saveError?.code === 11000) {
      return res.status(409).json({ error: 'A call is already in progress in this chat.' });
    }
    throw saveError;
  }

  let response;
  try {
    await populateCall(call);
    response = await joinInfo(call, req.user);
  } catch (tokenError) {
    await Call.updateOne(
      { _id: call._id, status: 'ringing' },
      { $set: { status: 'cancelled', active: false, activeMembers: [], endedAt: new Date() } }
    );
    throw tokenError;
  }

  emitToUsers([recipientId], 'call:incoming', {
    call: response.call,
    invitedBy: userPreview(call.caller),
  });
  scheduleRingTimeout(call._id);
  return res.status(201).json(response);
}

// GET /api/calls/incoming - is anything ringing for me right now?
async function getIncomingCall(req, res) {
  await refreshCallsFor([String(req.userId)]);

  const call = await Call.findOne({
    active: true,
    members: {
      $elemMatch: {
        user: req.userId,
        status: 'ringing',
        invitedAt: { $gt: ringCutoff() },
      },
    },
  }).sort({ createdAt: -1 });

  if (!call) return res.json({ call: null, invitedBy: null });

  await populateCall(call);
  await call.populate({ path: 'members.invitedBy', select: USER_FIELDS });

  const mine = memberOf(call, req.userId);
  const invitedBy = mine?.invitedBy ? userPreview(mine.invitedBy) : userPreview(call.caller);
  return res.json({ call: toCallJson(call), invitedBy });
}

// GET /api/calls/:callId
async function getCall(req, res) {
  const found = await findCallForUser(req.params.callId, req.userId);
  if (found.error) return res.status(found.status).json({ error: found.error });

  const call = await refreshCall(found.callId);
  return res.json({ call: toCallJson(call) });
}

// POST /api/calls/:callId/accept - answer a ringing call.
async function acceptCall(req, res) {
  const found = await findCallForUser(req.params.callId, req.userId);
  if (found.error) return res.status(found.status).json({ error: found.error });

  const { call, changed, error } = await mutateCall(found.callId, (current) => {
    const now = new Date();
    const expired = expireRinging(current, now);
    if (expired) settle(current, now);

    const mine = memberOf(current, req.userId);
    if (!mine) return { error: { status: 403, message: 'You are not part of this call.' } };
    if (mine.status === 'joined') return expired ? true : false; // already in it
    if (!isActive(current) || mine.status !== 'ringing') {
      // Save the expiry (if any) but report that this call is over for them.
      return expired ? { ended: true } : { error: { status: 410, message: 'This call has ended.' } };
    }

    mine.status = 'joined';
    mine.joinedAt = now;
    mine.leftAt = null;
    settle(current, now);
    return true;
  });

  if (error) return res.status(error.status).json({ error: error.message });
  if (changed) broadcastCallUpdate(call);

  const mine = memberOf(call, req.userId);
  if (!isActive(call) || mine?.status !== 'joined') {
    return res.status(410).json({ error: 'This call has ended.' });
  }
  return res.json(await joinInfo(call, req.user));
}

// POST /api/calls/:callId/decline - say no to a ringing call.
async function declineCall(req, res) {
  const found = await findCallForUser(req.params.callId, req.userId);
  if (found.error) return res.status(found.status).json({ error: found.error });

  const { call, changed, error } = await mutateCall(found.callId, (current) => {
    const now = new Date();
    const expired = expireRinging(current, now);

    const mine = memberOf(current, req.userId);
    if (!mine) return { error: { status: 403, message: 'You are not part of this call.' } };
    if (mine.status === 'joined' && isActive(current)) {
      return { error: { status: 409, message: 'You are in this call. Leave it instead.' } };
    }
    if (mine.status !== 'ringing') {
      if (expired) settle(current, now);
      return expired ? true : false;
    }

    mine.status = 'declined';
    mine.leftAt = now;
    settle(current, now);
    return true;
  });

  if (error) return res.status(error.status).json({ error: error.message });
  if (changed) broadcastCallUpdate(call);
  return res.json({ call: toCallJson(call) });
}

// POST /api/calls/:callId/end - hang up / leave. In a group call the others
// keep talking; the call ends when the last person leaves.
async function endCall(req, res) {
  const found = await findCallForUser(req.params.callId, req.userId);
  if (found.error) return res.status(found.status).json({ error: found.error });

  const { call, changed, error } = await mutateCall(found.callId, (current) => {
    if (!isActive(current)) return false;

    const now = new Date();
    expireRinging(current, now);

    const mine = memberOf(current, req.userId);
    if (!mine) return { error: { status: 403, message: 'You are not part of this call.' } };

    if (mine.status === 'ringing') {
      mine.status = 'declined';
      mine.leftAt = now;
    } else if (mine.status === 'joined') {
      mine.status = 'left';
      mine.leftAt = now;
    }

    settle(current, now);
    return true;
  });

  if (error) return res.status(error.status).json({ error: error.message });
  if (changed) broadcastCallUpdate(call);
  return res.json({ call: toCallJson(call) });
}

// POST /api/calls/:callId/join - go back into a call you left (or missed)
// while it's still going on, like WhatsApp's "Join" on an ongoing group call.
async function rejoinCall(req, res) {
  const found = await findCallForUser(req.params.callId, req.userId);
  if (found.error) return res.status(found.status).json({ error: found.error });

  if (await isBusy(String(req.userId), found.callId)) {
    return res.status(409).json({ error: 'You are already on another call.' });
  }

  const { call, changed, error } = await mutateCall(found.callId, (current) => {
    const now = new Date();
    if (expireRinging(current, now)) settle(current, now);

    if (!isActive(current) || current.status !== 'accepted') {
      return { error: { status: 410, message: 'This call has ended.' } };
    }

    const mine = memberOf(current, req.userId);
    if (!mine) return { error: { status: 403, message: 'You are not part of this call.' } };
    if (mine.status === 'joined') return false;

    if (mine.status !== 'ringing' && current.activeMembers.length >= MAX_IN_CALL) {
      return { error: { status: 409, message: `This call is full (${MAX_IN_CALL} people).` } };
    }

    mine.status = 'joined';
    mine.joinedAt = now;
    mine.leftAt = null;
    settle(current, now);
    return true;
  });

  if (error) return res.status(error.status).json({ error: error.message });
  if (changed) broadcastCallUpdate(call);
  return res.json(await joinInfo(call, req.user));
}

// POST /api/calls/:callId/invite - add people to the call.
// Body: { userIds: [...] } and/or { usernames: [...] }
async function inviteToCall(req, res) {
  const found = await findCallForUser(req.params.callId, req.userId);
  if (found.error) return res.status(found.status).json({ error: found.error });

  const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
  const usernames = Array.isArray(req.body?.usernames) ? req.body.usernames : [];

  if (!userIds.length && !usernames.length) {
    return res.status(400).json({ error: 'Choose at least one person to add.' });
  }
  if (userIds.length + usernames.length > MAX_INVITES_PER_REQUEST) {
    return res.status(400).json({ error: `You can add up to ${MAX_INVITES_PER_REQUEST} people at a time.` });
  }

  const skipped = [];
  const candidates = new Map(); // userId -> user

  for (const rawId of userIds) {
    if (typeof rawId !== 'string' || !mongoose.isValidObjectId(rawId)) {
      skipped.push({ userId: String(rawId), reason: 'not_found' });
      continue;
    }
    const user = await User.findById(rawId).select('privacy.allowDirectMessages profile.username');
    if (!user) skipped.push({ userId: rawId, reason: 'not_found' });
    else candidates.set(String(user._id), user);
  }

  for (const rawName of usernames) {
    const name = typeof rawName === 'string' ? rawName.trim().replace(/^@/, '') : '';
    const user = name ? await userModel.findByUsername(name) : null;
    if (!user) skipped.push({ username: name, reason: 'not_found' });
    else candidates.set(String(user._id), user);
  }

  // Checks that don't depend on the call itself.
  const allowed = [];
  for (const [userId, user] of candidates) {
    const username = user.profile?.username || null;

    if (userId === String(req.userId)) continue;
    if (await isBlockedEitherWay(req.userId, userId)) {
      skipped.push({ userId, username, reason: 'unavailable' });
    } else if (user.privacy?.allowDirectMessages === false) {
      skipped.push({ userId, username, reason: 'not_accepting_calls' });
    } else if (await isBusy(userId, found.callId)) {
      skipped.push({ userId, username, reason: 'busy' });
    } else {
      allowed.push({ userId, username });
    }
  }

  getLivekitUrl();

  const { call, changed, error, result } = await mutateCall(found.callId, (current) => {
    const now = new Date();
    if (expireRinging(current, now)) settle(current, now);

    if (!isActive(current)) return { error: { status: 410, message: 'This call has ended.' } };

    const mine = memberOf(current, req.userId);
    if (!mine || mine.status !== 'joined') {
      return { error: { status: 403, message: 'Only people in the call can add others.' } };
    }

    const invited = [];
    const lateSkipped = [];
    let activeCount = current.members.filter((member) =>
      ['ringing', 'joined'].includes(member.status)
    ).length;

    for (const { userId, username } of allowed) {
      const existing = memberOf(current, userId);

      if (existing && ['ringing', 'joined'].includes(existing.status)) {
        lateSkipped.push({ userId, username, reason: 'already_in_call' });
        continue;
      }
      if (activeCount >= MAX_IN_CALL) {
        lateSkipped.push({ userId, username, reason: 'call_full' });
        continue;
      }

      if (existing) {
        existing.status = 'ringing';
        existing.invitedBy = req.userId;
        existing.invitedAt = now;
        existing.joinedAt = null;
        existing.leftAt = null;
      } else {
        current.members.push({ user: userId, status: 'ringing', invitedBy: req.userId, invitedAt: now });
        if (!current.participants.some((participant) => idOf(participant) === userId)) {
          current.participants.push(userId);
        }
      }

      activeCount += 1;
      invited.push(userId);
    }

    if (!invited.length) return { error: { status: 409, message: 'Nobody could be added.', lateSkipped } };

    current.isGroup = true;
    return { invited, lateSkipped };
  });

  if (error) {
    const allSkipped = [...skipped, ...(error.lateSkipped || [])];
    return res.status(error.status).json({ error: error.message, invited: [], skipped: allSkipped });
  }

  if (changed) {
    broadcastCallUpdate(call);

    const inviter = call.members.find((member) => idOf(member.user) === String(req.userId))?.user;
    emitToUsers(result.invited, 'call:incoming', {
      call: toCallJson(call),
      invitedBy: userPreview(inviter || req.user),
    });
    scheduleRingTimeout(call._id);
  }

  return res.json({
    call: toCallJson(call),
    invited: result?.invited || [],
    skipped: [...skipped, ...(result?.lateSkipped || [])],
  });
}

module.exports = {
  startCall,
  getIncomingCall,
  getCall,
  acceptCall,
  declineCall,
  endCall,
  rejoinCall,
  inviteToCall,
  // Exported for tests.
  _internal: { expireRinging, settle, ensureMembers },
};
