const express = require('express');
const { identifyUser } = require('../middleware/identifyUser');
const { asyncHandler } = require('../utils/asyncHandler');
const {
  updateNotificationPrefs,
  updateLocationPrefs,
  registerDevice,
  completeOnboarding,
} = require('../controllers/preferencesController');

const router = express.Router();

// email (before login/onboarding) or Bearer token (after login) - see identifyUser
router.use(asyncHandler(identifyUser));

router.patch('/me/preferences/notifications', asyncHandler(updateNotificationPrefs));
router.patch('/me/preferences/location', asyncHandler(updateLocationPrefs));
router.post('/me/devices', asyncHandler(registerDevice));
router.post('/me/onboarding/complete', asyncHandler(completeOnboarding));

module.exports = router;
