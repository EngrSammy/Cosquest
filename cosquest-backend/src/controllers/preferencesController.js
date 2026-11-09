const User = require('../models/User');
const userModel = require('../models/userModel');
const { isValidFactionKey } = require('../models/factionModel');
const { isValidInterestKey } = require('../models/interestModel');
const { isValidAvatarKey } = require('../utils/avatarCatalog');
const { isValidUsername, normalizeUsername } = require('../utils/validation');

const MIN_RADIUS_MILES = 5;
const MAX_RADIUS_MILES = 100;
const DEFAULT_RADIUS_MILES = 50;

// Shared by the standalone endpoint and the one-shot onboarding payload.
function validateLocationInput({ locationEnabled, radiusMiles, lat, lng }) {
  if (typeof locationEnabled !== 'boolean') return 'locationEnabled (boolean) is required.';
  if (locationEnabled) {
    if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      return 'lat is required when locationEnabled is true, and must be a number between -90 and 90.';
    }
    if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      return 'lng is required when locationEnabled is true, and must be a number between -180 and 180.';
    }
  }
  if (radiusMiles !== undefined) {
    const n = Number(radiusMiles);
    if (!Number.isFinite(n) || n < MIN_RADIUS_MILES || n > MAX_RADIUS_MILES) {
      return `radiusMiles must be between ${MIN_RADIUS_MILES} and ${MAX_RADIUS_MILES}.`;
    }
  }
  return null;
}

// PATCH /api/users/me/preferences/notifications
async function updateNotificationPrefs(req, res) {
  const { notificationsEnabled, eventReminders, emailWeeklyNewsletter } = req.body;
  const extraCategories = ['questUpdates', 'factionNews', 'friendActivity', 'rankChanges'];
  const extraFields = [...extraCategories, 'emailPromotionalEvents'];
  for (const key of extraFields) {
    if (req.body[key] !== undefined && typeof req.body[key] !== 'boolean') return res.status(400).json({ error: `${key} must be a boolean.` });
  }
  // The master switch is required on its own during onboarding (step 4);
  // afterward, the Settings screen can flip any one of these independently.
  if (notificationsEnabled === undefined && eventReminders === undefined && emailWeeklyNewsletter === undefined && !extraFields.some((key) => req.body[key] !== undefined)) {
    return res.status(400).json({ error: 'notificationsEnabled (boolean) is required.' });
  }
  if (notificationsEnabled !== undefined && typeof notificationsEnabled !== 'boolean') {
    return res.status(400).json({ error: 'notificationsEnabled must be a boolean.' });
  }
  if (eventReminders !== undefined && typeof eventReminders !== 'boolean') {
    return res.status(400).json({ error: 'eventReminders must be a boolean.' });
  }
  if (emailWeeklyNewsletter !== undefined && typeof emailWeeklyNewsletter !== 'boolean') {
    return res.status(400).json({ error: 'emailWeeklyNewsletter must be a boolean.' });
  }
  const updated = await userModel.updateUser(req.userId, (user) => {
    if (notificationsEnabled !== undefined) {
      user.preferences.notificationsEnabled = notificationsEnabled;
      user.onboarding.notificationPreferenceChosen = true;
    }
    if (eventReminders !== undefined) user.notificationCategories.eventReminders = eventReminders;
    // Preference only - no email actually gets sent yet (no email
    // infrastructure exists in this backend), see COMMUNITY/SETTINGS docs.
    if (emailWeeklyNewsletter !== undefined) user.preferences.emailWeeklyNewsletter = emailWeeklyNewsletter;
    for (const key of extraCategories) {
      if (req.body[key] !== undefined) user.notificationCategories[key] = req.body[key];
    }
    if (req.body.emailPromotionalEvents !== undefined) user.preferences.emailPromotionalEvents = req.body.emailPromotionalEvents;
  });
  return res.json({ user: userModel.sanitize(updated) });
}

