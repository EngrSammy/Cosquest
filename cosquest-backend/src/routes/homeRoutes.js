const express = require('express');
const { requireAuth, requireCompletedOnboarding } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const { getDashboard } = require('../controllers/homeController');

const router = express.Router();

router.get('/dashboard', requireAuth, requireCompletedOnboarding, asyncHandler(getDashboard));

module.exports = router;
