/**
 * The app's existing Spark REST endpoints (routes/chatRoutes.js), served by
 * the Sparks module. Same URLs, bodies, status codes and response shapes as
 * the stand-in engine (src/controllers/sparkController.js dispatches here
 * when SPARKS_ENGINE=module). Differences are listed in
 * SPARKS_INTEGRATION.md ("Compatibility").
 */
const Message = require('../models/Message');
const MessageReaction = require('../models/MessageReaction');
const {
  loadConversationForUser,
  loadMessageInConversation,
  serializeMessage,
  hiddenFor,
  groupReactions,
  pollSummaries,
  SENDER_FIELDS,
} = require('../controllers/chatController');
const host = require('./index');
const members = require('./members');
const { serializeRow, legacySeams } = require('./compat');

const LIVE = ['active', 'dormant'];
const ADMIN_ONLY = 'Only group admins can delete, merge or pin Sparks.';

async function loadChat(req, res) {
  if (!host.isReady()) {
    res.status(503).json({ error: 'Sparks are unavailable right now.' });
    return null;
  }
  const { conversation, error } = await loadConversationForUser(req.params.conversationId, req.user);
  if (error) {
    res.status(error.status).json({ error: error.message });
    return null;
  }
  return conversation; // every chat type has Sparks now, DMs included
}

async function liveSpark(conversation, sparkId) {
  if (typeof sparkId !== 'string' || !sparkId) return null;
  const row = await host.store.getSpark(sparkId);
  return row && row.chatId === String(conversation._id) && LIVE.includes(row.state) ? row : null;
}

// Module admin errors carry .status (403 / 404 / 400).
function sendAdminError(res, error) {
  if (error?.status === 403) return res.status(403).json({ error: ADMIN_ONLY });
  if (error?.status === 404) return res.status(404).json({ error: 'Spark not found.' });
  if (error?.status === 400) return res.status(400).json({ error: 'Choose a different Spark to merge into.' });
  throw error;
}

// GET /api/chats/:conversationId/sparks
async function listSparks(req, res) {
  const conversation = await loadChat(req, res);
  if (!conversation) return;
  const rows = (await host.store.sparksOfChat(String(conversation._id), 200)).filter((s) => LIVE.includes(s.state));
  const list = await Promise.all(rows.map((row) => serializeRow(host.store, row)));
  list.sort((a, b) => {
    const rank = (s) => (s.active ? (s.pinned ? 0 : 1) : 2);
    return rank(a) - rank(b) || new Date(b.lastActivityAt) - new Date(a.lastActivityAt);
  });
  return res.json({ sparks: list, canManage: await members.isAdmin(req.userId, String(conversation._id)) });
}

// GET /api/chats/:conversationId/sparks/native - the module's own Spark
// objects (DATA_CONTRACT Spark: summary, seams, state...), for web clients.
async function listNativeSparks(req, res) {
  const conversation = await loadChat(req, res);
  if (!conversation) return;
  return res.json({ sparks: await host.backend.sparksOfChat(String(conversation._id)) });
}

// GET /api/chats/:conversationId/sparks/members - the chat's members exactly
// as the module sees them (ChatMember[]: userId, displayName, roles, isAdmin),
// for the app's sdk.sparks.setMembers. Same role spelling as role pings.
async function listSparkMembers(req, res) {
  const conversation = await loadChat(req, res);
  if (!conversation) return;
  const list = [...(await members.chatMembers(String(conversation._id)))]; // a copy: the list is cached
  // An implicit-membership room's list is capped (SPARKS_INTEGRATION.md §8): make sure the viewer is in it.
  if (!list.some((m) => m.userId === String(req.userId))) {
    list.push({ userId: String(req.userId), displayName: members.displayNameOf(req.user), roles: [], isAdmin: await members.isAdmin(String(req.userId), String(conversation._id)) });
  }
  return res.json({ members: list });
}

// GET /api/chats/:conversationId/sparks/:sparkId
async function getSpark(req, res) {
  const conversation = await loadChat(req, res);
  if (!conversation) return;
  const row = await liveSpark(conversation, req.params.sparkId);
  if (!row) return res.status(404).json({ error: 'Spark not found.' });

  const docs = (
    await Message.find({ sparkId: row.sparkId, deletedFor: { $ne: req.userId } })
      .sort({ seq: -1, _id: -1 })
      .limit(500)
      .populate('sender', SENDER_FIELDS)
      .populate({ path: 'replyTo', populate: { path: 'sender', select: 'profile.username profile.firstName' } })
  ).reverse();
  const reactionsByMessage = groupReactions(await MessageReaction.find({ message: { $in: docs.map((d) => d._id) } }), req.userId);
  const polls = await pollSummaries(docs, req.userId);
  const messages = docs.map((doc) =>
    serializeMessage(doc, { viewerId: req.userId, conversationType: conversation.type, otherLastReadAt: null, reactions: reactionsByMessage.get(String(doc._id)) || [], poll: polls.get(String(doc._id)) })
  );
  return res.json({
    spark: await serializeRow(host.store, row),
    messages,
    seams: await legacySeams(host.store, row.sparkId),
    canManage: await members.isAdmin(req.userId, String(conversation._id)),
  });
}

