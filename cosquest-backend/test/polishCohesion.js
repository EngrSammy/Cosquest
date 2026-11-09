// The cohesion polish backend additions (task 059, docs/polish/BACKEND-PORT.md):
// capabilities, reports, account deletion, block from anywhere, push tokens
// and pushes, game events in the notification centre.
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');
const Report = require('../src/models/Report');
const Post = require('../src/models/Post');
const Message = require('../src/models/Message');
const Block = require('../src/models/Block');
const Follow = require('../src/models/Follow');
const push = require('../src/utils/push');
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
  async function request(method, path, token, body, headers = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return { status: response.status, data };
  }

  console.log('\n--- polish: capabilities, reports, delete account, block anywhere, push, game events ---');
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const passwordHash = await bcrypt.hash('Cohesion!2026', 10);
  const created = await Promise.all([1, 2, 3].map((index) => User.create({
    email: `cohesion${index}${suffix}@example.test`,
    passwordHash,
    profile: { username: `Coh${index}${suffix}`.slice(0, 20), usernameNormalized: `coh${index}${suffix}`.slice(0, 20), firstName: 'Coh', lastName: `User${index}`, avatarKey: 'green-knight' },
    onboardingComplete: true,
    faction: 'ascendants',
    preferences: { notificationsEnabled: true },
  })));
  const [a, b, c] = created.map((user) => ({ id: user.id, username: user.profile.username, email: user.email, token: signToken(user.id, user.tokenVersion) }));

  // Capabilities (public).
  const caps = await request('GET', '/api/meta/capabilities');
  check(caps.status === 200 && caps.data.capabilities.deleteAccount && caps.data.capabilities.reports && caps.data.capabilities.blockAnywhere, 'GET /api/meta/capabilities lists the new features', caps.data);
  check(caps.data.capabilities.push === false, 'push is off by default (PUSH_ENABLED unset)', caps.data);

  // Reports.
  const bad = await request('POST', '/api/reports', a.token, { targetType: 'planet', targetId: 'x', reason: 'spam' });
  check(bad.status === 400, 'report: unknown target type -> 400', bad);
  const badReason = await request('POST', '/api/reports', a.token, { targetType: 'user', targetId: b.id, reason: 'because' });
  check(badReason.status === 400, 'report: unknown reason -> 400', badReason);
  const self = await request('POST', '/api/reports', a.token, { targetType: 'user', targetId: a.id, reason: 'spam' });
  check(self.status === 400, 'report: yourself -> 400', self);
  const noAuth = await request('POST', '/api/reports', null, { targetType: 'user', targetId: b.id, reason: 'spam' });
  check(noAuth.status === 401, 'report: signed out -> 401', noAuth);
  const r1 = await request('POST', '/api/reports', a.token, { targetType: 'user', targetId: b.id, reason: 'harassment', details: 'Keeps sending this' });
  check(r1.status === 201 && r1.data.report.id && r1.data.updated === false, 'report a user -> 201', r1);
  const r2 = await request('POST', '/api/reports', a.token, { targetType: 'user', targetId: b.id, reason: 'spam' });
  check(r2.status === 200 && r2.data.updated === true && r2.data.report.id === r1.data.report.id, 'reporting the same thing again updates the one report', r2);
  for (const targetType of ['post', 'message', 'group', 'comment']) {
    const r = await request('POST', '/api/reports', a.token, { targetType, targetId: `${targetType}-1`, reason: 'other', snapshot: 'what I saw' });
    check(r.status === 201, `report a ${targetType} -> 201`, r);
  }
  check((await Report.countDocuments({ reporter: a.id })) === 5, 'five reports stored for the reporter', null);

  // Block from anywhere (by id, by username), idempotent, removes follows.
  await Follow.create({ follower: a.id, following: c.id });
  await Follow.create({ follower: c.id, following: a.id });
  const blk = await request('POST', '/api/blocks', a.token, { userId: c.id });
  check(blk.status === 201 && blk.data.blocked === true && blk.data.username === c.username, 'POST /api/blocks by id -> 201', blk);
  check((await Follow.countDocuments({ $or: [{ follower: a.id, following: c.id }, { follower: c.id, following: a.id }] })) === 0, 'blocking drops follows both ways', null);
  const blk2 = await request('POST', '/api/blocks', a.token, { username: c.username });
  check(blk2.status === 200 && blk2.data.blocked === true, 'POST /api/blocks again (by username) -> 200, still one block', blk2);
  check((await Block.countDocuments({ blocker: a.id, blocked: c.id })) === 1, 'one Block row', null);
  const listed = await request('GET', '/api/users/me/blocked', a.token);
  check(listed.status === 200 && listed.data.users.some((u) => u.username === c.username), 'the existing blocked list shows it', listed.data);
  const selfBlock = await request('POST', '/api/blocks', a.token, { userId: a.id });
  check(selfBlock.status === 400, 'block yourself -> 400', selfBlock);
  const unknown = await request('POST', '/api/blocks', a.token, { userId: '0123456789abcdef01234567' });
  check(unknown.status === 404, 'block someone who does not exist -> 404', unknown);
  const unblk = await request('DELETE', `/api/blocks/${c.id}`, a.token);
  check(unblk.status === 200 && unblk.data.blocked === false && (await Block.countDocuments({ blocker: a.id })) === 0, 'DELETE /api/blocks/:userId unblocks', unblk);

  // Push tokens: register (existing endpoint), pushes go out with routing data, unregister.
  const sent = [];
  push.setTransport(async (messages) => {
    sent.push(...messages);
    return messages.map((m) => (m.to.includes('dead') ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' }));
  });
  try {
    const reg = await request('POST', '/api/users/me/devices', b.token, { pushToken: 'ExponentPushToken[cohesion-b]', platform: 'android' });
    check(reg.status === 200, 'register a push token -> 200', reg);
    await request('POST', '/api/users/me/devices', b.token, { pushToken: 'ExponentPushToken[dead-b]', platform: 'ios' });
    const follow = await request('POST', `/api/users/${a.username}/follow`, b.token);
    const followA = await request('POST', `/api/users/${b.username}/follow`, a.token);
    check(follow.status === 201 && followA.status === 201, 'follows for the push test', [follow.status, followA.status]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const followPush = sent.find((m) => m.to === 'ExponentPushToken[cohesion-b]' && m.data.type === 'follow');
    check(followPush && followPush.data.username === a.username && Number.isInteger(followPush.badge), 'a follow pushes to the followed person with the follower and a badge count', sent);
    const me = await User.findById(b.id);
    check(me.devices.length === 1 && me.devices[0].pushToken === 'ExponentPushToken[cohesion-b]', 'a token Expo says is gone is removed', me.devices);

    // A DM to someone not connected pushes, with the chat id for the tap.
    const dm = await request('POST', '/api/chats/dm', a.token, { username: b.username });
    const msg = await request('POST', `/api/chats/${dm.data.chat.id}/messages`, a.token, { content: 'push me' });
    check(msg.status === 201 || msg.status === 200, 'send a DM', msg.status);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const dmPush = sent.find((m) => m.data.type === 'message' && m.data.conversationId === dm.data.chat.id);
    check(dmPush && dmPush.body === 'push me' && dmPush.title === a.username, 'a DM pushes to the partner with the chat id', sent.slice(-3));

    const unreg = await request('DELETE', '/api/users/me/devices', b.token, { pushToken: 'ExponentPushToken[cohesion-b]' });
    check(unreg.status === 200 && (await User.findById(b.id)).devices.length === 0, 'DELETE /api/users/me/devices forgets the token', unreg);

    // Game events: off without a key, refused with a wrong one, delivered with the right one.
    delete process.env.GAME_EVENTS_KEY;
    const off = await request('POST', '/api/notifications/game-events', null, { usernames: [b.username], kind: 'raid_started', message: 'x' });
    check(off.status === 503, 'game events without GAME_EVENTS_KEY -> 503', off);
    process.env.GAME_EVENTS_KEY = 'test-game-events-key';
    const wrong = await request('POST', '/api/notifications/game-events', null, { usernames: [b.username], kind: 'raid_started', message: 'x' }, { 'X-Game-Events-Key': 'nope' });
    check(wrong.status === 401, 'game events with a wrong key -> 401', wrong);
    const badLink = await request('POST', '/api/notifications/game-events', null, { usernames: [b.username], kind: 'raid_started', message: 'x', link: 'https://evil.example' }, { 'X-Game-Events-Key': 'test-game-events-key' });
    check(badLink.status === 400, 'game events: only cosquest://play links', badLink);
    await request('POST', '/api/users/me/devices', b.token, { pushToken: 'ExponentPushToken[cohesion-b2]', platform: 'android' });
    const ev = await request('POST', '/api/notifications/game-events', null, { usernames: [b.username], kind: 'raid_started', message: 'A raid boss is up at Trafalgar Square', link: 'cosquest://play?raid=R1' }, { 'X-Game-Events-Key': 'test-game-events-key' });
    check(ev.status === 201 && ev.data.delivered === 1, 'a game event is delivered', ev);
    const centre = await request('GET', '/api/users/me/notifications', b.token);
    const game = centre.data.notifications.find((n) => n.type === 'game');
    check(game && game.link === 'cosquest://play?raid=R1' && game.gameKind === 'raid_started', 'the notification centre lists it with its link and kind', centre.data.notifications.slice(0, 2));
    await new Promise((resolve) => setTimeout(resolve, 300));
    check(sent.some((m) => m.to === 'ExponentPushToken[cohesion-b2]' && m.data.type === 'game' && m.data.link === 'cosquest://play?raid=R1'), 'and pushes it with the link', sent.slice(-2));
    delete process.env.GAME_EVENTS_KEY;
  } finally {
    push.setTransport(null);
  }

  // Game results as a card (kind game_result), with a text line for older apps.
  const dmAC = await request('POST', '/api/chats/dm', a.token, { username: c.username });
  const res1 = await request('POST', `/api/chats/${dmAC.data.chat.id}/game-results`, a.token, { headline: 'Won the duel!', pointName: 'Trafalgar Square', realm: 'anime', win: true, xp: 120, coins: 15, level: 4, rank: 'Scout', note: 'beat that' });
  check(res1.status === 201 && res1.data.message.kind === 'game_result', 'POST game-results -> a game_result message', res1);
  const gr = res1.data.message.gameResult || {};
  check(gr.headline === 'Won the duel!' && gr.win === true && gr.xp === 120 && gr.level === 4 && gr.pointName === 'Trafalgar Square', 'the card carries the result', gr);
  check(/Won the duel at Trafalgar Square · \+120 XP in CosQuest\nbeat that/.test(res1.data.message.content), 'content is the same result as text (older apps)', res1.data.message.content);
  const noHead = await request('POST', `/api/chats/${dmAC.data.chat.id}/game-results`, a.token, { xp: 5 });
  check(noHead.status === 400, 'game result without a headline -> 400', noHead);
  const huge = await request('POST', `/api/chats/${dmAC.data.chat.id}/game-results`, a.token, { headline: 'x', xp: -5, coins: 1e12 });
  check(huge.status === 201 && huge.data.message.gameResult.xp === 0 && huge.data.message.gameResult.coins === 100000, 'numbers are clamped', huge.data.message.gameResult);
  const listed2 = await request('GET', `/api/chats/${dmAC.data.chat.id}/messages`, c.token);
  check(listed2.data.messages.some((m) => m.kind === 'game_result' && m.gameResult && m.gameResult.headline === 'Won the duel!'), 'the other person sees the card in the history', null);
  const outsider = await request('POST', `/api/chats/${dmAC.data.chat.id}/game-results`, b.token, { headline: 'sneaky' });
  check(outsider.status === 403 || outsider.status === 404, 'not a member -> refused', outsider.status);
  check(caps.data.capabilities.gameResults === true, 'capabilities say game results are supported', caps.data);

  // Delete account.
  await Post.create({ author: b.id, content: 'my post', type: 'text' }).catch(() => null);
  const wrongPw = await request('DELETE', '/api/users/me', b.token, { password: 'not it' });
  check(wrongPw.status === 401, 'delete account with the wrong password -> 401', wrongPw);
  const noPw = await request('DELETE', '/api/users/me', b.token, {});
  check(noPw.status === 401, 'delete account without a password -> 401', noPw);
  const del = await request('DELETE', '/api/users/me', b.token, { password: 'Cohesion!2026' });
  check(del.status === 200 && del.data.deleted === true, 'delete account -> 200', del);
  const gone = await User.findById(b.id);
  check(gone.deletedAt && !gone.email && !gone.passwordHash && gone.profile.firstName === 'Deleted' && gone.devices.length === 0, 'personal details wiped, the row kept as "Deleted user"', gone && gone.profile);
  check((await Post.countDocuments({ author: b.id })) === 0, 'their posts are gone', null);
  check((await Message.countDocuments({ sender: b.id, deletedForEveryone: false })) === 0, 'their messages read as deleted', null);
  check((await Follow.countDocuments({ $or: [{ follower: b.id }, { following: b.id }] })) === 0, 'their follows are gone', null);
  const oldToken = await request('GET', '/api/users/me/notifications', b.token);
  check(oldToken.status === 401, 'their old token stops working', oldToken.status);
  const login = await request('POST', '/api/auth/login', null, { email: b.email, password: 'Cohesion!2026' });
  check(login.status === 401 || login.status === 404 || login.status === 400, 'they cannot sign in again', login);
  const profile = await request('GET', `/api/users/${b.username}`, a.token);
  check(profile.status === 404, 'their old username no longer resolves', profile.status);
  // Social sign-in accounts confirm with the word.
  const social = await User.create({ profile: { username: `CohS${suffix}`.slice(0, 20), usernameNormalized: `cohs${suffix}`.slice(0, 20), firstName: 'S' }, onboardingComplete: true, faction: 'ascendants' });
  const sTok = signToken(social.id, social.tokenVersion);
  const sNo = await request('DELETE', '/api/users/me', sTok, {});
  check(sNo.status === 400, 'a social account must confirm', sNo);
  const sYes = await request('DELETE', '/api/users/me', sTok, { confirm: 'DELETE' });
  check(sYes.status === 200, 'a social account deletes with { confirm: "DELETE" }', sYes);

  return { pass, fail };
}

module.exports = { run };
