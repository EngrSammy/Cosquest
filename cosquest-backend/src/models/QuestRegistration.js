const mongoose = require('mongoose');

const questRegistrationSchema = new mongoose.Schema(
  {
    quest: { type: mongoose.Schema.Types.ObjectId, ref: 'Quest', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // The quest-management system will move a registration to completed or
    // winner once that quest has ended. Users cannot set these states.
    status: { type: String, enum: ['registered', 'cancelled', 'completed', 'winner'], default: 'registered', index: true },
    paymentStatus: { type: String, enum: ['not_required', 'pending', 'paid'], default: 'not_required' },
  },
  { timestamps: true }
);

questRegistrationSchema.index({ quest: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('QuestRegistration', questRegistrationSchema);
