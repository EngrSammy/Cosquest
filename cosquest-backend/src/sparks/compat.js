/**
 * Keeps the app's existing Spark API working on top of the module: module
 * Spark rows -> the old response shape (src/utils/sparks.js serializeSpark),
 * and module spark.event broadcasts -> the old socket events
 * (spark:updated, spark:messages, spark:deleted on `conversation:<id>`).
 *
 * Old field          <- module
 *   id                 sparkId ("spk_..." string, not an ObjectId)
 *   conversationId     chatId
 *   subject            subject
 *   summary            summary text ('' until the first summary job)
 *   summarizedByAi     a summary exists (every module summary is on-device AI)
 *   keywords           words of the subject (the module keeps no keyword list)
 *   active             state === 'active' (pinned Sparks never go dormant)
 *   pinned             pinned
 *   revived            revivalIndex > 0
 *   eras[]             sessions (one per life of the Spark): { index, startedAt }
 *   messageCount       messages with this sparkId, not deleted
 *   participantCount   distinct senders of those
 *   createdBy          member id, or null for the bot
 *   startedByBot       createdBy === null
 *   lastActivityAt     lastMessageAt
 *   createdAt          createdAt
 * Added (new, additive): state, revivalIndex, seams (fold + labeled),
 * summaryStale, participantIds, version, mergedInto.
 * Message marker `spark: { id, era, postedInSpark }`: id = sparkId,
 * era = sparkRevivalIndex.
 */
const Message = require('../models/Message');
const { emitToConversation } = require('../realtime/socket');

function keywordsOf(subject) {
  return String(subject || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
}

async function sparkStats(sparkId) {
  const [row] = await Message.aggregate([
    { $match: { sparkId, deletedForEveryone: { $ne: true } } },
    { $group: { _id: null, n: { $sum: 1 }, senders: { $addToSet: '$sender' } } },
  ]);
  return { messageCount: row?.n || 0, participantIds: (row?.senders || []).map(String) };
}

/** A module SparkRow -> the app's old Spark JSON (+ additive fields). */
async function serializeRow(store, row) {
  const [sessions, seams, stats] = await Promise.all([store.sessions(row.sparkId), store.seams(row.sparkId), sparkStats(row.sparkId)]);
  const eras = sessions.length
    ? sessions.map((s) => ({ index: s.sessionIndex, startedAt: new Date(s.startedAt) }))
    : [{ index: 0, startedAt: new Date(row.createdAt) }];
  return {
    id: row.sparkId,
    conversationId: row.chatId,
    subject: row.subject,
    summary: row.summaryText || '',
    summarizedByAi: row.summaryText !== null && row.summaryText !== undefined,
    keywords: keywordsOf(row.subject),
    active: row.state === 'active',
    pinned: Boolean(row.pinned),
    revived: row.revivalIndex > 0,
    eras,
    messageCount: stats.messageCount,
    participantCount: stats.participantIds.length,
    createdBy: row.createdBy || null,
    startedByBot: !row.createdBy,
    lastActivityAt: new Date(row.lastMessageAt),
    createdAt: new Date(row.createdAt),
    // --- additive (module) ---
    state: row.state,
    revivalIndex: row.revivalIndex,
    seams: seams.map(({ sparkId, ...seam }) => seam),
    summaryStale: row.summaryStaleSeq !== null && row.summaryStaleSeq !== undefined,
    participantIds: stats.participantIds,
    version: row.version,
    ...(row.mergedInto ? { mergedInto: row.mergedInto } : {}),
  };
}

/** The old panel `seams`: [{ beforeMessageId, label }] - labelled ones only (folds have no text). */
async function legacySeams(store, sparkId) {
  return (await store.seams(sparkId)).filter((s) => s.kind === 'labeled').map((s) => ({ beforeMessageId: s.beforeMessageId, label: s.label }));
}

/** Message marker in the old shape, from the module fields. */
function messageMarker(message) {
  if (!message.sparkId) return null;
  return { id: message.sparkId, era: message.sparkRevivalIndex || 0, postedInSpark: Boolean(message.postedInSpark) };
}

/** spark.event (module) -> the app's existing socket events. */
async function emitLegacyEvent(store, event) {
  const chatId = event.chatId;
  const sparkId = event.spark.sparkId;
  if (event.kind === 'deleted' || event.kind === 'merged') {
    emitToConversation(chatId, 'spark:deleted', { conversationId: chatId, sparkId, ...(event.kind === 'merged' ? { mergedInto: event.spark.mergedInto } : {}) });
    return;
  }
  if (event.messageIds?.length) {
    emitToConversation(chatId, 'spark:messages', { conversationId: chatId, sparkId, era: event.spark.revivalIndex, messageIds: event.messageIds });
  }
  const row = await store.getSpark(sparkId);
  if (row) emitToConversation(chatId, 'spark:updated', { conversationId: chatId, spark: await serializeRow(store, row) });
}

module.exports = { serializeRow, legacySeams, messageMarker, emitLegacyEvent, keywordsOf };
