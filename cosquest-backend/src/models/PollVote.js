const mongoose = require('mongoose');

/**
 * One person's answer to a poll (a Message with kind 'poll'). One row per
 * person per poll; changing your vote updates it, removing it deletes it.
 */
const pollVoteSchema = new mongoose.Schema(
  {
    message: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', required: true, index: true },
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    optionIds: { type: [String], default: [] },
  },
  { timestamps: true }
);

pollVoteSchema.index({ message: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('PollVote', pollVoteSchema);
