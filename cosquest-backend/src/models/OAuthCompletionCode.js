const mongoose = require('mongoose');

const oauthCompletionCodeSchema = new mongoose.Schema(
  {
    codeHash: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);

module.exports = mongoose.model('OAuthCompletionCode', oauthCompletionCodeSchema);
