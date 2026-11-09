// The polish backend additions (docs/polish/BACKEND-PORT.md): cursor paging
// on messages (`before`), some chats by id (`GET /api/chats?ids=`), and DM
// chat:preview events that carry each participant's chat summary. Each is
// optional for the app: without them it behaves as before.
const { io } = require('socket.io-client');
const User = require('../src/models/User');
const { signToken } = require('../src/utils/token');

async function run(baseUrl) {
  let pass = 0;
  let fail = 0;
  function check(ok, name, value) {
    if (ok) {
      pass += 1;
      console.log(`  ok  - ${name}`);
    } else {
      fail += 1;
      console.log(`FAIL - ${name}`, JSON.stringify(value));
    }
  }
  async function request(method, path, token, body) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  }

  console.log('\n--- polish: message cursor paging, chats by id, rich DM previews ---');
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const created = await Promise.all([1, 2, 3].map((index) => User.create({
    profile: { username: `Polish${index}${suffix}`, usernameNormalized: `polish${index}${suffix}`, firstName: 'Polish', lastName: `User${index}`, avatarKey: 'green-knight' },
    onboardingComplete: true,
    faction: 'ascendants',
  })));
  const [a, b, c] = created.map((user) => ({ id: user.id, username: user.profile.username, token: signToken(user.id, user.tokenVersion) }));

  const dm = await request('POST', '/api/chats/dm', a.token, { username: b.username });
  const dmId = dm.data.chat.id;
  const path = `/api/chats/${dmId}/messages`;
  for (let i = 1; i <= 75; i += 1) {
    await request('POST', path, i % 2 ? a.token : b.token, { content: `p${i}` });
  }

  // Cursor paging.
  const first = await request('GET', `${path}?limit=30`, a.token);
  const firstIds = first.data.messages.map((m) => m.content);
  check(first.data.messages.length === 30 && firstIds[0] === 'p75' && firstIds[29] === 'p46', 'first page: the newest 30, newest first', firstIds);
  check(first.data.pagination.hasMore === true && typeof first.data.pagination.nextBefore === 'string', 'first page says there is more and where to continue', first.data.pagination);

  // A new message arrives between pages: offset paging would repeat p46; the cursor doesn't.
  await request('POST', path, b.token, { content: 'p76' });
  const second = await request('GET', `${path}?limit=30&before=${first.data.pagination.nextBefore}`, a.token);
  const secondIds = second.data.messages.map((m) => m.content);
  check(secondIds.length === 30 && secondIds[0] === 'p45' && secondIds[29] === 'p16', 'before=<id>: the 30 just older, unshifted by a new message', secondIds);
  check(second.data.pagination.page === null && second.data.pagination.hasMore === true, 'cursor pages report no page number and more to come', second.data.pagination);

  const third = await request('GET', `${path}?limit=30&before=${second.data.pagination.nextBefore}&page=3`, a.token);
  const thirdIds = third.data.messages.map((m) => m.content);
  check(thirdIds.length === 15 && thirdIds[14] === 'p1' && third.data.pagination.hasMore === false, 'the last page: the rest, and no more (page is ignored next to before)', { thirdIds, p: third.data.pagination });

  const offset = await request('GET', `${path}?limit=30&page=2`, a.token);
  check(offset.data.messages[0].content === 'p46' && offset.data.pagination.page === 2, 'without before: offset pages exactly as before', offset.data.pagination);

  const bogus = await request('GET', `${path}?limit=5&before=not-a-cursor`, a.token);
  check(bogus.status === 200 && bogus.data.messages[0].content === 'p76', 'an unusable before is ignored (newest page)', bogus.data.messages[0]);
  const foreign = await request('GET', `${path}?limit=5&before=000000000000000000000000`, a.token);
  check(foreign.status === 200 && foreign.data.messages[0].content === 'p76', 'a message id from elsewhere is ignored', foreign.data.messages[0]);
  const at = first.data.messages[10].createdAt;
  const byTime = await request('GET', `${path}?limit=3&before=${encodeURIComponent(at)}`, a.token);
  check(byTime.status === 200 && byTime.data.messages.length === 3 && new Date(byTime.data.messages[0].createdAt) < new Date(at), 'before=<ISO time> works too', byTime.data.messages.map((m) => m.createdAt));

  // Chats by id.
  const all = await request('GET', '/api/chats', a.token);
  const some = await request('GET', `/api/chats?ids=${dmId}`, a.token);
  check(all.data.chats.length > 1 && some.data.chats.length === 1 && some.data.chats[0].id === dmId, '?ids= returns just those chats', some.data.chats.map((chat) => chat.id));
  const dmBC = await request('POST', '/api/chats/dm', b.token, { username: c.username });
  const notMine = await request('GET', `/api/chats?ids=${dmId},${dmBC.data.chat.id},garbage`, a.token);
  check(notMine.data.chats.length === 1 && notMine.data.chats[0].id === dmId, "someone else's chat and junk ids are left out", notMine.data.chats.map((chat) => chat.id));
  const same = all.data.chats.find((chat) => chat.id === dmId);
  check(JSON.stringify(same) === JSON.stringify(some.data.chats[0]), 'a chat by id is the same summary as in the full list');

  // Rich DM previews.
  const socket = io(baseUrl, { auth: { token: b.token }, transports: ['websocket'], forceNew: true });
  await new Promise((resolve, reject) => {
    socket.on('connect', resolve);
    socket.on('connect_error', reject);
    setTimeout(() => reject(new Error('socket connect timeout')), 5000);
  }).catch((error) => check(false, 'socket connects', String(error)));
  const preview = new Promise((resolve) => {
    socket.on('chat:preview', (payload) => {
      if (payload?.conversationId === dmId) resolve(payload);
    });
    setTimeout(() => resolve(null), 5000);
  });
  await request('POST', path, a.token, { content: 'live one' });
  const got = await preview;
  socket.close();
  check(got && got.chat && got.chat.id === dmId, 'a DM preview carries the chat', got);
  check(got?.chat?.lastMessage?.preview === 'live one' && got.chat.unreadCount > 0, "with the receiver's own unread count and last message", got?.chat);
  check(got?.chat?.otherParticipant?.username === a.username, 'and the other person (the sender, from the receiver side)', got?.chat?.otherParticipant);

  return { pass, fail };
}

module.exports = { run };
