const Quest = require('../models/Quest');
const QuestRegistration = require('../models/QuestRegistration');
const notificationModel = require('../models/notificationModel');
const { distanceMiles, serializeQuest } = require('../utils/quest');

// Fallback only - every user who completed onboarding after the location
// step became required already has their own coordinates (see
// preferencesController.completeOnboarding). This exists for accounts that
// finished onboarding before that requirement existed.
function configuredLocation() {
  return {
    lat: Number(process.env.DASHBOARD_DEFAULT_LAT || 6.5244),
    lng: Number(process.env.DASHBOARD_DEFAULT_LNG || 3.3792),
    radiusMiles: Number(process.env.DASHBOARD_RADIUS_MILES || 30),
  };
}

async function getDashboard(req, res) {
  const hasOwnLocation =
    req.user.preferences?.locationEnabled &&
    typeof req.user.location?.lat === 'number' &&
    typeof req.user.location?.lng === 'number';
  const location = hasOwnLocation
    ? { lat: req.user.location.lat, lng: req.user.location.lng, radiusMiles: req.user.preferences.radiusMiles || 50, source: 'user' }
    : { ...configuredLocation(), source: 'default' };

  const [quests, registrations, notifications] = await Promise.all([
    Quest.find({ isPublished: true, status: { $in: ['live', 'upcoming'] } }).sort({ startsAt: 1 }),
    QuestRegistration.find({ user: req.userId, status: 'registered' }, 'quest'),
    notificationModel.listForUser(req.userId),
  ]);
  const registrationIds = new Set(registrations.map((registration) => String(registration.quest)));
  const nearby = quests
    .map((quest) => ({ quest, distance: distanceMiles(location.lat, location.lng, quest.location.lat, quest.location.lng) }))
    .filter((item) => item.distance <= location.radiusMiles)
    .sort((a, b) => a.distance - b.distance);
  const format = ({ quest, distance }) => serializeQuest(quest, { distance, isRegistered: registrationIds.has(String(quest._id)) });
  const liveQuest = nearby.find((item) => item.quest.status === 'live');
  const maxUpcoming = Number(process.env.DASHBOARD_MAX_UPCOMING || 3);
  const maxNearby = Number(process.env.DASHBOARD_MAX_NEARBY || 6);

  return res.json({
    user: {
      id: req.userId,
      firstName: req.user.profile.firstName || req.user.profile.username,
      username: req.user.profile.username,
      avatarKey: req.user.profile.avatarKey,
      avatarPhotoUrl: req.user.profile.avatarPhotoUrl,
    },
    location,
    unreadNotificationCount: notifications.filter((notification) => !notification.read).length,
    liveQuest: liveQuest ? format(liveQuest) : null,
    upcomingQuests: nearby.filter((item) => item.quest.status === 'upcoming').slice(0, maxUpcoming).map(format),
    nearbyQuests: nearby.slice(0, maxNearby).map(format),
  });
}

module.exports = { getDashboard };
