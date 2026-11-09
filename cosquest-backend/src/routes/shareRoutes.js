const express = require('express');
const { optionalAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { renderPublicProfilePage } = require('../controllers/shareController');

const router = express.Router();

// Short, human-friendly, and outside /api on purpose - this is the actual
// link people paste into Instagram/Facebook/WhatsApp/etc, not a JSON endpoint.
router.get('/:username', asyncHandler(optionalAuth), asyncHandler(renderPublicProfilePage));

module.exports = router;
