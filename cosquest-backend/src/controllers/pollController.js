const Conversation = require('../models/Conversation');
const ConversationMember = require('../models/ConversationMember');
const Message = require('../models/Message');
const PollVote = require('../models/PollVote');
const User = require('../models/User');
const {
  loadConversationForUser,
  loadMessageInConversation,
  serializeMessage,
  userPreview,
  canSendToConversation,
  explicitGroupMemberIds,
  hiddenFor,
  forBroadcast,
  buildPollSummary,
  pollIsClosed,
  groupRoleOf,
  isAdminRole,
  SENDER_FIELDS,
} = require('./chatController');
const { emitToConversation, emitToConversationExcept, emitToUsers } = require('../realtime/socket');
const sparks = require('../utils/sparks'); // legacy engine (SPARKS_ENGINE=legacy)
const sparksHost = require('../sparks'); // @cosquest/sparks-backend

// Polls (group chat spec: "Create a poll for group decisions").
// A poll is a Message with kind 'poll', so replies, reactions, pinning,
// deleting, @ mentions in replies, read state and live updates all work like
// any other message. Votes live in PollVote (one row per person per poll).

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 12;
const CLOSES_IN = {
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
};

// Results without anyone's own picks (each app keeps its own).
function publicSummary(message, votes) {
  const summary = buildPollSummary(message, votes, null);
  delete summary.myVotes;
  return summary;
}

async function broadcastResults(conversation, message) {
  const votes = await PollVote.find({ message: message._id }, 'user optionIds');
  emitToConversation(String(conversation._id), 'poll:updated', {
    conversationId: String(conversation._id),
    messageId: String(message._id),
    poll: publicSummary(message, votes),
  });
  return votes;
}

// Same chat-list live update as a normal new message.
async function previewToMembers(conversation) {
  const id = String(conversation._id);
  if (conversation.type === 'dm') {
    emitToUsers(conversation.participants.map(String), 'chat:preview', { conversationId: id });
  } else if (conversation.type === 'group' && conversation.group?.kind !== 'faction') {
    const memberIds = await explicitGroupMemberIds(conversation);
    emitToUsers(memberIds.map(String), 'chat:preview', { conversationId: id });
  }
}

async function loadPoll(req, res) {
  const { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) {
    res.status(error.status).json({ error: error.message });
    return null;
  }
  const message = await loadMessageInConversation(conversation, req.params.messageId);
  if (!message || message.kind !== 'poll' || !message.poll || hiddenFor(message, req.userId)) {
    res.status(404).json({ error: 'Poll not found.' });
    return null;
  }
  if (message.deletedForEveryone) {
    res.status(400).json({ error: 'This poll was deleted.' });
    return null;
  }
  return { conversation, message };
}

// POST /api/chats/:conversationId/polls
// Body: { question, options: [text, ...] (2-12), multiple?, anonymous?,
//         closesIn?: "1h" | "1d" | "1w" (omit = no end), replyTo? }
async function createPoll(req, res) {
  const { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) return res.status(error.status).json({ error: error.message });

  // Same rules as sending a message: blocked DMs, muted by an admin, slow mode.
  const sendError = await canSendToConversation(conversation, req.userId);
  if (sendError) return res.status(sendError.status).json({ error: sendError.message, ...(sendError.extra || {}) });

  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';
  if (!question || question.length > 300) {
    return res.status(400).json({ error: 'Ask a question (up to 300 characters).' });
  }

  const rawOptions = Array.isArray(req.body?.options) ? req.body.options : [];
  const texts = rawOptions.map((option) => (typeof option === 'string' ? option.trim() : '')).filter(Boolean);
  if (texts.length < MIN_OPTIONS || texts.length > MAX_OPTIONS) {
    return res.status(400).json({ error: `A poll needs ${MIN_OPTIONS} to ${MAX_OPTIONS} options.` });
  }
  if (texts.some((text) => text.length > 100)) {
    return res.status(400).json({ error: 'Each option can be up to 100 characters.' });
  }
  const lower = texts.map((text) => text.toLowerCase());
  if (new Set(lower).size !== lower.length) {
    return res.status(400).json({ error: 'Each option must be different.' });
  }

  const closesIn = req.body?.closesIn;
  if (closesIn !== undefined && closesIn !== null && closesIn !== '' && !CLOSES_IN[closesIn]) {
    return res.status(400).json({ error: 'closesIn must be 1h, 1d or 1w (or left out for no end).' });
  }

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
    kind: 'poll',
    content: question,
    replyTo,
    poll: {
      question,
      options: texts.map((text, index) => ({ id: `o${index + 1}`, text })),
      multiple: req.body?.multiple === true,
      anonymous: req.body?.anonymous === true,
      closesAt: CLOSES_IN[closesIn] ? new Date(now.getTime() + CLOSES_IN[closesIn]) : null,
    },
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
    poll: buildPollSummary(message, [], req.userId),
  });

  // A reply carries its target's text in `replyTo`: people who deleted that
  // message "for me" must not receive it live (same rule as createMessage).
  emitToConversationExcept(String(conversation._id), (message.replyTo?.deletedFor || []).map(String), 'message:new', {
    conversationId: String(conversation._id),
    message: forBroadcast(serialized),
  });
  previewToMembers(conversation).catch(() => {});

  // The question is conversation like any other message: Sparks sees it too.
  if (sparksHost.isModule()) {
    sparksHost.onMessage(message);
  } else if (sparks.SPARK_CHAT_TYPES.includes(conversation.type)) {
    sparks.handleNewMessage(conversation, message).catch((err) => {
      console.error('[sparks] detection failed:', err.message);
    });
  }

  return res.status(201).json({ message: serialized });
}

