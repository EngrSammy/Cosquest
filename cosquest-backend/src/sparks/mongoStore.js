/**
 * MongoSparksStore: every SparksStore method of @cosquest/sparks-backend
 * (dist/ports.d.ts), on MongoDB. A port of the module's SQLite reference
 * store (cosquest-sparks apps/backend-reference/src/host/store.ts).
 *
 * - Sparks' own state lives in collections prefixed `sparks_` (devices,
 *   outcomes, sparks, sessions, seams, pings, jobs, calls, segments, topics,
 *   outlines, consents). Rows are stored as plain documents with the row's
 *   fields (ms timestamps stay numbers) and `_id` = the row's key, through the
 *   native driver (no Mongoose casting, so a row comes back exactly as the
 *   module wrote it).
 * - Messages are THEIR `messages` collection (Message model): seq, sparkId,
 *   sparkRevivalIndex, postedInSpark and sparkHintState are fields on it.
 * - The two atomic methods: insertJob relies on the unique index on
 *   idempotencyKey (E11000 -> return the stored row); updateJob is one
 *   conditional updateOne whose filter carries the `where` clause, null-safe
 *   (a `where` value of null matches null or a missing field, like SQL
 *   IS NOT DISTINCT FROM).
 */
const mongoose = require('mongoose');
const Message = require('../models/Message');
const { toMessageRow } = require('./messageRow');

const OPEN = ['pending', 'offered', 'leased'];
const TERMINAL = ['done', 'failed', 'fallback', 'cancelled'];
const DAY = 86_400_000;

const NAMES = {
  devices: 'sparks_devices',
  outcomes: 'sparks_outcomes',
  sparks: 'sparks_sparks',
  sessions: 'sparks_sessions',
  seams: 'sparks_seams',
  pings: 'sparks_pings',
  jobs: 'sparks_jobs',
  calls: 'sparks_calls',
  segments: 'sparks_segments',
  topics: 'sparks_topics',
  outlines: 'sparks_outlines',
  consents: 'sparks_consents',
};

function strip(doc, extra = []) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  for (const k of extra) delete rest[k];
  return rest;
}

// The driver would store `undefined` as null; a patch means "leave it".
function defined(patch) {
  const out = {};
  for (const [k, v] of Object.entries(patch || {})) if (v !== undefined) out[k] = v;
  return out;
}

function oid(id) {
  return mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(String(id)) : null;
}

class MongoSparksStore {
  constructor(connection = mongoose.connection) {
    this.c = {};
    for (const [key, name] of Object.entries(NAMES)) this.c[key] = connection.collection(name);
    this.messages = Message.collection;
  }

  /** Creates every index the module's queries need. Idempotent; call once at startup. */
  async ensureIndexes() {
    const { c } = this;
    await Promise.all([
      c.devices.createIndex({ userId: 1 }),
      c.outcomes.createIndex({ deviceId: 1, at: 1 }),
      // Outcomes only matter for the last hour (worker scoring).
      c.outcomes.createIndex({ createdAt: 1 }, { expireAfterSeconds: 2 * 86400 }),
      c.sparks.createIndex({ chatId: 1, lastMessageAt: -1 }),
      c.sparks.createIndex({ state: 1 }),
      c.sessions.createIndex({ sparkId: 1, sessionIndex: 1 }),
      c.seams.createIndex({ sparkId: 1, addedAt: 1 }),
      c.jobs.createIndex({ idempotencyKey: 1 }, { unique: true }),
      c.jobs.createIndex({ status: 1, createdAt: 1 }),
      c.jobs.createIndex({ type: 1, scopeId: 1, status: 1 }),
      c.jobs.createIndex({ callId: 1, type: 1 }),
      // Finished jobs (input already cleared) are kept a week for debugging.
      c.jobs.createIndex({ endedAt: 1 }, { expireAfterSeconds: 7 * 86400 }),
      c.calls.createIndex({ status: 1 }),
      c.segments.createIndex({ callId: 1, startMs: 1 }),
      c.topics.createIndex({ callId: 1, idx: 1 }),
      c.consents.createIndex({ userId: 1, decidedAt: -1 }),
      Message.createIndexes(),
    ]);
  }

