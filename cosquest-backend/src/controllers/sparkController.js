const mongoose = require('mongoose');
const Spark = require('../models/Spark');
const Message = require('../models/Message');
const MessageReaction = require('../models/MessageReaction');
const {
  loadConversationForUser,
  loadMessageInConversation,
  serializeMessage,
  groupRoleOf,
  isAdminRole,
  hiddenFor,
  groupReactions,
  pollSummaries,
  SENDER_FIELDS,
} = require('./chatController');
const sparks = require('../utils/sparks');
const { emitToConversation } = require('../realtime/socket');
const sparksHost = require('../sparks');

// THIS FILE is the stand-in engine's REST layer, kept for rollback
// (SPARKS_ENGINE=legacy, the default). With SPARKS_ENGINE=module every endpoint below is served by the
// Sparks module through src/sparks/rest.js - same URLs and response shapes,
// and DMs have Sparks too. See SPARKS_INTEGRATION.md.
//
// Legacy engine: Sparks live in Community, faction rooms and groups (not DMs).

async function loadSparkChat(req, res) {
  const { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) {
    res.status(error.status).json({ error: error.message });
    return null;
  }
  if (!sparks.SPARK_CHAT_TYPES.includes(conversation.type)) {
    res.status(400).json({ error: 'Sparks are only in group chats.' });
    return null;
  }
  return conversation;
}

async function loadSpark(conversation, sparkId) {
  if (!mongoose.isValidObjectId(sparkId)) return null;
  return Spark.findOne({ _id: sparkId, conversation: conversation._id, deletedAt: null });
}

// Admins only (groups). Community and faction rooms have no admins, so
// nobody can delete / merge / pin there yet.
async function requireSparkAdmin(conversation, user, res) {
  if (conversation.type === 'group' && isAdminRole(await groupRoleOf(conversation, user))) return true;
  res.status(403).json({ error: 'Only group admins can delete, merge or pin Sparks.' });
  return false;
}

// GET /api/chats/:conversationId/sparks
// Active Sparks first (pulsing circles; pinned ones always count as active),
// then quiet ones (cards).
async function listSparks(req, res) {
  const conversation = await loadSparkChat(req, res);
  if (!conversation) return;

  const now = Date.now();
  const list = (await sparks.liveSparks(conversation._id)).map((spark) => sparks.serializeSpark(spark, now));
  list.sort((a, b) => {
    const rank = (s) => (s.active ? (s.pinned ? 0 : 1) : 2);
    return rank(a) - rank(b) || new Date(b.lastActivityAt) - new Date(a.lastActivityAt);
  });

  const isAdmin = conversation.type === 'group' && isAdminRole(await groupRoleOf(conversation, req.user));
  return res.json({ sparks: list, canManage: isAdmin });
}

// GET /api/chats/:conversationId/sparks/:sparkId
// The side panel: the Spark, its latest 500 messages (oldest first, each
// with its era for the colour gradient) and the seams ("11 months later").
async function getSpark(req, res) {
  const conversation = await loadSparkChat(req, res);
  if (!conversation) return;
  const spark = await loadSpark(conversation, req.params.sparkId);
  if (!spark) return res.status(404).json({ error: 'Spark not found.' });

  // Newest 500 (so a long Spark never loses its latest messages), shown oldest first.
  const docs = (
    await Message.find({ spark: spark._id, deletedFor: { $ne: req.userId } })
      .sort({ createdAt: -1, _id: -1 })
      .limit(500)
      .populate('sender', SENDER_FIELDS)
      .populate({ path: 'replyTo', populate: { path: 'sender', select: 'profile.username profile.firstName' } })
  ).reverse();

  const reactionDocs = await MessageReaction.find({ message: { $in: docs.map((doc) => doc._id) } });
  const reactionsByMessage = groupReactions(reactionDocs, req.userId);
  const polls = await pollSummaries(docs, req.userId);

  const messages = docs.map((doc) =>
    serializeMessage(doc, {
      viewerId: req.userId,
      conversationType: conversation.type,
      otherLastReadAt: null,
      reactions: reactionsByMessage.get(String(doc._id)) || [],
      poll: polls.get(String(doc._id)),
    })
  );

  const isAdmin = conversation.type === 'group' && isAdminRole(await groupRoleOf(conversation, req.user));
  return res.json({
    spark: sparks.serializeSpark(spark),
    messages,
    seams: sparks.buildSeams(docs),
    canManage: isAdmin,
  });
}

