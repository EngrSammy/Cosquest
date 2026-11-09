const mongoose = require('mongoose');

/**
 * Someone asked to join a group whose join setting is "admin approval"
 * (from the invite link or the Join button). Admins approve or decline.
 */
const groupJoinRequestSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ['pending', 'approved', 'declined', 'cancelled'], default: 'pending', index: true },
    via: { type: String, enum: ['link', 'join'], default: 'join' },
    // Their introduction ("I'd love to join the Saturday mural meetup").
    message: { type: String, default: '', trim: true, maxlength: 200 },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One open request per person per group.
groupJoinRequestSchema.index(
  { conversation: 1, user: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

module.exports = mongoose.model('GroupJoinRequest', groupJoinRequestSchema);
