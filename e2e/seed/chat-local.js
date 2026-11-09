#!/usr/bin/env node
/**
 * A local, throwaway CosQuest chat backend for Maestro journeys: in-memory
 * MongoDB and Redis, the real backend from CHAT_BACKEND_DIR, seeded with
 * realistic people, DMs, groups, Sparks, polls, media, a missed call, a game
 * invite, Community / faction room chatter, posts, quests and notifications.
 * Nothing touches a real database, Cloudinary, SMTP, Expo push or OAuth.
 *
 *   node e2e/seed/chat-local.js
 *   CHAT_BACKEND_DIR=/path/to/cosquest-backend PORT=4120 node e2e/seed/chat-local.js
 *
 * Point the app at http://localhost:4120 (with `adb reverse tcp:4120 tcp:4120`)
 * or http://10.0.2.2:4120. Every seeded user's password is cosquest-dev-1.
 * See README.md next to this file for the full story.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { createRequire } = require('module');
const media = require('./media');

const SEED_DIR = __dirname;
const env = process.env;
const BACKEND = path.resolve(env.CHAT_BACKEND_DIR || '/home/engineer/cq-work/cx-journeys/mcj-merged/cosquest-backend');
if (!fs.existsSync(path.join(BACKEND, 'server.js'))) {
  console.error(`[chat-local] no server.js in CHAT_BACKEND_DIR=${BACKEND}`);
  process.exit(1);
}
const breq = createRequire(path.join(BACKEND, 'package.json'));
const fromBackend = (rel) => breq(path.join(BACKEND, rel));

// ---------------------------------------------------------------------------
// Environment (set before the backend is required: several modules read it at load)
// ---------------------------------------------------------------------------
function def(key, value) {
  if (env[key] === undefined || env[key] === '') env[key] = value;
}
def('PORT', '4120');
env.NODE_ENV = 'development';
def('JWT_SECRET', 'local-dev-only-secret-not-for-production');
def('LIVEKIT_URL', 'ws://10.0.2.2:7880');
def('LIVEKIT_API_KEY', 'devkey');
def('LIVEKIT_API_SECRET', 'secret');
// The public delivery name of the Cloudinary account that hosts the preset
// avatar pictures (no key: nothing can be uploaded or listed with it). With
// it unset GET /api/meta/avatars answers 503 and the app has no catalog.
def('CLOUDINARY_CLOUD_NAME', 'h3vdfsoe');
def('SPARKS_ENGINE', 'module');
def('UPLOAD_DIR', path.join(SEED_DIR, '.uploads'));
// The phone reaches this machine as localhost through `adb reverse tcp:PORT tcp:PORT`.
def('MEDIA_BASE_URL', `http://localhost:${env.PORT}`);
def('CHAT_HOST', '127.0.0.1');
def('SEED_OUT', path.join(SEED_DIR, '.seed.json'));
def('DEV_PASSWORD', 'cosquest-dev-1');
const redisBinary = path.join(os.homedir(), '.local/bin/redis-server');
if (fs.existsSync(redisBinary)) def('REDISMS_SYSTEM_BINARY', redisBinary);
env.PUSH_ENABLED = '0'; // never send through Expo
if (env.CHAT_LOCAL_KEEP_KEYS !== '1') {
  for (const key of [
    'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET',
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM_EMAIL',
    'ANTHROPIC_API_KEY', 'DEEPGRAM_API_KEY', 'EXPO_ACCESS_TOKEN', 'GAME_PUSH_SECRET',
    'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET',
    'APPLE_OAUTH_CLIENT_ID', 'APPLE_OAUTH_TEAM_ID', 'APPLE_OAUTH_KEY_ID', 'APPLE_OAUTH_PRIVATE_KEY',
    'SPARKS_MODEL_MANIFEST_URL',
  ]) delete env[key];
}
delete env.MONGODB_URI;
delete env.REDIS_URL;
fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
// server.js runs dotenv on the working directory's .env: run from here (none).
process.chdir(SEED_DIR);

const PORT = Number(env.PORT);
const BASE = `http://127.0.0.1:${PORT}`;
const MEDIA_BASE = env.MEDIA_BASE_URL.replace(/\/+$/, '');
const log = (...args) => console.log('[chat-local]', ...args);

// ---------------------------------------------------------------------------
// Local stand-ins for the outside services (installed before the backend loads,
// because controllers destructure these functions at require time)
// ---------------------------------------------------------------------------
const outbox = []; // every email the backend "sent"

function patchBackend() {
  // 1. Email: no SMTP. Log it (with any 6-digit code) and keep it for GET /__dev/mail.
  const mailer = fromBackend('src/utils/mailer.js');
  mailer.sendEmail = async ({ to, subject, text }) => {
    const code = (/\b(\d{6})\b/.exec(text || '') || [])[1] || null;
    outbox.push({ to, subject, text, code, at: new Date().toISOString() });
    log(`mail to ${to}: "${subject}"${code ? ` code ${code}` : ''}`);
    return { skipped: true, local: true };
  };

  // 2. Uploads: no Cloudinary. Keep multer's file in UPLOAD_DIR and serve it at /uploads/<name>.
  const host = fromBackend('src/utils/imageHost.js');
  const keep = (file) => {
    const name = path.basename(file.path);
    return { name, url: `${MEDIA_BASE}/uploads/${encodeURIComponent(name)}` };
  };
  const fileDuration = (file) => {
    if (!/wav/.test(file.mimetype) && !/\.wav$/i.test(file.originalname || '')) return null;
    try {
      return media.wavDurationSeconds(fs.readFileSync(file.path));
    } catch {
      return null;
    }
  };
  host.storeAvatarPhoto = async (file) => keep(file).url;
  host.storeChatMedia = async (file, kind) => {
    const { name, url } = keep(file);
    const resourceType = kind === 'file' ? 'raw' : ['audio', 'video'].includes(kind) ? 'video' : 'image';
    return {
      url,
      publicId: `local/${name}`,
      resourceType,
      durationSeconds: ['audio', 'video'].includes(kind) ? fileDuration(file) : null,
      fileName: String(file.originalname || name).replace(/[\\/\x00-\x1f]/g, '_').slice(0, 255),
      mimeType: file.mimetype,
      sizeBytes: file.size,
    };
  };
  host.storePostMedia = async (files, type) => files.map((file) => ({
    url: keep(file).url,
    publicId: `local/${path.basename(file.path)}`,
    resourceType: type === 'reel' ? 'video' : 'image',
    width: null,
    height: null,
    durationSeconds: type === 'reel' ? fileDuration(file) || 10 : null,
  }));
  const unlinkLocal = (items) => {
    for (const item of items || []) {
      if (item?.publicId?.startsWith('local/')) fs.unlink(path.join(env.UPLOAD_DIR, item.publicId.slice(6)), () => {});
    }
  };
  host.deletePostMedia = async (items) => unlinkLocal(items);
  host.deleteChatMedia = async (item) => unlinkLocal(item ? [item] : []);

  // 3. Voice-note transcription: no Deepgram. A fixed sentence, so the transcript UI has something.
  const transcript = env.VOICE_TRANSCRIPT ?? 'Hey, quick voice note. I am running a little late, save me a seat.';
  fromBackend('src/utils/transcribeAudio.js').transcribeAudio = async () => transcript;

  // 4. Rate limits off (Maestro signs in again and again from one IP). CHAT_LOCAL_RATE_LIMITS=1 keeps them.
  if (env.CHAT_LOCAL_RATE_LIMITS !== '1') {
    const id = breq.resolve('express-rate-limit');
    const original = breq('express-rate-limit');
    const wrapped = (options = {}) => original({ ...options, skip: () => true });
    Object.assign(wrapped, original, { default: wrapped, rateLimit: wrapped });
    require.cache[id].exports = wrapped;
  }
}

// ---------------------------------------------------------------------------
// Extra HTTP in front of the backend: /uploads/* (local media) and /__dev/*
// ---------------------------------------------------------------------------
let seedResult = null;
const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.aac': 'audio/aac',
  '.webm': 'video/webm', '.mov': 'video/quicktime', '.pdf': 'application/pdf', '.txt': 'text/plain',
};

function serveUpload(req, res) {
  const name = decodeURIComponent(req.url.split('?')[0].replace(/^\/(uploads|__media)\//, ''));
  const file = path.join(env.UPLOAD_DIR, path.basename(name));
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Not found.' }));
    }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      const start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
      return req.method === 'HEAD' ? res.end() : fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': stat.size });
    return req.method === 'HEAD' ? res.end() : fs.createReadStream(file).pipe(res);
  });
}

function readJson(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); }
    });
  });
}

async function serveDev(req, res) {
  const send = (status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  };
  const local = /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress || '');
  if (!local) return send(403, { error: 'dev routes answer loopback callers only' });
  const url = new URL(req.url, BASE);
  try {
    if (url.pathname === '/__dev/seed') return send(200, seedResult || { error: 'still seeding' });
    if (url.pathname === '/__dev/mail') {
      const to = (url.searchParams.get('to') || '').toLowerCase();
      const mails = to ? outbox.filter((m) => String(m.to).toLowerCase() === to) : outbox;
      return send(200, { mails, latest: mails[mails.length - 1] || null });
    }
    if (url.pathname === '/__dev/notify' && req.method === 'POST') {
      // { username, message, type?: system|follow|mention|group, actor?: username, conversationId? }
      const body = await readJson(req);
      const User = fromBackend('src/models/User.js');
      const notificationModel = fromBackend('src/models/notificationModel.js');
      const find = (u) => User.findOne({ 'profile.usernameNormalized': String(u || '').toLowerCase() });
      const user = await find(body.username);
      if (!user) return send(404, { error: `no user ${body.username}` });
      const actor = body.actor ? await find(body.actor) : null;
      const n = await notificationModel.createForUser(user._id, String(body.message || 'Hello from chat-local'), {
        type: body.type || 'system',
        actor: actor?._id,
        conversation: body.conversationId || undefined,
      });
      return send(201, { notification: { id: String(n._id), type: n.type, message: n.message } });
    }
    return send(404, { error: 'unknown dev route', routes: ['GET /__dev/seed', 'GET /__dev/mail?to=', 'POST /__dev/notify'] });
  } catch (error) {
    return send(500, { error: error.message });
  }
}

function interceptHttp() {
  const original = http.createServer;
  http.createServer = function createServer(...args) {
    http.createServer = original; // only the backend's own server
    const i = args.findIndex((a) => typeof a === 'function');
    const app = args[i];
    args[i] = (req, res) => {
      if (/^\/(uploads|__media)\//.test(req.url) && (req.method === 'GET' || req.method === 'HEAD')) return serveUpload(req, res);
      if (req.url.startsWith('/__dev/')) return serveDev(req, res);
      return app(req, res);
    };
    const server = original.apply(http, args);
    const listen = server.listen.bind(server);
    // Bind to CHAT_HOST (default loopback: the emulator reaches it as 10.0.2.2).
    server.listen = (port, cb) => listen(port, env.CHAT_HOST, cb);
    return server;
  };
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------
const PEOPLE = [
  { username: 'ada', first: 'Ada', last: 'Nwosu', faction: 'icons', avatarKey: 'pink-idol', colors: ['#ca4aa0', '#6a3093'], photo: true, age: 27, gender: 'Female', expertise: 'costume_crafting', points: 1240, interests: ['comic', 'cosplay', 'anime', 'movie'], bio: 'Comic nerd in Lagos. I run the Saturday sketch club and make capes for anyone who asks nicely.' },
  { username: 'bo', first: 'Bolu', last: 'Adeyemi', faction: 'icons', avatarKey: 'neon-racer', colors: ['#11998e', '#38ef7d'], photo: true, age: 29, gender: 'Male', expertise: 'events', points: 980, interests: ['comic', 'game', 'movie'], bio: 'Speedrunner by night, comic hoarder by day.' },
  { username: 'cy', first: 'Cyrus', last: 'Mensah', faction: 'controllers', avatarKey: 'visor-ranger', colors: ['#2193b0', '#6dd5ed'], photo: true, age: 31, gender: 'Male', expertise: 'quest_coordination', points: 2210, interests: ['game', 'scifi'], bio: 'Raid lead. Bring snacks.' },
  { username: 'dami', first: 'Damilola', last: 'Ojo', faction: 'icons', avatarKey: 'goggle-scout', colors: ['#f12711', '#f5af19'], photo: false, age: 24, gender: 'Female', expertise: 'costume_crafting', points: 760, interests: ['cosplay', 'comic'], bio: 'Prop maker. EVA foam is a lifestyle.' },
  { username: 'chioma', first: 'Chioma', last: 'Eze', faction: 'ascendants', avatarKey: 'pearl-princess', colors: ['#8e2de2', '#4a00e0'], photo: true, age: 26, gender: 'Female', expertise: 'events', points: 3120, interests: ['anime', 'cosplay', 'music'], bio: 'Cosplayer and con organiser. Currently sewing: Nezuko.' },
  { username: 'tunde', first: 'Tunde', last: 'Bakare', faction: 'icons', avatarKey: 'caped-champion', colors: ['#373b44', '#4286f4'], photo: true, age: 33, gender: 'Male', expertise: 'photography', points: 1530, interests: ['comic', 'movie', 'sports'], bio: 'Photographer. Yes, I will take your con photos.' },
  { username: 'zara', first: 'Zara', last: 'Ahmed', faction: 'celestials', avatarKey: 'tech-tinkerer', colors: ['#ee9ca7', '#ffdde1'], photo: true, age: 28, gender: 'Female', expertise: 'design', points: 1890, interests: ['scifi', 'movie', 'game'], bio: 'Star Wars, Star Trek and everything in between.' },
  { username: 'kofi', first: 'Kofi', last: 'Boateng', faction: 'controllers', avatarKey: 'beat-gamer', colors: ['#0f2027', '#2c5364'], photo: false, age: 30, gender: 'Male', expertise: 'back_end', points: 640, interests: ['game', 'music'], bio: 'Fighting games. Tekken main, sore loser.' },
  { username: 'lena', first: 'Lena', last: 'Fischer', faction: 'everborns', avatarKey: 'young-wanderer', colors: ['#56ab2f', '#a8e063'], photo: true, age: 25, gender: 'Female', expertise: 'community', points: 1100, interests: ['fantasy', 'cosplay'], bio: 'Tabletop GM. Elves are real.' },
];
const SIGNUP = { email: 'newbie@example.test', username: 'newbie', password: 'Cosquest-dev-1!' }; // meets the app's sign-up rules
const LAGOS = { lat: 6.5244, lng: 3.3792 };
const MIN = 60 * 1000;

async function seed() {
  const User = fromBackend('src/models/User.js');
  const Message = fromBackend('src/models/Message.js');
  const ConversationMember = fromBackend('src/models/ConversationMember.js');
  const Quest = fromBackend('src/models/Quest.js');
  const notificationModel = fromBackend('src/models/notificationModel.js');
  const { signToken } = fromBackend('src/utils/token.js');
  const bcrypt = breq('bcryptjs');
  const now = Date.now();

  // ---- HTTP helpers -------------------------------------------------------
  async function api(method, urlPath, token, body, { form } = {}) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    let payload;
    if (form) payload = form;
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const response = await fetch(`${BASE}${urlPath}`, { method, headers, body: payload });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(`${method} ${urlPath}: ${response.status} ${JSON.stringify(data)}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }
  const writeUpload = (name, buffer) => {
    const file = path.join(env.UPLOAD_DIR, name);
    fs.writeFileSync(file, buffer);
    return `${MEDIA_BASE}/uploads/${encodeURIComponent(name)}`;
  };

  // ---- people ---------------------------------------------------------------
  const passwordHash = await bcrypt.hash(env.DEV_PASSWORD, 10);
  const users = {};
  for (const p of PEOPLE) {
    const photoUrl = p.photo ? writeUpload(`avatar-${p.username}.png`, media.avatarPng(p.colors[0], p.colors[1])) : null;
    const user = await User.create({
      email: `${p.username}@example.test`,
      passwordHash,
      profile: {
        username: p.username,
        usernameNormalized: p.username,
        firstName: p.first,
        lastName: p.last,
        age: p.age,
        gender: p.gender,
        bio: p.bio,
        avatarKey: p.avatarKey,
        avatarPhotoUrl: photoUrl,
      },
      faction: p.faction,
      interests: p.interests,
      pointsBalance: p.points,
      expertise: p.expertise,
      preferences: { notificationsEnabled: true, locationEnabled: true, radiusMiles: 50 },
      location: { lat: LAGOS.lat + (Math.random() - 0.5) * 0.05, lng: LAGOS.lng + (Math.random() - 0.5) * 0.05, updatedAt: new Date() },
      onboardingComplete: true,
      onboarding: { avatarChosen: true, notificationPreferenceChosen: true },
    });
    users[p.username] = {
      id: user.id,
      username: p.username,
      name: `${p.first} ${p.last}`,
      email: user.email,
      faction: p.faction,
      token: signToken(user.id, user.tokenVersion), // no session id: valid until someone signs in as this user
    };
  }
  const tok = (u) => users[u].token;
  const ids = (list) => list.map((u) => users[u].id);

  // ---- messages (timestamps are rewritten to "minutes ago" at the end) -----
  const convs = {}; // key -> { id, type, title }
  const timeline = []; // { id, at }
  const readPlan = []; // { conv, username, at }
  const messages = {}; // name -> id (for README/peer reference)

  async function say(conv, username, minutesAgo, content, extra = {}) {
    const { replyTo, mentions, sparkId, file, everyone } = extra;
    const id = convs[conv].id;
    let data;
    if (file) {
      const form = new FormData();
      if (content) form.append('content', content);
      if (replyTo) form.append('replyTo', replyTo);
      if (sparkId) form.append('sparkId', sparkId);
      if (mentions) form.append('mentions', JSON.stringify(ids(mentions)));
      if (file.waveform) form.append('waveform', JSON.stringify(file.waveform));
      form.append('media', new Blob([file.buffer], { type: file.type }), file.name);
      data = await api('POST', `/api/chats/${id}/messages`, tok(username), undefined, { form });
    } else {
      data = await api('POST', `/api/chats/${id}/messages`, tok(username), {
        content,
        ...(replyTo ? { replyTo } : {}),
        ...(sparkId ? { sparkId } : {}),
        ...(mentions ? { mentions: ids(mentions) } : {}),
        ...(everyone ? { mentionsEveryone: true } : {}),
      });
    }
    timeline.push({ id: data.message.id, at: now - minutesAgo * MIN });
    return data.message;
  }
  const react = (conv, username, messageId, emoji) =>
    api('POST', `/api/chats/${convs[conv].id}/messages/${messageId}/reactions`, tok(username), { emoji });
  async function poll(conv, username, minutesAgo, question, options, votes = {}, extra = {}) {
    const data = await api('POST', `/api/chats/${convs[conv].id}/polls`, tok(username), { question, options, ...extra });
    timeline.push({ id: data.message.id, at: now - minutesAgo * MIN });
    for (const [voter, optionIndex] of Object.entries(votes)) {
      await api('POST', `/api/chats/${convs[conv].id}/messages/${data.message.id}/vote`, tok(voter), { optionIds: [`o${optionIndex}`] });
    }
    return data.message;
  }
  const readUntil = (conv, username, minutesAgo) => readPlan.push({ conv, username, at: now - minutesAgo * MIN });
  async function dm(a, b, key) {
    const data = await api('POST', '/api/chats/dm', tok(a), { username: b });
    convs[key] = { id: data.chat.id, type: 'dm', title: `${a} + ${b}`, members: [a, b] };
  }
  async function group(key, owner, body, members) {
    const data = await api('POST', '/api/groups', tok(owner), { ...body, members: ids(members) });
    convs[key] = { id: data.chat.id, type: 'group', title: body.name, owner, members: [owner, ...members], kind: body.kind };
  }
  const sparks = [];
  async function spark(conv, username, seedMessage, subject) {
    const data = await api('POST', `/api/chats/${convs[conv].id}/sparks`, tok(username), { messageId: seedMessage.id, subject, force: true });
    const row = { conversation: conv, conversationId: convs[conv].id, id: data.spark.id, subject, startedBy: username };
    sparks.push(row);
    return row;
  }

  // ---- DMs with ada -------------------------------------------------------------
  // bo: old chat about the con, then 3 unread messages and a game invite.
  await dm('bo', 'ada', 'dm:bo');
  await say('dm:bo', 'bo', 2880, 'Did you see the Comic-Con Lagos lineup? 👀');
  await say('dm:bo', 'ada', 2876, 'Yes!! They got the Black Panther artist for a signing');
  await say('dm:bo', 'bo', 2871, "We're going. No excuses this year");
  const cape = await say('dm:bo', 'ada', 2868, 'Only if you help me finish the Storm cape 😅');
  await react('dm:bo', 'bo', cape.id, '😂');
  await say('dm:bo', 'bo', 2860, "Deal. I'll bring the glue gun", { replyTo: cape.id });
  await say('dm:bo', 'bo', 42, 'You around this evening?');
  await say('dm:bo', 'bo', 41, "There's a Shrine right by the café on our street");
  await say('dm:bo', 'bo', 40, 'Race you to it 😄');
  readUntil('dm:bo', 'ada', 100);
  let gameInvite = null;
  const invite = {
    type: 'shrine',
    targetId: env.GAME_TARGET_ID || 'Ldf5686bcfc03',
    place: env.GAME_PLACE || 'Caffè Nero',
    lat: Number(env.GAME_LAT || 51.507277),
    lng: Number(env.GAME_LNG || -0.128365),
    note: 'Meet me here?',
  };
  try {
    const data = await api('POST', `/api/chats/${convs['dm:bo'].id}/game-invites`, tok('bo'), invite);
    timeline.push({ id: data.message.id, at: now - 39 * MIN });
    gameInvite = { messageId: data.message.id, ...invite };
  } catch (error) {
    log(`game invite not seeded (this backend has no game-invites route?): ${error.message}`);
  }

  // chioma: a photo, reactions, a reply. All read.
  await dm('chioma', 'ada', 'dm:chioma');
  await say('dm:chioma', 'chioma', 1440, 'Fitting tomorrow still on?');
  await say('dm:chioma', 'ada', 1437, 'Yes, 4pm at mine');
  const wig = await say('dm:chioma', 'chioma', 600, 'First try on the wig, be honest', {
    file: { buffer: media.photoPng(2), type: 'image/png', name: 'wig-test.png' },
  });
  messages.chiomaPhoto = wig.id;
  await react('dm:chioma', 'ada', wig.id, '😍');
  const kind = await say('dm:chioma', 'ada', 590, "Chioma!!! That's perfect");
  await react('dm:chioma', 'chioma', kind.id, '❤️');
  await say('dm:chioma', 'chioma', 585, "You're too kind. The fringe still needs work", { replyTo: kind.id });
  await say('dm:chioma', 'ada', 580, "Bring it tomorrow, I'll help trim it");

  // tunde: a link, an edited message (ada's), then an unread voice note.
  await dm('tunde', 'ada', 'dm:tunde');
  await say('dm:tunde', 'tunde', 4320, 'Uploaded the photos from Saturday: https://photos.example.test/lagos-sketch-club');
  const typo = await say('dm:tunde', 'ada', 4300, 'These are amazng');
  await api('PATCH', `/api/chats/${convs['dm:tunde'].id}/messages/${typo.id}`, tok('ada'), { content: 'These are amazing, thank you!' });
  messages.adaEdited = typo.id;
  const voice = await say('dm:tunde', 'tunde', 30, '', {
    file: { buffer: media.voiceWav(4, 2), type: 'audio/wav', name: 'voice-note.wav', waveform: Array.from({ length: 32 }, (_, i) => Math.round((0.3 + 0.6 * Math.abs(Math.sin(i / 2.5))) * 100) / 100) },
  });
  messages.tundeVoiceNote = voice.id;
  readUntil('dm:tunde', 'ada', 60);

  // zara: ada wrote last and zara has not read it yet.
  await dm('zara', 'ada', 'dm:zara');
  await say('dm:zara', 'zara', 1500, 'Are you coming to the Star Wars marathon on Friday?');
  await say('dm:zara', 'ada', 1490, "Can't Friday, sketch club. Next one for sure");
  await say('dm:zara', 'zara', 1489, 'Holding you to it 🫡');
  await say('dm:zara', 'ada', 200, 'Actually Friday freed up, is there still a seat?');
  readUntil('dm:zara', 'zara', 1000);

  // dami: a PDF from dami, ada's thanks. Read.
  await dm('dami', 'ada', 'dm:dami');
  await say('dm:dami', 'dami', 3000, 'Pattern for the cape, print it at A3', {
    file: { buffer: media.textPdf(['Storm cape pattern', '', '1. Cut two panels, 140 x 90 cm', '2. Hem the edges', '3. Attach to the collar with snaps']), type: 'application/pdf', name: 'Storm-cape-pattern.pdf' },
  });
  await say('dm:dami', 'ada', 2990, 'Lifesaver 🙏');

  // kofi: a missed voice call (kofi rang, gave up), then a text. Unread.
  await dm('kofi', 'ada', 'dm:kofi');
  await say('dm:kofi', 'kofi', 10080, 'GG last night, that last round was robbery');
  await say('dm:kofi', 'ada', 10070, 'Rematch next week 😤');
  try {
    const call = await api('POST', `/api/chats/${convs['dm:kofi'].id}/calls`, tok('kofi'), { type: 'audio' });
    await api('POST', `/api/calls/${call.call.id}/end`, tok('kofi'));
    await new Promise((r) => setTimeout(r, 300));
    const log1 = await Message.findOne({ conversation: convs['dm:kofi'].id, kind: 'call' });
    if (log1) timeline.push({ id: String(log1._id), at: now - 46 * MIN });
  } catch (error) {
    log(`missed call not seeded: ${error.message}`);
  }
  await say('dm:kofi', 'kofi', 45, "Call me back when you're free, it's about the tournament");
  readUntil('dm:kofi', 'ada', 1000);

  // ---- groups ------------------------------------------------------------
  // ada owns this one (and made tunde an admin). A poll; 1 unread.
  await group('g:sketch', 'ada', { name: 'Lagos Comic Sketch Club', description: 'Saturday sketching at Freedom Park. Bring pencils.', kind: 'private' }, ['bo', 'dami', 'tunde', 'chioma']);
  await api('POST', `/api/groups/${convs['g:sketch'].id}/members/${users.tunde.id}/role`, tok('ada'), { role: 'admin' });
  await say('g:sketch', 'ada', 3000, 'Welcome everyone! Saturdays 2pm at Freedom Park');
  await say('g:sketch', 'dami', 2990, 'Count me in');
  await say('g:sketch', 'tunde', 2985, "I'll bring the good markers");
  const themePoll = await poll('g:sketch', 'ada', 1200, 'Theme for next Saturday?', ['Villains only', 'Gender-swapped heroes', 'Draw each other as heroes'], { bo: 1, dami: 3, tunde: 3, chioma: 2 });
  messages.sketchPoll = themePoll.id;
  await say('g:sketch', 'bo', 1100, 'Villains only gets my vote next time 😈');
  await say('g:sketch', 'dami', 60, 'Running 10 mins late on Saturday, save me a bench');
  readUntil('g:sketch', 'ada', 90);

  // ada is a member here; cy @mentions her. 4 unread.
  await group('g:raid', 'cy', { name: 'Raid Night Crew', description: 'Weekly raids. Tanks wanted.', kind: 'open' }, ['ada', 'kofi', 'bo', 'lena']);
  const raidAt9 = await say('g:raid', 'cy', 2000, 'Raid tonight at 9. Who is in?');
  await say('g:raid', 'kofi', 1995, 'In');
  await say('g:raid', 'lena', 1990, 'In, bringing the healer build');
  await say('g:raid', 'ada', 1985, 'In 🛡️');
  const needTank = await say('g:raid', 'cy', 300, '@ada are you joining tonight? We need a tank', { mentions: ['ada'] });
  messages.raidMentionOfAda = needTank.id;
  await say('g:raid', 'kofi', 290, 'She tanked last week, she is in 😂', { replyTo: needTank.id });
  await say('g:raid', 'bo', 120, 'Can someone send the strat doc again?');
  await say('g:raid', 'cy', 115, 'Pinned the plan, scroll up');
  await api('PATCH', `/api/chats/${convs['g:raid'].id}/pinned-message`, tok('cy'), { messageId: raidAt9.id, duration: '7d' });
  readUntil('g:raid', 'ada', 400);

  // The big one: 9 people, lots of chatter, a poll, @ada, a photo, two Sparks.
  await group('g:con', 'chioma', { name: 'Cosplay Con 2026 🎭', description: 'Planning for Con 2026: costumes, rooms, rides, badges.', kind: 'open' }, ['ada', 'bo', 'dami', 'zara', 'tunde', 'lena', 'kofi', 'cy']);
  await say('g:con', 'chioma', 2400, 'Welcome to the Con 2026 squad! Use this group for planning');
  await say('g:con', 'zara', 2390, 'Hiii 👋');
  await say('g:con', 'lena', 2385, 'So excited');
  const dates = await say('g:con', 'chioma', 400, 'Okay planning time. Dates are 12 to 14 December, Eko Convention Centre');
  await say('g:con', 'tunde', 398, "I'll do a photo corner again");
  await say('g:con', 'dami', 396, 'Who needs props? I have two free weeks');
  await say('g:con', 'zara', 395, 'Me!!! I need a lightsaber hilt');
  await say('g:con', 'bo', 390, 'We should do a group costume this year');
  await say('g:con', 'lena', 388, 'Yes! Fellowship of the Ring? There are nine of us');
  await say('g:con', 'kofi', 386, 'Avengers is easier to source');
  const themeVote = await poll('g:con', 'zara', 385, 'Group costume theme?', ['Fellowship of the Ring', 'Avengers', 'Studio Ghibli', 'Each to their own'], { lena: 1, kofi: 2, chioma: 3, bo: 2, dami: 1, tunde: 3, zara: 1 });
  messages.conPoll = themeVote.id;
  const hotelSeed = await say('g:con', 'chioma', 200, 'Has anyone booked a hotel near the venue? Prices are climbing');
  const hotel = await spark('g:con', 'chioma', hotelSeed, 'Hotel near the venue');
  await say('g:con', 'bo', 195, 'The Eko Hotel has a group rate if we book 4 rooms', { sparkId: hotel.id });
  await say('g:con', 'zara', 193, 'I can share a room with someone', { sparkId: hotel.id });
  await say('g:con', 'lena', 190, "Me too, Zara let's share", { sparkId: hotel.id });
  await say('g:con', 'chioma', 185, "I'll call them tomorrow about the group rate", { sparkId: hotel.id });
  const groupShot = await say('g:con', 'tunde', 180, "Last year's group shot for inspo", {
    file: { buffer: media.photoPng(0), type: 'image/png', name: 'con-2025-group.png' },
  });
  await react('g:con', 'ada', groupShot.id, '❤️');
  await react('g:con', 'zara', groupShot.id, '🔥');
  await react('g:con', 'bo', groupShot.id, '🔥');
  const robe = await say('g:con', 'zara', 150, "@ada you're the best at capes, can you help me with my Jedi robe?", { mentions: ['ada'] });
  messages.conMentionOfAda = robe.id;
  await say('g:con', 'dami', 140, 'Ada made my cape last year, she is a legend', { replyTo: robe.id });
  await say('g:con', 'chioma', 100, 'Reminder: badge pre-sale closes Friday');
  const badgeSeed = await say('g:con', 'tunde', 90, 'Is the badge pre-sale code still working?');
  const badges = await spark('g:con', 'tunde', badgeSeed, 'Badge pre-sale');
  await say('g:con', 'chioma', 88, 'Yes, CQCON26 gives 20% off', { sparkId: badges.id });
  await say('g:con', 'kofi', 85, 'Just bought mine, it worked', { sparkId: badges.id });
  await say('g:con', 'ada', 84, 'Got mine too 🎟️', { sparkId: badges.id });
  await say('g:con', 'lena', 40, 'Who is driving on day one? I can take 3');
  await say('g:con', 'kofi', 35, 'Me please');
  await say('g:con', 'bo', 30, 'Me too');
  await say('g:con', 'zara', 10, 'Saving a seat for Ada as well');
  await api('PATCH', `/api/chats/${convs['g:con'].id}/pinned-message`, tok('chioma'), { messageId: dates.id, duration: '7d' });
  readUntil('g:con', 'ada', 145);

  // A faction group for Icons (every Icons member is in it automatically).
  await group('g:icons', 'bo', { name: 'Icons Lagos Chapter', description: 'Icons in and around Lagos.', kind: 'faction', factionKey: 'icons' }, []);
  await say('g:icons', 'bo', 500, 'Icons, faction quest this weekend: find the 5 hidden comic panels around Yaba');
  await say('g:icons', 'tunde', 480, 'Found one already, near the bookshop 👀');
  await say('g:icons', 'dami', 20, "Who's teaming up for Saturday?");
  readUntil('g:icons', 'ada', 490);

  // ---- Community and the Icons faction room ---------------------------------
  const rooms = (await api('GET', '/api/chats', tok('ada'))).chats;
  const community = rooms.find((c) => c.type === 'community');
  const factionRoom = rooms.find((c) => c.type === 'faction');
  convs.community = { id: community.id, type: 'community', title: 'Community' };
  convs['faction:icons'] = { id: factionRoom.id, type: 'faction', title: factionRoom.title, factionKey: 'icons' };
  await say('community', 'chioma', 900, 'Welcome to everyone who joined this week! Say hi 👋');
  await say('community', 'lena', 880, 'Hi from the Everborn 🧝');
  await say('community', 'kofi', 870, 'Controllers in the house');
  await say('community', 'zara', 860, 'Celestials checking in 🚀');
  const meetSeed = await say('community', 'cy', 300, 'Anyone up for a Lagos-wide meetup next month?');
  const meetup = await spark('community', 'cy', meetSeed, 'Lagos meetup');
  await say('community', 'chioma', 295, 'Yes! Freedom Park again?', { sparkId: meetup.id });
  await say('community', 'bo', 290, 'I can sort out the venue', { sparkId: meetup.id });
  await say('community', 'kofi', 25, 'Tekken tournament sign-ups are open, details in my profile');
  readUntil('community', 'ada', 865);

  await say('faction:icons', 'tunde', 700, 'Morning Icons ☀️');
  await say('faction:icons', 'bo', 690, "Rank update: we're #2 this week, Controllers are catching up");
  const streaming = await say('faction:icons', 'dami', 50, '@ada are you streaming the sketch club this week?', { mentions: ['ada'] });
  messages.factionMentionOfAda = streaming.id;
  readUntil('faction:icons', 'ada', 695);

  // ---- rewrite timestamps and read state --------------------------------------
  for (const item of timeline) {
    const at = new Date(item.at);
    await Message.collection.updateOne({ _id: new (breq('mongoose').Types.ObjectId)(item.id) }, { $set: { createdAt: at, updatedAt: at } });
  }
  const later = new Date(now + 1000);
  for (const conv of Object.values(convs)) {
    // Everyone has read everything, unless the plan says otherwise.
    for (const username of conv.members || []) {
      await ConversationMember.updateOne({ conversation: conv.id, user: users[username].id }, { $set: { lastReadAt: later } }, { upsert: true, timestamps: false });
    }
  }
  for (const { conv, username, at } of readPlan) {
    await ConversationMember.updateOne({ conversation: convs[conv].id, user: users[username].id }, { $set: { lastReadAt: new Date(at) } }, { upsert: true, timestamps: false });
  }

  // ---- people follow ada; notifications ------------------------------------------
  for (const u of ['bo', 'chioma', 'zara', 'tunde']) await api('POST', '/api/users/ada/follow', tok(u));
  for (const u of ['bo', 'chioma', 'cy']) await api('POST', `/api/users/${u}/follow`, tok('ada'));
  await notificationModel.createForUser(users.ada.id, 'Your faction Icons climbed to #2 on the leaderboard this week 🏆');
  await notificationModel.createForUser(users.ada.id, '🎉 Welcome to CosQuest! Your account is officially live.');

  // ---- posts --------------------------------------------------------------------
  const posts = {};
  const thought = async (u, content) => (await api('POST', '/api/posts', tok(u), { type: 'thought', content })).post;
  posts.ada = (await thought('ada', 'Finished the Storm cape. Three weeks, two glue guns, zero regrets.')).id;
  posts.chioma = (await thought('chioma', 'Con 2026 planning has officially started. Group costume ideas welcome!')).id;
  posts.zara = (await thought('zara', 'Hot take: Andor is the best Star Wars show.')).id;
  {
    const form = new FormData();
    form.append('type', 'image');
    form.append('content', 'Golden hour at Freedom Park after sketch club');
    form.append('media', new Blob([media.photoPng(3)], { type: 'image/png' }), 'freedom-park.png');
    posts.tunde = (await api('POST', '/api/posts', tok('tunde'), undefined, { form })).post.id;
  }
  await api('POST', `/api/posts/${posts.ada}/likes`, tok('chioma'));
  await api('POST', `/api/posts/${posts.ada}/likes`, tok('bo'));
  await api('POST', `/api/posts/${posts.ada}/comments`, tok('bo'), { body: 'The glue gun did most of the work 😂' });
  await api('POST', `/api/posts/${posts.tunde}/likes`, tok('ada'));

  // ---- quests (the Home dashboard reads quests near the user) ------------------------
  const hour = 60 * MIN;
  const questBase = { hostName: 'CosQuest', location: { name: 'Tafawa Balewa Square', address: 'Lagos Island, Lagos', ...LAGOS }, isPublished: true, isSeedData: true };
  const quests = await Quest.insertMany([
    { ...questBase, slug: 'cosplay-city-hunt', title: 'Cosplay City Hunt', description: 'Find the hidden CosQuest markers around the city and earn points with your squad.', status: 'live', startsAt: new Date(now - hour), endsAt: new Date(now + 3 * hour), prizePool: { amount: 50000 }, entryFee: { amount: 500 }, maxParticipants: 120, interests: ['cosplay', 'anime', 'game'] },
    { ...questBase, slug: 'marvel-trivia-night', title: 'Marvel Trivia Night', description: 'Bring your best comic knowledge for a fast-paced team trivia showdown.', status: 'upcoming', startsAt: new Date(now + 24 * hour), endsAt: new Date(now + 26 * hour), prizePool: { amount: 75000 }, entryFee: { amount: 0 }, maxParticipants: 80, interests: ['comic', 'movie'], faction: 'icons' },
    { ...questBase, slug: 'anime-realm-showdown', title: 'Anime Realm Showdown', description: 'A creative fan challenge for anime lovers, artists and cosplayers.', status: 'upcoming', startsAt: new Date(now + 72 * hour), endsAt: new Date(now + 75 * hour), prizePool: { amount: 100000 }, entryFee: { amount: 1000 }, maxParticipants: 60, interests: ['anime', 'cosplay', 'music'] },
  ]);
  await api('POST', `/api/quests/${quests[1].id}/registrations`, tok('ada')).catch((e) => log(`quest registration skipped: ${e.message}`));

  // ---- perf world (SEED_PERF=1, docs/polish/BASELINE.md) -------------------------
  // A group with 2,000 messages and a feed of 50 posts (photos and videos).
  const perf = env.SEED_PERF === '1' ? await seedPerf() : null;
  async function seedPerf() {
    const mongoose = breq('mongoose');
    const PERF_MESSAGES = Number(env.PERF_MESSAGES || 2000);
    await group('g:big', 'cy', { name: 'Big Group 2k', description: 'Two thousand messages, for the scroll test.', kind: 'open' }, ['ada', 'bo', 'chioma', 'tunde', 'zara']);
    const crowd = ['cy', 'ada', 'bo', 'chioma', 'tunde', 'zara'];
    const lines = ['Anyone at the fountains?', 'That boss took forever 😅', 'Saturday works for me', 'Who has the spare wig?',
      'Photos from last night are up', 'Raid at 8, bring snacks', "I'll be 10 minutes late", 'The new Codex cards are wild',
      'Has anyone tried the Trafalgar quiz?', 'Lagos meetup is on!'];
    const start = now - 3 * 24 * 60 * MIN;
    const rows = [];
    for (let i = 0; i < PERF_MESSAGES - 2; i += 1) {
      const at = new Date(start + i * 60 * 1000);
      rows.push({
        _id: new mongoose.Types.ObjectId(),
        conversation: new mongoose.Types.ObjectId(convs['g:big'].id),
        sender: new mongoose.Types.ObjectId(users[crowd[i % crowd.length]].id),
        kind: 'text',
        content: `${lines[i % lines.length]} (#${i + 1})`,
        createdAt: at,
        updatedAt: at,
      });
    }
    await Message.collection.insertMany(rows);
    // The newest two through the API, so the list shows a normal preview.
    await say('g:big', 'bo', 3, 'Message 1999: still scrolling?');
    await say('g:big', 'cy', 2, 'Message 2000: the end of the scroll test');
    await ConversationMember.updateOne({ conversation: convs['g:big'].id, user: users.ada.id }, { $set: { lastReadAt: new Date() } }, { upsert: true, timestamps: false });

    // 50 posts: thoughts, photos and short videos.
    const people = ['bo', 'chioma', 'tunde', 'zara', 'cy', 'lena', 'kofi', 'dami'];
    let clip = null;
    try {
      const out = path.join(env.UPLOAD_DIR, 'perf-clip-src.mp4');
      require('child_process').execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=480x480:rate=30:duration=6',
        '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', out]);
      clip = fs.readFileSync(out);
    } catch (e) {
      log(`perf: no ffmpeg video (${e.message}); reels skipped`);
    }
    const perfPosts = [];
    for (let i = 0; i < 50; i += 1) {
      const u = people[i % people.length];
      let post;
      if (i % 5 === 1 && clip) {
        const form = new FormData();
        form.append('type', 'reel');
        form.append('content', `Reel ${i + 1}: costume test`);
        form.append('media', new Blob([clip], { type: 'video/mp4' }), `reel-${i + 1}.mp4`);
        post = (await api('POST', '/api/posts', tok(u), undefined, { form })).post;
      } else if (i % 5 === 3) {
        const form = new FormData();
        form.append('type', 'image');
        form.append('content', `Shoot ${i + 1}`);
        form.append('media', new Blob([media.photoPng(10 + i)], { type: 'image/png' }), `shoot-${i + 1}.png`);
        post = (await api('POST', '/api/posts', tok(u), undefined, { form })).post;
      } else {
        post = await thought(u, `Feed post ${i + 1}: ${lines[i % lines.length]}`);
      }
      perfPosts.push(post.id);
    }
    return { bigGroup: convs['g:big'].id, messages: PERF_MESSAGES, posts: perfPosts.length, reels: clip ? 10 : 0 };
  }

  // ---- result -----------------------------------------------------------------
  const sparkList = [];
  for (const s of sparks) {
    const detail = await api('GET', `/api/chats/${s.conversationId}/sparks/${s.id}`, tok('ada'));
    sparkList.push({ ...s, messageCount: detail.messages.length });
  }
  return {
    startedAt: new Date(now).toISOString(),
    baseUrl: `http://localhost:${PORT}`,
    emulatorBaseUrl: `http://10.0.2.2:${PORT}`,
    backendDir: BACKEND,
    sparksEngine: env.SPARKS_ENGINE,
    livekitUrl: env.LIVEKIT_URL,
    mediaBaseUrl: MEDIA_BASE,
    password: env.DEV_PASSWORD,
    mainUser: 'ada',
    signup: SIGNUP,
    users,
    conversations: convs,
    sparks: sparkList,
    gameInvite,
    messages,
    posts,
    perf,
    quests: quests.map((q) => ({ id: q.id, slug: q.slug, title: q.title, status: q.status })),
  };
}

// ---------------------------------------------------------------------------
async function main() {
  const { MongoMemoryServer } = breq('mongodb-memory-server');
  const { RedisMemoryServer } = breq('redis-memory-server');
  const mongod = await MongoMemoryServer.create({ instance: { args: ['--wiredTigerCacheSizeGB', '0.25'] } });
  const redisd = await RedisMemoryServer.create();
  env.MONGODB_URI = mongod.getUri('cosquest');
  env.REDIS_URL = `redis://${await redisd.getHost()}:${await redisd.getPort()}`;

  const stop = async (code = 0) => {
    try {
      fromBackend('src/sparks/index.js').stop();
    } catch {
      // not loaded
    }
    await mongod.stop().catch(() => {});
    await redisd.stop().catch(() => {});
    process.exit(code);
  };
  process.on('SIGINT', () => stop(0));
  process.on('SIGTERM', () => stop(0));

  try {
    patchBackend();
    interceptHttp();
    const { startServer } = fromBackend('server.js');
    await startServer();
    seedResult = await seed();
  } catch (error) {
    console.error('[chat-local] failed', error);
    await stop(1);
    return;
  }
  fs.writeFileSync(env.SEED_OUT, `${JSON.stringify(seedResult, null, 2)}\n`);

  log(`backend ${BACKEND} (Sparks engine: ${env.SPARKS_ENGINE})`);
  log(`listening on ${env.CHAT_HOST}:${PORT}; app: EXPO_PUBLIC_API_URL=http://localhost:${PORT} with adb reverse, or http://10.0.2.2:${PORT}`);
  log(`sign in as "ada" (ada@example.test) / "${env.DEV_PASSWORD}"; free for sign-up: ${SIGNUP.email} / ${SIGNUP.username}`);
  log(`LiveKit ${env.LIVEKIT_URL}; media served from ${MEDIA_BASE}/uploads/`);
  log(`seed written to ${env.SEED_OUT}`);
  log('ready');
}

main();
