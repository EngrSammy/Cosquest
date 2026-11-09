const router = require('express').Router();
const { requireAuth, requireCompletedOnboarding } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { leaderboard, realms } = require('../controllers/spotlightController');
router.use(requireAuth, requireCompletedOnboarding);
router.get('/leaderboard', asyncHandler(leaderboard));
router.get('/realms', realms);
module.exports = router;
