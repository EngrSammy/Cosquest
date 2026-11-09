/**
 * A mock-SDK phone for tests and the smoke script: a Socket.IO client logged
 * in as one CosQuest user, speaking the real Sparks wire protocol on the
 * `sparks` event (device.register, heartbeats, hints, job ack/result) with
 * real HPKE (X25519 / HKDF-SHA256 / AES-256-GCM) to open the job inputs the
 * backend seals to it. The "AI" is a deterministic keyword stand-in, so the
 * tests prove the plumbing, not the model.
 *
 * Same idea as cosquest-sparks apps/simulator/src/phone.ts, over Socket.IO
 * instead of the demo host's WebSocket frames, and without the SDK package
 * (which is React Native).
 */
const { randomUUID } = require('crypto');
const { io } = require('socket.io-client');

const STOP = new Set('the and for are you was with this that have will what when who our can its just about from they them then than there here into also very really sure lets yes yeah okay hey'.split(' '));
const tokens = (text) =>
  String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w))
    .filter((w) => w.length >= 4 && !STOP.has(w));
const title = (w) => w.charAt(0).toUpperCase() + w.slice(1);

let hpke = null;
async function suite() {
  if (!hpke) {
    const { CipherSuite, HkdfSha256, Aes256Gcm } = await import('@hpke/core');
    const { DhkemX25519HkdfSha256 } = await import('@hpke/dhkem-x25519');
    hpke = new CipherSuite({ kem: new DhkemX25519HkdfSha256(), kdf: new HkdfSha256(), aead: new Aes256Gcm() });
  }
  return hpke;
}
const b64url = (buf) => Buffer.from(new Uint8Array(buf)).toString('base64url');
const unb64url = (s) => {
  const b = Buffer.from(s, 'base64url');
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

// ---------------- the fake model ----------------

function detect(input) {
  const none = { type: 'spark.detect', verdict: 'none', subject: null, sparkId: null, memberMessageIds: [], confidence: 0.3 };
  const freq = new Map();
  for (const m of input.window) for (const w of new Set(tokens(m.text))) freq.set(w, [...(freq.get(w) || []), m]);
  const ranked = [...freq.entries()]
    .filter(([, ms]) => ms.length >= 3 && new Set(ms.map((m) => m.senderId)).size >= 2)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  if (!ranked.length) return none;
  const [word, msgs] = ranked[0];
  const ids = msgs.map((m) => m.messageId);
  const match = input.catalog.find((c) => tokens(c.subject).includes(word));
  if (match) return { type: 'spark.detect', verdict: match.state === 'active' ? 'attach' : 'revive', subject: null, sparkId: match.sparkId, memberMessageIds: ids, confidence: 0.9 };
  const second = ranked.find(([w, ms]) => w !== word && ms.filter((m) => ids.includes(m.messageId)).length >= 2);
  return { type: 'spark.detect', verdict: 'new', subject: [title(word), second ? second[0] : ''].join(' ').trim(), sparkId: null, memberMessageIds: ids, confidence: 0.9 };
}

function bestActive(text, active) {
  const words = tokens(text);
  const hit = active.find((a) => tokens(a.subject).some((w) => words.includes(w)));
  return hit ? { sparkId: hit.sparkId, score: 1 } : { sparkId: null, score: 0 };
}

function runJob(input) {
  switch (input.type) {
    case 'spark.detect':
      return detect(input);
    case 'spark.assign':
      return { type: 'spark.assign', assignments: input.messages.map((m) => ({ messageId: m.messageId, ...bestActive(m.text, input.active) })) };
    case 'spark.summarize': {
      const basedOnSeq = Math.max(...input.messages.map((m) => m.seq));
      const people = new Set(input.messages.map((m) => m.senderId)).size;
      return { type: 'spark.summarize', summary: `${people} people are talking about ${input.subject.toLowerCase()} (${input.messages.length} messages).`, basedOnSeq };
    }
    case 'spark.rolepings':
      return { type: 'spark.rolepings', pings: [] };
    default:
      return null; // call jobs: not simulated here (released)
  }
}

// ---------------- the phone ----------------

/**
 * connectPhone(baseUrl, { userId, token, tier })
 * tier 'full' = model loaded, takes jobs and sends hints; 'none' = no model
 * (still registers, still receives Spark events, never works).
 */
async function connectPhone(baseUrl, { userId, token, tier = 'full', deviceId = `dev_${randomUUID().slice(0, 12)}`, log = () => {} }) {
  const cs = await suite();
  const keys = await cs.kem.generateKeyPair();
  const publicKey = b64url(await cs.kem.serializePublicKey(keys.publicKey));
  const kid = `k_${randomUUID().slice(0, 8)}`;
  const hasModel = tier !== 'none';

  const socket = io(baseUrl, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });

  const frames = []; // every inbound `sparks` envelope
  const legacy = []; // the app's old socket events: spark:updated / spark:messages / spark:deleted
  const sparks = new Map(); // sparkId -> latest Spark (wire shape), from spark.event / spark.snapshot
  const results = []; // { jobId, type, verdict }
  const waiters = new Set();
  const notify = () => {
    for (const w of [...waiters]) w();
  };

  const envelope = (type, payload) => ({ v: 1, type, id: randomUUID(), ts: new Date().toISOString(), payload });
  const send = (type, payload) => socket.timeout(10_000).emitWithAck('sparks', envelope(type, payload));

  async function open(sealed, kind, id) {
    const pt = await cs.open(
      { recipientKey: keys, enc: unb64url(sealed.enc), info: new TextEncoder().encode(`cosquest-sparks/v1/${kind}`) },
      unb64url(sealed.ct),
      new TextEncoder().encode(`${id}|${deviceId}`)
    );
    return JSON.parse(new TextDecoder().decode(pt));
  }

  async function onOffer(p) {
    let input;
    try {
      input = await open(p.input, 'job.offer', p.jobId);
    } catch (error) {
      await send('job.ack', { jobId: p.jobId, leaseToken: p.leaseToken, accepted: false, reason: 'decrypt_failed' });
      return;
    }
    await send('job.ack', { jobId: p.jobId, leaseToken: p.leaseToken, accepted: true });
    const output = runJob(input);
    if (!output) {
      await send('job.release', { jobId: p.jobId, leaseToken: p.leaseToken, reason: 'error' });
      return;
    }
    log(`job ${p.type} -> ${output.verdict || 'ok'}${output.subject ? ` "${output.subject}"` : ''}`);
    results.push({ jobId: p.jobId, type: p.type, output });
    await send('job.result', {
      jobId: p.jobId, leaseToken: p.leaseToken, type: p.type, idempotencyKey: p.idempotencyKey, output,
      metrics: { wallMs: 5, tokensIn: 100, tokensOut: 20, modelVersion: 'mock-1', tier },
    });
  }

  socket.on('sparks', (msg) => {
    frames.push(msg);
    if (msg.type === 'job.offer') onOffer(msg.payload).catch((e) => log(`offer failed: ${e.message}`));
    if (msg.type === 'spark.event') sparks.set(msg.payload.spark.sparkId, msg.payload.spark);
    if (msg.type === 'spark.snapshot') for (const s of msg.payload.sparks) sparks.set(s.sparkId, s);
    if (msg.type === 'spark.event' && ['deleted', 'merged'].includes(msg.payload.kind)) sparks.delete(msg.payload.spark.sparkId);
    notify();
  });
  for (const ev of ['spark:updated', 'spark:messages', 'spark:deleted']) {
    socket.on(ev, (payload) => {
      legacy.push({ event: ev, payload });
      notify();
    });
  }

  function until(pred, timeoutMs = 8000, what = 'condition') {
    return new Promise((resolve, reject) => {
      const check = () => {
        const v = pred();
        if (v) {
          waiters.delete(check);
          clearTimeout(timer);
          resolve(v);
        }
      };
      const timer = setTimeout(() => {
        waiters.delete(check);
        reject(new Error(`timed out waiting for ${what}`));
      }, timeoutMs);
      waiters.add(check);
      check();
    });
  }

  async function heartbeat() {
    return send('device.heartbeat', {
      deviceId, foreground: true, gameState: 'idle', modelLoaded: hasModel, batteryLevel: 0.9, charging: true,
      lowPowerMode: false, thermal: 'nominal', activeJobIds: [], available: hasModel,
    });
  }

  const registerAck = await send('device.register', {
    deviceId, userId, sessionId: `s_${randomUUID().slice(0, 8)}`, platform: 'ios', osVersion: '18.0', appVersion: '1.0.0',
    sdkVersion: '1.2.0-mock', tier, modelVersion: hasModel ? 'mock-1' : null, transcription: false, publicKey, kid,
  });
  const registered = registerAck?.ok ? await until(() => frames.find((f) => f.type === 'device.registered'), 5000, 'device.registered') : null;
  if (registered) await heartbeat();
  const beat = setInterval(() => heartbeat().catch(() => {}), 2000);

  return {
    userId, deviceId, socket, frames, legacy, sparks, results, registerAck, registered, until, send, heartbeat,
    /** Join the app's conversation room (to receive the old spark:* events too). */
    join: (conversationId) => socket.timeout(5000).emitWithAck('conversation:join', conversationId),
    /** The author's own hint for a message it just sent (SDK 1.2 'model' method). */
    hint(message, chatId) {
      if (!hasModel) return Promise.resolve();
      const active = [...sparks.values()].filter((s) => s.chatId === chatId && s.state === 'active');
      const pick = bestActive(message.content, active);
      return send('message.spark_hint', { chatId, messageId: message.id, seq: message.seq, sparkId: pick.sparkId, score: pick.score, method: 'model' });
    },
    close() {
      clearInterval(beat);
      socket.close();
    },
  };
}

module.exports = { connectPhone, tokens };
