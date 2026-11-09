const mongoose = require('mongoose');

/**
 * SPARKS (group chat spec): a sub-conversation surfaced from the main chat
 * as a pulsing circle with a subject line and a running summary.
 *
 *  - Created by the Sparks bot (createdBy: null) when 3+ messages from 2+
 *    people share a subject within ~2 minutes, or by a member with
 *    "Start a Spark" (createdBy: that member).
 *  - Active while people keep talking; after ~15 minutes of silence it goes
 *    quiet (computed from lastActivityAt - nothing has to run on a timer).
 *  - Revived when the subject comes back: a new era starts (eras drive the
 *    colour gradient; long gaps get a seam label like "11 months later").
 *  - Admins can delete, merge and pin Sparks. Pinned Sparks never fade.
 */
const sparkSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 80 },
    summary: { type: String, default: '', maxlength: 1200 },
    // Words that describe the subject (used to match new messages / revivals).
    keywords: { type: [String], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    seedMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    // Each time the Spark comes back after going quiet, a new era starts.
    eras: {
      type: [{ _id: false, startedAt: { type: Date, required: true } }],
      default: [],
    },
    lastActivityAt: { type: Date, default: Date.now, index: true },
    messageCount: { type: Number, default: 0 },
    participants: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
    pinned: { type: Boolean, default: false },
    pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Summary bookkeeping (so it isn't rewritten on every message).
    summaryMessageCount: { type: Number, default: 0 },
    summarizedByAi: { type: Boolean, default: false },
    // Soft delete / merge.
    deletedAt: { type: Date, default: null },
    mergedInto: { type: mongoose.Schema.Types.ObjectId, ref: 'Spark', default: null },
  },
  { timestamps: true }
);

sparkSchema.index({ conversation: 1, deletedAt: 1, lastActivityAt: -1 });

module.exports = mongoose.model('Spark', sparkSchema);
