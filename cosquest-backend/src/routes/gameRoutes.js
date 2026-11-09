const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { getGameSession } = require('../controllers/gameController');

// The merged app's CostQuest game (src/controllers/gameController.js).
const router = express.Router();

// The game backend's single sign-on checks a chat session here.
router.get('/session', requireAuth, asyncHandler(getGameSession));

module.exports = router;