  /** Test helper: drops every sparks_ row (never touches messages). */
  async reset() {
    await Promise.all(Object.values(this.c).map((col) => col.deleteMany({})));
  }

  // ---------- devices ----------

  async upsertDevice(d) {
    await this.c.devices.replaceOne({ _id: d.deviceId }, { _id: d.deviceId, ...defined(d) }, { upsert: true });
  }
  async getDevice(deviceId) {
    return strip(await this.c.devices.findOne({ _id: deviceId }));
  }
  async devicesOfUsers(userIds) {
    if (!userIds?.length) return [];
    return (await this.c.devices.find({ userId: { $in: userIds } }).toArray()).map((d) => strip(d));
  }
  async patchDevice(deviceId, patch) {
    const set = defined(patch);
    delete set.deviceId;
    if (Object.keys(set).length) await this.c.devices.updateOne({ _id: deviceId }, { $set: set });
  }
  async recordOutcome(deviceId, jobId, outcome, at) {
    await this.c.outcomes.insertOne({ deviceId, jobId, outcome, at, createdAt: new Date() });
  }
  async outcomeCounts(deviceId, sinceMs) {
    const rows = await this.c.outcomes
      .aggregate([{ $match: { deviceId, at: { $gte: sinceMs } } }, { $group: { _id: '$outcome', n: { $sum: 1 } } }])
      .toArray();
    const n = (k) => rows.find((r) => r._id === k)?.n || 0;
    return { done: n('done'), failed: n('failed') };
  }

  // ---------- messages (their Message collection) ----------

  async getMessage(messageId) {
    const _id = oid(messageId);
    return _id ? toMessageRow(await this.messages.findOne({ _id })) : null;
  }
  async messagesInChat(chatId, q) {
    const conversation = oid(chatId);
    if (!conversation) return [];
    const docs = await this.messages
      .find({ conversation, seq: { $gt: q.sinceSeq ?? -1, $lt: q.beforeSeq ?? Number.MAX_SAFE_INTEGER } })
      .sort({ seq: q.newestFirst ? -1 : 1 })
      .limit(q.limit)
      .toArray();
    return docs.map(toMessageRow);
  }
  async unassignedSince(chatId, sinceMs) {
    const conversation = oid(chatId);
    if (!conversation) return [];
    const docs = await this.messages
      .find({ conversation, sparkId: null, createdAt: { $gte: new Date(sinceMs) }, seq: { $type: 'number' } })
      .sort({ seq: 1 })
      .toArray();
    return docs.map(toMessageRow).filter((m) => !m.deleted && m.kind !== 'system');
  }
  async messagesOfSpark(sparkId, sinceSeq) {
    const docs = await this.messages.find({ sparkId, seq: { $gt: sinceSeq ?? -1 } }).sort({ seq: 1 }).toArray();
    return docs.map(toMessageRow);
  }
  async setMessagesSpark(messageIds, sparkId, revivalIndex) {
    const ids = messageIds.map(oid).filter(Boolean);
    if (!ids.length) return;
    const update = sparkId === null
      // Leaving a Spark (deleted): back in the main chat, unmarked.
      ? { $set: { sparkId: null, postedInSpark: false }, $unset: { sparkRevivalIndex: '' } }
      : revivalIndex === null
        ? { $set: { sparkId }, $unset: { sparkRevivalIndex: '' } }
        : { $set: { sparkId, sparkRevivalIndex: revivalIndex } };
    await this.messages.updateMany({ _id: { $in: ids } }, update);
  }
  async setHintState(messageId, state) {
    const _id = oid(messageId);
    if (_id) await this.messages.updateOne({ _id }, { $set: { sparkHintState: state } });
  }
  async recentSenders(chatId, sinceMs) {
    const conversation = oid(chatId);
    if (!conversation) return [];
    const ids = await this.messages.distinct('sender', { conversation, createdAt: { $gte: new Date(sinceMs) } });
    return ids.map(String);
  }

