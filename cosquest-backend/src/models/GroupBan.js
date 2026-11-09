const mongoose = require('mongoose');

/**
 * Banned from a group by an admin: removed, and can't come back (not by
 * being added, the Join button or the invite link) until an admin unbans
 * them. For faction groups this also overrides "everyone in the faction is
 * in it".
 */
const groupBanSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    bannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reason: { type: String, default: '', trim: true, maxlength: 200 },
  },
  { timestamps: true }
);

groupBanSchema.index({ conversation: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('GroupBan', groupBanSchema);
