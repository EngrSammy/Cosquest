const express = require('express');
const { AVATARS } = require('../models/avatarModel');
const CLOUDINARY_AVATAR_PUBLIC_IDS = require('../data/cloudinaryAvatarPublicIds');
const { getAvatarCatalog } = require('../utils/avatarCatalog');
const { asyncHandler } = require('../utils/asyncHandler');
const { PROFILE_CATEGORIES } = require('../models/profileCategoryModel');

const router = express.Router();

// GET /api/meta/avatars (public) - the avatar picker options for onboarding step 1.
// Asks Cloudinary what exists (cached, see utils/avatarCatalog.js) so newly
// uploaded avatars appear without a code change.
router.get('/avatars', asyncHandler(async (req, res) => {
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    return res.status(503).json({ error: 'Cloudinary is not configured for preset avatars.' });
  }
  if (CLOUDINARY_AVATAR_PUBLIC_IDS.length !== AVATARS.length) {
    return res.status(500).json({ error: 'The Cloudinary avatar mapping is incomplete.' });
  }
  const catalog = await getAvatarCatalog();
  return res.json({ avatars: catalog.map(({ key, label, imageUrl }) => ({ key, label, imageUrl })) });
}));

// GET /api/meta/profile-categories (public) - the searchable category picker.
router.get('/profile-categories', (req, res) => res.json({ categories: PROFILE_CATEGORIES }));

module.exports = router;