// POST /api/chats/:conversationId/sparks  { messageId, subject, force? }
// "Start a Spark": the pressed message becomes the seed. If a similar Spark
// exists (active or quiet), the answer is 409 { code: "similar_sparks",
// matches } so the person decides: add to it, or send again with force: true.
async function startSpark(req, res) {
  const conversation = await loadSparkChat(req, res);
  if (!conversation) return;

  const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
  if (subject.length < 2 || subject.length > 60) {
    return res.status(400).json({ error: 'Give the Spark a subject (2-60 characters).' });
  }

  const seed = await loadMessageInConversation(conversation, req.body?.messageId);
  if (!seed || seed.deletedForEveryone || hiddenFor(seed, req.userId)) {
    return res.status(404).json({ error: 'Message not found.' });
  }
  if (seed.spark) {
    const current = await Spark.findOne({ _id: seed.spark, deletedAt: null });
    if (current) {
      return res.status(409).json({
        code: 'already_in_spark',
        error: `This message is already in the Spark "${current.subject}".`,
        spark: sparks.serializeSpark(current),
      });
    }
  }

  const keywords = [...new Set([...sparks.keywordsOf(subject), ...sparks.keywordsOf(seed.content)])].slice(0, 8);

  if (req.body?.force !== true) {
    const existing = await sparks.liveSparks(conversation._id);
    const matches = existing
      .map((spark) => ({ spark, score: Math.max(sparks.similarity(spark.keywords, keywords), sparks.similarity(sparks.keywordsOf(spark.subject), sparks.keywordsOf(subject))) }))
      .filter((item) => item.score >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => sparks.serializeSpark(item.spark));
    if (matches.length) {
      return res.status(409).json({
        code: 'similar_sparks',
        error: 'There is already a Spark about this. Add your message to it, or start a new one anyway.',
        matches,
      });
    }
  }

  const spark = await Spark.create({
    conversation: conversation._id,
    subject,
    keywords,
    createdBy: req.user._id,
    seedMessage: seed._id,
    eras: [{ startedAt: new Date() }],
  });
  await sparks.addMessagesToSpark(spark, [seed]);
  return res.status(201).json({ spark: sparks.serializeSpark(spark) });
}

// POST /api/chats/:conversationId/sparks/:sparkId/messages  { messageId }
// Put a message into a Spark ("add to the existing one").
async function addToSpark(req, res) {
  const conversation = await loadSparkChat(req, res);
  if (!conversation) return;
  const spark = await loadSpark(conversation, req.params.sparkId);
  if (!spark) return res.status(404).json({ error: 'Spark not found.' });

  const message = await loadMessageInConversation(conversation, req.body?.messageId);
  if (!message || message.deletedForEveryone || hiddenFor(message, req.userId)) {
    return res.status(404).json({ error: 'Message not found.' });
  }
  if (message.spark && String(message.spark) !== String(spark._id)) {
    const other = await Spark.findOne({ _id: message.spark, deletedAt: null });
    if (other) return res.status(409).json({ code: 'already_in_spark', error: `This message is already in "${other.subject}".` });
  }

  await sparks.addMessagesToSpark(spark, [message]);
  return res.json({ spark: sparks.serializeSpark(spark) });
}

// PATCH /api/chats/:conversationId/sparks/:sparkId/pin  { pinned } - admins.
// A pinned Spark doesn't fade during quiet periods.
async function pinSpark(req, res) {
  const conversation = await loadSparkChat(req, res);
  if (!conversation) return;
  if (!(await requireSparkAdmin(conversation, req.user, res))) return;
  const spark = await loadSpark(conversation, req.params.sparkId);
  if (!spark) return res.status(404).json({ error: 'Spark not found.' });

  spark.pinned = req.body?.pinned !== false;
  spark.pinnedBy = spark.pinned ? req.user._id : null;
  await spark.save();
  sparks.broadcastSpark(spark);
  return res.json({ spark: sparks.serializeSpark(spark) });
}

