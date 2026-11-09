const mongoose = require('mongoose');

const postBookmarkSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

postBookmarkSchema.index({ post: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('PostBookmark', postBookmarkSchema);
