const Quest = require('../models/Quest');
const QuestRegistration = require('../models/QuestRegistration');
const { distanceMiles, serializeQuest } = require('../utils/quest');

function parseCoordinate(value, min, max) {
  if (value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : undefined;
}

function parseLimit(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, 50) : fallback;
}

async function listQuests(req, res) {
  const { status } = req.query;
  const lat = parseCoordinate(req.query.lat, -90, 90);
  const lng = parseCoordinate(req.query.lng, -180, 180);
  const radiusMiles = Number(req.query.radiusMiles || process.env.DASHBOARD_RADIUS_MILES || 30);
  if (lat === undefined || lng === undefined || !Number.isFinite(radiusMiles) || radiusMiles <= 0) {
    return res.status(400).json({ error: 'lat, lng, and radiusMiles must be valid numbers.' });
  }

  const query = { isPublished: true };
  if (status) query.status = status;
  if (req.query.faction) query.faction = req.query.faction;
  const quests = await Quest.find(query).sort({ startsAt: 1 }).limit(parseLimit(req.query.limit, 20));
  const withDistance = quests.map((quest) => ({
    quest,
    distance: lat === null ? undefined : distanceMiles(lat, lng, quest.location.lat, quest.location.lng),
  }));
  const filtered = lat === null ? withDistance : withDistance.filter((item) => item.distance <= radiusMiles);
  filtered.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));
  return res.json({ quests: filtered.map(({ quest, distance }) => serializeQuest(quest, { distance })) });
}

async function getQuest(req, res) {
  const quest = await Quest.findOne({ _id: req.params.questId, isPublished: true });
  if (!quest) return res.status(404).json({ error: 'Quest not found.' });
  return res.json({ quest: serializeQuest(quest) });
}

async function registerForQuest(req, res) {
  const quest = await Quest.findOneAndUpdate(
    {
      _id: req.params.questId,
      isPublished: true,
      status: { $in: ['upcoming', 'live'] },
      $expr: { $lt: ['$registrationCount', '$maxParticipants'] },
    },
    { $inc: { registrationCount: 1 } },
    { new: true }
  );
  if (!quest) return res.status(409).json({ error: 'This quest is unavailable or already full.' });

  try {
    const paymentStatus = quest.entryFee.amount > 0 ? 'pending' : 'not_required';
    const registration = await QuestRegistration.create({ quest: quest._id, user: req.userId, paymentStatus });
    return res.status(201).json({ registration: { id: String(registration._id), status: registration.status, paymentStatus }, quest: serializeQuest(quest, { isRegistered: true }) });
  } catch (error) {
    await Quest.updateOne({ _id: quest._id, registrationCount: { $gt: 0 } }, { $inc: { registrationCount: -1 } });
    if (error?.code === 11000) return res.status(409).json({ error: 'You are already registered for this quest.' });
    throw error;
  }
}

async function cancelRegistration(req, res) {
  const registration = await QuestRegistration.findOneAndUpdate(
    { quest: req.params.questId, user: req.userId, status: 'registered' },
    { $set: { status: 'cancelled' } },
    { new: true }
  );
  if (!registration) return res.status(404).json({ error: 'Active quest registration not found.' });
  const quest = await Quest.findByIdAndUpdate(
    registration.quest,
    { $inc: { registrationCount: -1 } },
    { new: true }
  );
  return res.json({ message: 'Quest registration cancelled.', quest: serializeQuest(quest, { isRegistered: false }) });
}

module.exports = { listQuests, getQuest, registerForQuest, cancelRegistration };