  // ---------- sparks ----------

  async insertSpark(s) {
    await this.c.sparks.insertOne({ _id: s.sparkId, ...defined(s) });
  }
  async getSpark(sparkId) {
    if (typeof sparkId !== 'string') return null;
    return strip(await this.c.sparks.findOne({ _id: sparkId }));
  }
  async patchSpark(sparkId, patch) {
    const set = defined(patch);
    delete set.version;
    delete set.sparkId;
    const update = Object.keys(set).length ? { $set: set, $inc: { version: 1 } } : { $inc: { version: 1 } };
    const doc = await this.c.sparks.findOneAndUpdate({ _id: sparkId }, update, { returnDocument: 'after', includeResultMetadata: false });
    if (!doc) throw new Error(`spark ${sparkId} not found`);
    return strip(doc);
  }
  async sparksOfChat(chatId, limit = 1000) {
    return (await this.c.sparks.find({ chatId }).sort({ lastMessageAt: -1 }).limit(limit).toArray()).map((d) => strip(d));
  }
  async activeSparks() {
    return (await this.c.sparks.find({ state: 'active' }).toArray()).map((d) => strip(d));
  }
  async sessions(sparkId) {
    return (await this.c.sessions.find({ sparkId }).sort({ sessionIndex: 1 }).toArray()).map((d) => strip(d));
  }
  async addSession(s) {
    const _id = `${s.sparkId}:${s.sessionIndex}`;
    await this.c.sessions.replaceOne({ _id }, { _id, sparkId: s.sparkId, sessionIndex: s.sessionIndex, startedAt: s.startedAt, endedAt: s.endedAt ?? null }, { upsert: true });
  }
  async closeSession(sparkId, sessionIndex, endedAt) {
    await this.c.sessions.updateOne({ _id: `${sparkId}:${sessionIndex}` }, { $set: { endedAt } });
  }
  async seams(sparkId) {
    return (await this.c.seams.find({ sparkId }).sort({ addedAt: 1, _id: 1 }).toArray()).map((d) => strip(d, ['addedAt']));
  }
  async addSeam(s) {
    // Stored once, never recomputed (stable history): insert-or-ignore.
    const _id = `${s.sparkId}:${s.beforeMessageId}`;
    await this.c.seams.updateOne(
      { _id },
      { $setOnInsert: { sparkId: s.sparkId, beforeMessageId: s.beforeMessageId, gapMs: s.gapMs, kind: s.kind, label: s.label ?? null, addedAt: Date.now() } },
      { upsert: true }
    );
  }
  async hasPing(sparkId, revivalIndex, role) {
    return Boolean(await this.c.pings.findOne({ _id: `${sparkId}:${revivalIndex}:${role}` }, { projection: { _id: 1 } }));
  }
  async addPing(sparkId, revivalIndex, role, userIds) {
    await this.c.pings.updateOne(
      { _id: `${sparkId}:${revivalIndex}:${role}` },
      { $setOnInsert: { sparkId, revivalIndex, role, userIds } },
      { upsert: true }
    );
  }

  // ---------- jobs ----------

