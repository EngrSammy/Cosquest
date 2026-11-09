const mongoose = require('mongoose');

// One reaction per user per message - sending a new emoji replaces their old one.
const messageReactionSchema = new mongoose.Schema(
  {
    message: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    emoji: { type: String, required: true, trim: true, maxlength: 8 },
  },
  { timestamps: true }
);

messageReactionSchema.index({ message: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('MessageReaction', messageReactionSchema);
