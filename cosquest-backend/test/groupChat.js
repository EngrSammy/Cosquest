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
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  }

  // Mention notifications are written after the send response returns.
  async function waitFor(fn, attempts = 40) {
    for (let i = 0; i < attempts; i += 1) {
      const value = await fn();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return null;
  }

  const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const created = await Promise.all([1, 2, 3].map((index) => User.create({
    profile: {
      username: `Group${index}${suffix}`,
      usernameNormalized: `group${index}${suffix}`,
      firstName: 'Group',
      lastName: `User${index}`,
      avatarKey: 'green-knight',
    },
    onboardingComplete: true,
    faction: 'ascendants',
  })));
  const [a, b, c] = created.map((user) => ({
    id: user.id,
    username: user.profile.username,
    token: signToken(user.id, user.tokenVersion),
  }));

  const chats = await request('GET', '/api/chats', a.token);
  const community = chats.data.chats.find((chat) => chat.type === 'community');
  const messagesPath = `/api/chats/${community.id}/messages`;

  async function mentionNotifications(user) {
    const list = await request('GET', '/api/users/me/notifications', user.token);
    return list.data.notifications.filter((item) => item.type === 'mention');
  }

  console.log('\n--- group chat: @ mentions ---');
  const members = await request('GET', `/api/chats/${community.id}/members?search=${b.username}`, a.token);
  check(
    members.status === 200 && members.data.members.some((member) => member.id === b.id) &&
      !members.data.members.some((member) => member.id === a.id) && members.data.canMentionEveryone === true,
    'the members list finds people by search and never includes yourself',
    members
  );

  const tagged = await request('POST', messagesPath, a.token, { content: 'hello @b', mentions: [b.id, a.id, 'not-an-id'] });
  check(
    tagged.status === 201 && tagged.data.message.mentions.length === 1 && tagged.data.message.mentions[0] === b.id,
    'mentions keep real people only (invalid ids and the sender are dropped)',
    tagged
  );
  const bMention = await waitFor(async () => (await mentionNotifications(b))[0]);
  check(
    bMention && bMention.conversationId === community.id && bMention.messageId === tagged.data.message.id,
    'the tagged person gets a mention notification pointing at the message',
    bMention
  );
  check((await mentionNotifications(c)).length === 0, 'people who were not tagged get no notification');

  const everyone = await request('POST', messagesPath, a.token, { content: 'hi all', mentionsEveryone: true });
  check(everyone.status === 201 && everyone.data.message.mentionsEveryone === true, 'a message can mention everyone', everyone);
  const cMention = await waitFor(async () => (await mentionNotifications(c))[0]);
  check(Boolean(cMention), 'mentioning everyone notifies everyone in the chat', cMention);

  console.log('\n--- group chat: hidden edit and rollback ---');
  const original = await request('POST', messagesPath, a.token, { content: 'first version' });
  const messageId = original.data.message.id;
  const edited = await request('PATCH', `${messagesPath}/${messageId}`, a.token, { content: 'second version' });
  check(
    edited.status === 200 && edited.data.message.editedAt && edited.data.message.canRollback === true,
    'the author sees the edit and can roll it back',
    edited
  );
  const seenByB = (await request('GET', messagesPath, b.token)).data.messages.find((message) => message.id === messageId);
  check(
    seenByB?.content === 'second version' && seenByB.editedAt === null && seenByB.canRollback === false,
    'everyone else sees the new text but no "edited" sign',
    seenByB
  );
  check(
    (await request('POST', `${messagesPath}/${messageId}/rollback`, b.token)).status === 403,
    'only the author can roll an edit back'
  );
  const rolledBack = await request('POST', `${messagesPath}/${messageId}/rollback`, a.token);
  check(
    rolledBack.status === 200 && rolledBack.data.message.content === 'first version' &&
      rolledBack.data.message.editedAt === null && rolledBack.data.message.canRollback === false,
    'rollback restores the earlier text',
    rolledBack
  );
  check(
    (await request('POST', `${messagesPath}/${messageId}/rollback`, a.token)).status === 400,
    'there is nothing left to roll back after the first version'
  );

  console.log('\n--- group chat: optional read receipts ---');
  const dm = await request('POST', '/api/chats/dm', a.token, { username: b.username });
  const dmId = dm.data.chat.id;
  const dmMessages = `/api/chats/${dmId}/messages`;
  const readFlags = async () => {
    const list = await request('GET', dmMessages, a.token);
    return Object.fromEntries(list.data.messages.map((message) => [message.content, message.read]));
  };

  await request('POST', dmMessages, a.token, { content: 'm1' });
  await request('PATCH', `/api/chats/${dmId}/read`, b.token);
  check((await readFlags()).m1 === true, 'with receipts on, a read message shows as read');

  const off = await request('PATCH', '/api/users/me/privacy', b.token, { readReceipts: false });
  check(off.status === 200 && off.data.privacy.readReceipts === false && off.data.privacy.readReceiptsOffAt, 'readReceipts can be switched off', off);
  check((await request('PATCH', '/api/users/me/privacy', b.token, { readReceipts: 'no' })).status === 400, 'readReceipts must be a boolean');

  await request('POST', dmMessages, a.token, { content: 'm2' });
  await request('PATCH', `/api/chats/${dmId}/read`, b.token);
  const frozen = await readFlags();
  check(frozen.m1 === true, 'messages read before the switch-off keep showing as read', frozen);
  check(frozen.m2 === false, 'messages read after the switch-off do not show as read', frozen);

  const chatList = await request('GET', '/api/chats', a.token);
  const aDm = chatList.data.chats.find((chat) => chat.id === dmId);
  check(aDm.otherParticipant.lastReadAt !== null, 'the chat list still shows the earlier read time', aDm);

  await request('PATCH', '/api/users/me/privacy', b.token, { readReceipts: true });
  check((await readFlags()).m2 === true, 'turning receipts back on shows everything normally again');

  return { pass, fail };
}

module.exports = { run };
