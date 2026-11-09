const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const userModel = require('../models/userModel');
const { EXPERTISE, isValidExpertise } = require('../models/expertiseModel');

const router = express.Router();

// GET /api/expertise - the list of expertise roles (public).
router.get('/expertise', (req, res) => res.json({ expertise: EXPERTISE }));

// PATCH /api/expertise/me  { expertise: "front_end" | null } - set or clear mine.
// The field must be present: an empty body must not silently clear it.
router.patch(
  '/expertise/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.body || !Object.prototype.hasOwnProperty.call(req.body, 'expertise')) {
      return res.status(400).json({ error: 'Send expertise: a role key, or null to clear it.' });
    }
    const value = req.body.expertise;
    if (value !== null && !isValidExpertise(value)) {
      return res.status(400).json({ error: 'Choose one of the listed expertise roles.' });
    }
    const user = await userModel.updateUser(req.userId, (doc) => {
      doc.expertise = value;
    });
    if (!user) return res.status(404).json({ error: 'User not found.' });
    return res.json({ user: userModel.sanitize(user) });
  })
);

module.exports = router;
