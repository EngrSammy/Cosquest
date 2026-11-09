require('dotenv').config();

const { connectDB, disconnectDB } = require('../src/config/db');
const User = require('../src/models/User');

async function run() {
  await connectDB();

  // Use the native collection so these legacy fields are removed even though
  // they are no longer part of the Mongoose schema.
  const result = await User.collection.updateMany(
    {},
    {
      $unset: {
        'preferences.locationEnabled': '',
        'preferences.radiusMiles': '',
        'preferences.lastKnownLocation': '',
        'onboarding.locationPreferenceChosen': '',
      },
    }
  );

  console.log(`[migration] Removed legacy user location preferences from ${result.modifiedCount} user(s).`);
  await disconnectDB();
}

if (require.main === module) {
  run().catch(async (error) => {
    console.error('[migration] Failed to remove legacy user location preferences:', error.message);
    await disconnectDB();
    process.exit(1);
  });
}

module.exports = { run };