// PATCH /api/users/me/preferences/location - CosQuest is played in the real
// world, so unlike notifications, this is a required onboarding step (see
// completeOnboarding below), not just an optional preference.
async function updateLocationPrefs(req, res) {
  const { locationEnabled, radiusMiles, lat, lng } = req.body;
  const error = validateLocationInput({ locationEnabled, radiusMiles, lat, lng });
  if (error) return res.status(400).json({ error });

  const updated = await userModel.updateUser(req.userId, (user) => {
    user.preferences.locationEnabled = Boolean(locationEnabled);
    user.preferences.radiusMiles = radiusMiles !== undefined ? Number(radiusMiles) : user.preferences.radiusMiles || DEFAULT_RADIUS_MILES;
    if (locationEnabled) {
      user.location.lat = Number(lat);
      user.location.lng = Number(lng);
      user.location.updatedAt = new Date();
    } else {
      user.location.lat = null;
      user.location.lng = null;
      user.location.updatedAt = null;
    }
  });
  return res.json({ user: userModel.sanitize(updated) });
}

// POST /api/users/me/devices  (register a push token, only meaningful once notificationsEnabled is true)
async function registerDevice(req, res) {
  const { pushToken, platform } = req.body;
  if (!pushToken || !platform) {
    return res.status(400).json({ error: 'pushToken and platform ("ios" | "android" | "web") are required.' });
  }
  // Polish: one phone, one owner. Signing in as someone else on the same
  // phone moves the token, so the last person no longer gets its pushes.
  await User.updateMany({ _id: { $ne: req.userId }, 'devices.pushToken': pushToken }, { $pull: { devices: { pushToken } } });
  const updated = await userModel.updateUser(req.userId, (user) => {
    const exists = user.devices.some((d) => d.pushToken === pushToken);
    if (!exists) {
      user.devices.push({ pushToken, platform, registeredAt: new Date() });
    }
  });
  return res.json({ user: userModel.sanitize(updated) });
}

/**
 * POST /api/users/me/onboarding/complete
 *
 * Mirrors the front-end's finishOnb() exactly: nothing gets saved to a
 * server while the user clicks through onboarding steps 1-4 - everything
 * (profile, faction, interests, preferences) sits in the client's local
 * `state` object and is only submitted once, all together, at the moment
 * the user taps "Enter CosQuest." This endpoint accepts that same combined
 * payload in one call and applies it atomically: every field is validated
 * first, and if anything is invalid, NOTHING is saved and onboardingComplete
 * stays false - there's no partial-onboarding state left behind.
 *
 * Clients may submit every step at once or save each step independently.
 * Either way, completion is allowed only after every required choice exists.
 */
