/**
 * Hook 3: the call layer. CosQuest calls (src/models/Call.js) start in a DM
 * and can grow into group calls; callController.broadcastCallUpdate() runs on
 * every change, and calls sync() here, which mirrors the call into the
 * module's sparks_calls row:
 *   answered (status accepted)   -> onCallStarted (scribe job for the attendees' phones)
 *   who is in the call changed   -> onCallMembership
 *   finished                     -> onCallEnded (the outline starts after the grace window)
 * Transcription itself is phone-side (consent + segments on the `sparks`
 * channel); nothing here touches LiveKit.
 */
const host = require('./index');
const members = require('./members');

const TERMINAL = ['declined', 'missed', 'cancelled', 'ended'];
const queues = new Map();

const idOf = (v) => String(v?._id || v);

async function syncNow(call) {
  const store = host.store;
  const backend = host.backend;
  const callId = idOf(call);
  const chatId = idOf(call.conversation);
  const joined = (call.members || []).filter((m) => m.status === 'joined').map((m) => idOf(m.user));
  const finished = TERMINAL.includes(call.status);
  const existing = await store.getCall(callId);

  if (!existing) {
    if (finished || call.status !== 'accepted') return;
    const row = {
      callId, chatId, startedAt: new Date(call.answeredAt || Date.now()).getTime(), endedAt: null,
      startedBy: idOf(call.caller), status: 'active', attendees: joined, everAttended: joined,
    };
    if (await store.insertCall(row)) await backend.onCallStarted(row);
    return;
  }
  if (existing.status !== 'active') return;
  if (finished) {
    await backend.onCallEnded(callId);
    return;
  }
  const same = existing.attendees.length === joined.length && joined.every((u) => existing.attendees.includes(u));
  if (!same) await backend.onCallMembership(callId, joined);
}

/** Fire-and-forget from broadcastCallUpdate. Never rejects. */
function sync(call) {
  if (!host.isModule() || !host.isReady() || !call) return Promise.resolve();
  const key = idOf(call);
  const run = (queues.get(key) || Promise.resolve()).then(() => syncNow(call));
  const tail = run.catch((error) => console.warn('[sparks] call sync failed:', error.message));
  queues.set(key, tail);
  tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return tail;
}

// GET /api/calls/:callId/outline - the post-call outline (OPEN_QUESTIONS Q9
// reference rule: people who were on the call, and the chat's admins).
async function getOutline(req, res) {
  if (!host.isModule() || !host.isReady()) return res.status(503).json({ error: 'Sparks are unavailable right now.' });
  const call = await host.store.getCall(String(req.params.callId));
  if (!call) return res.status(404).json({ error: 'No outline for this call.' });
  if (!call.everAttended.includes(String(req.userId)) && !(await members.isAdmin(String(req.userId), call.chatId))) {
    return res.status(403).json({ error: 'Only people who were on the call can read its outline.' });
  }
  return res.json((await host.store.getOutline(call.callId)) || { status: 'pending', outline: null });
}

module.exports = { sync, getOutline };
