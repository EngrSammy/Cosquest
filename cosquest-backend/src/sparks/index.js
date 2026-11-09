/**
 * THE one place the CosQuest backend loads the Sparks module
 * (@cosquest/sparks-backend, an ESM package vendored as a tgz in vendor/).
 * Everything else talks to this file. See SPARKS_INTEGRATION.md.
 *
 *   SPARKS_ENGINE   legacy (default) | module  - module = the real Sparks
 *                   (detection on members' phones via the SDK). Leave it on
 *                   legacy until the Expo app ships the SDK (or the server
 *                   fallback worker runs), then set module. legacy = the old
 *                   keyword engine in src/utils/sparks.js.
 *   SPARKS_WORKER   unset/1: this process runs the sweepers (sparks.start()).
 *                   0: it does not. With several instances, set 0 on all but one.
 *   SPARKS_TIMERS   production (default) | demo (short timers for QA builds)
 *   SPARKS_CONFIG   optional JSON of config overrides, e.g. {"hintWaitMs":5000}
 */
const mongoose = require('mongoose');
const { MongoSparksStore } = require('./mongoStore');
const { createPorts } = require('./ports');
const { toMessageRow } = require('./messageRow');

let mod = null; // the imported ESM module
let backend = null;
let store = null;
let initPromise = null;

function engine() {
  return String(process.env.SPARKS_ENGINE || 'legacy').toLowerCase() === 'module' ? 'module' : 'legacy';
}
const isModule = () => engine() === 'module';
const isReady = () => Boolean(backend);

function log(level, msg, data) {
  if (process.env.NODE_ENV === 'test' && level === 'info' && !process.env.SPARKS_DEBUG) return;
  const line = `[sparks] ${msg}`;
  if (level === 'warn') console.warn(line, data === undefined ? '' : data);
  else console.log(line, data === undefined ? '' : data);
}

function configOverrides() {
  let extra = {};
  if (process.env.SPARKS_CONFIG) {
    try {
      extra = JSON.parse(process.env.SPARKS_CONFIG);
    } catch (error) {
      log('warn', 'SPARKS_CONFIG is not valid JSON - ignored');
    }
  }
  const demo = String(process.env.SPARKS_TIMERS || '').toLowerCase() === 'demo';
  return { ...(demo ? mod.demoOverrides : {}), ...extra };
}

/**
 * Loads the ESM module (dynamic import from CommonJS), builds the store and
 * ports and, on the worker process, starts the sweepers. Call once after
 * Mongo is connected and Socket.IO is up (server.js does). Safe to call
 * twice. Never throws: if the module cannot load, Sparks is off and the
 * reason is logged (chat keeps working).
 */
function init({ getIO }) {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      mod = await import('@cosquest/sparks-backend');
      store = new MongoSparksStore(mongoose.connection);
      await store.ensureIndexes();
      backend = mod.createSparksBackend(createPorts({ getIO, store, log }), configOverrides());
      const worker = process.env.SPARKS_WORKER !== '0';
      if (worker) backend.start();
      const version = require('@cosquest/sparks-backend/package.json').version;
      log('info', `module ${version} ready (engine=${engine()}, sweepers ${worker ? 'on' : 'off'})`);
    } catch (error) {
      backend = null;
      console.error('[sparks] module failed to load - Sparks are off:', error);
    }
    return backend;
  })();
  return initPromise;
}

function stop() {
  backend?.stop();
}

// ---------------------------------------------------------------------------
// Hook 1: the `sparks` socket channel
// ---------------------------------------------------------------------------

/**
 * Wires one authenticated socket (socket.userId set by the handshake) to the
 * module. Frames from one socket are handled in order.
 */
function bindSocket(socket) {
  socket.data.sparksDeviceId = null;
  let chain = Promise.resolve();
  socket.on('sparks', (msg, ack) => {
    chain = chain.then(() => handleFrame(socket, msg, ack)).catch((error) => {
      log('warn', 'sparks frame failed', String(error));
      if (typeof ack === 'function') ack({ error: 'internal' });
    });
  });
}

