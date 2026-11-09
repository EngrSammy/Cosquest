// Saves the "call entry" message in the DM where a call started, once the
// call has finished, and sends it live - exactly like a normal new message
// (message:new to the conversation room + chat:preview to the DM's two
// people, so the chat list updates too).
//
// Called from callController's broadcastCallUpdate(), which runs on every
// call status change - so declined / missed / cancelled / ended are all
// covered from one place.
//
// Group calls: the entry still goes in the DM the call started in, and also
// records that it was a group call and how many people took part.

const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { serializeMessage, SENDER_FIELDS } = require('../controllers/chatController');
const { emitToConversation, emitToUsers } = require('../realtime/socket');

const FINISHED_STATUSES = ['declined', 'missed', 'cancelled', 'ended'];

function durationSeconds(call) {
  if (call.status !== 'ended' || !call.answeredAt || !call.endedAt) return null;
  return Math.max(0, Math.round((new Date(call.endedAt) - new Date(call.answeredAt)) / 1000));
}

// Everyone who was actually in the call at some point.
function participantCount(call) {
  const members = call.members || [];
  if (!members.length) return call.status === 'ended' ? 2 : null;
  return members.filter((member) => member.joinedAt).length;
}

async function recordCallMessage(call) {
  if (!call || !FINISHED_STATUSES.includes(call.status)) return;

  const conversationId = call.conversation?._id || call.conversation;
  const callerId = call.caller?._id || call.caller;

  // Already saved for this call? (status can be broadcast more than once)
  if (await Message.exists({ 'callLog.callId': call._id })) return;

  let message;
  try {
    message = await Message.create({
      conversation: conversationId,
      // The caller "sent" the call entry - so a missed call counts as
      // unread for the other person, and the app can tell who called.
      sender: callerId,
      kind: 'call',
      content: '',
      callLog: {
        callId: call._id,
        type: call.type,
        status: call.status,
        durationSeconds: durationSeconds(call),
        callerId,
        groupCall: Boolean(call.isGroup),
        participantCount: participantCount(call),
      },
    });
  } catch (error) {
    // Two status updates raced: the unique index kept only one. Fine.
    if (error?.code === 11000) return;
    throw error;
  }

  const conversation = await Conversation.findById(conversationId).select('participants');
  await Conversation.updateOne({ _id: conversationId }, { $inc: { messageCount: 1 } });
  await message.populate('sender', SENDER_FIELDS);

  const serialized = serializeMessage(message, {
    viewerId: callerId,
    conversationType: 'dm',
    otherLastReadAt: null,
    reactions: [],
  });

  emitToConversation(String(conversationId), 'message:new', {
    conversationId: String(conversationId),
    message: serialized,
  });

  // Only the DM's own two people - people added to a group call aren't part
  // of that DM.
  const dmPeople = (conversation?.participants || []).map(String);
  emitToUsers(dmPeople, 'chat:preview', {
    conversationId: String(conversationId),
  });
}

module.exports = { recordCallMessage };
