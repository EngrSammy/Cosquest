const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set. Add it to .env - see README "Database: MongoDB".');
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log(`[db] Connected to MongoDB (${mongoose.connection.name})`);

  mongoose.connection.on('error', (err) => {
    console.error('[db] MongoDB connection error:', err.message);
  });
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB };
