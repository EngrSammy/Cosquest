const express = require('express');
const { requireAuth, requireCompletedOnboarding } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { listQuests, getQuest, registerForQuest, cancelRegistration } = require('../controllers/questController');

const router = express.Router();

router.get('/quests', asyncHandler(listQuests));
router.get('/quests/:questId', asyncHandler(getQuest));
router.post('/quests/:questId/registrations', requireAuth, requireCompletedOnboarding, asyncHandler(registerForQuest));
router.delete('/quests/:questId/registrations', requireAuth, requireCompletedOnboarding, asyncHandler(cancelRegistration));

module.exports = router;
