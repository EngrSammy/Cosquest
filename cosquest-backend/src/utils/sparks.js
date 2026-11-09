/**
 * SPARKS ENGINE ("Sparks bot" in the app; "AI-driven topic detection" in
 * the spec).
 *
 * This is the stand-in until Subomi's AI is ready: topic detection here is
 * keyword-based (no AI service needed). Subjects and running summaries use
 * Claude when ANTHROPIC_API_KEY is set, and a simple built-in summary
 * otherwise. To plug in another AI later, replace `detectTopic()` and/or
 * `aiSummarize()` - everything else (storage, eras, seams, live updates,
 * the app) stays the same.
 *
 * Spec numbers (tune in testing - an open item in the spec):
 *   trigger: 3+ messages, 2+ people, same subject, within ~2 minutes
 *   exit:    ~15 minutes with no new replies -> quiet (static card)
 *   seams:   sliding scale relative to the Spark's own pace
 */
const Spark = require('../models/Spark');
const Message = require('../models/Message');
const { emitToConversation } = require('../realtime/socket');

const TRIGGER_WINDOW_MS = 2 * 60 * 1000;
const TRIGGER_MESSAGES = 3;
const TRIGGER_PEOPLE = 2;
const ACTIVE_MS = 15 * 60 * 1000;
const SPARK_CHAT_TYPES = ['community', 'faction', 'group'];

const DAY = 24 * 60 * 60 * 1000;
const SEAM_MIN_MS = 2 * DAY; // fast Sparks: a 2-day silence is a gap
const SEAM_MAX_MS = 14 * DAY; // slow-burn Sparks: a couple of weeks
const SEAM_PACE_FACTOR = 40; // "a silence 40x longer than its usual pace"

const STOPWORDS = new Set(
  `a about above after again against all also am an and any are aren as at be because been before being below between both
  but by can cant could couldnt did didnt do does doesnt doing dont down during each few for from further get gets got had
  hadnt has hasnt have havent having he hed hell hes her here heres hers herself him himself his how hows i id ill im ive
  if in into is isnt it its itself just lets like me more most much must my myself no nor not now of off on once only or
  other ought our ours ourselves out over own same she shed shell shes should shouldnt so some such than that thats the
  their theirs them themselves then there theres these they theyd theyll theyre theyve this those through to too under
  until up us very was wasnt we wed well were weve werent what whats when whens where wheres which while who whos whom
  why whys will with wont would wouldnt you youd youll youre youve your yours yourself yourselves yeah yes yep ok okay
  lol lmao haha hahaha omg really think know want going gonna wanna gotta make made thing things something anything
  everything good great nice cool thanks thank please sure maybe right still even back time today tomorrow yesterday
  guys hey hello hi bro sis man people one two see look said say says tell told come came go went done also well
  actually literally kinda sorta pretty lot lots way day days week weeks month months year years`.split(/\s+/)
);

// ==========================================================================
// PURE HELPERS (no database) - unit-tested
// ==========================================================================

