// The merged app's game: invite cards (kind 'game_invite') and the session
// check the game backend's single sign-on relies on (src/controllers/gameController.js).
const User = require('../src/models/User');
const { signToken, generateSessionId } = require('../src/utils/token');

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
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  }

  const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const make = async (index) => {
    const user = await User.create({
      profile: {
        username: `Gam${index}${suffix}`,
        usernameNormalized: `gam${index}${suffix}`,
        firstName: 'Gam',
        lastName: `User${index}`,
        avatarKey: 'green-knight',
      },
      onboardingComplete: true,
      faction: 'icons',
    });
    return { id: user.id, user, username: user.profile.username, token: signToken(user.id, user.tokenVersion) };
  };
  const [a, b, c] = [await make(1), await make(2), await make(3)];

  const created = await request('POST', '/api/groups', a.token, { name: 'Raid Club', kind: 'private', members: [b.id] });
  const groupId = created.data.group.id;
  const chat = `/api/chats/${groupId}`;
  const invite = (user, body) => request('POST', `${chat}/game-invites`, user.token, body);
  const soon = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  console.log('\n--- game invites: creating ---');
  check((await invite(a, { targetId: 'p1' })).status === 400, 'an invite needs a type');
  check((await invite(a, { type: 'party', targetId: 'p1' })).status === 400, 'type is raid, shrine or duel');
  check((await invite(a, { type: 'raid' })).status === 400, 'an invite needs a target');
  check((await invite(a, { type: 'raid', targetId: 'has spaces' })).status === 400, 'targetId is a plain id');
  check((await invite(a, { type: 'raid', targetId: 'p1', place: 'x'.repeat(81) })).status === 400, 'place is at most 80 characters');
  check((await invite(a, { type: 'raid', targetId: 'p1', lat: 51.5 })).status === 400, 'lat without lng is refused');
  check((await invite(a, { type: 'raid', targetId: 'p1', lat: 95, lng: 0 })).status === 400, 'lat must be a real latitude');
  check((await invite(a, { type: 'raid', targetId: 'p1', startsAt: 'tomorrowish' })).status === 400, 'startsAt must be a date');
  check((await invite(a, { type: 'raid', targetId: 'p1', startsAt: '2099-01-01T00:00:00Z' })).status === 400, 'startsAt must be soon');
  check((await invite(c, { type: 'raid', targetId: 'p1' })).status === 403, 'people outside the chat cannot send invites');

  const raid = await invite(a, {
    type: 'raid', targetId: 'raid:abc-123', place: 'Trafalgar Square', lat: 51.508, lng: -0.128, startsAt: soon, note: 'Bring potions',
  });
  const raidId = raid.data.message?.id;
  const card = raid.data.message?.gameInvite;
  check(
    raid.status === 201 && raid.data.message.kind === 'game_invite' && card?.type === 'raid' && card.targetId === 'raid:abc-123' &&
      card.place === 'Trafalgar Square' && card.lat === 51.508 && card.lng === -0.128 && new Date(card.startsAt).toISOString() === soon &&
      raid.data.message.content === 'Bring potions',
    'an invite is a chat message carrying what to open in the game',
    raid.data
  );
  const bare = await invite(b, { type: 'shrine', targetId: 'p9' });
  check(bare.status === 201 && bare.data.message.gameInvite.lat === null && bare.data.message.gameInvite.startsAt === null && bare.data.message.gameInvite.place === '', 'place, position and time are optional', bare.data);

  const preview = (await request('GET', '/api/chats', a.token)).data.chats.find((item) => item.id === groupId).lastMessage.preview;
  check(preview.includes('🎮') && preview.includes('Shrine'), 'the chat list shows the invite', preview);

  const listed = (await request('GET', `${chat}/messages`, b.token)).data.messages.find((m) => m.id === raidId);
  check(listed?.gameInvite?.targetId === 'raid:abc-123' && listed.kind === 'game_invite', 'the message list carries the card for everyone', listed);
  const text = (await request('GET', `${chat}/messages`, b.token)).data.messages.find((m) => m.kind !== 'game_invite');
  check(!text || text.gameInvite === null, 'other messages have no card');

  console.log('\n--- game invites: like other messages ---');
  check((await request('PATCH', `${chat}/messages/${raidId}`, a.token, { content: 'edited' })).status === 400, 'an invite cannot be edited');
  const replied = await invite(b, { type: 'duel', targetId: 'p1', replyTo: raidId });
  check(replied.status === 201 && replied.data.message.replyTo?.id === raidId, 'an invite can reply to a message', replied.data);
  const dm = await request('POST', `${chat}/messages/${raidId}/forward`, a.token, { targetUsername: b.username });
  const forwarded = dm.data.message || dm.data;
  check(dm.status === 201 && forwarded.kind === 'game_invite' && forwarded.gameInvite?.targetId === 'raid:abc-123' && forwarded.forwarded === true, 'an invite can be forwarded to another chat, card and all', dm.data);
  const gone = await request('DELETE', `${chat}/messages/${raidId}?scope=everyone`, a.token);
  const afterDelete = (await request('GET', `${chat}/messages`, b.token)).data.messages.find((m) => m.id === raidId);
  check(gone.status < 300 && afterDelete && afterDelete.gameInvite == null, 'deleting for everyone removes the card', afterDelete);

  console.log('\n--- game session (single sign-on check) ---');
  const me = await request('GET', '/api/game/session', a.token);
  check(me.status === 200 && me.data.user.id === a.id && me.data.user.username === a.username && me.data.user.faction === 'icons', 'a live session answers who it is', me.data);
  check(me.data.user.email === undefined && me.data.user.tokenVersion === undefined && me.data.user.currentSessionId === undefined, 'and nothing private', me.data);
  check((await request('GET', '/api/game/session', null)).status === 401, 'no token is refused');
  check((await request('GET', '/api/game/session', `${a.token}x`)).status === 401, 'a forged token is refused');

  // A sign-in on another phone rotates the session id: the old token is dead.
  const sessionId = generateSessionId();
  await User.updateOne({ _id: c.id }, { $set: { currentSessionId: sessionId } });
  check((await request('GET', '/api/game/session', c.token)).status === 401, 'a session replaced by a sign-in elsewhere is refused');
  check((await request('GET', '/api/game/session', signToken(c.id, 0, sessionId))).status === 200, 'the current session is accepted');
  // Logging out bumps tokenVersion: every earlier token is dead.
  await User.updateOne({ _id: c.id }, { $inc: { tokenVersion: 1 } });
  check((await request('GET', '/api/game/session', signToken(c.id, 0, sessionId))).status === 401, 'a logged-out session is refused');

  return { pass, fail };
}

module.exports = { run };
