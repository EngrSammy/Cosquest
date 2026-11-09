/**
 * Drops a notification into the account of every user who currently has
 * `preferences.notificationsEnabled` on. This is the in-app half of "allow
 * notifications" - no Firebase/APNs needed, since the message just sits in
 * MongoDB until each person's app asks for it (GET /api/users/me/notifications).
 *
 * Usage: npm run notify -- "Your message here"
 * (runs against whatever MONGODB_URI is set in your real .env)
 */
const notificationModel = require('../src/models/notificationModel');

/**
 * Assumes a MongoDB connection is already open (the CLI entrypoint below
 * opens one; test/smoke.js reuses the connection runWithMemoryMongo.js
 * already made, so calling this mid-test doesn't disconnect anything).
 */
async function run(message) {
  const count = await notificationModel.createForEnabledUsers(message);
  console.log(`Sent to ${count} user(s) with notifications enabled.`);
  return count;
}

if (require.main === module) {
  require('dotenv').config();
  const { connectDB, disconnectDB } = require('../src/config/db');
  const message = process.argv.slice(2).join(' ').trim();
  if (!message) {
    console.error('Usage: npm run notify -- "Your message here"');
    process.exit(1);
  }
  connectDB()
    .then(() => run(message))
    .then(() => disconnectDB())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Failed to send notifications:', err.message);
      process.exit(1);
    });
}

module.exports = { run };
