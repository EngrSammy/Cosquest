/**
 * A light journey against the TEST servers (never production), over HTTP:
 * two test accounts sign in, find their DM, send, reply, react, edit, run a
 * poll, look at Sparks, profile, notifications and avatars; the game staging
 * server answers health, config and points at Trafalgar Square.
 *
 *   CQ_TEST_PASSWORD=... node e2e/testserver/smoke.js
 *
 * Env: CHAT_TEST_API [https://cosquest-api-test.204.168.162.79.sslip.io],
 *      GAME_STAGING  [https://costquest-staging.204.168.162.79.sslip.io],
 *      USER_A [chioma_e2e], USER_B [dami_e2e], CQ_TEST_PASSWORD (required).
 * Signing in rotates each account's session: other devices signed in as these
 * accounts are signed out. Never use alice_e2e here.
 */
const API = process.env.CHAT_TEST_API || 'https://cosquest-api-test.204.168.162.79.sslip.io';
const GAME = process.env.GAME_STAGING || 'https://costquest-staging.204.168.162.79.sslip.io';
const A = process.env.USER_A || 'chioma_e2e';
const B = process.env.USER_B || 'dami_e2e';
const PASSWORD = process.env.CQ_TEST_PASSWORD;
if (!PASSWORD) {
  console.error('set CQ_TEST_PASSWORD');
  process.exit(2);
}
if (/alice_e2e/i.test(A + B)) {
  console.error('alice_e2e is in use elsewhere; pick other accounts');
  process.exit(2);
}
if (!/test|staging/.test(API + GAME)) {
  console.error('refusing: these are not test servers');
  process.exit(2);
}

const results = [];
async function step(name, fn) {
  const t0 = Date.now();
  try {
    const note = await fn();
    results.push({ name, ok: true, ms: Date.now() - t0, note });
    console.log(`PASS ${name} (${Date.now() - t0} ms)${note ? ` ${note}` : ''}`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, note: String(e.message || e) });
    console.log(`FAIL ${name} (${Date.now() - t0} ms) ${e.message || e}`);
  }
}

async function call(base, method, path, { token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}
const chat = (method, path, opts) => call(API, method, path, opts);

(async () => {
  const s = {};
  const mark = `journey ${new Date().toISOString().slice(0, 16)}`;
  await step(`sign in ${A}`, async () => { s.a = (await chat('POST', '/api/auth/login', { body: { identifier: A, password: PASSWORD } })).token; });
  await step(`sign in ${B}`, async () => { s.b = (await chat('POST', '/api/auth/login', { body: { identifier: B, password: PASSWORD } })).token; });
  await step('profile (me)', async () => { const u = (await chat('GET', '/api/users/me', { token: s.a })).user; return `${u.username || u.profile?.username}, faction ${u.faction || '-'}`; });
  await step('chat list', async () => { const r = await chat('GET', '/api/chats', { token: s.a }); const list = r.chats || r.conversations || r; return `${list.length} chats`; });
  await step(`DM ${A} -> ${B}`, async () => { const r = await chat('POST', '/api/chats/dm', { token: s.a, body: { username: B } }); s.dm = (r.conversation || r.chat || r).id; return s.dm; });
  await step('send', async () => { s.m1 = (await chat('POST', `/api/chats/${s.dm}/messages`, { token: s.a, body: { content: `Hi from the ${mark}` } })).message.id; });
  await step('other side sees it', async () => {
    const r = await chat('GET', `/api/chats/${s.dm}/messages?limit=10`, { token: s.b });
    if (!(r.messages || []).some((m) => m.id === s.m1)) throw new Error('not in the list');
  });
  await step('reply', async () => { const m = (await chat('POST', `/api/chats/${s.dm}/messages`, { token: s.b, body: { content: 'Got it', replyTo: s.m1 } })).message; return `quote ${JSON.stringify(m.replyTo).slice(0, 80)}`; });
  await step('react', async () => { await chat('POST', `/api/chats/${s.dm}/messages/${s.m1}/reactions`, { token: s.b, body: { emoji: '🔥' } }); });
  await step('edit', async () => { const m = (await chat('PATCH', `/api/chats/${s.dm}/messages/${s.m1}`, { token: s.a, body: { content: `Hi from the ${mark} (edited)` } })).message; if (!m.editedAt) throw new Error('no editedAt'); });
  await step('poll', async () => { const r = await chat('POST', `/api/chats/${s.dm}/polls`, { token: s.a, body: { question: 'Meet at the fountains?', options: ['Yes', 'Later'] } }); s.poll = (r.message || r).id; return s.poll; });
  await step('sparks list', async () => { const r = await chat('GET', `/api/chats/${s.dm}/sparks`, { token: s.a }); return `${(r.sparks || []).length} sparks`; });
  await step('notifications', async () => { const r = await chat('GET', '/api/users/me/notifications', { token: s.b }); return `${(r.notifications || r.items || []).length} notifications`; });
  await step('avatar catalogue', async () => { const r = await chat('GET', '/api/meta/avatars'); return `${(r.avatars || []).length} avatars`; });
  await step('game invite route', async () => {
    const r = await fetch(`${API}/api/chats/${s.dm}/game-invites`, { method: 'POST', headers: { Authorization: `Bearer ${s.a}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'shrine', targetId: 'XQ-trafalgar-trivia', place: 'Test Trivia Stone', lat: 51.5075, lng: -0.1278 }) });
    if (!r.ok) throw new Error(`POST /game-invites -> ${r.status}`);
  });
  await step('game staging health', async () => JSON.stringify(await call(GAME, 'GET', '/health')));
  await step('game config', async () => { const r = await call(GAME, 'GET', '/v1/roam/config'); return Object.keys(r).slice(0, 6).join(','); });
  await step('game points at Trafalgar Square', async () => { const r = await call(GAME, 'GET', '/v1/roam/points?lat=51.5074&lng=-0.1278&radius_m=600'); return `${(r.points || []).length} points`; });
  const failed = results.filter((r) => !r.ok).length;
  console.log(`== ${results.length - failed} of ${results.length} passed`);
  process.exitCode = failed ? 1 : 0;
})();
