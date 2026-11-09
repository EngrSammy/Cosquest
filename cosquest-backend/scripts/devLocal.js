/**
 * A throwaway chat backend for trying the merged app on an emulator or a
 * phone on the same network, with nothing written to any real database:
 * an in-memory MongoDB and Redis (as `npm test` uses), seeded with
 *
 *   - "ada" (the person on the phone), signed-up, onboarded, faction icons;
 *   - "bo", who has sent ada three messages and a game invite card for a real
 *     Quest Point on the STAGING game server near GAME_LAT/GAME_LNG
 *     (default Trafalgar Square), so the unread bubble and Join can be tried;
 *   - "cy", in a group with both, with one more unread message.
 *
 *   node scripts/devLocal.js            # port 4120, password cosquest-dev-1
 *   PORT=4120 DEV_PASSWORD=... GAME_LAT=51.5074 GAME_LNG=-0.1278 node scripts/devLocal.js
 *
 * Point the app at it with EXPO_PUBLIC_API_URL=http://10.0.2.2:4120 (the
 * Android emulator's name for this machine) or `adb reverse tcp:4120 tcp:4120`
 * and http://localhost:4120. Debug builds allow cleartext HTTP; release
 * builds do not. Everything is gone when the process stops.
 */
const bcrypt = require('bcryptjs');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { RedisMemoryServer } = require('redis-memory-server');

const STAGING_GAME = 'https://costquest-staging.204.168.162.79.sslip.io';

async function main() {
  const mongod = await MongoMemoryServer.create();
  const redisd = await RedisMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.REDIS_URL = `redis://${await redisd.getHost()}:${await redisd.getPort()}`;
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';
  process.env.PORT = process.env.PORT || '4120';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'local-dev-only-secret-not-for-production';
  process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'local-dev';
  process.env.LIVEKIT_URL = process.env.LIVEKIT_URL || 'wss://livekit.invalid';
  process.env.LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'local-dev-key';
  process.env.LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'local-dev-secret-with-enough-entropy';

  const { startServer } = require('../server');
  const User = require('../src/models/User');
  const { signToken } = require('../src/utils/token');
  await startServer();
  const base = `http://localhost:${process.env.PORT}`;

  const password = process.env.DEV_PASSWORD || 'cosquest-dev-1';
  const passwordHash = await bcrypt.hash(password, 10);
  const make = async (username, firstName) => {
    const user = await User.create({
      email: `${username}@example.test`,
      passwordHash,
      profile: {
        username,
        usernameNormalized: username.toLowerCase(),
        firstName,
        lastName: 'Local',
        avatarKey: 'green-knight',
      },
      onboardingComplete: true,
      faction: 'icons',
      interests: ['gaming', 'anime'],
    });
    return { id: user.id, username, token: signToken(user.id, user.tokenVersion) };
  };
  const call = async (method, path, token, body) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
    return data;
  };

  const ada = await make('ada', 'Ada');
  const bo = await make('bo', 'Bo');
  const cy = await make('cy', 'Cy');

  const dm = await call('POST', '/api/chats/dm', bo.token, { username: 'ada' });
  const dmId = dm.conversation?.id || dm.chat?.id || dm.id;
  for (const content of ['Are you near Trafalgar?', 'There is a Guardian by the café', 'Race you to it 😄']) {
    await call('POST', `/api/chats/${dmId}/messages`, bo.token, { content });
  }

  // A real point on the staging game server, so Join lands on something.
  const lat = Number(process.env.GAME_LAT || 51.5074);
  const lng = Number(process.env.GAME_LNG || -0.1278);
  let invite = { type: 'shrine', targetId: 'Ldf5686bcfc03', place: 'Caffè Nero', lat: 51.507277, lng: -0.128365 };
  try {
    const res = await fetch(`${STAGING_GAME}/v1/roam/points?lat=${lat}&lng=${lng}&radius_m=600`);
    const { points } = await res.json();
    const pick = points
      .filter((p) => p.tier === 'common' && p.distance_m > 25)
      .sort((a, b) => a.distance_m - b.distance_m)[0] || points[0];
    if (pick) invite = { type: pick.challenge === 'duel' ? 'duel' : 'shrine', targetId: pick.id, place: pick.name, lat: pick.lat, lng: pick.lng };
  } catch (error) {
    console.warn('[devLocal] staging points unavailable, using the fallback invite', error.message);
  }
  await call('POST', `/api/chats/${dmId}/game-invites`, bo.token, { ...invite, note: 'Meet me here?' });

  const group = await call('POST', '/api/groups', cy.token, { name: 'Raid Club', kind: 'private', members: [ada.id, bo.id] });
  await call('POST', `/api/chats/${group.group.id}/messages`, cy.token, { content: 'Raid at six, who is in?' });

  console.log(`[devLocal] chat backend on ${base}`);
  console.log(`[devLocal] sign in as "ada" (or ada@example.test) with password "${password}"`);
  console.log(`[devLocal] dm ${dmId}; invite ${JSON.stringify(invite)}`);
  console.log(`[devLocal] group ${group.group.id}`);
  console.log('[devLocal] ready');

  const stop = async () => {
    await mongod.stop().catch(() => {});
    await redisd.stop().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error) => {
  console.error('[devLocal] failed', error);
  process.exit(1);
});
