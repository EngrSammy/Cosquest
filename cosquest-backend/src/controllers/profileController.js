const userModel = require('../models/userModel');
const { isValidAvatarKey } = require('../utils/avatarCatalog');
const { storeAvatarPhoto } = require('../utils/imageHost');
const { isValidEmail, isValidUsername, normalizeUsername } = require('../utils/validation');
const { isValidProfileCategory } = require('../models/profileCategoryModel');

// GET /api/users/me
function getMe(req, res) {
  return res.json({ user: userModel.sanitize(req.user) });
}

// PATCH /api/users/me/profile  (onboarding step 1)
async function updateProfile(req, res) {
  const { firstName, lastName, username, age, gender, bio, category, showCategoryOnProfile } = req.body;

  if (username !== undefined) {
    if (!isValidUsername(username)) {
      return res
        .status(400)
        .json({ error: 'username must be 3-20 characters: letters, numbers, underscore only.' });
    }
    if (await userModel.isUsernameTaken(username, req.userId)) {
      return res.status(409).json({ error: 'That username is already taken.' });
    }
  }

  if (age !== undefined && age !== null && age !== '') {
    const n = Number(age);
    if (!Number.isInteger(n) || n < 13 || n > 120) {
      return res.status(400).json({ error: 'age must be a whole number between 13 and 120.' });
    }
  }
  if (bio !== undefined && (typeof bio !== 'string' || bio.trim().length > 500)) {
    return res.status(400).json({ error: 'bio must be text with at most 500 characters.' });
  }
  if (category !== undefined && category !== null && category !== '' && !isValidProfileCategory(category)) {
    return res.status(400).json({ error: 'category must be one of the values from GET /api/meta/profile-categories.' });
  }
  if (showCategoryOnProfile !== undefined && typeof showCategoryOnProfile !== 'boolean') {
    return res.status(400).json({ error: 'showCategoryOnProfile must be a boolean.' });
  }

  const updated = await userModel.updateUser(req.userId, (user) => {
    if (firstName !== undefined) user.profile.firstName = String(firstName).trim();
    if (lastName !== undefined) user.profile.lastName = String(lastName).trim();
    if (username !== undefined) {
      user.profile.username = String(username).trim();
      user.profile.usernameNormalized = normalizeUsername(username);
    }
    if (age !== undefined) user.profile.age = age === '' || age === null ? null : Number(age);
    if (gender !== undefined) user.profile.gender = String(gender).trim();
    if (bio !== undefined) user.profile.bio = bio.trim();
    if (category !== undefined) user.profile.category = category ? String(category).trim() : null;
    if (showCategoryOnProfile !== undefined) user.profile.showCategoryOnProfile = showCategoryOnProfile;
  });

  return res.json({ user: userModel.sanitize(updated) });
}

// GET /api/users/me/contact - private editing view of the public contact details.
function getContact(req, res) {
  return res.json({ contact: req.user.contact || { email: '', phone: '', businessAddress: '' } });
}

// PATCH /api/users/me/contact - saved values are public because this screen
// has no per-field visibility controls. This never changes the login email.
async function updateContact(req, res) {
  const { email, phone, businessAddress } = req.body;
  if (email !== undefined && (typeof email !== 'string' || (email.trim() && !isValidEmail(email)))) {
    return res.status(400).json({ error: 'contact email must be a valid email address.' });
  }
  if (phone !== undefined && (typeof phone !== 'string' || (phone.trim() && !/^\+[1-9]\d{7,14}$/.test(phone.trim())))) {
    return res.status(400).json({ error: 'phone must use international format, for example +2348148327836.' });
  }
  if (businessAddress !== undefined && (typeof businessAddress !== 'string' || businessAddress.trim().length > 250)) {
    return res.status(400).json({ error: 'businessAddress must be text with at most 250 characters.' });
  }

  const updated = await userModel.updateUser(req.userId, (user) => {
    if (email !== undefined) user.contact.email = email.trim().toLowerCase();
    if (phone !== undefined) user.contact.phone = phone.trim();
    if (businessAddress !== undefined) user.contact.businessAddress = businessAddress.trim();
  });
  return res.json({ contact: updated.contact });
}

// GET /api/users/check-username?username=xyz
async function checkUsername(req, res) {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'username query param is required.' });
  const taken = await userModel.isUsernameTaken(username, req.userId);
  return res.json({ username, available: !taken });
}

// PATCH /api/users/me/avatar
async function setAvatar(req, res) {
  const { avatar } = req.body;
  if (!(await isValidAvatarKey(avatar))) {
    return res.status(400).json({ error: 'Not a recognized avatar option. See GET /api/meta/avatars.' });
  }
  const updated = await userModel.updateUser(req.userId, (user) => {
    // Preset avatar and uploaded photo coexist by design (a small badge over
    // the main photo, per the actual profile UI) - picking one never clears
    // the other.
    user.profile.avatarKey = avatar;
    user.onboarding.avatarChosen = true;
  });
  return res.json({ user: userModel.sanitize(updated) });
}

// POST /api/users/me/avatar/photo  (multipart/form-data, field name "photo")
async function uploadAvatarPhoto(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No photo uploaded. Send multipart/form-data with a "photo" field.' });
  }
  try {
    const url = await storeAvatarPhoto(req.file);
    const updated = await userModel.updateUser(req.userId, (user) => {
      user.profile.avatarPhotoUrl = url;
      user.onboarding.avatarChosen = true;
    });
    return res.json({ user: userModel.sanitize(updated) });
  } catch (err) {
    return res.status(err.status || 500).json({ error: `Photo upload failed: ${err.message}` });
  }
}

module.exports = { getMe, updateProfile, getContact, updateContact, checkUsername, setAvatar, uploadAvatarPhoto };
