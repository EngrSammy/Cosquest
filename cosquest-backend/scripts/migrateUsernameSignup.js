require('dotenv').config();

const User = require('../src/models/User');
const { connectDB, disconnectDB } = require('../src/config/db');

async function run() {
  await connectDB();
  try {
    const indexes = await User.collection.indexes();
    const emailIndex = indexes.find((index) => index.key?.email === 1);

    // Older deployments used a non-sparse unique email index. MongoDB permits
    // only one document without an email under that index, which would block
    // username-only sign-ups. Recreate it as sparse before deploying this change.
    if (emailIndex && !emailIndex.sparse) {
      await User.collection.dropIndex(emailIndex.name);
      await User.collection.createIndex({ email: 1 }, { name: emailIndex.name, unique: true, sparse: true });
      console.log('Migrated the email index to unique + sparse.');
    } else if (!emailIndex) {
      await User.collection.createIndex({ email: 1 }, { name: 'email_1', unique: true, sparse: true });
      console.log('Created the unique + sparse email index.');
    } else {
      console.log('Email index already supports username-only sign-up.');
    }

    await User.collection.createIndex(
      { 'profile.usernameNormalized': 1 },
      { name: 'profile.usernameNormalized_1', unique: true, sparse: true }
    );
    console.log('Ensured the unique username index.');
  } finally {
    await disconnectDB();
  }
}

run().catch((err) => {
  console.error('Username sign-up migration failed:', err.message);
  process.exit(1);
});
