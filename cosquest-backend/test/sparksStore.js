/**
 * Contract tests for MongoSparksStore (src/sparks/mongoStore.js) against the
 * real in-memory MongoDB: the two atomic methods the module's job leasing
 * depends on (insertJob idempotency, updateJob conditional update), consent
 * semantics, Spark versioning, and the message seq / Sparks fields on the
 * app's own Message collection.
 */
const mongoose = require('mongoose');
const Message = require('../src/models/Message');
const MessageSeqCounter = require('../src/models/MessageSeqCounter');
const { MongoSparksStore } = require('../src/sparks/mongoStore');
const { backfillConversation } = require('../scripts/backfillMessageSeq');

async function run() {
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

  const store = new MongoSparksStore(mongoose.connection);
  await store.ensureIndexes();
  const tag = `t${Date.now()}`;
  const job = (over = {}) => ({
    jobId: `job_${tag}_${Math.random().toString(16).slice(2, 10)}`, type: 'spark.detect', scopeId: `chat_${tag}`, chatId: `chat_${tag}`, callId: null,
    idempotencyKey: `key_${tag}`, status: 'pending', attempt: 0, leaseToken: null, leaseDeviceId: null, leaseExpiresAt: null, offerExpiresAt: null,
    deadline: Date.now() + 60000, createdAt: Date.now(), nextRetryAt: Date.now(), input: { type: 'spark.detect' }, result: null, resultMeta: null,
    tipUserId: null, minTier: 'lite', candidateUserIds: ['u1'], triedDeviceIds: [], ...over,
  });

  console.log('\n--- sparks store: insertJob (idempotent) ---');
  const first = await store.insertJob(job());
  const again = await store.insertJob(job());
  check(again.jobId === first.jobId, 'a second insert with the same idempotency key returns the stored row', { first: first.jobId, again: again.jobId });
  const racers = await Promise.all(Array.from({ length: 8 }, () => store.insertJob(job({ idempotencyKey: `race_${tag}`, scopeId: `race_${tag}` }))));
  const stored = await store.c.jobs.countDocuments({ idempotencyKey: `race_${tag}` });
  check(stored === 1 && new Set(racers.map((r) => r.jobId)).size === 1, '8 concurrent inserts with one key store one job and all get it back', { stored, ids: racers.map((r) => r.jobId) });
  check((await store.getJob(first.jobId)).leaseToken === null && !('endedAt' in (await store.getJob(first.jobId))), 'rows come back exactly as written (null kept, no store-only fields)');

  console.log('\n--- sparks store: updateJob (conditional, atomic) ---');
  const leases = await Promise.all(
    Array.from({ length: 10 }, (_, i) => store.updateJob(first.jobId, { status: 'offered', leaseToken: `lt_${i}`, leaseDeviceId: `d${i}` }, { status: 'pending', leaseToken: null }))
  );
  const winner = await store.getJob(first.jobId);
  check(leases.filter(Boolean).length === 1 && winner.status === 'offered' && winner.leaseToken === `lt_${leases.indexOf(true)}`, '10 devices racing for one lease: exactly one wins', { leases, winner: winner.leaseToken });
  check((await store.updateJob(first.jobId, { status: 'leased' }, { leaseToken: 'lt_wrong' })) === false, 'a stale lease token changes nothing');
  check((await store.updateJob(first.jobId, { status: 'leased' }, { leaseToken: winner.leaseToken, status: 'offered' })) === true && (await store.getJob(first.jobId)).status === 'leased', 'the lease holder moves it on');
  check((await store.updateJob(first.jobId, { status: 'done' }, { leaseToken: null })) === false, 'where leaseToken null does not match a held lease');
  check((await store.updateJob('job_missing', { status: 'done' })) === false, 'an unknown job reports no change');
  await store.updateJob(first.jobId, { status: 'done', input: null }, { leaseToken: winner.leaseToken });
  const done = await store.c.jobs.findOne({ _id: first.jobId });
  check(done.endedAt instanceof Date && done.input === null, 'finishing a job clears its input and stamps endedAt (7-day TTL)', done.endedAt);
  check((await store.openJobs('spark.detect', `chat_${tag}`)).length === 0 && (await store.jobsByStatus(['done'])).some((j) => j.jobId === first.jobId), 'openJobs / jobsByStatus follow the status');

  console.log('\n--- sparks store: consents (latestConsent) ---');
  const user = `user_${tag}`;
  await store.addConsent({ userId: user, callId: null, noticeVersion: 1, decision: 'accepted', scope: 'always', decidedAt: '2026-01-01T00:00:00.000Z' });
  check((await store.latestConsent(user, 'call_a'))?.scope === 'always', 'a standing "always" decision covers any call');
  await store.addConsent({ userId: user, callId: 'call_a', noticeVersion: 1, decision: 'declined', scope: 'call', decidedAt: '2026-02-01T00:00:00.000Z' });
  check((await store.latestConsent(user, 'call_a'))?.decision === 'declined', 'a newer decision for this call wins');
  check((await store.latestConsent(user, 'call_b'))?.decision === 'accepted', 'a decision for another call is ignored');
  await store.addConsent({ userId: user, callId: 'call_a', noticeVersion: 1, decision: 'accepted', scope: 'call', decidedAt: '2026-02-01T00:00:00.000Z' });
  check((await store.latestConsent(user, 'call_a'))?.decision === 'accepted', 'same timestamp: the later entry wins (append-only log)');
  check((await store.latestConsent(`nobody_${tag}`, 'call_a')) === null, 'no decision -> null');

  console.log('\n--- sparks store: Sparks ---');
  const sparkId = `spk_${tag}`;
  await store.insertSpark({ sparkId, chatId: `chat_${tag}`, subject: 'Test', state: 'active', pinned: false, revivalIndex: 0, summaryText: null, summaryBasedOnSeq: null, summaryUpdatedAt: null, createdBy: null, createdAt: 1, lastMessageAt: 1, mergedInto: null, version: 1, firstUnsummarizedAt: null });
  const patched = await store.patchSpark(sparkId, { pinned: true, version: 99 });
  check(patched.pinned === true && patched.version === 2, 'patchSpark applies the patch and increments version', patched);
  let threw = false;
  try {
    await store.patchSpark('spk_missing', { pinned: true });
  } catch {
    threw = true;
  }
  check(threw, 'patchSpark on a missing Spark throws');
  await store.addSeam({ sparkId, beforeMessageId: 'm1', gapMs: 10, kind: 'labeled', label: '3 weeks later' });
  await store.addSeam({ sparkId, beforeMessageId: 'm1', gapMs: 99, kind: 'fold', label: null });
  const seams = await store.seams(sparkId);
  check(seams.length === 1 && seams[0].label === '3 weeks later' && seams[0].gapMs === 10, 'a seam is stored once and never recomputed', seams);
  await store.addPing(sparkId, 0, 'Front-end', ['u1']);
  check((await store.hasPing(sparkId, 0, 'Front-end')) && !(await store.hasPing(sparkId, 1, 'Front-end')), 'role pings are once per role per revival');

  console.log('\n--- sparks store: messages (their collection) ---');
  const conversation = new mongoose.Types.ObjectId();
  const sender = new mongoose.Types.ObjectId();
  // Two legacy messages from before seq existed (raw inserts, like old data).
  await Message.collection.insertMany([
    { conversation, sender, kind: 'text', content: 'old one', createdAt: new Date(Date.now() - 5000), deletedFor: [] },
    { conversation, sender, kind: 'text', content: 'old two', createdAt: new Date(Date.now() - 4000), deletedFor: [] },
  ]);
  const fresh = await Promise.all(['a', 'b', 'c'].map((content) => Message.create({ conversation, sender, content })));
  const seqs = fresh.map((m) => m.seq).sort();
  check(seqs.join(',') === '3,4,5', 'concurrent inserts get distinct seqs, after the reserved legacy range', seqs);
  check((await backfillConversation(conversation, { dryRun: false })) === 2, 'the backfill numbers the legacy messages');
  const all = await store.messagesInChat(String(conversation), { limit: 10 });
  check(all.map((m) => m.seq).join(',') === '1,2,3,4,5' && all[0].text === 'old one', 'messagesInChat returns the whole chat in seq order', all.map((m) => m.seq));
  check((await backfillConversation(conversation, { dryRun: false })) === 0 && (await MessageSeqCounter.findById(conversation)).seq === 5, 'the backfill is idempotent and the counter carries on');
  const newest = await store.messagesInChat(String(conversation), { beforeSeq: 5, limit: 2, newestFirst: true });
  check(newest.map((m) => m.seq).join(',') === '4,3', 'beforeSeq / newestFirst / limit');
  await store.setMessagesSpark([String(fresh[0]._id), String(fresh[1]._id)], sparkId, 0);
  await store.setHintState(String(fresh[0]._id), 'assigned');
  check((await store.messagesOfSpark(sparkId)).length === 2 && (await store.getMessage(String(fresh[0]._id))).hintState === 'assigned', 'setMessagesSpark / messagesOfSpark / setHintState');
  const unassigned = await store.unassignedSince(String(conversation), Date.now() - 60000);
  check(unassigned.length === 3 && unassigned.every((m) => !m.sparkId), 'unassignedSince skips messages already in a Spark', unassigned.map((m) => m.text));
  await store.setMessagesSpark([String(fresh[0]._id)], null, null);
  const freed = await Message.findById(fresh[0]._id).lean();
  check(freed.sparkId === null && freed.sparkRevivalIndex === undefined && freed.postedInSpark === false, 'leaving a Spark clears the marker');
  const row = await store.getMessage(String(fresh[1]._id));
  check(row.chatId === String(conversation) && row.senderId === String(sender) && row.kind === 'text' && row.sparkRevivalIndex === 0 && typeof row.sentAt === 'string', 'a Message maps onto MessageRow', row);
  check((await store.recentSenders(String(conversation), Date.now() - 60000)).join() === String(sender), 'recentSenders');

  await store.c.jobs.deleteMany({ idempotencyKey: { $in: [`key_${tag}`, `race_${tag}`] } });
  return { pass, fail };
}

module.exports = { run };
