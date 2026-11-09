const mongoose = require('mongoose');

const oauthIdentitySchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ['google', 'apple'], required: true },
    subject: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

oauthIdentitySchema.index({ provider: 1, subject: 1 }, { unique: true });

module.exports = mongoose.model('OAuthIdentity', oauthIdentitySchema);
