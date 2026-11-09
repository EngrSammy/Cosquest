/**
 * Runs the full smoke suite against a throwaway server instance backed by
 * an ephemeral, real, in-memory MongoDB (downloaded/managed automatically
 * by mongodb-memory-server) and an ephemeral, real Redis (same idea, via
 * redis-memory-server) - no MongoDB or Redis install, Atlas/cloud account,
 * or already-running server required. This is what `npm test` runs.
 *
 * It does NOT touch your real .env / MONGODB_URI / REDIS_URL / PORT -
 * everything here is set explicitly before the app is required, so it can
 * safely run alongside (or instead of) a real dev server without colliding.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { RedisMemoryServer } = require('redis-memory-server');

async function main() {
  const mongod = await MongoMemoryServer.create();
  const redisd = await RedisMemoryServer.create();

  // Isolated per-run temp folder so the smoke suite's real avatar-photo
  // upload test doesn't leave junk files behind in the project's own uploads/.
  const tmpUploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cosquest-test-uploads-'));

  process.env.MONGODB_URI = mongod.getUri();
  process.env.REDIS_URL = `redis://${await redisd.getHost()}:${await redisd.getPort()}`;
  process.env.NODE_ENV = 'test';
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud'; // no real Cloudinary call in tests
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-not-for-production';
  process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
  process.env.PORT = '4111'; // deliberately not 4000, so it can't collide with a real dev server
  process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || tmpUploadDir;
  process.env.PUBLIC_UPLOAD_PATH = process.env.PUBLIC_UPLOAD_PATH || '/uploads';
  process.env.LIVEKIT_URL = 'wss://test.livekit.invalid';
  process.env.LIVEKIT_API_KEY = 'test-api-key';
  process.env.LIVEKIT_API_SECRET = 'test-api-secret-with-enough-entropy';
  // Sparks module: production timers, except the wait for an author's hint
  // (20 s in production) so the end-to-end test does not idle.
  process.env.SPARKS_CONFIG = JSON.stringify({ hintWaitMs: 1500 });

  // Attachment fixtures use fake hosted audio; never submit them to Deepgram.
  require('../src/utils/transcribeAudio').transcribeAudio = async () => 'Test voice note.';
  const { startServer } = require('../server');
  const { disconnectDB } = require('../src/config/db');
  const { disconnectRedis } = require('../src/config/redis');
  const { closeSocket } = require('../src/realtime/socket');
  const server = await startServer();

  const { run } = require('./smoke');
  let result = { pass: 0, fail: 1 };
  try {
    result = await run(`http://localhost:${process.env.PORT}`);
    const additions = await require('./communitySettings').run(`http://localhost:${process.env.PORT}`);
    result.pass += additions.pass;
    result.fail += additions.fail;
    const attachments = await require('./chatAttachments').run(`http://localhost:${process.env.PORT}`);
    result.pass += attachments.pass;
    result.fail += attachments.fail;
    const discovery = await require('./discoverUsers').run(`http://localhost:${process.env.PORT}`);
    result.pass += discovery.pass;
    result.fail += discovery.fail;
    const calls = await require('./calls').run(`http://localhost:${process.env.PORT}`);
    result.pass += calls.pass;
    result.fail += calls.fail;
    const groupChat = await require('./groupChat').run(`http://localhost:${process.env.PORT}`);
    result.pass += groupChat.pass;
    result.fail += groupChat.fail;
    const groups = await require('./groups').run(`http://localhost:${process.env.PORT}`);
    result.pass += groups.pass;
    result.fail += groups.fail;
    const groupExtras = await require('./groupExtras').run(`http://localhost:${process.env.PORT}`);
    result.pass += groupExtras.pass;
    result.fail += groupExtras.fail;
    const polls = await require('./polls').run(`http://localhost:${process.env.PORT}`);
    result.pass += polls.pass;
    result.fail += polls.fail;
    const chatExtras = await require('./chatExtras').run(`http://localhost:${process.env.PORT}`);
    result.pass += chatExtras.pass;
    result.fail += chatExtras.fail;
    const gameInvites = await require('./gameInvites').run(`http://localhost:${process.env.PORT}`);
    result.pass += gameInvites.pass;
    result.fail += gameInvites.fail;
    const polish = await require('./polishPaging').run(`http://localhost:${process.env.PORT}`);
    result.pass += polish.pass;
    result.fail += polish.fail;
    const cohesion = await require('./polishCohesion').run(`http://localhost:${process.env.PORT}`);
    result.pass += cohesion.pass;
    result.fail += cohesion.fail;
    // The stand-in keyword engine's own suite: it is the rollback path now,
    // so it runs with SPARKS_ENGINE=legacy (read per request).
    process.env.SPARKS_ENGINE = 'legacy';
    let sparks;
    try {
      sparks = await require('./sparks').run(`http://localhost:${process.env.PORT}`);
    } finally {
      delete process.env.SPARKS_ENGINE;
    }
    result.pass += sparks.pass;
    result.fail += sparks.fail;
    // The Sparks module (SPARKS_ENGINE=module): store contract + end to end with mock-SDK phones.
    process.env.SPARKS_ENGINE = 'module';
    let sparksStore, sparksModule;
    try {
      sparksStore = await require('./sparksStore').run();
      sparksModule = await require('./sparksModule').run(`http://localhost:${process.env.PORT}`);
    } finally {
      delete process.env.SPARKS_ENGINE;
    }
    result.pass += sparksStore.pass + sparksModule.pass;
    result.fail += sparksStore.fail + sparksModule.fail;
    const oauthRedirect = await require('./oauthRedirect').run(`http://localhost:${process.env.PORT}`);
    result.pass += oauthRedirect.pass;
    result.fail += oauthRedirect.fail;
    const avatarCatalog = await require('./avatarCatalog').run(`http://localhost:${process.env.PORT}`);
    result.pass += avatarCatalog.pass;
    result.fail += avatarCatalog.fail;
  } finally {
    require('../src/sparks').stop();
    await new Promise((resolve) => server.close(resolve));
    await closeSocket(); // quits the adapter's dedicated pub/sub Redis connections - see socket.js
    await disconnectDB();
    await disconnectRedis();
    await mongod.stop();
    await redisd.stop();
    fs.rmSync(tmpUploadDir, { recursive: true, force: true });
  }

  console.log(`[integration] ran against an ephemeral in-memory MongoDB + Redis - ${result.pass} passed, ${result.fail} failed`);
  process.exit(result.fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Integration test run failed:', err);
  process.exit(1);
});
