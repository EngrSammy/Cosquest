/**
 * Manual smoke run: starts the REAL server (`node server.js`, its own
 * process) against a throwaway in-memory MongoDB + Redis, connects two
 * mock-SDK phones over Socket.IO (test/helpers/sparksPhone.js: real wire
 * protocol, real HPKE, keyword "AI") and shows a Spark appear in a group
 * chat and in a DM, through the module and through the app's old REST API.
 *
 *   npm run sparks:smoke
 *
 * Needs the dev dependencies (mongodb-memory-server, redis-memory-server,
 * socket.io-client, @hpke/*). Touches no real database.
 */
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { RedisMemoryServer } = require('redis-memory-server');

const PORT = process.env.SMOKE_PORT || '4123';
const BASE = `http://localhost:${PORT}`;
const say = (...args) => console.log('[smoke]', ...args);

async function main() {
  const mongod = await MongoMemoryServer.create();
  const redisd = await RedisMemoryServer.create();
  const env = {
    ...process.env,
    MONGODB_URI: mongod.getUri(),
    REDIS_URL: `redis://${await redisd.getHost()}:${await redisd.getPort()}`,
    PORT,
    SPARKS_ENGINE: 'module',
    JWT_SECRET: 'smoke-only-secret',
    JWT_EXPIRES_IN: '1h',
    CLOUDINARY_CLOUD_NAME: 'smoke',
    LIVEKIT_URL: 'wss://smoke.invalid',
    LIVEKIT_API_KEY: 'smoke',
    LIVEKIT_API_SECRET: 'smoke-secret-with-enough-entropy-1234',
    SPARKS_CONFIG: JSON.stringify({ hintWaitMs: 1500 }),
  };
  Object.assign(process.env, { JWT_SECRET: env.JWT_SECRET, JWT_EXPIRES_IN: '1h' });

  const server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`));
  server.stderr.on('data', (d) => process.stdout.write(`[server] ${d}`));
  const phones = [];
  try {
    for (let i = 0; ; i += 1) {
      try {
        if ((await fetch(`${BASE}/health`)).ok) break;
      } catch {}
      if (i > 100) throw new Error('server did not start');
      await new Promise((r) => setTimeout(r, 100));
    }

    await mongoose.connect(env.MONGODB_URI);
    const User = require('../src/models/User');
    const { signToken } = require('../src/utils/token');
    const { connectPhone } = require('../test/helpers/sparksPhone');
    const make = async (name, expertise) => {
      const user = await User.create({
        profile: { username: name, usernameNormalized: name.toLowerCase(), firstName: name, lastName: 'Smoke', avatarKey: 'green-knight' },
        onboardingComplete: true, faction: 'ascendants', expertise,
      });
      return { id: user.id, name, token: signToken(user.id, user.tokenVersion) };
    };
    const api = async (method, p, token, body) => {
      const r = await fetch(`${BASE}/api${p}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      return { status: r.status, data: await r.json() };
    };
    const amara = await make('Amara', 'front_end');
    const bayo = await make('Bayo', 'costume_crafting');

    const pa = await connectPhone(BASE, { userId: amara.id, token: amara.token, tier: 'full', log: (m) => say(`Amara's phone: ${m}`) });
    const pb = await connectPhone(BASE, { userId: bayo.id, token: bayo.token, tier: 'full', log: (m) => say(`Bayo's phone: ${m}`) });
    phones.push(pa, pb);
    say(`Amara's phone registered: ${pa.registered?.type} ${pa.deviceId}`);
    say(`Bayo's phone registered:  ${pb.registered?.type} ${pb.deviceId}`);

    const send = async (user, phone, chatId, content) => {
      const r = await api('POST', `/chats/${chatId}/messages`, user.token, { content });
      say(`${user.name}: "${content}" -> ${r.status} seq=${r.data.message?.seq}`);
      await phone.hint(r.data.message, chatId);
    };
    const show = async (label, chatId, phone) => {
      const spark = await phone.until(() => [...phone.sparks.values()].find((s) => s.chatId === chatId), 10000, `${label} Spark`);
      say(`${label}: spark.event on ${phone === pa ? "Amara's" : "Bayo's"} phone -> "${spark.subject}" (${spark.state}, ${spark.messageCount} messages, by ${spark.createdBy.kind})`);
      const legacy = await api('GET', `/chats/${chatId}/sparks`, amara.token);
      const s = legacy.data.sparks[0];
      say(`${label}: GET /api/chats/${chatId}/sparks -> ${legacy.status} ${JSON.stringify({ id: s.id, subject: s.subject, active: s.active, messageCount: s.messageCount, participantCount: s.participantCount, startedByBot: s.startedByBot, eras: s.eras.length })}`);
    };

    const group = await api('POST', '/groups', amara.token, { name: 'Smoke Club', kind: 'private', members: [bayo.id] });
    const groupId = group.data.group.id;
    say(`group chat ${groupId}`);
    await send(amara, pa, groupId, 'Who is bringing the dragon costume to the meetup?');
    await send(bayo, pb, groupId, 'I can carry the dragon costume, it needs a new tail');
    await send(amara, pa, groupId, 'Great, the dragon costume wings are mine then');
    await show('group', groupId, pb);

    const dm = await api('POST', '/chats/dm', amara.token, { username: bayo.name });
    const dmId = dm.data.chat.id;
    say(`DM ${dmId}`);
    await send(amara, pa, dmId, 'Did you book the hotel for the convention?');
    await send(bayo, pb, dmId, 'Not yet, the convention hotel is nearly full');
    await send(amara, pa, dmId, 'Book the convention hotel tonight please');
    await show('DM', dmId, pa);
    say('OK: a Spark in a group chat and in a DM, end to end');
    await new Promise((r) => setTimeout(r, 1500)); // let in-flight follow-up jobs (role pings) finish before teardown
  } finally {
    for (const p of phones) p.close();
    await new Promise((r) => setTimeout(r, 500)); // let the server see the disconnects before it shuts down
    server.kill('SIGTERM');
    await new Promise((r) => server.once('exit', r));
    await mongoose.disconnect();
    await mongod.stop();
    await redisd.stop();
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error('[smoke] FAILED:', error);
    process.exit(1);
  }
);
