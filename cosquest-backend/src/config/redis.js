const Redis = require('ioredis');

/**
 * One Redis connection, shared by everything that needs it:
 *  - src/realtime/socket.js duplicates it (pub/sub can't share a connection
 *    with normal commands) to fan Socket.IO events out across server
 *    instances - see src/realtime/presence.js and the adapter setup below.
 *  - src/middleware/rateLimiter.js uses it as a shared counter, so a login
 *    brute-force limit means the same thing whether requests land on one
 *    server process or ten.
 *  - src/realtime/presence.js uses it to track who's currently connected.
 *
 * Mirrors src/config/db.js: `lazyConnect: true` + an explicit connectRedis()
 * call from startServer() means a broken/missing Redis fails startup loudly,
 * the same way a broken MONGODB_URI already does, instead of every command
 * silently queuing forever against a connection that will never open.
 */
let client = null;

function getRedisClient() {
  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error('REDIS_URL is not set. Add it to .env, e.g. REDIS_URL=redis://127.0.0.1:6379');
    }
    client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: null });
    client.on('error', (err) => {
      console.error('[redis] connection error:', err.message);
    });
  }
  return client;
}

async function connectRedis() {
  const redis = getRedisClient();
  if (redis.status === 'ready') return redis;
  if (redis.status === 'wait') {
    // Nothing has touched this client yet - the normal path.
    await redis.connect();
  } else {
    // Something already made it start connecting before this explicit call
    // (e.g. rate-limit-redis's RedisStore issues a SCRIPT LOAD as soon as
    // src/middleware/rateLimiter.js is required, which is well before
    // startServer() gets here - ioredis auto-connects on that first command
    // despite lazyConnect). Calling connect() again on a client that's
    // already connecting throws, so just wait for the connection already in
    // flight to finish instead of starting a second one.
    await new Promise((resolve, reject) => {
      redis.once('ready', resolve);
      redis.once('error', reject);
    });
  }
  console.log('[redis] Connected');
  return redis;
}

async function disconnectRedis() {
  if (client) {
    await client.quit();
    client = null;
  }
}

/**
 * A fresh, independent connection to the same Redis server - needed
 * anywhere a dedicated connection is required (Socket.IO's adapter needs
 * separate pub and sub connections; a subscribed connection can't also run
 * ordinary commands). Not a clone of `client`'s state, just its address.
 */
function duplicateRedisClient() {
  return getRedisClient().duplicate();
}

module.exports = { getRedisClient, connectRedis, disconnectRedis, duplicateRedisClient };
