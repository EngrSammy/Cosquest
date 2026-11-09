const User = require('../src/models/User');
const Spark = require('../src/models/Spark');
const sparksEngine = require('../src/utils/sparks');
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

  // Topic detection runs after the send response returns.
  async function waitFor(fn, attempts = 80) {
    for (let i = 0; i < attempts; i += 1) {
      const value = await fn();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return null;
  }

  const suffix = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  const make = async (index) => {
    const user = await User.create({
      profile: {
        username: `Spk${index}${suffix}`,
        usernameNormalized: `spk${index}${suffix}`,
        firstName: 'Spk',
        lastName: `User${index}`,
        avatarKey: 'green-knight',
      },
      onboardingComplete: true,
      faction: 'ascendants',
    });
    return { id: user.id, username: user.profile.username, token: signToken(user.id, user.tokenVersion) };
  };
  const [a, b, outsider] = [await make(1), await make(2), await make(3)];

  console.log('\n--- sparks: pure helpers ---');
  check(
    sparksEngine.keywordsOf('Meetup at the PARKS, see https://x.io @bob').join(',') === 'meetup,park',
    'keywords drop stopwords, links and mentions, and fold plurals'
  );
  const pinnedOld = { pinned: true, lastActivityAt: new Date(Date.now() - 3600 * 1000) };
  check(sparksEngine.isActive(pinnedOld) === true && sparksEngine.hasRecentActivity(pinnedOld) === false, 'a pinned Spark stays active but is not "recent"');
  check(sparksEngine.isActive({ pinned: false, lastActivityAt: new Date(Date.now() - 3600 * 1000) }) === false, 'an unpinned Spark goes quiet after 15 minutes');

  const created = await request('POST', '/api/groups', a.token, { name: 'Spark Club', kind: 'private', members: [b.id] });
  const groupId = created.data.group.id;
  const messagesPath = `/api/chats/${groupId}/messages`;
  const sparksPath = `/api/chats/${groupId}/sparks`;

  const say = async (user, content, extra = {}) => (await request('POST', messagesPath, user.token, { content, ...extra })).data.message;
  const listSparks = async (user = a) => (await request('GET', sparksPath, user.token)).data;

  console.log('\n--- sparks: automatic detection ---');
  const m1 = await say(a, 'meetup saturday?');
  await say(b, 'meetup at the park!');
  check((await listSparks()).sparks.length === 0, 'two messages are not enough for a Spark');
  const m3 = await say(a, 'the meetup should be at the mall');
  // The Spark shows up a moment before its messages are tagged into it.
  const found = await waitFor(async () => {
    const spark = (await listSparks()).sparks[0];
    return spark?.messageCount === 3 ? spark : null;
  });
  check(
    found && found.subject.toLowerCase().includes('meetup') && found.active === true && found.startedByBot === true && found.messageCount === 3,
    '3 messages from 2 people on one subject start a Spark',
    found
  );
  const meetupId = found.id;

  const tagged = await waitFor(async () => {
    const list = (await request('GET', messagesPath, a.token)).data.messages;
    const mine = list.find((message) => message.id === m1.id);
    return mine?.spark ? mine : null;
  });
  check(tagged && tagged.spark.id === meetupId && tagged.spark.era === 0 && tagged.spark.postedInSpark === false, 'the messages carry a Spark marker in the main chat', tagged);

  await say(b, 'I will bring snacks for the meetup');
  const joined = await waitFor(async () => ((await listSparks()).sparks.find((s) => s.id === meetupId)?.messageCount === 4 ? true : null));
  check(joined === true, 'a new message on an active Spark\'s subject joins it');

  const inside = await say(b, 'count me in', { sparkId: meetupId });
  check(inside.spark?.id === meetupId && inside.spark.postedInSpark === true, 'a reply posted inside a Spark joins it right away', inside);
  check((await request('POST', messagesPath, a.token, { content: 'x', sparkId: '64b000000000000000000000' })).status === 400, 'replying into a Spark that does not exist is rejected');

  console.log('\n--- sparks: the side panel ---');
  await request('POST', `${messagesPath}/${m3.id}/reactions`, b.token, { emoji: '🔥' });
  const panel = await request('GET', `${sparksPath}/${meetupId}`, b.token);
  const panelIds = panel.data.messages?.map((message) => message.id) || [];
  check(panel.status === 200 && panelIds.length === 5 && panelIds[0] === m1.id && panelIds[4] === inside.id, 'the panel lists the Spark\'s messages oldest first', panelIds);
  const reacted = panel.data.messages?.find((message) => message.id === m3.id);
  check(reacted?.reactions?.[0]?.emoji === '🔥' && reacted.reactions[0].mine === true, 'panel messages include their reactions', reacted);
  check(panel.data.canManage === false && (await request('GET', sparksPath, a.token)).data.canManage === true, 'only group admins can manage Sparks');

  console.log('\n--- sparks: access ---');
  check((await request('GET', sparksPath, outsider.token)).status === 403, 'people outside the group cannot list its Sparks');
  const dm = await request('POST', '/api/chats/dm', a.token, { username: b.username });
  check((await request('GET', `/api/chats/${dm.data.chat.id}/sparks`, a.token)).status === 400, 'direct messages have no Sparks');

  console.log('\n--- sparks: starting one by hand ---');
  const seed = await say(a, 'anybody know a good wig stylist');
  check((await request('POST', sparksPath, a.token, { messageId: seed.id, subject: 'x' })).status === 400, 'a Spark needs a proper subject');
  const similar = await request('POST', sparksPath, a.token, { messageId: seed.id, subject: 'Meetup plans' });
  check(similar.status === 409 && similar.data.code === 'similar_sparks' && similar.data.matches[0].id === meetupId, 'a similar Spark is offered instead of a duplicate', similar);
  const wig = await request('POST', sparksPath, a.token, { messageId: seed.id, subject: 'Wig styling' });
  check(wig.status === 201 && wig.data.spark.startedByBot === false && wig.data.spark.messageCount === 1, 'a member can start a Spark from a message', wig);
  const wigId = wig.data.spark.id;
  const again = await request('POST', sparksPath, a.token, { messageId: seed.id, subject: 'Another try' });
  check(again.status === 409 && again.data.code === 'already_in_spark', 'a message already in a Spark cannot start another', again);

  console.log('\n--- sparks: admin tools and pinning ---');
  check((await request('PATCH', `${sparksPath}/${meetupId}/pin`, b.token, { pinned: true })).status === 403, 'members cannot pin');
  check((await request('POST', `${sparksPath}/${wigId}/merge`, b.token, { intoSparkId: meetupId })).status === 403, 'members cannot merge');
  check((await request('DELETE', `${sparksPath}/${wigId}`, b.token)).status === 403, 'members cannot delete');

  const longAgo = new Date(Date.now() - 3 * 3600 * 1000);
  await Spark.updateOne({ _id: meetupId }, { $set: { lastActivityAt: longAgo } });
  check((await listSparks()).sparks.find((s) => s.id === meetupId).active === false, 'a Spark with no new messages for a while goes quiet');
  const pinned = await request('PATCH', `${sparksPath}/${meetupId}/pin`, a.token, { pinned: true });
  check(pinned.status === 200 && pinned.data.spark.pinned === true && pinned.data.spark.active === true, 'a pinned Spark never fades', pinned);
  const order = (await listSparks()).sparks.map((s) => s.id);
  check(order[0] === meetupId, 'pinned Sparks are listed first', order);
  const unpinned = await request('PATCH', `${sparksPath}/${meetupId}/pin`, a.token, { pinned: false });
  check(unpinned.data.spark.pinned === false && unpinned.data.spark.active === false, 'unpinning lets it go quiet again', unpinned);

  const merged = await request('POST', `${sparksPath}/${wigId}/merge`, a.token, { intoSparkId: meetupId });
  check(merged.status === 200 && merged.data.spark.id === meetupId && merged.data.spark.messageCount === 6, 'merging moves the other Spark\'s messages in', merged);
  check(merged.data.spark.revived === false, 'a merge does not count as a revival', merged.data.spark);
  const afterMerge = await request('GET', `${sparksPath}/${meetupId}`, a.token);
  const movedSeed = afterMerge.data.messages.find((message) => message.id === seed.id);
  check(movedSeed?.spark?.id === meetupId && movedSeed.spark.era === 0, 'the merged messages are tagged with the surviving Spark', movedSeed);
  check((await request('GET', `${sparksPath}/${wigId}`, a.token)).status === 404, 'the merged Spark is gone');
  check((await request('POST', `${sparksPath}/${meetupId}/merge`, a.token, { intoSparkId: meetupId })).status === 400, 'a Spark cannot merge into itself');

  console.log('\n--- sparks: revival ---');
  await Spark.updateOne({ _id: meetupId }, { $set: { lastActivityAt: longAgo } });
  // A returning subject needs a new cluster (3 messages, 2 people) to revive it.
  await say(b, 'meetup next week?');
  await say(a, 'is the meetup moved');
  check((await listSparks()).sparks.find((s) => s.id === meetupId).revived === false, 'one or two stray messages do not revive a quiet Spark');
  const comeback = await say(b, 'meetup moved to sunday');
  await waitFor(async () => ((await listSparks()).sparks.find((s) => s.id === meetupId)?.active ? true : null));
  const revivedSpark = (await listSparks()).sparks.find((s) => s.id === meetupId);
  check(revivedSpark.revived === true && revivedSpark.eras.length === 2 && revivedSpark.active === true, 'talking about a quiet Spark again revives it in a new era', revivedSpark);
  const revivedMessage = await waitFor(async () => {
    const message = (await request('GET', messagesPath, a.token)).data.messages.find((item) => item.id === comeback.id);
    return message?.spark ? message : null;
  });
  check(revivedMessage?.spark.era === 1, 'the returning message belongs to the new era', revivedMessage);

  console.log('\n--- sparks: delete ---');
  const removed = await request('DELETE', `${sparksPath}/${meetupId}`, a.token);
  check(removed.status === 200 && removed.data.deleted === true, 'an admin can delete a Spark', removed);
  const afterDelete = (await request('GET', messagesPath, a.token)).data.messages.find((message) => message.id === m1.id);
  check(afterDelete && afterDelete.spark === null, 'its messages stay in the main chat, unmarked', afterDelete);
  check((await listSparks()).sparks.length === 0, 'it no longer appears in the list');

  console.log('\n--- sparks: community and faction rooms ---');
  const chats = await request('GET', '/api/chats', a.token);
  const community = chats.data.chats.find((chat) => chat.type === 'community');
  const communityNote = await request('POST', `/api/chats/${community.id}/messages`, a.token, { content: 'cosplay convention tickets' });
  const communitySpark = await request('POST', `/api/chats/${community.id}/sparks`, a.token, { messageId: communityNote.data.message.id, subject: 'Convention tickets' });
  check(communitySpark.status === 201, 'Community can have Sparks', communitySpark);
  check((await request('PATCH', `/api/chats/${community.id}/sparks/${communitySpark.data.spark.id}/pin`, a.token, { pinned: true })).status === 403, 'nobody can manage Sparks where there are no admins');

  console.log('\n--- sparks: simultaneous messages ---');
  const burst = await Promise.all([
    request('POST', messagesPath, a.token, { content: 'garden tomorrow?' }),
    request('POST', messagesPath, b.token, { content: 'garden party at noon' }),
    request('POST', messagesPath, a.token, { content: 'garden decorations needed' }),
  ]);
  check(burst.every((item) => item.status === 201), 'three messages sent at once all succeed');
  await waitFor(async () => ((await listSparks()).sparks.length >= 1 ? true : null));
  await new Promise((resolve) => setTimeout(resolve, 300));
  const gardenSparks = (await listSparks()).sparks;
  check(gardenSparks.length === 1 && gardenSparks[0].messageCount === 3, 'a burst of messages makes one Spark, not duplicates', gardenSparks);

  return { pass, fail };
}

module.exports = { run };