  /** Inserts unless the idempotency key exists; returns the stored row either way. */
  async insertJob(j) {
    try {
      await this.c.jobs.insertOne({ _id: j.jobId, ...defined(j) });
      return j;
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const existing = await this.c.jobs.findOne({ idempotencyKey: j.idempotencyKey });
      if (existing) return strip(existing, ['endedAt']);
      throw error; // a jobId collision, not an idempotency hit
    }
  }
  async getJob(jobId) {
    return strip(await this.c.jobs.findOne({ _id: jobId }), ['endedAt']);
  }
  /** The leasing primitive: one atomic conditional update. True when `where` matched. */
  async updateJob(jobId, patch, where) {
    const filter = { _id: jobId };
    for (const [k, v] of Object.entries(where || {})) {
      if (v === undefined) continue;
      filter[k] = v === null ? null : v; // { k: null } matches null or missing
    }
    const set = defined(patch);
    delete set.jobId;
    if (TERMINAL.includes(set.status)) set.endedAt = new Date();
    else if (set.status) set.endedAt = null;
    if (!Object.keys(set).length) return Boolean(await this.c.jobs.countDocuments(filter, { limit: 1 }));
    const r = await this.c.jobs.updateOne(filter, { $set: set });
    return r.matchedCount > 0;
  }
  async jobsByStatus(statuses) {
    return (await this.c.jobs.find({ status: { $in: statuses } }).sort({ createdAt: 1 }).toArray()).map((d) => strip(d, ['endedAt']));
  }
  async openJobs(type, scopeId) {
    return (await this.c.jobs.find({ type, scopeId, status: { $in: OPEN } }).toArray()).map((d) => strip(d, ['endedAt']));
  }
  async jobsOfCall(callId, type) {
    return (await this.c.jobs.find({ callId, type }).sort({ createdAt: 1 }).toArray()).map((d) => strip(d, ['endedAt']));
  }
  async activeJobDeviceIds() {
    const ids = await this.c.jobs.distinct('leaseDeviceId', { status: { $in: ['offered', 'leased'] } });
    return new Set(ids.filter(Boolean));
  }

  // ---------- calls ----------

  /** Host-side (the call layer creates the row, then calls sparks.onCallStarted). */
  async insertCall(c) {
    try {
      await this.c.calls.insertOne({ _id: c.callId, ...defined(c) });
      return true;
    } catch (error) {
      if (error?.code === 11000) return false;
      throw error;
    }
  }
  async getCall(callId) {
    return strip(await this.c.calls.findOne({ _id: callId }));
  }
  async callsByStatus(status) {
    return (await this.c.calls.find({ status }).toArray()).map((d) => strip(d));
  }
  async patchCall(callId, patch) {
    const set = defined(patch);
    delete set.callId;
    if (Object.keys(set).length) await this.c.calls.updateOne({ _id: callId }, { $set: set });
  }
  async insertSegment(s) {
    try {
      await this.c.segments.insertOne({ _id: s.segmentId, ...defined(s) });
      return true;
    } catch (error) {
      if (error?.code === 11000) return false;
      throw error;
    }
  }
  async segments(callId) {
    return (await this.c.segments.find({ callId }).sort({ startMs: 1, receivedAt: 1 }).toArray()).map((d) => strip(d));
  }
  async insertTopic(t) {
    // idx = position in the call's topic list; retry if another insert took it.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const idx = await this.c.topics.countDocuments({ callId: t.callId });
      try {
        await this.c.topics.insertOne({ _id: `${t.callId}:${idx}`, callId: t.callId, idx, topic: t });
        return;
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    }
    throw new Error(`could not store topic for ${t.callId}`);
  }
  async topics(callId) {
    return (await this.c.topics.find({ callId }).sort({ idx: 1 }).toArray()).map((d) => d.topic);
  }
  async saveOutline(callId, outline, status) {
    await this.c.outlines.replaceOne({ _id: callId }, { _id: callId, status, outline: outline ?? null }, { upsert: true });
  }
  async getOutline(callId) {
    const d = await this.c.outlines.findOne({ _id: callId });
    return d ? { status: d.status, outline: d.outline ?? null } : null;
  }
  async addConsent(c) {
    // Append-only consent log; _id (an ObjectId) keeps insertion order for ties.
    await this.c.consents.insertOne({ ...defined(c), callId: c.callId ?? null });
  }
  /** The newest decision that covers this call: one made for it, or a standing ("always") one. */
  async latestConsent(userId, callId) {
    const d = await this.c.consents.find({ userId, $or: [{ callId }, { scope: 'always' }] }).sort({ decidedAt: -1, _id: -1 }).limit(1).next();
    return strip(d);
  }
}

module.exports = { MongoSparksStore, NAMES, DAY };
