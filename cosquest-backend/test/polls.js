const User = require('../src/models/User');
const Message = require('../src/models/Message');
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
        username: `Pol${index}${suffix}`,
        usernameNormalized: `pol${index}${suffix}`,
        firstName: 'Pol',
        lastName: `User${index}`,
        avatarKey: 'green-knight',
      },
      onboardingComplete: true,
      faction: 'ascendants',
    });
    return { id: user.id, username: user.profile.username, token: signToken(user.id, user.tokenVersion) };
  };
  const [a, b, c] = [await make(1), await make(2), await make(3)];

  const created = await request('POST', '/api/groups', a.token, { name: 'Poll Club', kind: 'private', members: [b.id] });
  const groupId = created.data.group.id;
  const chat = `/api/chats/${groupId}`;
  const pollsPath = `${chat}/polls`;
  const makePoll = (user, body) => request('POST', pollsPath, user.token, body);

  console.log('\n--- polls: creating ---');
  check((await makePoll(a, { options: ['x', 'y'] })).status === 400, 'a poll needs a question');
  check((await makePoll(a, { question: 'q', options: ['only one'] })).status === 400, 'a poll needs at least 2 options');
  check((await makePoll(a, { question: 'q', options: Array.from({ length: 13 }, (_, i) => `o${i}`) })).status === 400, 'a poll has at most 12 options');
  check((await makePoll(a, { question: 'q', options: ['Same', 'same'] })).status === 400, 'options must be different (ignoring capitals)');
  check((await makePoll(a, { question: 'q', options: ['ok', 'x'.repeat(101)] })).status === 400, 'an option is at most 100 characters');
  check((await makePoll(a, { question: 'q', options: ['a', 'b'], closesIn: '5y' })).status === 400, 'closesIn must be 1h, 1d or 1w');
  check((await makePoll(c, { question: 'q', options: ['a', 'b'] })).status === 403, 'people outside the group cannot create polls');

  const lunch = await makePoll(a, { question: 'Where to eat?', options: ['Pizza', 'Tacos', 'Ramen'] });
  const lunchId = lunch.data.message?.id;
  check(
    lunch.status === 201 && lunch.data.message.kind === 'poll' && lunch.data.message.poll.options.map((o) => o.id).join() === 'o1,o2,o3' &&
      lunch.data.message.poll.totalVoters === 0 && lunch.data.message.poll.closed === false && lunch.data.message.content === 'Where to eat?',
    'a poll is created as a chat message with its options',
    lunch.data
  );
  const preview = (await request('GET', '/api/chats', b.token)).data.chats.find((item) => item.id === groupId).lastMessage.preview;
  check(preview.includes('Poll: Where to eat?'), 'the chat list shows the poll', preview);

  console.log('\n--- polls: voting ---');
  const vote = (user, messageId, optionIds) => request('POST', `${chat}/messages/${messageId}/vote`, user.token, { optionIds });
  const first = await vote(b, lunchId, ['o2']);
  check(first.status === 200 && first.data.poll.totalVoters === 1 && first.data.poll.options[1].votes === 1 && first.data.poll.myVotes.join() === 'o2', 'a member votes and sees their own pick', first.data);
  check((await vote(b, lunchId, ['o9'])).status === 400, 'an option that is not in the poll is refused');
  check((await vote(b, lunchId, ['o1', 'o2'])).status === 400, 'one answer only unless the poll allows several');
  check((await request('POST', `${chat}/messages/${lunchId}/vote`, b.token, { optionIds: 'o1' })).status === 400, 'optionIds must be a list');
  const changed = await vote(b, lunchId, ['o1']);
  check(changed.data.poll.totalVoters === 1 && changed.data.poll.options[0].votes === 1 && changed.data.poll.options[1].votes === 0, 'voting again changes the vote instead of adding one', changed.data.poll);
  await vote(a, lunchId, ['o1']);
  const listed = await request('GET', `${chat}/messages`, a.token);
  const asA = listed.data.messages.find((m) => m.id === lunchId);
  const asB = (await request('GET', `${chat}/messages`, b.token)).data.messages.find((m) => m.id === lunchId);
  check(asA.poll.options[0].votes === 2 && asA.poll.totalVoters === 2 && asA.poll.myVotes.join() === 'o1' && asB.poll.myVotes.join() === 'o1', 'the message list carries live results and each viewer\'s own votes', asA.poll);
  const removed = await vote(a, lunchId, []);
  check(removed.data.poll.totalVoters === 1 && removed.data.poll.myVotes.length === 0, 'an empty list removes your vote', removed.data.poll);
  check((await vote(c, lunchId, ['o1'])).status === 403, 'people outside the group cannot vote');

  const multi = await makePoll(b, { question: 'Pick toppings', options: ['Cheese', 'Olives', 'Peppers'], multiple: true });
  const multiVote = await vote(a, multi.data.message.id, ['o1', 'o3']);
  check(multiVote.status === 200 && multiVote.data.poll.options[0].votes === 1 && multiVote.data.poll.options[2].votes === 1, 'a multiple-choice poll accepts several answers', multiVote.data);

  console.log('\n--- polls: who voted ---');
  const voters = await request('GET', `${chat}/messages/${lunchId}/poll/votes`, a.token);
  check(voters.status === 200 && voters.data.totalVoters === 1 && voters.data.options[0].voters[0]?.id === b.id, 'members can see who picked each option', voters.data);
  const secret = await makePoll(a, { question: 'Secret?', options: ['Yes', 'No'], anonymous: true });
  await vote(b, secret.data.message.id, ['o1']);
  check((await request('GET', `${chat}/messages/${secret.data.message.id}/poll/votes`, a.token)).status === 403, 'an anonymous poll never lists voters');
  check((await request('GET', `${chat}/messages/${secret.data.message.id}`, a.token)).data.message.poll.options[0].votes === 1, 'but the counts are shown');

  console.log('\n--- polls: closing ---');
  check((await request('POST', `${chat}/messages/${lunchId}/poll/close`, b.token)).status === 403, 'only the creator or a group admin can close a poll');
  const bPoll = await makePoll(b, { question: 'B asks', options: ['one', 'two'] });
  const byAdmin = await request('POST', `${chat}/messages/${bPoll.data.message.id}/poll/close`, a.token);
  check(byAdmin.status === 200 && byAdmin.data.poll.closed === true, 'a group admin can close a member\'s poll', byAdmin.data);
  const closed = await request('POST', `${chat}/messages/${lunchId}/poll/close`, a.token);
  check(closed.status === 200 && closed.data.poll.closed === true && closed.data.poll.closedAt, 'the creator closes their own poll', closed.data);
  check((await vote(b, lunchId, ['o3'])).status === 400, 'nobody can vote once it is closed');

  const timed = await makePoll(a, { question: 'Timed', options: ['a', 'b'], closesIn: '1h' });
  check(Boolean(timed.data.message.poll.closesAt) && timed.data.message.poll.closed === false, 'a poll can close by itself after a time');
  await Message.updateOne({ _id: timed.data.message.id }, { $set: { 'poll.closesAt': new Date(Date.now() - 1000) } });
  check((await vote(b, timed.data.message.id, ['o1'])).status === 400, 'a poll past its end time is closed');

  console.log('\n--- polls: like any other message ---');
  check((await request('PATCH', `${chat}/messages/${lunchId}`, a.token, { content: 'changed' })).status === 400, 'polls cannot be edited');
  check((await request('POST', `${chat}/messages/${lunchId}/forward`, a.token, { targetUsername: b.username })).status === 400, 'polls cannot be forwarded');
  check((await request('POST', `${chat}/messages/bulk-forward`, a.token, { messageIds: [lunchId], targetUsername: b.username })).status === 400, 'polls cannot be bulk-forwarded');
  const found = await request('GET', `${chat}/search?q=${encodeURIComponent('Where to eat')}`, b.token);
  check(found.data.results.some((item) => item.message.id === lunchId && item.message.poll?.totalVoters === 1), 'search finds a poll by its question, with its results', found.data);

  const seedPoll = await makePoll(a, { question: 'Costume colours for the parade', options: ['Red', 'Blue'] });
  await vote(b, seedPoll.data.message.id, ['o2']);
  const spark = await request('POST', `${chat}/sparks`, a.token, { messageId: seedPoll.data.message.id, subject: 'Parade colours' });
  if (spark.status === 201) {
    const panel = await request('GET', `${chat}/sparks/${spark.data.spark.id}`, a.token);
    const inPanel = panel.data.messages?.find((m) => m.id === seedPoll.data.message.id);
    check(inPanel?.poll?.totalVoters === 1 && inPanel.poll.options[1].votes === 1, 'a poll shown in a Spark panel keeps its results', inPanel);
  } else {
    check(false, 'a poll can be the start of a Spark', spark);
  }

  const dm = await request('POST', '/api/chats/dm', a.token, { username: b.username });
  const dmPoll = await request('POST', `/api/chats/${dm.data.chat.id}/polls`, a.token, { question: 'Movie night?', options: ['Yes', 'No'] });
  check(dmPoll.status === 201, 'polls also work in a direct message', dmPoll.data);

  const gone = await makePoll(a, { question: 'Delete me', options: ['a', 'b'] });
  await request('DELETE', `${chat}/messages/${gone.data.message.id}?scope=everyone`, a.token);
  check((await vote(b, gone.data.message.id, ['o1'])).status === 400, 'a deleted poll cannot be voted on');
  const notAPoll = await request('POST', `${chat}/messages`, a.token, { content: 'just text' });
  check((await vote(b, notAPoll.data.message.id, ['o1'])).status === 404, 'a message that is not a poll is "Poll not found"');

  return { pass, fail };
}

module.exports = { run };
