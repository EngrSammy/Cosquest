require('dotenv').config();

const Quest = require('../src/models/Quest');
const { connectDB, disconnectDB } = require('../src/config/db');

function numberSetting(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function questData({ slug, title, description, status, startsAt, endsAt, prizePool, entryFee, maxParticipants, interests }) {
  return {
    slug,
    title,
    description,
    coverImageUrl: process.env[`SEED_${slug.toUpperCase().replaceAll('-', '_')}_IMAGE`] || '',
    hostName: process.env.SEED_QUEST_HOST || 'CosQuest',
    status,
    startsAt,
    endsAt,
    location: {
      name: process.env.SEED_QUEST_LOCATION_NAME || 'Tafawa Balewa Square',
      address: process.env.SEED_QUEST_ADDRESS || 'Lagos Island, Lagos',
      lat: numberSetting('DASHBOARD_DEFAULT_LAT', 6.5244),
      lng: numberSetting('DASHBOARD_DEFAULT_LNG', 3.3792),
    },
    prizePool: { amount: prizePool, currency: process.env.SEED_CURRENCY || 'NGN' },
    entryFee: { amount: entryFee, currency: process.env.SEED_CURRENCY || 'NGN' },
    maxParticipants,
    interests,
    isPublished: true,
    isSeedData: true,
  };
}

async function run() {
  const now = new Date();
  const hour = 60 * 60 * 1000;
  const liveHours = numberSetting('SEED_LIVE_DURATION_HOURS', 3);
  const upcomingHours = numberSetting('SEED_UPCOMING_START_HOURS', 24);
  const secondUpcomingHours = numberSetting('SEED_SECOND_UPCOMING_START_HOURS', 72);
  const quests = [
    questData({
      slug: 'cosplay-city-hunt',
      title: process.env.SEED_LIVE_QUEST_TITLE || 'Cosplay City Hunt',
      description: process.env.SEED_LIVE_QUEST_DESCRIPTION || 'Find the hidden CosQuest markers around the city and earn points with your squad.',
      status: 'live', startsAt: new Date(now.getTime() - hour), endsAt: new Date(now.getTime() + liveHours * hour),
      prizePool: numberSetting('SEED_LIVE_PRIZE_POOL', 50000), entryFee: numberSetting('SEED_LIVE_ENTRY_FEE', 500), maxParticipants: numberSetting('SEED_LIVE_MAX_PARTICIPANTS', 120), interests: ['cosplay', 'anime', 'game'],
    }),
    questData({
      slug: 'marvel-trivia-night',
      title: process.env.SEED_UPCOMING_QUEST_TITLE || 'Marvel Trivia Night',
      description: process.env.SEED_UPCOMING_QUEST_DESCRIPTION || 'Bring your best comic knowledge for a fast-paced team trivia showdown.',
      status: 'upcoming', startsAt: new Date(now.getTime() + upcomingHours * hour), endsAt: new Date(now.getTime() + (upcomingHours + 2) * hour),
      prizePool: numberSetting('SEED_UPCOMING_PRIZE_POOL', 75000), entryFee: numberSetting('SEED_UPCOMING_ENTRY_FEE', 0), maxParticipants: numberSetting('SEED_UPCOMING_MAX_PARTICIPANTS', 80), interests: ['comic', 'movie'],
    }),
    questData({
      slug: 'anime-realm-showdown',
      title: process.env.SEED_SECOND_UPCOMING_QUEST_TITLE || 'Anime Realm Showdown',
      description: process.env.SEED_SECOND_UPCOMING_QUEST_DESCRIPTION || 'A creative fan challenge for anime lovers, artists, and cosplayers.',
      status: 'upcoming', startsAt: new Date(now.getTime() + secondUpcomingHours * hour), endsAt: new Date(now.getTime() + (secondUpcomingHours + 3) * hour),
      prizePool: numberSetting('SEED_SECOND_UPCOMING_PRIZE_POOL', 100000), entryFee: numberSetting('SEED_SECOND_UPCOMING_ENTRY_FEE', 1000), maxParticipants: numberSetting('SEED_SECOND_UPCOMING_MAX_PARTICIPANTS', 60), interests: ['anime', 'cosplay', 'music'],
    }),
  ];

  await connectDB();
  try {
    for (const quest of quests) await Quest.updateOne({ slug: quest.slug }, { $set: quest }, { upsert: true });
    console.log(`Seeded ${quests.length} Home Dashboard quests.`);
  } finally {
    await disconnectDB();
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error('Home Dashboard seed failed:', err.message);
    process.exit(1);
  });
}

module.exports = { run };
