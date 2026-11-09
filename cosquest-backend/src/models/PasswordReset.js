const mongoose = require('mongoose');

/**
 * One row per account with an active forgot-password code. Two unique
 * indexes do the real work here:
 *  - `user` unique: a new forgot-password request replaces this account's
 *    row (see forgotPassword in authController.js) instead of adding a
 *    second one, so only one code is ever valid per account at a time.
 *  - `codeHash` unique: guarantees two different accounts can never hold
 *    the same active code at the same time, even if two people request one
 *    in the same instant and the random generator happens to pick the same
 *    six digits - the second write hits the unique index and retries with a
 *    fresh code (see issueResetCode's retry loop).
 * `expiresAt` is a TTL index, so an expired row is deleted by MongoDB
 * itself and its code value becomes reusable again automatically.
 */
const passwordResetSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    codeHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    // Wrong guesses against this one code, capped in resetPassword - stops
    // someone brute-forcing a 6-digit code (1,000,000 possibilities) within
    // its 5-minute window instead of requesting a fresh one.
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PasswordReset', passwordResetSchema);
