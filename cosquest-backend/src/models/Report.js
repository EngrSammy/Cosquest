const mongoose = require('mongoose');

/**
 * Polish (docs/polish/BACKEND-PORT.md): a report of a user, post, comment,
 * message or group from the app's Report sheet, for the team to review.
 * One open report per reporter per thing: reporting again updates it.
 */
const TARGETS = ['user', 'post', 'comment', 'message', 'group'];
const REASONS = ['spam', 'harassment', 'hate', 'nudity', 'violence', 'self_harm', 'impersonation', 'underage', 'other'];

const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    targetType: { type: String, enum: TARGETS, required: true },
    targetId: { type: String, required: true, trim: true, maxlength: 64 },
    reason: { type: String, enum: REASONS, required: true },
    details: { type: String, default: '', trim: true, maxlength: 1000 },
    // What the reporter saw when they reported (text only), in case it is edited or deleted later.
    snapshot: { type: String, default: '', maxlength: 2000 },
    conversation: { type: String, default: null },
    status: { type: String, enum: ['open', 'reviewed', 'actioned', 'dismissed'], default: 'open', index: true },
  },
  { timestamps: true }
);

reportSchema.index({ reporter: 1, targetType: 1, targetId: 1 }, { unique: true });
reportSchema.index({ targetType: 1, targetId: 1 });

module.exports = mongoose.model('Report', reportSchema);
module.exports.TARGETS = TARGETS;
module.exports.REASONS = REASONS;