// POST /api/chats/:conversationId/messages/:messageId/vote
// Body: { optionIds: ["o1"] } (several only if the poll allows it).
// An empty list removes your vote. Voting again changes it.
async function votePoll(req, res) {
  const loaded = await loadPoll(req, res);
  if (!loaded) return;
  const { conversation, message } = loaded;

  if (pollIsClosed(message.poll)) return res.status(400).json({ error: 'This poll is closed.' });

  const valid = new Set(message.poll.options.map((option) => option.id));
  const raw = Array.isArray(req.body?.optionIds) ? req.body.optionIds.map(String) : null;
  if (!raw) return res.status(400).json({ error: 'optionIds must be a list (empty to remove your vote).' });

  const optionIds = [...new Set(raw)];
  if (optionIds.some((id) => !valid.has(id))) return res.status(400).json({ error: 'That option is not in this poll.' });
  if (!message.poll.multiple && optionIds.length > 1) {
    return res.status(400).json({ error: 'This poll allows only one answer.' });
  }

  if (optionIds.length) {
    await PollVote.updateOne(
      { message: message._id, user: req.userId },
      { $set: { optionIds, conversation: conversation._id } },
      { upsert: true }
    );
  } else {
    await PollVote.deleteOne({ message: message._id, user: req.userId });
  }

  const votes = await broadcastResults(conversation, message);
  return res.json({ messageId: String(message._id), poll: buildPollSummary(message, votes, req.userId) });
}

// POST /api/chats/:conversationId/messages/:messageId/poll/close
// The poll's creator can close it early; in groups, admins can too.
async function closePoll(req, res) {
  const loaded = await loadPoll(req, res);
  if (!loaded) return;
  const { conversation, message } = loaded;

  const isCreator = String(message.sender) === String(req.userId);
  const isGroupAdmin = conversation.type === 'group' && isAdminRole(await groupRoleOf(conversation, req.user));
  if (!isCreator && !isGroupAdmin) {
    return res.status(403).json({ error: 'Only the person who created the poll (or a group admin) can close it.' });
  }

  if (!message.poll.closedAt) {
    message.poll.closedAt = new Date();
    message.poll.closedBy = req.userId;
    message.markModified('poll');
    await message.save();
  }

  const votes = await broadcastResults(conversation, message);
  return res.json({ messageId: String(message._id), poll: buildPollSummary(message, votes, req.userId) });
}

// GET /api/chats/:conversationId/messages/:messageId/poll/votes
// Who picked each option. Not available for anonymous polls.
async function listPollVotes(req, res) {
  const loaded = await loadPoll(req, res);
  if (!loaded) return;
  const { message } = loaded;

  if (message.poll.anonymous) {
    return res.status(403).json({ error: 'This poll is anonymous: only the counts are shown.' });
  }

  const votes = await PollVote.find({ message: message._id }).sort({ updatedAt: 1 }).limit(5000);
  const users = await User.find({ _id: { $in: votes.map((vote) => vote.user) } }).select(SENDER_FIELDS);
  const userById = new Map(users.map((user) => [String(user._id), userPreview(user)]));

  return res.json({
    options: message.poll.options.map((option) => {
      const voters = votes
        .filter((vote) => vote.optionIds.includes(option.id))
        .map((vote) => userById.get(String(vote.user)))
        .filter(Boolean);
      return { id: option.id, text: option.text, votes: voters.length, voters };
    }),
    totalVoters: votes.length,
  });
}

module.exports = { createPoll, votePoll, closePoll, listPollVotes };
