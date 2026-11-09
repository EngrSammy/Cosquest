const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
  comment: { type: mongoose.Schema.Types.ObjectId, ref: 'PostComment', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });
schema.index({ comment: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('CommentLike', schema);
