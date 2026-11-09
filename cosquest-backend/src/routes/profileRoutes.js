const express = require('express');
const { identifyUser, identifyUserWithPassword } = require('../middleware/identifyUser');
const { upload } = require('../middleware/upload');
const { requireAuth, optionalAuth, requireCompletedOnboarding } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncHandler');
const {
  getMe,
  updateProfile,
  getContact,
  updateContact,
  checkUsername,
  setAvatar,
  uploadAvatarPhoto,
} = require('../controllers/profileController');
const {
  getPublicProfile,
  getMyPoints,
  listQuestHistory,
  followUser,
  unfollowUser,
  listFollowers,
  listFollowing,
  searchUsers,
  discoverUsers,
} = require('../controllers/publicProfileController');
const { getProfileShareLink } = require('../controllers/shareController');
const { getPrivacy, updatePrivacy } = require('../controllers/privacyController');
const { blockUser, unblockUser, listBlockedUsers } = require('../controllers/blockController');

const router = express.Router();

// email (before login/onboarding) or Bearer token (after login) - see identifyUser
router.get('/me', asyncHandler(identifyUser), getMe);
router.patch('/me/profile', asyncHandler(identifyUser), asyncHandler(updateProfile));
router.get('/check-username', asyncHandler(identifyUser), asyncHandler(checkUsername));
router.patch('/me/avatar', asyncHandler(identifyUser), asyncHandler(setAvatar));
// multer has to parse the multipart body first, so req.body.email exists by the time identifyUser runs
router.post('/me/avatar/photo', upload.single('photo'), asyncHandler(identifyUser), asyncHandler(uploadAvatarPhoto));
router.get('/me/points', requireAuth, requireCompletedOnboarding, getMyPoints);
// Contact holds more sensitive PII (phone, business address) than the other
// onboarding-step fields, so its pre-login branch requires the account's
// password too, not just the identifier - see identifyUserWithPassword. GET
// (no body) uses HTTP Basic Auth for this instead of a JSON body, so the
// password never has to sit in a URL.
router.get('/me/contact', asyncHandler(identifyUserWithPassword), asyncHandler(getContact));
router.patch('/me/contact', asyncHandler(identifyUserWithPassword), asyncHandler(updateContact));
router.get('/me/privacy', requireAuth, requireCompletedOnboarding, getPrivacy);
router.patch('/me/privacy', requireAuth, requireCompletedOnboarding, asyncHandler(updatePrivacy));
router.get('/me/blocked', requireAuth, requireCompletedOnboarding, asyncHandler(listBlockedUsers));

// Find people to start a DM/forward with, by name - see searchUsers. Placed
// before /:username so "search" can never be mistaken for a username.
router.get('/search', requireAuth, requireCompletedOnboarding, asyncHandler(searchUsers));
router.get('/discover', requireAuth, requireCompletedOnboarding, asyncHandler(discoverUsers));

// Public profile and social graph. These routes intentionally come after the
// explicit /me routes so "me" can never be mistaken for a username.
router.get('/:username/profile', asyncHandler(optionalAuth), asyncHandler(getPublicProfile));
router.get('/:username/share', asyncHandler(optionalAuth), asyncHandler(getProfileShareLink));
router.get('/:username/quests', asyncHandler(optionalAuth), asyncHandler(listQuestHistory));
router.get('/:username/followers', asyncHandler(optionalAuth), asyncHandler(listFollowers));
router.get('/:username/following', asyncHandler(optionalAuth), asyncHandler(listFollowing));
router.post('/:username/follow', requireAuth, requireCompletedOnboarding, asyncHandler(followUser));
router.delete('/:username/follow', requireAuth, requireCompletedOnboarding, asyncHandler(unfollowUser));
router.post('/:username/block', requireAuth, requireCompletedOnboarding, asyncHandler(blockUser));
router.delete('/:username/block', requireAuth, requireCompletedOnboarding, asyncHandler(unblockUser));

module.exports = router;
