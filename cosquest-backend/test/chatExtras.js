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
    const form = body instanceof FormData;
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body && !form ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? (form ? body : JSON.stringify(body)) : undefined,
    });
    return { status: response.status, data: await response.json() };
  }

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
        username: `Ext${index}${suffix}`,
        usernameNormalized: `ext${index}${suffix}`,
        firstName: 'Ext',
        lastName: `User${index}`,
        avatarKey: 'green-knight',
      },
      onboardingComplete: true,
      faction: 'ascendants',
    });
    return { id: user.id, username: user.profile.username, token: signToken(user.id, user.tokenVersion) };
  };
  const [a, b, outsider] = [await make(1), await make(2), await make(3)];

  const created = await request('POST', '/api/groups', a.token, { name: 'Extras Club', kind: 'private', members: [b.id] });
  const groupId = created.data.group.id;
  const chat = `/api/chats/${groupId}`;
  const say = async (user, content, extra = {}) => (await request('POST', `${chat}/messages`, user.token, { content, ...extra })).data.message;

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const MB = 1024 * 1024;
  function albumForm(items, fields = {}) {
    const form = new FormData();
    items.forEach(([mime, name, bytes]) => form.append('media', new Blob([bytes], { type: mime }), name));
    Object.entries(fields).forEach(([key, value]) => form.append(key, value));
    return form;
  }

  console.log('\n--- chat extras: "before your change" ---');
  const draft = await say(a, 'first wording');
  await request('PATCH', `${chat}/messages/${draft.id}`, a.token, { content: 'second wording' });
  const mine = (await request('GET', `${chat}/messages/${draft.id}`, a.token)).data.message;
  const theirs = (await request('GET', `${chat}/messages/${draft.id}`, b.token)).data.message;
  check(mine.previousContent === 'first wording', 'the author sees the wording an undo would restore', mine);
  check(theirs.previousContent === null && theirs.editedAt === null, 'nobody else gets it', theirs);

  console.log('\n--- chat extras: search ---');
  const seedA = await say(a, 'Looking for a Dragon costume pattern');
  const plain = await say(b, 'my dragon wings are done (finally!)');
  await say(a, 'something unrelated');
  const spark = await request('POST', `${chat}/sparks`, a.token, { messageId: seedA.id, subject: 'Dragon costume' });
  check(spark.status === 201, 'setup: a Spark to search inside', spark);

  const found = await request('GET', `${chat}/search?q=DRAGON`, b.token);
  check(found.status === 200 && found.data.results.length === 2 && found.data.pagination.total === 2, 'search finds matches case-insensitively', found.data);
  const bySubject = Object.fromEntries(found.data.results.map((item) => [item.message.id, item.context]));
  check(bySubject[seedA.id]?.label === 'Dragon costume' && bySubject[seedA.id].sparkId === spark.data.spark.id, 'a result inside a Spark names it', bySubject);
  check(bySubject[plain.id]?.label === 'Original conversation' && bySubject[plain.id].sparkId === null, 'a result outside any Spark says so', bySubject);
  check(found.data.results[0].message.id === plain.id, 'results are newest first', found.data.results.map((item) => item.message.content));
  check((await request('GET', `${chat}/search?q=${encodeURIComponent('(finally!)')}`, b.token)).data.results.length === 1, 'special characters are searched literally, not as a pattern');
  check((await request('GET', `${chat}/search?q=a`, b.token)).status === 400, 'a search needs at least 2 characters');
  check((await request('GET', `${chat}/search?q=dragon`, outsider.token)).status === 403, 'people outside the chat cannot search it');

  await request('DELETE', `${chat}/messages/${plain.id}?scope=me`, b.token);
  check((await request('GET', `${chat}/search?q=dragon`, b.token)).data.results.length === 1, 'messages you deleted for yourself are not found');
  check((await request('GET', `${chat}/search?q=dragon`, a.token)).data.results.length === 2, 'but other people still find them');
  await request('DELETE', `${chat}/messages/${plain.id}?scope=everyone`, b.token);
  check((await request('GET', `${chat}/search?q=dragon`, a.token)).data.results.length === 1, 'messages deleted for everyone are not found');

  const voice = new FormData();
  voice.append('kind', 'audio');
  voice.append('media', new Blob(['voice bytes'], { type: 'audio/mp4' }), 'voice.m4a');
  const note = await request('POST', `${chat}/messages`, a.token, voice);
  const viaTranscript = await waitFor(async () => {
    const result = await request('GET', `${chat}/search?q=${encodeURIComponent('Test voice')}`, b.token);
    return result.data.results?.[0];
  });
  check(viaTranscript?.message.id === note.data.message.id, 'voice notes are found by their transcript', viaTranscript);

  console.log('\n--- chat extras: jump to a message ---');
  const run = [];
  for (let i = 1; i <= 7; i += 1) run.push(await say(i % 2 ? a : b, `line ${i} of the run`));
  await request('POST', `${chat}/messages/${run[3].id}/reactions`, b.token, { emoji: '🔥' });
  const around = await request('GET', `${chat}/messages/${run[3].id}/context?size=2`, a.token);
  const ids = around.data.messages?.map((message) => message.id) || [];
  check(
    around.status === 200 && around.data.targetId === run[3].id && ids.join() === [run[1], run[2], run[3], run[4], run[5]].map((m) => m.id).join(),
    'the message comes with the conversation around it, oldest first',
    ids
  );
  check(around.data.hasOlder === true && around.data.hasNewer === true, 'it says there is more before and after');
  const reacted = around.data.messages?.find((message) => message.id === run[3].id);
  check(reacted?.reactions?.[0]?.emoji === '🔥', 'the surrounding messages include their reactions', reacted);
  const end = await request('GET', `${chat}/messages/${run[6].id}/context?size=3`, a.token);
  check(end.data.hasNewer === false && end.data.messages.at(-1).id === run[6].id, 'at the newest message there is nothing newer');
  const exact = await request('GET', `${chat}/messages/${run[3].id}/context?size=3`, a.token);
  check(exact.data.hasNewer === false && exact.data.messages.at(-1).id === run[6].id && exact.data.hasOlder === true, 'when exactly "size" newer messages remain it does not claim there are more', exact.data);
  check((await request('GET', `${chat}/messages/${run[0].id}/context`, b.token)).status === 200 && (await request('GET', `${chat}/messages/${run[0].id}/context`, outsider.token)).status === 403, 'outsiders cannot open a message context');

  const dm = await request('POST', '/api/chats/dm', a.token, { username: b.username });
  const dmChat = `/api/chats/${dm.data.chat.id}`;
  const dmMsg = (await request('POST', `${dmChat}/messages`, a.token, { content: 'read me' })).data.message;
  await request('PATCH', `${dmChat}/read`, b.token);
  const dmContext = await request('GET', `${dmChat}/messages/${dmMsg.id}/context`, a.token);
  check(dmContext.data.messages[0].read === true, 'in a DM, read receipts show in the context too', dmContext.data.messages[0]);

  console.log('\n--- chat extras: albums ---');
  const two = await request('POST', `${chat}/album`, a.token, albumForm([['image/png', 'one.png', png], ['image/png', 'two.png', png]], { content: 'cosplay photoshoot' }));
  check(
    two.status === 201 && two.data.message.kind === 'album' && two.data.message.album.length === 2 && two.data.message.album.every((item) => item.kind === 'image' && item.url) && two.data.message.content === 'cosplay photoshoot',
    'several photos go out as one album message',
    two
  );
  const mixed = await request('POST', `${chat}/album`, a.token, albumForm([['image/png', 'one.png', png], ['video/mp4', 'clip.mp4', 'video bytes']]));
  check(mixed.status === 201 && mixed.data.message.album.map((item) => item.kind).join() === 'image,video', 'photos and videos can be mixed, in order', mixed);
  check((await request('POST', `${chat}/album`, a.token, albumForm([]))).status === 400, 'an album needs at least one file');
  check((await request('POST', `${chat}/album`, a.token, albumForm(Array(11).fill(['image/png', 'x.png', png])))).status === 400, 'an album has at most 10 files');
  check((await request('POST', `${chat}/album`, a.token, albumForm([['image/png', 'x.png', png], ['application/pdf', 'x.pdf', 'pdf']]))).status === 400, 'documents cannot go in an album');
  check((await request('POST', `${chat}/album`, a.token, albumForm([['image/png', 'big.png', Buffer.alloc(10 * MB + 1)]]))).status === 413, 'each photo keeps the 10 MB limit');
  check((await request('POST', `${chat}/album`, outsider.token, albumForm([['image/png', 'x.png', png]]))).status === 403, 'only people in the chat can post albums');
  check((await request('POST', `${chat}/album`, a.token, albumForm([['image/png', 'x.png', png]], { sparkId: '64b000000000000000000000' }))).status === 400, 'an album into a Spark that does not exist is rejected');
  check((await request('POST', `${chat}/album`, a.token, albumForm([['image/png', 'x.png', png]], { replyTo: 'nope' }))).status === 400, 'a bad replyTo is rejected');

  const reply = await request('POST', `${chat}/album`, b.token, albumForm([['image/png', 'x.png', png]], { replyTo: run[0].id, sparkId: spark.data.spark.id }));
  check(reply.status === 201 && reply.data.message.replyTo?.id === run[0].id && reply.data.message.spark?.id === spark.data.spark.id && reply.data.message.spark.postedInSpark === true, 'an album can reply to a message and be posted inside a Spark', reply);

  const listed = (await request('GET', `${chat}/messages`, b.token)).data.messages.find((message) => message.id === two.data.message.id);
  check(listed?.album?.length === 2, 'albums come back in the normal message list');
  check((await request('GET', '/api/chats', a.token)).data.chats.find((item) => item.id === groupId).lastMessage.preview === '📷 1 photo', 'the chat list shows a short album preview');
  check((await request('GET', `${chat}/search?q=photoshoot`, b.token)).data.results.some((item) => item.message.id === two.data.message.id), 'albums are found by their caption');

  const forwarded = await request('POST', `${chat}/messages/${mixed.data.message.id}/forward`, a.token, { targetUsername: b.username });
  check(forwarded.status === 201 && forwarded.data.message.kind === 'album' && forwarded.data.message.album.length === 2 && forwarded.data.message.forwarded === true, 'forwarding an album copies its photos and videos', forwarded);

  const gone = await request('DELETE', `${chat}/messages/${two.data.message.id}?scope=everyone`, a.token);
  const tomb = (await request('GET', `${chat}/messages/${two.data.message.id}`, b.token)).data.message;
  check(gone.status === 200 && tomb.deleted === true && !tomb.album, 'a deleted album does not leak its photos', tomb);

  return { pass, fail };
}

module.exports = { run };