// POST /api/chats/:conversationId/sparks  { messageId, subject, force? }
async function startSpark(req, res) {
  const conversation = await loadChat(req, res);
  if (!conversation) return;
  const chatId = String(conversation._id);

  const subject = typeof req.body?.subject === 'string' ? req.body.subject.trim() : '';
  if (subject.length < 2 || subject.length > 60) {
    return res.status(400).json({ error: 'Give the Spark a subject (2-60 characters).' });
  }
  const seed = await loadMessageInConversation(conversation, req.body?.messageId);
  if (!seed || seed.deletedForEveryone || hiddenFor(seed, req.userId)) return res.status(404).json({ error: 'Message not found.' });
  if (typeof seed.seq !== 'number') return res.status(400).json({ error: 'This message is too old to start a Spark from.' });
  if (seed.sparkId) {
    const current = await liveSpark(conversation, seed.sparkId);
    if (current) {
      return res.status(409).json({
        code: 'already_in_spark',
        error: `This message is already in the Spark "${current.subject}".`,
        spark: await serializeRow(host.store, current),
      });
    }
  }

  if (req.body?.force !== true) {
    // The module's no-model duplicate check (trigram match on subjects).
    const dupes = await host.backend.lexicalDuplicates(chatId, subject);
    const rows = (await Promise.all(dupes.map((d) => host.store.getSpark(d.sparkId)))).filter((r) => r && LIVE.includes(r.state));
    if (rows.length) {
      return res.status(409).json({
        code: 'similar_sparks',
        error: 'There is already a Spark about this. Add your message to it, or start a new one anyway.',
        matches: await Promise.all(rows.map((r) => serializeRow(host.store, r))),
      });
    }
  }

  const row = await host.startManual({ userId: req.userId, chatId, seedMessageId: String(seed._id), subject });
  if (!row) return res.status(409).json({ error: 'Could not start a Spark from this message.' });
  return res.status(201).json({ spark: await serializeRow(host.store, row) });
}

// POST /api/chats/:conversationId/sparks/:sparkId/messages  { messageId }
async function addToSpark(req, res) {
  const conversation = await loadChat(req, res);
  if (!conversation) return;
  const spark = await liveSpark(conversation, req.params.sparkId);
  if (!spark) return res.status(404).json({ error: 'Spark not found.' });
  const message = await loadMessageInConversation(conversation, req.body?.messageId);
  if (!message || message.deletedForEveryone || hiddenFor(message, req.userId)) return res.status(404).json({ error: 'Message not found.' });
  if (typeof message.seq !== 'number') return res.status(400).json({ error: 'This message is too old to add to a Spark.' });
  if (message.sparkId && message.sparkId !== spark.sparkId) {
    const other = await liveSpark(conversation, message.sparkId);
    if (other) return res.status(409).json({ code: 'already_in_spark', error: `This message is already in "${other.subject}".` });
  }
  const row = await host.startManual({ userId: req.userId, chatId: spark.chatId, seedMessageId: String(message._id), subject: spark.subject, attachTo: spark.sparkId });
  return res.json({ spark: await serializeRow(host.store, row || spark) });
}

// PATCH /api/chats/:conversationId/sparks/:sparkId/pin  { pinned } - admins.
async function pinSpark(req, res) {
  const conversation = await loadChat(req, res);
  if (!conversation) return;
  if (!(await liveSpark(conversation, req.params.sparkId))) {
    // Same order as before: non-admins hear 403 even for an unknown Spark.
    if (!(await members.isAdmin(req.userId, String(conversation._id)))) return res.status(403).json({ error: ADMIN_ONLY });
    return res.status(404).json({ error: 'Spark not found.' });
  }
  try {
    await host.backend.admin.pin(req.userId, req.params.sparkId, req.body?.pinned !== false);
  } catch (error) {
    return sendAdminError(res, error);
  }
  return res.json({ spark: await serializeRow(host.store, await host.store.getSpark(req.params.sparkId)) });
}

// DELETE /api/chats/:conversationId/sparks/:sparkId - admins.
async function deleteSpark(req, res) {
  const conversation = await loadChat(req, res);
  if (!conversation) return;
  if (!(await liveSpark(conversation, req.params.sparkId))) {
    if (!(await members.isAdmin(req.userId, String(conversation._id)))) return res.status(403).json({ error: ADMIN_ONLY });
    return res.status(404).json({ error: 'Spark not found.' });
  }
  try {
    await host.backend.admin.remove(req.userId, req.params.sparkId);
  } catch (error) {
    return sendAdminError(res, error);
  }
  return res.json({ deleted: true });
}

// POST /api/chats/:conversationId/sparks/:sparkId/merge  { intoSparkId } - admins.
async function mergeSpark(req, res) {
  const conversation = await loadChat(req, res);
  if (!conversation) return;
  if (!(await members.isAdmin(req.userId, String(conversation._id)))) return res.status(403).json({ error: ADMIN_ONLY });
  const from = await liveSpark(conversation, req.params.sparkId);
  const into = await liveSpark(conversation, req.body?.intoSparkId);
  if (!from || !into) return res.status(404).json({ error: 'Spark not found.' });
  if (from.sparkId === into.sparkId) return res.status(400).json({ error: 'Choose a different Spark to merge into.' });
  try {
    await host.backend.admin.merge(req.userId, from.sparkId, into.sparkId);
  } catch (error) {
    return sendAdminError(res, error);
  }
  return res.json({ spark: await serializeRow(host.store, await host.store.getSpark(into.sparkId)) });
}

module.exports = { listSparks, listNativeSparks, listSparkMembers, getSpark, startSpark, addToSpark, pinSpark, deleteSpark, mergeSpark };
