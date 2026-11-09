/**
 * One-off: numbers every message that predates the per-conversation `seq`
 * (Sparks). Safe to run before or after deploying the Sparks branch, and
 * safe to run twice (it only touches messages without a seq).
 *
 *   node scripts/backfillMessageSeq.js            # all conversations
 *   node scripts/backfillMessageSeq.js --dry-run  # just count
 *
 * How the numbers stay unique: the first message sent in a conversation
 * after deploy creates its counter starting after the N legacy messages
 * (MessageSeqCounter.reservedForLegacy = N), so this script gives the legacy
 * ones 1..N in createdAt order. Run before deploy, it creates the counters
 * itself the same way.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB, disconnectDB } = require('../src/config/db');
const Message = require('../src/models/Message');
const MessageSeqCounter = require('../src/models/MessageSeqCounter');

async function backfillConversation(conversationId, { dryRun }) {
  const legacyCount = await Message.countDocuments({ conversation: conversationId, seq: { $exists: false } });
  if (!legacyCount) return 0;

  let counter = await MessageSeqCounter.findById(conversationId);
  if (!counter && !dryRun) {
    try {
      counter = await MessageSeqCounter.create({ _id: conversationId, seq: legacyCount, reservedForLegacy: legacyCount });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      counter = await MessageSeqCounter.findById(conversationId);
    }
  }
  const reserved = counter ? counter.reservedForLegacy : legacyCount;
  if (legacyCount > reserved) {
    console.warn(`[seq] ${conversationId}: ${legacyCount} legacy messages but only ${reserved} seqs reserved - skipped, check by hand`);
    return 0;
  }
  if (dryRun) return legacyCount;

  const docs = await Message.find({ conversation: conversationId, seq: { $exists: false } }, '_id').sort({ createdAt: 1, _id: 1 }).lean();
  // Numbers end at `reserved`, so a partial earlier run (or a reservation
  // larger than what is left) never collides with seqs already handed out.
  const start = reserved - docs.length + 1;
  const ops = docs.map((doc, i) => ({
    updateOne: { filter: { _id: doc._id, seq: { $exists: false } }, update: { $set: { seq: start + i } } },
  }));
  for (let i = 0; i < ops.length; i += 1000) await Message.bulkWrite(ops.slice(i, i + 1000), { ordered: false });
  return docs.length;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  await connectDB();
  await Message.createIndexes(); // creates (never drops) the (conversation, seq) and (sparkId, seq) indexes
  const conversationIds = await Message.distinct('conversation', { seq: { $exists: false } });
  let total = 0;
  for (const id of conversationIds) total += await backfillConversation(id, { dryRun });
  console.log(`[seq] ${dryRun ? 'would number' : 'numbered'} ${total} messages in ${conversationIds.length} conversations`);
  await disconnectDB();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error('[seq] backfill failed:', error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}

module.exports = { backfillConversation };
