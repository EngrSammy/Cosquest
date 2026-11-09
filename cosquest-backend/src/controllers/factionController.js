const { FACTIONS, isValidFactionKey, getFaction } = require('../models/factionModel');
const userModel = require('../models/userModel');
const User = require('../models/User');
const Quest = require('../models/Quest');
const { previewUser, parseLimit, parsePage } = require('./publicProfileController');

// GET /api/factions (public - no auth required, same as the front-end's onboarding step 2 list)
// memberCount and activeQuestCount are live counts, not stored on the faction.
// A quest's faction is just a label (see Quest.faction) - it never restricts
// who can register, so this count is purely informational.
async function listFactions(req, res) {
  const [memberCounts, questCounts] = await Promise.all([
    User.aggregate([
      { $match: { onboardingComplete: true, faction: { $ne: null } } },
      { $group: { _id: '$faction', count: { $sum: 1 } } },
    ]),
    Quest.aggregate([
      { $match: { isPublished: true, status: { $in: ['live', 'upcoming'] }, faction: { $ne: null } } },
      { $group: { _id: '$faction', count: { $sum: 1 } } },
    ]),
  ]);
  const memberCountByKey = new Map(memberCounts.map((row) => [row._id, row.count]));
  const questCountByKey = new Map(questCounts.map((row) => [row._id, row.count]));
  return res.json({
    factions: FACTIONS.map((faction) => ({
      ...faction,
      memberCount: memberCountByKey.get(faction.key) || 0,
      activeQuestCount: questCountByKey.get(faction.key) || 0,
    })),
  });
}

// GET /api/factions/:key/members - a small preview list (e.g. the avatar row
// on a faction card), same pattern as followers/following.
async function listFactionMembers(req, res) {
  if (!isValidFactionKey(req.params.key)) return res.status(404).json({ error: 'Faction not found.' });

  const limit = parseLimit(req.query.limit, 6);
  const page = parsePage(req.query.page);
  const query = { faction: req.params.key, onboardingComplete: true };
  const [users, total] = await Promise.all([
    User.find(query)
      .select('profile.username profile.firstName profile.lastName profile.avatarKey profile.avatarPhotoUrl faction')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(query),
  ]);

  return res.json({
    faction: getFaction(req.params.key),
    users: users.map(previewUser),
    pagination: { page, limit, total, hasMore: page * limit < total },
  });
}

// POST /api/users/me/faction  (onboarding step 2)
async function setFaction(req, res) {
  const { factionKey } = req.body;
  if (!factionKey || !isValidFactionKey(factionKey)) {
    return res.status(400).json({ error: 'factionKey must be one of the values from GET /api/factions.' });
  }
  const updated = await userModel.updateUser(req.userId, (user) => {
    user.faction = factionKey;
  });
  return res.json({ user: userModel.sanitize(updated) });
}

module.exports = { listFactions, listFactionMembers, setFaction };
