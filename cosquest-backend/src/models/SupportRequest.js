const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['support', 'bug'], required: true },
  subject: { type: String, required: true, maxlength: 150 },
  message: { type: String, required: true, maxlength: 5000 },
  appVersion: { type: String, maxlength: 50, default: '' },
  platform: { type: String, enum: ['ios', 'android', 'web', 'unknown'], default: 'unknown' },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
}, { timestamps: true });
module.exports = mongoose.model('SupportRequest', schema);
