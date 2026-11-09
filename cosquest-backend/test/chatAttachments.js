const User = require('../src/models/User');
const Message = require('../src/models/Message');
const Conversation = require('../src/models/Conversation');
const { signToken } = require('../src/utils/token');
const { validateChatMedia } = require('../src/utils/chatMedia');

async function run(baseUrl) {
  let pass = 0;
  let fail = 0;
  function check(ok, name, value) {
    if (ok) { pass++; console.log(`  ok  - ${name}`); }
    else { fail++; console.log(`FAIL - ${name}`, JSON.stringify(value)); }
  }
  async function call(method, path, token, body) {
    const form = body instanceof FormData;
    const response = await fetch(baseUrl + path, { method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !form ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? form ? body : JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  }
  const fixtures = await Promise.all([1, 2, 3].map((index) => User.create({
    profile: { username: `Attach${index}${Date.now()}`, usernameNormalized: `attach${index}${Date.now()}` },
    onboardingComplete: true, faction: 'ascendants',
  })));
  const [a, b, c] = fixtures.map((user) => ({ id: user.id, username: user.profile.username, token: signToken(user.id, user.tokenVersion) }));
  const dm = (await call('POST', '/api/chats/dm', a.token, { username: b.username })).data.chat.id;
  const path = `/api/chats/${dm}`;
  const send = async (content, token = a.token) => (await call('POST', `${path}/messages`, token, { content })).data.message;
  const one = await send('one');
  const two = await send('two');
  console.log('\n--- attachment, timed pin, and bulk chat tests ---');
  for (const [duration, days] of [['24h', 1], ['7d', 7], ['30d', 30]]) {
    const pin = await call('PATCH', `${path}/pinned-message`, a.token, { messageId: one.id, duration });
    check(pin.status === 200 && new Date(pin.data.pinnedMessage.expiresAt) - new Date(pin.data.pinnedMessage.pinnedAt) === days * 86400000, `pin lasts exactly ${duration}`, pin);
    check((await call('GET', path, b.token)).data.chat.pinnedMessage.duration === duration, 'pin expiry visible to the other participant');
  }
  for (const duration of ['forever', '1d', ['7d'], '__proto__']) {
    check((await call('PATCH', `${path}/pinned-message`, a.token, { messageId: two.id, duration })).status === 400, 'invalid pin duration rejected');
  }
  check((await call('PATCH', `${path}/pinned-message`, a.token, {})).status === 400, 'missing messageId cannot accidentally unpin');
  check((await call('PATCH', `${path}/pinned-message`, c.token, { messageId: one.id, duration: '7d' })).status === 403, 'nonmember cannot pin');
  await Conversation.updateOne({ _id: dm }, { $set: { pinnedUntil: new Date(Date.now() - 1) } });
  check((await call('GET', path, a.token)).data.chat.pinnedMessage === null, 'expired pin disappears without deleting its message');
  check((await call('GET', `${path}/messages/${one.id}`, a.token)).data.message.content === 'one', 'pin expiration preserves message');
  await Conversation.updateOne({ _id: dm }, { $set: { pinnedMessage: one.id, pinnedUntil: null, pinnedAt: null } });
  const migrated = (await call('GET', path, a.token)).data.chat.pinnedMessage;
  const repeated = (await call('GET', path, a.token)).data.chat.pinnedMessage;
  check(migrated.duration === '7d' && migrated.expiresAt === repeated.expiresAt, 'legacy pin gets a single non-sliding seven-day expiry');
  await call('PATCH', `${path}/pinned-message`, a.token, { messageId: null });
  check((await Conversation.findById(dm)).pinnedUntil === null, 'unpin clears expiry metadata');

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  async function upload(kind, mime, filename, bytes, extra = {}) {
    const form = new FormData();
    if (kind) form.append('kind', kind);
    form.append('media', new Blob([bytes], { type: mime }), filename);
    for (const [key, value] of Object.entries(extra)) form.append(key, value);
    return call('POST', `${path}/messages`, a.token, form);
  }
  const sticker = await upload('sticker', 'image/png', 'sticker.png', png);
  check(sticker.status === 201 && sticker.data.message.kind === 'sticker' && sticker.data.message.media.resourceType === 'image', 'sticker upload creates a sticker message', sticker);
  check((await upload('sticker', 'application/pdf', 'fake.pdf', 'fake')).status === 400, 'non-image sticker rejected');
  check((await upload('audio', 'image/png', 'fake.png', png)).status === 400, 'declared kind cannot disguise media type');
  check((await call('POST', `${path}/messages`, a.token, { kind: 'sticker', content: 'no upload' })).status === 400, 'sticker requires media');
  const audio = await upload('audio', 'audio/mp4', 'voice.m4a', 'test adapter audio bytes', { waveform: '[0,0.4,1]', replyTo: one.id });
  check(audio.status === 201 && audio.data.message.kind === 'audio' && audio.data.message.media.durationSeconds > 0 && audio.data.message.media.waveform.length === 3 && audio.data.message.replyTo.id === one.id, 'voice note returns duration, waveform, and reply target', audio);
  check((await upload('audio', 'audio/mp4', 'voice.m4a', 'bytes', { waveform: '[2]' })).status === 400, 'out-of-range waveform rejected');
  check((await upload('audio', 'audio/mp4', 'voice.m4a', 'bytes', { waveform: 'invalid JSON' })).status === 400, 'malformed waveform rejected');
  const video = await upload('video', 'video/mp4', 'clip.mp4', 'test adapter video bytes');
  check(video.status === 201 && video.data.message.kind === 'video' && video.data.message.media.resourceType === 'video' && video.data.message.media.durationSeconds > 0, 'chat video stored as video with duration', video);
  const MB = 1024 * 1024;
  for (const [kind, mime, maximum] of [['sticker', 'image/png', MB], ['audio', 'audio/mp4', 10 * MB], ['video', 'video/mp4', 50 * MB], ['file', 'application/pdf', 10 * MB]]) {
    check(!validateChatMedia({ mimetype: mime, size: maximum }, { kind }).error, `${kind} accepts size boundary`);
    check(validateChatMedia({ mimetype: mime, size: maximum + 1 }, { kind }).status === 413, `${kind} rejects oversize`);
  }
  check((await upload('sticker', 'image/png', 'large.png', Buffer.alloc(MB + 1))).status === 413, 'sticker size limit enforced through HTTP');

  const old = await send('old');
  // createdAt is immutable through Mongoose; backdate this disposable fixture directly.
  await Message.collection.updateOne({ _id: new (require('mongoose').Types.ObjectId)(old.id) }, { $set: { createdAt: new Date(Date.now() - 6 * 60000) } });
  const other = await send('not mine', b.token);
  const pinTarget = await send('delete pinned');
  await call('PATCH', `${path}/pinned-message`, a.token, { messageId: pinTarget.id, duration: '24h' });
  const batchDelete = await call('POST', `${path}/messages/bulk-delete`, a.token, { messageIds: [pinTarget.id, other.id, old.id, pinTarget.id], scope: 'everyone' });
  check(batchDelete.status === 207 && batchDelete.data.summary.succeeded === 1 && batchDelete.data.summary.failed === 2 && batchDelete.data.results.length === 3, 'bulk delete reports mixed eligibility and deduplicates IDs', batchDelete);
  check((await call('GET', path, a.token)).data.chat.pinnedMessage === null && (await Conversation.findById(dm)).pinnedUntil === null, 'bulk delete for everyone clears pin metadata');
  check((await Message.findById(other.id)).deletedForEveryone === false && (await Message.findById(old.id)).deletedForEveryone === false, 'ineligible bulk-delete messages remain intact');
  const hide = await call('POST', `${path}/messages/bulk-delete`, a.token, { messageIds: [other.id, old.id], scope: 'me' });
  check(hide.status === 200 && hide.data.summary.succeeded === 2, 'bulk delete for me works for old and received messages');
  check((await call('GET', `${path}/messages/${other.id}`, b.token)).status === 200 && (await call('GET', `${path}/messages/${other.id}`, a.token)).status === 404, 'bulk delete for me preserves other viewer access');
  check((await call('POST', `${path}/messages/bulk-delete`, c.token, { messageIds: [one.id] })).status === 403, 'bulk delete requires source membership');
  for (const messageIds of [[], ['bad-id'], Array(51).fill(one.id)]) {
    check((await call('POST', `${path}/messages/bulk-delete`, a.token, { messageIds })).status === 400, 'invalid bulk selection rejected');
  }

  const sourceIds = [one.id, two.id, sticker.data.message.id, audio.data.message.id, video.data.message.id];
  const targetDm = (await call('POST', '/api/chats/dm', a.token, { username: c.username })).data.chat.id;
  const countBefore = await Message.countDocuments({ conversation: targetDm });
  const forwarded = await call('POST', `${path}/messages/bulk-forward`, a.token, { messageIds: sourceIds.slice().reverse(), targets: [{ targetUsername: c.username }, { targetConversationId: targetDm }] });
  check(forwarded.status === 200 && forwarded.data.summary.succeeded === 5 && forwarded.data.results.length === 5, 'bulk forward deduplicates recipients and sends each selected message', forwarded);
  const copies = await Message.find({ conversation: targetDm }).sort({ createdAt: 1, _id: 1 });
  check(copies.length === countBefore + 5 && copies[0].content === 'one' && copies[1].content === 'two', 'bulk forwarding preserves chronological order');
  check(copies.some((m) => m.kind === 'sticker') && copies.some((m) => m.kind === 'video') && copies.find((m) => m.kind === 'audio').media.waveform.length === 3, 'forward preserves sticker/video/audio metadata');
  const unavailable = await call('POST', `${path}/messages/bulk-forward`, a.token, { messageIds: [one.id, old.id], targetUsername: c.username });
  check(unavailable.status === 404 && await Message.countDocuments({ conversation: targetDm }) === countBefore + 5, 'unavailable selected source rejects before sending any copy');
  const mixedTargets = await call('POST', `${path}/messages/bulk-forward`, a.token, { messageIds: [one.id], targets: [{ targetConversationId: targetDm }, { targetUsername: 'missing_person' }] });
  check(mixedTargets.status === 404 && await Message.countDocuments({ conversation: targetDm }) === countBefore + 5, 'invalid destination rejects entire preflight without sends');
  await User.updateOne({ _id: c.id }, { $set: { 'privacy.allowDirectMessages': false } });
  check((await call('POST', `${path}/messages/bulk-forward`, a.token, { messageIds: [one.id], targetConversationId: targetDm })).status === 403, 'bulk forward respects recipient privacy');
  await User.updateOne({ _id: c.id }, { $set: { 'privacy.allowDirectMessages': true } });
  const multiple = await call('POST', `${path}/messages/bulk-forward`, a.token, { messageIds: [one.id, two.id], targets: [{ targetConversationId: targetDm }, { targetConversationId: dm }] });
  check(multiple.status === 200 && multiple.data.summary.succeeded === 4, 'two selected messages can be forwarded to two chats', multiple);
  const cross = await call('POST', `${path}/messages/bulk-delete`, a.token, { messageIds: [copies[0].id] });
  check(cross.status === 207 && cross.data.results[0].status === 404, 'bulk delete cannot target a message in another conversation');
  const single = await call('POST', `${path}/messages/${sticker.data.message.id}/forward`, a.token, { targetUsername: c.username });
  check(single.status === 201 && single.data.message.kind === 'sticker', 'existing single forward still handles stickers');
  return { pass, fail };
}

module.exports = { run };