// DELETE /api/chats/:conversationId/sparks/:sparkId - admins.
// The Spark goes away; its messages stay in the main chat (unmarked).
async function deleteSpark(req, res) {
  const conversation = await loadSparkChat(req, res);
  if (!conversation) return;
  if (!(await requireSparkAdmin(conversation, req.user, res))) return;
  const spark = await loadSpark(conversation, req.params.sparkId);
  if (!spark) return res.status(404).json({ error: 'Spark not found.' });

  await Message.updateMany({ spark: spark._id }, { $set: { spark: null, sparkEra: 0, postedInSpark: false } });
  spark.deletedAt = new Date();
  await spark.save();

  emitToConversation(String(conversation._id), 'spark:deleted', {
    conversationId: String(conversation._id),
    sparkId: String(spark._id),
  });
  return res.json({ deleted: true });
}

// POST /api/chats/:conversationId/sparks/:sparkId/merge  { intoSparkId } - admins.
// Moves this Spark's messages into the other one, then removes this one.
async function mergeSpark(req, res) {
  const conversation = await loadSparkChat(req, res);
  if (!conversation) return;
  if (!(await requireSparkAdmin(conversation, req.user, res))) return;

  const from = await loadSpark(conversation, req.params.sparkId);
  const into = await loadSpark(conversation, req.body?.intoSparkId);
  if (!from || !into) return res.status(404).json({ error: 'Spark not found.' });
  if (String(from._id) === String(into._id)) return res.status(400).json({ error: 'Choose a different Spark to merge into.' });

  // Release the messages first and clear the tag on the loaded copies too:
  // addMessagesToSpark skips any message still pointing at another Spark.
  const moved = await Message.find({ spark: from._id });
  await Message.updateMany({ spark: from._id }, { $set: { spark: null } });
  moved.forEach((message) => {
    message.spark = null;
  });
  into.keywords = [...new Set([...(into.keywords || []), ...(from.keywords || [])])].slice(0, 12);
  into.participants = [...new Set([...(into.participants || []), ...(from.participants || [])].map(String))];
  if (from.pinned) into.pinned = true;
  await sparks.addMessagesToSpark(into, moved, { merging: true });

  from.deletedAt = new Date();
  from.mergedInto = into._id;
  await from.save();

  emitToConversation(String(conversation._id), 'spark:deleted', {
    conversationId: String(conversation._id),
    sparkId: String(from._id),
    mergedInto: String(into._id),
  });
  return res.json({ spark: sparks.serializeSpark(into) });
}

const legacy = { listSparks, getSpark, startSpark, addToSpark, pinSpark, deleteSpark, mergeSpark };

// Engine switch per request (SPARKS_ENGINE is read every time, so a restart
// with SPARKS_ENGINE=legacy is all a rollback needs).
function dispatch(name) {
  return (req, res) => (sparksHost.isModule() ? require('../sparks/rest')[name](req, res) : legacy[name](req, res));
}

module.exports = {
  listSparks: dispatch('listSparks'),
  getSpark: dispatch('getSpark'),
  startSpark: dispatch('startSpark'),
  addToSpark: dispatch('addToSpark'),
  pinSpark: dispatch('pinSpark'),
  deleteSpark: dispatch('deleteSpark'),
  mergeSpark: dispatch('mergeSpark'),
  listSparkMembers: (req, res) =>
    sparksHost.isModule() ? require('../sparks/rest').listSparkMembers(req, res) : res.status(404).json({ error: 'Not available on the legacy Sparks engine.' }),
  listNativeSparks: (req, res) =>
    sparksHost.isModule() ? require('../sparks/rest').listNativeSparks(req, res) : res.status(404).json({ error: 'Not available on the legacy Sparks engine.' }),
};
