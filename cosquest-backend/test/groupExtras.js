const User = require('../src/models/User');
const Conversation = require('../src/models/Conversation');
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

  const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const make = async (index) => {
    const user = await User.create({
      profile: {
        username: `Gx${index}${suffix}`,
        usernameNormalized: `gx${index}${suffix}`,
        firstName: 'Gx',
        lastName: `User${index}`,
        avatarKey: 'green-knight',
      },
      onboardingComplete: true,
      faction: 'ascendants',
    });
    return { id: user.id, username: user.profile.username, token: signToken(user.id, user.tokenVersion) };
  };
  const [a, b, c] = [await make(1), await make(2), await make(3)];

  console.log('\n--- group extras: expertise roles ---');
  const list = await request('GET', '/api/expertise');
  check(list.status === 200 && list.data.expertise.some((item) => item.key === 'front_end' && item.label === 'Front-end'), 'the expertise list is public', list);
  check((await request('PATCH', '/api/expertise/me', null, { expertise: 'design' })).status === 401, 'setting your expertise needs a login');
  check((await request('PATCH', '/api/expertise/me', a.token, { expertise: 'wizard' })).status === 400, 'only listed roles are accepted');
  check((await request('PATCH', '/api/expertise/me', a.token, {})).status === 400, 'an empty request does not silently clear the role');
  const set = await request('PATCH', '/api/expertise/me', a.token, { expertise: 'front_end' });
  check(set.status === 200 && set.data.user.expertise === 'front_end' && set.data.user.expertiseLabel === 'Front-end', 'a role can be chosen', set.data.user);

  const made = await request('POST', '/api/groups', a.token, { name: 'Gx Open', kind: 'open', joinMode: 'approval', members: [b.id] });
  const groupId = made.data.group.id;
  const chat = `/api/chats/${groupId}`;
  const sent = await request('POST', `${chat}/messages`, a.token, { content: 'hello from the front end' });
  check(sent.data.message.sender.expertise === 'Front-end', 'the role shows under the sender\'s name in chat', sent.data.message.sender);
  check((await request('GET', `${chat}/members`, b.token)).data.members.length === 1, 'setup: a second member sees the member picker');
  const seenBy = await request('GET', `${chat}/members?search=${a.username}`, b.token);
  check(seenBy.data.members[0]?.expertise === 'Front-end', 'and in the member picker', seenBy.data);
  await request('PATCH', '/api/expertise/me', a.token, { expertise: null });
  check((await request('GET', `${chat}/messages`, b.token)).data.messages[0].sender.expertise === null, 'clearing it removes the label');

  console.log('\n--- group extras: local and regional groups ---');
  check(made.data.group.scope === 'local' && made.data.chat.group.scope === 'local', 'groups are local by default', made.data.group.scope);
  await Conversation.updateOne({ _id: groupId }, { $set: { 'group.scope': 'regional' } });
  const regional = (await request('GET', `/api/groups/${groupId}`, a.token)).data.group;
  const inList = (await request('GET', '/api/chats', a.token)).data.chats.find((item) => item.id === groupId);
  const discovered = (await request('GET', '/api/groups/discover', c.token)).data.groups.find((item) => item.id === groupId);
  check(regional.scope === 'regional' && inList.group.scope === 'regional' && discovered?.scope === 'regional', 'a regional group says so in its info, the chat list and discovery', { regional: regional.scope, list: inList.group.scope, discovered: discovered?.scope });

  console.log('\n--- group extras: join requests with an introduction ---');
  const long = 'x'.repeat(300);
  const asked = await request('POST', `/api/groups/${groupId}/join`, c.token, { message: `  ${long}  ` });
  check(asked.status === 202 && asked.data.requested === true, 'asking to join an approval group makes a request', asked);
  const requests = await request('GET', `/api/groups/${groupId}/requests`, a.token);
  check(requests.data.requests.length === 1 && requests.data.requests[0].message.length === 200, 'admins see the introduction, cut to 200 characters', requests.data.requests[0]?.message?.length);
  check((await request('GET', `/api/groups/${groupId}`, c.token)).data.preview.requestPending === true, 'the person sees their request is pending');
  const cancelled = await request('DELETE', `/api/groups/${groupId}/requests/mine`, c.token);
  check(cancelled.status === 200 && cancelled.data.cancelled === true, 'they can cancel their own request', cancelled);
  check((await request('GET', `/api/groups/${groupId}/requests`, a.token)).data.requests.length === 0, 'it disappears from the admins\' list');
  check((await request('DELETE', `/api/groups/${groupId}/requests/mine`, c.token)).data.cancelled === false, 'cancelling again does nothing');
  const again = await request('POST', `/api/groups/${groupId}/join`, c.token);
  check(again.status === 202 && (await request('GET', `/api/groups/${groupId}/requests`, a.token)).data.requests.length === 1, 'they can ask again after cancelling');

  const secret = await request('POST', '/api/groups', a.token, { name: 'Gx Secret', kind: 'private' });
  check((await request('DELETE', `/api/groups/${secret.data.group.id}/requests/mine`, c.token)).status === 404, 'a private group stays hidden from people who never asked to join it');

  console.log('\n--- group extras: mute only Sparks ---');
  const seed = sent.data.message;
  const spark = await request('POST', `${chat}/sparks`, a.token, { messageId: seed.id, subject: 'Front end chat' });
  check(spark.status === 201, 'setup: a Spark to reply inside', spark);
  const unread = async () => (await request('GET', '/api/chats', b.token)).data.chats.find((item) => item.id === groupId);
  check((await unread()).sparksMuted === false, 'Spark notifications are on by default');
  check((await request('PATCH', `${chat}/notifications`, b.token, { sparksMuted: 'yes' })).status === 400, 'the setting must be true or false');
  check((await request('PATCH', `${chat}/notifications`, c.token, { sparksMuted: true })).status === 403, 'people outside the chat cannot change it');

  await request('PATCH', `${chat}/read`, b.token);
  await request('POST', `${chat}/messages`, a.token, { content: 'a normal message in the main chat' });
  await request('POST', `${chat}/messages`, a.token, { content: 'a reply inside the Spark', sparkId: spark.data.spark.id });
  check((await unread()).unreadCount === 2, 'by default both new messages count as unread', (await unread()).unreadCount);

  const muted = await request('PATCH', `${chat}/notifications`, b.token, { sparksMuted: true });
  check(muted.status === 200 && muted.data.sparksMuted === true, 'a member can mute just the Spark activity', muted);
  const after = await unread();
  check(after.sparksMuted === true && after.unreadCount === 1, 'replies inside Sparks no longer count as unread, the main chat still does', after);
  await request('PATCH', `${chat}/notifications`, b.token, { sparksMuted: false });
  check((await unread()).unreadCount === 2, 'turning it off counts them again');

  const newcomer = await request('PATCH', `/api/chats/${(await request('GET', '/api/chats', c.token)).data.chats[0].id}/notifications`, c.token, { sparksMuted: true });
  const community = (await request('GET', '/api/chats', c.token)).data.chats.find((item) => item.type === 'community');
  check(newcomer.status === 200 && community.unreadCount > 0 && community.sparksMuted === true, 'changing the setting never marks a chat as read', community);

  return { pass, fail };
}

module.exports = { run };