async function completeOnboarding(req, res) {
  const { profile, faction, interests, preferences, location } = req.body;
  const errors = [];

  if (profile?.username !== undefined) {
    if (!isValidUsername(profile.username)) {
      errors.push('profile.username must be 3-20 characters: letters, numbers, underscore only.');
    } else if (await userModel.isUsernameTaken(profile.username, req.userId)) {
      errors.push('That username is already taken.');
    }
  }
  if (profile?.age !== undefined && profile.age !== null && profile.age !== '') {
    const n = Number(profile.age);
    if (!Number.isInteger(n) || n < 13 || n > 120) {
      errors.push('profile.age must be a whole number between 13 and 120.');
    }
  }
  if (profile?.avatar !== undefined && !(await isValidAvatarKey(profile.avatar))) {
    errors.push('profile.avatar is not a recognized avatar option. See GET /api/meta/avatars.');
  }
  if (faction !== undefined && !isValidFactionKey(faction)) {
    errors.push('faction must be one of the values from GET /api/factions.');
  }
  if (interests !== undefined) {
    if (!Array.isArray(interests)) {
      errors.push('interests must be an array of interest keys.');
    } else {
      const invalid = interests.filter((k) => !isValidInterestKey(k));
      if (invalid.length) errors.push(`Unknown interest key(s): ${invalid.join(', ')}`);
    }
  }
  if (preferences?.notificationsEnabled !== undefined && typeof preferences.notificationsEnabled !== 'boolean') {
    errors.push('preferences.notificationsEnabled must be a boolean.');
  }
  if (location !== undefined) {
    const locationError = validateLocationInput(location);
    if (locationError) errors.push(`location.${locationError}`);
  }

  const nextProfile = {
    firstName: profile?.firstName !== undefined ? String(profile.firstName).trim() : req.user.profile.firstName,
    lastName: profile?.lastName !== undefined ? String(profile.lastName).trim() : req.user.profile.lastName,
    username: profile?.username !== undefined ? String(profile.username).trim() : req.user.profile.username,
    age: profile?.age !== undefined ? profile.age : req.user.profile.age,
    gender: profile?.gender !== undefined ? String(profile.gender).trim() : req.user.profile.gender,
  };
  const nextFaction = faction !== undefined ? faction : req.user.faction;
  const nextInterests = interests !== undefined ? interests : req.user.interests;
  const avatarChosen = req.user.onboarding?.avatarChosen || profile?.avatar !== undefined;
  const notificationPreferenceChosen =
    req.user.onboarding?.notificationPreferenceChosen || preferences?.notificationsEnabled !== undefined;
  const nextLocationEnabled = location?.locationEnabled !== undefined ? location.locationEnabled : req.user.preferences?.locationEnabled;
  const nextLat = location?.lat !== undefined ? location.lat : req.user.location?.lat;
  const nextLng = location?.lng !== undefined ? location.lng : req.user.location?.lng;

  if (!nextProfile.firstName) errors.push('profile.firstName is required.');
  if (!nextProfile.lastName) errors.push('profile.lastName is required.');
  if (!isValidUsername(nextProfile.username)) {
    errors.push('profile.username is required and must be 3-20 characters: letters, numbers, underscore only.');
  }
  const nextAge = Number(nextProfile.age);
  if (!Number.isInteger(nextAge) || nextAge < 13 || nextAge > 120) {
    errors.push('profile.age is required and must be a whole number between 13 and 120.');
  }
  if (!nextProfile.gender) errors.push('profile.gender is required.');
  if (!avatarChosen) errors.push('Choose an avatar or upload a profile photo before completing onboarding.');
  if (!nextFaction || !isValidFactionKey(nextFaction)) errors.push('Choose a faction before completing onboarding.');
  if (!Array.isArray(nextInterests) || nextInterests.length === 0) {
    errors.push('Choose at least one interest before completing onboarding.');
  }
  if (!notificationPreferenceChosen) errors.push('Choose whether to enable notifications before completing onboarding.');
  if (!nextLocationEnabled || typeof nextLat !== 'number' || typeof nextLng !== 'number') {
    errors.push('Enable location and share your coordinates before completing onboarding.');
  }

  if (errors.length) {
    return res.status(400).json({ error: errors.join(' '), errors });
  }

  const updated = await userModel.updateUser(req.userId, (user) => {
    if (profile) {
      if (profile.firstName !== undefined) user.profile.firstName = String(profile.firstName).trim();
      if (profile.lastName !== undefined) user.profile.lastName = String(profile.lastName).trim();
      if (profile.username !== undefined) user.profile.username = String(profile.username).trim();
      if (profile.username !== undefined) user.profile.usernameNormalized = normalizeUsername(profile.username);
      if (profile.age !== undefined) user.profile.age = profile.age === '' || profile.age === null ? null : Number(profile.age);
      if (profile.gender !== undefined) user.profile.gender = String(profile.gender).trim();
      if (profile.avatar !== undefined) {
        // Preset avatar and uploaded photo coexist (a small badge over the
        // main photo) - setting one never clears the other.
        user.profile.avatarKey = profile.avatar;
        user.onboarding.avatarChosen = true;
      }
    }
    if (faction !== undefined) user.faction = faction;
    if (interests !== undefined) user.interests = [...new Set(interests)];
    if (preferences) {
      if (preferences.notificationsEnabled !== undefined) user.preferences.notificationsEnabled = Boolean(preferences.notificationsEnabled);
      if (preferences.notificationsEnabled !== undefined) user.onboarding.notificationPreferenceChosen = true;
    }
    if (location) {
      if (location.locationEnabled !== undefined) user.preferences.locationEnabled = Boolean(location.locationEnabled);
      if (location.radiusMiles !== undefined) user.preferences.radiusMiles = Number(location.radiusMiles);
      else if (!user.preferences.radiusMiles) user.preferences.radiusMiles = DEFAULT_RADIUS_MILES;
      if (location.locationEnabled) {
        user.location.lat = Number(location.lat);
        user.location.lng = Number(location.lng);
        user.location.updatedAt = new Date();
      }
    }
    user.onboardingComplete = true;
  });

  return res.json({ message: 'Onboarding complete.', onboardingRequired: false, user: userModel.sanitize(updated) });
}

module.exports = { updateNotificationPrefs, updateLocationPrefs, registerDevice, completeOnboarding };
