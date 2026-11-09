const mongoose = require('mongoose');

// Same shape as chat's messageMediaSchema — a voice comment goes through
// the same storeChatMedia() upload path chat voice notes already use, so
// the stored shape matches exactly.
const commentMediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    resourceType: { type: String, enum: ['image', 'video', 'raw'], required: true },
    durationSeconds: { type: Number, default: null },
    fileName: { type: String, default: null },
    mimeType: { type: String, default: null },
    sizeBytes: { type: Number, default: null },
    // Set by the backend once speech-to-text finishes for a voice
    // comment. transcribing:true means it's still processing.
    transcript: { type: String, default: null },
    transcribing: { type: Boolean, default: false },
  },
  { _id: false }
);

const postCommentSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Was required: true — a voice-only comment can have no typed text
    // at all, so a comment now needs body OR media, not necessarily both
    // (enforced in the controller, not the schema).
    body: { type: String, required: false, trim: true, maxlength: 500 },
    // NEW — present only on a voice comment/reply.
    media: { type: commentMediaSchema, default: null },
    parentComment: { type: mongoose.Schema.Types.ObjectId, ref: 'PostComment', default: null, index: true },
    replyToComment: { type: mongoose.Schema.Types.ObjectId, ref: 'PostComment', default: null },
    replyCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

postCommentSchema.index({ post: 1, parentComment: 1, createdAt: -1 });

module.exports = mongoose.model('PostComment', postCommentSchema);
