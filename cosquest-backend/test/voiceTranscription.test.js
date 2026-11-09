const assert = require('node:assert/strict');
const { test } = require('node:test');
const mongoose = require('mongoose');
const { transcribeAudio } = require('../src/utils/transcribeAudio');
const Message = require('../src/models/Message');
const Conversation = require('../src/models/Conversation');
const ConversationMember = require('../src/models/ConversationMember');
const MessageReaction = require('../src/models/MessageReaction');
const imageHost = require('../src/utils/imageHost');
const socket = require('../src/realtime/socket');

const audioUrl = 'https://example.com/voice.m4a';

function configureKey(t) {
  const previous = process.env.DEEPGRAM_API_KEY;
  process.env.DEEPGRAM_API_KEY = 'test-only-key';
  t.after(() => {
    if (previous === undefined) delete process.env.DEEPGRAM_API_KEY;
    else process.env.DEEPGRAM_API_KEY = previous;
  });
}

test('Deepgram sends the hosted URL with authentication and trims the transcript', async (t) => {
  configureKey(t);
  t.mock.method(global, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Token test-only-key');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), { url: audioUrl });
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, json: async () => ({ results: { channels: [{ alternatives: [{ transcript: ' Hello there. ' }] }] } }) };
  });
  assert.equal(await transcribeAudio(audioUrl), 'Hello there.');
});

test('Deepgram handles empty results, rejected requests, timeouts, and missing configuration', async (t) => {
  configureKey(t);
  const fetchMock = t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({}) }));
  assert.equal(await transcribeAudio(audioUrl), '');
  fetchMock.mock.mockImplementation(async () => ({ ok: false, status: 401, text: async () => 'Unauthorized' }));
  await assert.rejects(transcribeAudio(audioUrl), /Deepgram request failed \(401\): Unauthorized/);
  fetchMock.mock.mockImplementation(async () => { throw new DOMException('Timed out', 'TimeoutError'); });
  await assert.rejects(transcribeAudio(audioUrl), { name: 'TimeoutError' });
  delete process.env.DEEPGRAM_API_KEY;
  const previousCalls = fetchMock.mock.callCount();
  await assert.rejects(transcribeAudio(audioUrl), /DEEPGRAM_API_KEY is not configured/);
  assert.equal(fetchMock.mock.callCount(), previousCalls);
});

for (const outcome of ['success', 'failure', 'deleted', 'forward']) {
  test(`voice-note background transcription: ${outcome}`, async (t) => {
    configureKey(t);
    const senderId = new mongoose.Types.ObjectId();
    const hiddenUser = new mongoose.Types.ObjectId();
    const hiddenReplyUser = new mongoose.Types.ObjectId();
    const conversation = { _id: new mongoose.Types.ObjectId(), type: 'community' };
    conversation.id = String(conversation._id);
    const media = { url: audioUrl, publicId: 'voice', resourceType: 'video' };
    let finishRequest;
    const fetchMock = t.mock.method(global, 'fetch', () => new Promise((resolve, reject) => {
      finishRequest = () => outcome === 'failure'
        ? reject(new Error('Deepgram unavailable'))
        : resolve({ ok: true, json: async () => ({ results: { channels: [{ alternatives: [{ transcript: ' Hello. ' }] }] } }) });
    }));
    t.mock.method(console, 'error', () => {});
    t.mock.method(imageHost, 'storeChatMedia', async () => ({ ...media }));
    t.mock.method(Conversation, 'findById', async () => conversation);
    t.mock.method(Conversation, 'updateOne', async () => ({}));
    t.mock.method(ConversationMember, 'updateOne', async () => ({}));
    const events = [];
    t.mock.method(socket, 'emitToConversationExcept', (...args) => events.push(args));
    t.mock.method(socket, 'emitToConversation', (...args) => events.push(args));
    t.mock.method(MessageReaction, 'find', () => ({ select: async () => [{ emoji: '👍', user: hiddenReplyUser }] }));

    let saved;
    t.mock.method(Message, 'create', async (data) => {
      saved = new Message(data);
      saved.createdAt = new Date();
      saved.populate = async () => saved;
      return saved;
    });
    let updated;
    t.mock.method(Message, 'findOneAndUpdate', async (filter, update, options) => {
      assert.equal(String(filter._id), String(saved._id));
      assert.equal(filter['media.url'], audioUrl);
      assert.equal(filter.kind, 'audio');
      assert.equal(options.new, true);
      assert.deepEqual(Object.keys(update.$set).sort(), ['media.transcribing', 'media.transcript']);
      // Model an intervening edit and hidden reply, which must survive completion.
      updated = {
        ...saved.toObject(), sender: senderId, content: 'Edited during transcription',
        deletedForEveryone: outcome === 'deleted', deletedFor: [hiddenUser],
        replyTo: { _id: new mongoose.Types.ObjectId(), content: 'Reply text', deletedFor: [hiddenReplyUser] },
        media: { ...media, transcript: update.$set['media.transcript'], transcribing: update.$set['media.transcribing'] },
        async populate() { return this; },
      };
      return updated;
    });

    // Load after replacing the destructured upload/socket functions.
    const controllerPath = require.resolve('../src/controllers/chatController');
    delete require.cache[controllerPath];
    t.after(() => { delete require.cache[controllerPath]; });
    const controller = require(controllerPath);
    const req = {
      params: { conversationId: conversation.id }, user: { _id: senderId }, userId: senderId,
      body: { kind: 'audio' }, file: { mimetype: 'audio/mp4', size: 100 },
    };
    const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    if (outcome === 'forward') {
      const original = new Message({ conversation: conversation._id, sender: senderId, kind: 'audio', media: { ...media, transcribing: true } });
      t.mock.method(Message, 'findById', async () => original);
      req.params.messageId = String(original._id);
      req.body = { targetConversationId: conversation.id };
      await controller.forwardMessage(req, res);
    } else {
      await controller.createMessage(req, res);
    }
    assert.equal(res.code, 201);
    assert.equal(res.body.message.media.transcribing, true);
    assert.equal(res.body.message.media.transcript, null);
    assert.equal(updated, undefined, 'send completes before transcription');
    assert.equal(fetchMock.mock.callCount(), 1);

    finishRequest();
    await new Promise(setImmediate);
    assert.equal(updated.media.transcribing, false);
    assert.equal(updated.media.transcript, outcome === 'failure' ? null : 'Hello.');
    const edited = events.filter((event) => event[2] === 'message:edited');
    if (outcome === 'deleted') {
      assert.equal(edited.length, 0, 'deleted messages are not broadcast again');
    } else {
      assert.equal(edited.length, 1);
      assert.deepEqual(edited[0][1].sort(), [String(hiddenUser), String(hiddenReplyUser)].sort());
      assert.equal(edited[0][3].message.content, 'Edited during transcription');
      assert.deepEqual(edited[0][3].message.reactions, [{ emoji: '👍', userId: String(hiddenReplyUser) }]);
    }
  });
}
