const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    resourceType: { type: String, enum: ['image', 'video'], required: true },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    durationSeconds: { type: Number, default: null },
  },
  { _id: false }
);

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // 'share' = this post shares another post into the feed (like Facebook's
    // "Share now"); content is the sharer's optional caption.
    type: { type: String, enum: ['image', 'reel', 'thought', 'share'], required: true, index: true },
    content: { type: String, default: '', trim: true, maxlength: 2200 },
    media: { type: [mediaSchema], default: [] },
    // The original post a 'share' post points to (always the ORIGINAL, never
    // another share). Null for every other type.
    sharedPost: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null, index: true },
    likeCount: { type: Number, default: 0, min: 0 },
    commentCount: { type: Number, default: 0, min: 0 },
    shareCount: { type: Number, default: 0, min: 0 },
    bookmarkCount: { type: Number, default: 0, min: 0 },
    // Set whenever the owner edits `content`; distinct from `updatedAt` so
    // an edit can be shown to viewers ("edited") without conflating it with
    // any other future field that might touch this document.
    editedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ type: 1, createdAt: -1 });

module.exports = mongoose.model('Post', postSchema);
