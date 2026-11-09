const mongoose = require('mongoose');

/**
 * Per-conversation message sequence counter (Sparks needs a server-assigned,
 * strictly increasing `seq` on every message of a chat - see
 * SPARKS_INTEGRATION.md). One document per conversation; `next()` is a
 * single atomic findOneAndUpdate($inc), so two processes inserting into the
 * same chat at once still get distinct numbers.
 *
 * First use in a conversation that already has messages: the counter starts
 * after them (it reserves 1..N for the N legacy messages, which
 * scripts/backfillMessageSeq.js numbers later), so new and old seqs never
 * collide and old messages still sort before new ones.
 */
const counterSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId }, // the conversation id
    seq: { type: Number, default: 0 },
    // How many legacy (seq-less) messages the counter skipped over at creation.
    reservedForLegacy: { type: Number, default: 0 },
  },
  { collection: 'message_seq_counters', versionKey: false }
);

counterSchema.statics.next = async function next(conversationId) {
  const _id = new mongoose.Types.ObjectId(String(conversationId));
  const existing = await this.findOneAndUpdate({ _id }, { $inc: { seq: 1 } }, { new: true });
  if (existing) return existing.seq;

  // No counter yet: reserve room for the messages that predate seq.
  const Message = mongoose.model('Message');
  const legacy = await Message.countDocuments({ conversation: _id, seq: { $exists: false } });
  try {
    await this.create({ _id, seq: legacy, reservedForLegacy: legacy });
  } catch (error) {
    if (error?.code !== 11000) throw error; // another process created it first
  }
  const row = await this.findOneAndUpdate({ _id }, { $inc: { seq: 1 } }, { new: true });
  return row.seq;
};

module.exports = mongoose.model('MessageSeqCounter', counterSchema);