async function handleFrame(socket, msg, ack) {
  const reply = typeof ack === 'function' ? ack : () => {};
  if (!isModule() || !backend) return reply({ error: 'sparks unavailable' });
  const userId = socket.userId;
  const prev = socket.data.sparksDeviceId;

  // Bind the socket to its device BEFORE the module handles device.register:
  // the module answers device.registered through ports.send(deviceId) inside
  // handle(). Getting this wrong = the phone never hears back.
  let joined = null;
  if (msg?.type === 'device.register' && msg.payload?.userId === userId && typeof msg.payload?.deviceId === 'string') {
    const deviceId = msg.payload.deviceId;
    // A deviceId already registered to ANOTHER account is refused: otherwise
    // this socket would join that device's room (and the module would
    // overwrite the row with this user's key).
    const existing = await store.getDevice(deviceId);
    if (existing && existing.userId !== userId) return reply({ error: 'device belongs to another user' });
    if (deviceId !== prev) {
      socket.join(`sparksdevice:${deviceId}`);
      joined = deviceId;
    }
  }

  const r = await backend.handle({ userId, deviceId: prev }, msg);
  if (joined && r.deviceId !== joined) socket.leave(`sparksdevice:${joined}`); // registration refused
  if (prev && r.deviceId !== prev) socket.leave(`sparksdevice:${prev}`); // re-registered as another device
  socket.data.sparksDeviceId = r.deviceId;
  reply(r.error ? { error: r.error } : { ok: true });
}

// ---------------------------------------------------------------------------
// Hook 2: the message insert path
// ---------------------------------------------------------------------------

const chatQueues = new Map();

/**
 * Call after a message is stored (seq assigned by the Message pre-save hook),
 * for every chat type including DMs. Runs one message at a time per chat.
 * Fire-and-forget safe: never rejects.
 */
function onMessage(message) {
  if (!isModule() || !backend) return Promise.resolve();
  const row = toMessageRow(message.toObject ? message.toObject({ depopulate: true }) : message);
  if (!row) return Promise.resolve();
  if (row.kind === 'system') return Promise.resolve(); // call log entries are not conversation
  const key = row.chatId;
  const run = (chatQueues.get(key) || Promise.resolve()).then(() => backend.onChatMessage(row));
  const tail = run.catch((error) => log('warn', `onChatMessage failed for ${row.messageId}`, String(error)));
  chatQueues.set(key, tail);
  tail.then(() => {
    if (chatQueues.get(key) === tail) chatQueues.delete(key);
  });
  return tail;
}

/**
 * A reply posted inside a Spark's panel (`sparkId` in the send body): the
 * fields to store on the new message, or null if that Spark is gone. A reply
 * into a dormant Spark revives it, so it gets the next revival index.
 */
async function replyFields(conversationId, sparkId) {
  if (!backend || typeof sparkId !== 'string') return null;
  const spark = await store.getSpark(sparkId);
  if (!spark || spark.chatId !== String(conversationId) || spark.state === 'deleted' || spark.state === 'merged') return null;
  return {
    sparkId: spark.sparkId,
    sparkRevivalIndex: spark.state === 'dormant' ? spark.revivalIndex + 1 : spark.revivalIndex,
    postedInSpark: true,
  };
}

// ---------------------------------------------------------------------------
// Manual start / attach for clients without the SDK (REST, web)
// ---------------------------------------------------------------------------

/**
 * "Start a Spark" / "add to this Spark" from the REST API, through the
 * module's own backend.startSpark (module 1.2) - the same rules as
 * spark.create from a phone, checked as `userId`. The caller has already run
 * the duplicate check, so this always creates ('new') or attaches
 * ({ attachTo }). Returns the Spark row the seed message ended up in, or
 * null. Refusals come back as errors carrying a status (400 / 403 / 404).
 */
async function startManual({ userId, chatId, seedMessageId, subject, attachTo = null }) {
  const result = await backend.startSpark({ userId, chatId, seedMessageId, subject, resolution: attachTo ? { attachTo } : 'new' });
  return result.status === 'needs_choice' ? null : store.getSpark(result.spark.sparkId);
}

module.exports = {
  engine,
  isModule,
  isReady,
  init,
  stop,
  bindSocket,
  onMessage,
  replyFields,
  startManual,
  get backend() {
    return backend;
  },
  get store() {
    return store;
  },
};