// The words that say what a message is about: lowercase, no stopwords,
// 3+ letters, simple plural folding ("uniforms" -> "uniform").
function keywordsOf(text) {
  const words = String(text || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/@[a-z0-9_.]+/g, ' ')
    .match(/[a-z0-9][a-z0-9'-]*[a-z0-9]|[a-z0-9]/g);
  if (!words) return [];

  const out = [];
  for (let word of words) {
    word = word.replace(/'s$/, '').replace(/'/g, '');
    if (word.length < 3 || STOPWORDS.has(word) || /^\d+$/.test(word)) continue;
    if (word.length > 4 && word.endsWith('ies')) word = `${word.slice(0, -3)}y`;
    else if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) word = word.slice(0, -1);
    if (!out.includes(word)) out.push(word);
  }
  return out;
}

// How much two keyword lists overlap (0..1, relative to the smaller one).
function similarity(a, b) {
  if (!a?.length || !b?.length) return 0;
  const set = new Set(a);
  const shared = b.filter((word) => set.has(word)).length;
  return shared / Math.min(a.length, b.length);
}

/**
 * The trigger: among recent messages not already in a Spark (each
 * { id, senderId, keywords, createdAt }), is there a subject shared by
 * TRIGGER_MESSAGES+ messages from TRIGGER_PEOPLE+ people, within the
 * window, that includes the newest message? Returns
 * { keywords, messageIds } or null.
 */
function detectTopic(recent, newest, now = Date.now()) {
  if (!newest?.keywords?.length) return null;
  const pool = recent.filter((item) => now - new Date(item.createdAt).getTime() <= TRIGGER_WINDOW_MS);
  if (!pool.some((item) => item.id === newest.id)) pool.push(newest);

  let best = null;
  for (const word of newest.keywords) {
    const group = pool.filter((item) => item.keywords.includes(word));
    const people = new Set(group.map((item) => String(item.senderId)));
    if (group.length >= TRIGGER_MESSAGES && people.size >= TRIGGER_PEOPLE) {
      if (!best || group.length > best.group.length) best = { word, group };
    }
  }
  if (!best) return null;

  // Subject words: the trigger word first, then others shared by 2+ of them.
  const counts = new Map();
  for (const item of best.group) {
    for (const word of item.keywords) counts.set(word, (counts.get(word) || 0) + 1);
  }
  const extra = [...counts.entries()]
    .filter(([word, count]) => word !== best.word && count >= 2)
    .sort((x, y) => y[1] - x[1])
    .map(([word]) => word);

  return { keywords: [best.word, ...extra].slice(0, 5), messageIds: best.group.map((item) => item.id) };
}

function subjectFromKeywords(keywords) {
  const words = (keywords || []).slice(0, 2);
  if (!words.length) return 'New Spark';
  const text = words.join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Someone posted in it within the last ~15 minutes (ignores pinning). This
// is what decides whether a returning message is a revival (new era).
function hasRecentActivity(spark, now = Date.now()) {
  if (!spark) return false;
  return now - new Date(spark.lastActivityAt).getTime() < ACTIVE_MS;
}

// Active = shown as a pulsing circle: recent activity, or pinned (a pinned
// Spark never fades to a quiet card).
function isActive(spark, now = Date.now()) {
  if (!spark) return false;
  return Boolean(spark.pinned) || hasRecentActivity(spark, now);
}

// "Sliding scale relative to that Spark's own pace": a silence counts as a
// real gap (seam) when it's much longer than the Spark's usual gap between
// messages, between 2 days (fast Sparks) and 2 weeks (slow-burn Sparks).
function seamThreshold(timestamps) {
  const times = timestamps.map((t) => new Date(t).getTime()).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < times.length; i += 1) gaps.push(times[i] - times[i - 1]);
  if (!gaps.length) return SEAM_MAX_MS;
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  return Math.min(SEAM_MAX_MS, Math.max(SEAM_MIN_MS, median * SEAM_PACE_FACTOR));
}

// "3 days later", "2 weeks later", "11 months later", "a year later"...
function seamLabel(ms) {
  const days = Math.round(ms / DAY);
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} later`;
  if (days < 60) {
    const weeks = Math.round(days / 7);
    return `${weeks} weeks later`;
  }
  if (days < 365) {
    const months = Math.round(days / 30);
    return `${months} month${months === 1 ? '' : 's'} later`;
  }
  const years = Math.round(days / 365);
  return years === 1 ? 'a year later' : `${years} years later`;
}

// Seams between consecutive messages (oldest first): [{ beforeMessageId, label }].
function buildSeams(messages) {
  const threshold = seamThreshold(messages.map((m) => m.createdAt));
  const seams = [];
  for (let i = 1; i < messages.length; i += 1) {
    const gap = new Date(messages[i].createdAt).getTime() - new Date(messages[i - 1].createdAt).getTime();
    if (gap >= threshold) seams.push({ beforeMessageId: String(messages[i]._id || messages[i].id), label: seamLabel(gap) });
  }
  return seams;
}

// ==========================================================================
// SUMMARIES
// ==========================================================================

function nameOf(message) {
  const profile = message.sender?.profile;
  return profile?.username || profile?.firstName || 'someone';
}

function builtInSummary(spark, messages) {
  const names = [...new Set(messages.map(nameOf))];
  const who =
    names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
  const last = [...messages].reverse().find((m) => m.content && !m.deletedForEveryone);
  const latest = last ? ` Latest: "${last.content.length > 90 ? `${last.content.slice(0, 87)}...` : last.content}"` : '';
  return `${who} ${names.length === 1 ? 'is' : 'are'} talking about ${spark.subject.toLowerCase()} (${spark.messageCount} message${spark.messageCount === 1 ? '' : 's'}).${latest}`;
}

// Optional: Claude writes a subject + summary when ANTHROPIC_API_KEY is set.
async function aiSummarize(spark, messages) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || typeof fetch !== 'function') return null;

  const transcript = messages
    .filter((m) => m.content && !m.deletedForEveryone)
    .slice(-40)
    .map((m) => `${nameOf(m)}: ${m.content}`)
    .join('\n');
  if (!transcript) return null;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.SPARKS_AI_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system:
          'You label sub-conversations ("Sparks") inside a group chat for a cosplay/fandom community app. ' +
          'Given the messages, reply with JSON only, no other text: ' +
          '{"subject": "2-4 word topic, Title-ish case", "summary": "1-3 short sentences: who is discussing what, and where it stands"}.',
        messages: [{ role: 'user', content: `Current subject: ${spark.subject}\n\nMessages:\n${transcript}` }],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const text = (data?.content || []).map((part) => part.text || '').join('').trim();
    const json = JSON.parse(text.replace(/^```(json)?|```$/g, '').trim());
    if (!json?.summary) return null;
    return {
      subject: typeof json.subject === 'string' ? json.subject.trim().slice(0, 80) : null,
      summary: String(json.summary).trim().slice(0, 1200),
    };
  } catch (error) {
    console.error('[sparks] AI summary failed:', error.message);
    return null;
  }
}

const lastAiRun = new Map(); // sparkId -> ms (at most every 30s per Spark)

async function refreshSummary(spark, { force = false } = {}) {
  if (!force && spark.messageCount - spark.summaryMessageCount < 3 && spark.summary) return spark;

  const messages = await Message.find({ spark: spark._id, deletedForEveryone: { $ne: true } })
    .sort({ createdAt: 1 })
    .limit(200)
    .populate('sender', 'profile.username profile.firstName');

  spark.summary = builtInSummary(spark, messages);
  spark.summaryMessageCount = spark.messageCount;
  await spark.save();

  const id = String(spark._id);
  if (process.env.ANTHROPIC_API_KEY && Date.now() - (lastAiRun.get(id) || 0) > 30 * 1000) {
    lastAiRun.set(id, Date.now());
    aiSummarize(spark, messages)
      .then(async (result) => {
        if (!result) return;
        const fresh = await Spark.findById(spark._id);
        if (!fresh || fresh.deletedAt) return;
        fresh.summary = result.summary;
        fresh.summarizedByAi = true;
        // Only rename bot-made Sparks (a member's own subject is kept).
        if (result.subject && !fresh.createdBy) fresh.subject = result.subject;
        await fresh.save();
        broadcastSpark(fresh);
      })
      .catch(() => {});
  }
  return spark;
}

// ==========================================================================
// STORAGE + LIVE UPDATES
// ==========================================================================

function serializeSpark(spark, now = Date.now()) {
  const eras = spark.eras?.length ? spark.eras : [{ startedAt: spark.createdAt }];
  return {
    id: String(spark._id),
    conversationId: String(spark.conversation),
    subject: spark.subject,
    summary: spark.summary || '',
    summarizedByAi: Boolean(spark.summarizedByAi),
    keywords: spark.keywords || [],
    // Pulsing circle while active; static card when quiet. Pinned never fades.
    active: isActive(spark, now),
    pinned: Boolean(spark.pinned),
    // Has a past: pulses in a different colour, shows the gradient.
    revived: eras.length > 1,
    eras: eras.map((era, index) => ({ index, startedAt: era.startedAt })),
    messageCount: spark.messageCount || 0,
    participantCount: (spark.participants || []).length,
    createdBy: spark.createdBy ? String(spark.createdBy) : null,
    startedByBot: !spark.createdBy,
    lastActivityAt: spark.lastActivityAt,
    createdAt: spark.createdAt,
  };
}

function broadcastSpark(spark) {
  emitToConversation(String(spark.conversation), 'spark:updated', {
    conversationId: String(spark.conversation),
    spark: serializeSpark(spark),
  });
}

function broadcastSparkMessages(spark, messageIds, era) {
  if (!messageIds.length) return;
  emitToConversation(String(spark.conversation), 'spark:messages', {
    conversationId: String(spark.conversation),
    sparkId: String(spark._id),
    era,
    messageIds: messageIds.map(String),
  });
}

// The era a message from `when` belongs to: the latest era that had started
// by then (0 if it predates them all).
function eraAt(spark, when) {
  const time = new Date(when).getTime();
  let era = 0;
  (spark.eras || []).forEach((item, index) => {
    if (new Date(item.startedAt).getTime() <= time) era = index;
  });
  return era;
}

/**
 * Adds messages to a Spark (moving them out of any other Spark is not
 * done - a message belongs to one Spark). Starts a new era when the Spark
 * had gone quiet (a revival). Returns the era index used.
 *
 * `merging`: these are existing messages being moved in from another Spark
 * (admin merge). That is not new activity, so it neither revives the Spark
 * nor bumps lastActivityAt, and each message gets the era that was running
 * when it was sent. Callers must pass messages whose `spark` is already
 * cleared (null) or points at this Spark.
 */
async function addMessagesToSpark(spark, messages, { now = new Date(), postedInSpark = false, merging = false } = {}) {
  if (!spark.eras?.length) spark.eras = [{ startedAt: spark.createdAt || now }];
  if (!merging && !hasRecentActivity(spark, now.getTime()) && spark.messageCount > 0) {
    spark.eras.push({ startedAt: now });
  }
  const era = spark.eras.length - 1;

  const fresh = messages.filter((message) => !message.spark || String(message.spark) === String(spark._id));
  const ids = fresh.map((message) => message._id);
  if (ids.length && merging) {
    const byEra = new Map();
    for (const message of fresh) {
      const index = eraAt(spark, message.createdAt);
      if (!byEra.has(index)) byEra.set(index, []);
      byEra.get(index).push(message._id);
    }
    await Promise.all(
      [...byEra].map(([index, eraIds]) =>
        Message.updateMany({ _id: { $in: eraIds }, spark: { $in: [null, spark._id] } }, { $set: { spark: spark._id, sparkEra: index } })
      )
    );
  } else if (ids.length) {
    await Message.updateMany(
      { _id: { $in: ids }, spark: { $in: [null, spark._id] } },
      { $set: { spark: spark._id, sparkEra: era, ...(postedInSpark ? { postedInSpark: true } : {}) } }
    );
  }

  const people = new Set((spark.participants || []).map(String));
  for (const message of fresh) people.add(String(message.sender?._id || message.sender));
  spark.participants = [...people];
  spark.messageCount = await Message.countDocuments({ spark: spark._id, deletedForEveryone: { $ne: true } });
  if (merging) {
    const newest = fresh.reduce((max, message) => Math.max(max, new Date(message.createdAt).getTime()), 0);
    if (newest > new Date(spark.lastActivityAt).getTime()) spark.lastActivityAt = new Date(newest);
  } else {
    spark.lastActivityAt = now;
  }

  // New words join the Spark's keywords (so the topic can drift a little).
  const words = new Set(spark.keywords || []);
  for (const message of fresh) keywordsOf(message.content).slice(0, 3).forEach((word) => words.size < 12 && words.add(word));
  spark.keywords = [...words];

  await spark.save();
  broadcastSparkMessages(spark, ids, era);
  await refreshSummary(spark);
  broadcastSpark(spark);
  return era;
}

async function liveSparks(conversationId) {
  return Spark.find({ conversation: conversationId, deletedAt: null }).sort({ lastActivityAt: -1 }).limit(200);
}

// The best existing Spark for these words (active ones first), or null.
function bestMatch(sparks, keywords, { minScore = 0.5, activeOnly = false } = {}) {
  let best = null;
  for (const spark of sparks) {
    if (activeOnly && !isActive(spark)) continue;
    const score = similarity(spark.keywords, keywords);
    if (score >= minScore && (!best || score > best.score || (score === best.score && isActive(spark)))) {
      best = { spark, score };
    }
  }
  return best?.spark || null;
}

// The active Spark a message is a continuation of: it mentions one of the
// Spark's subject words (the first two keywords - the trigger word / the
// subject the member typed; later keywords are words picked up along the
// way). Comparing against the whole drifting keyword list instead would make
// a Spark harder to join the longer it runs. Most hits wins; ties go to the
// most recently active (liveSparks is sorted that way).
function continuingSpark(sparks, words) {
  let best = null;
  for (const spark of sparks) {
    if (!isActive(spark)) continue;
    const subject = (spark.keywords || []).slice(0, 2);
    const hits = words.filter((word) => subject.includes(word)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { spark, hits };
  }
  return best?.spark || null;
}

/**
 * Called after every new message in Community / faction / group chats.
 *  - a reply posted inside a Spark: add it there;
 *  - otherwise: continue an active Spark on the same subject, or detect a
 *    new topic (3+ messages, 2+ people, ~2 min) - reviving a matching old
 *    Spark instead of starting from zero.
 */
async function detectAndAssign(conversation, message, { sparkId = null } = {}) {
  if (!SPARK_CHAT_TYPES.includes(conversation.type)) return null;
  if (message.kind === 'call') return null;

  if (sparkId) {
    const spark = await Spark.findOne({ _id: sparkId, conversation: conversation._id, deletedAt: null });
    if (!spark) return null;
    await addMessagesToSpark(spark, [message], { postedInSpark: true });
    return spark;
  }

  const words = keywordsOf(message.content);
  if (!words.length) return null;

  const sparks = await liveSparks(conversation._id);

  // 1) Still talking about an active Spark's subject -> it joins that Spark.
  const continuing = continuingSpark(sparks, words);
  if (continuing) {
    await addMessagesToSpark(continuing, [message]);
    return continuing;
  }

  // 2) A new cluster? (the spec's trigger)
  const since = new Date(Date.now() - TRIGGER_WINDOW_MS);
  const recentDocs = await Message.find({
    conversation: conversation._id,
    createdAt: { $gte: since },
    spark: null,
    deletedForEveryone: { $ne: true },
    kind: { $in: ['text', 'image', 'video', 'audio', 'album', 'poll'] },
  })
    .sort({ createdAt: -1 })
    .limit(40);

  const recent = recentDocs.map((doc) => ({
    id: String(doc._id),
    senderId: String(doc.sender),
    keywords: keywordsOf(doc.content),
    createdAt: doc.createdAt,
  }));
  const topic = detectTopic(recent, { id: String(message._id), senderId: String(message.sender?._id || message.sender), keywords: words, createdAt: message.createdAt });
  if (!topic) return null;

  const clusterDocs = recentDocs.filter((doc) => topic.messageIds.includes(String(doc._id)));
  if (!clusterDocs.some((doc) => String(doc._id) === String(message._id))) clusterDocs.push(message);

  // 3) Same subject as an older Spark -> revive it rather than start over.
  const old = bestMatch(sparks, topic.keywords, { minScore: 0.5 });
  if (old) {
    await addMessagesToSpark(old, clusterDocs);
    return old;
  }

  const spark = await Spark.create({
    conversation: conversation._id,
    subject: subjectFromKeywords(topic.keywords),
    keywords: topic.keywords,
    createdBy: null,
    seedMessage: clusterDocs[clusterDocs.length - 1]?._id || message._id,
    eras: [{ startedAt: new Date() }],
  });
  await addMessagesToSpark(spark, clusterDocs);
  return spark;
}

// Detection runs fire-and-forget per message, so two messages sent at the
// same moment would otherwise both see "no Spark yet" and create duplicates,
// or save the same Spark at once. Run them one after another per chat
// (per server process).
const chatQueues = new Map(); // conversationId -> tail of the promise chain

function handleNewMessage(conversation, message, options) {
  const key = String(conversation._id);
  const run = (chatQueues.get(key) || Promise.resolve()).then(() => detectAndAssign(conversation, message, options));
  const tail = run.catch(() => {});
  chatQueues.set(key, tail);
  tail.then(() => {
    if (chatQueues.get(key) === tail) chatQueues.delete(key);
  });
  return run;
}

module.exports = {
  SPARK_CHAT_TYPES,
  ACTIVE_MS,
  keywordsOf,
  similarity,
  detectTopic,
  subjectFromKeywords,
  isActive,
  hasRecentActivity,
  eraAt,
  seamThreshold,
  seamLabel,
  buildSeams,
  builtInSummary,
  serializeSpark,
  broadcastSpark,
  addMessagesToSpark,
  refreshSummary,
  liveSparks,
  bestMatch,
  continuingSpark,
  handleNewMessage,
};
