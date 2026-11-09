#!/usr/bin/env node
/**
 * Act as another seeded user while a Maestro journey runs (the phone is
 * signed in as ada). Talks to the chat backend over HTTP (and Socket.IO for
 * typing / presence), exactly like the app does.
 *
 *   node e2e/seed/peer.js <user> <command> [args] [--flags]
 *   node e2e/seed/peer.js <global-command> [args]
 *   node e2e/seed/peer.js help
 *
 * CHAT_API (default http://localhost:4120), SEED_OUT (default ./.seed.json).
 * See README.md for every command.
 */
const { joinMedia } = require('./lkmedia');
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const media = require('./media');

const API = (process.env.CHAT_API || 'http://localhost:4120').replace(/\/+$/, '');
const SEED_OUT = process.env.SEED_OUT || path.join(__dirname, '.seed.json');
const STATE_FILE = path.join(__dirname, '.peer-state.json');
const BACKEND = path.resolve(process.env.CHAT_BACKEND_DIR || '/home/engineer/cq-work/cx-journeys/mcj-merged/cosquest-backend');
const PASSWORD = process.env.DEV_PASSWORD || 'cosquest-dev-1';

const HELP = `peer.js: act as a seeded user against the local chat backend (${API})

  node e2e/seed/peer.js <user> <command> ...      <user>: bo, cy, dami, chioma, tunde, zara, kofi, lena (or ada)
  <conv>: a username (that user's DM with you), a group name or part of it, "community",
          "faction", a seed key (g:con, dm:bo...) or a conversation id
  <msg>:  "last" (newest not mine), "last-mine", "last-poll", a message id, or text it contains

Messages
  send <conv> "text"                       reply <conv> <msg> "text"
  mention <conv> <user[,user]|everyone> "text"
  react <conv> <msg> <emoji>               unreact <conv> <msg> <emoji>
  edit <conv> <msg> "new text"             delete <conv> <msg> [--everyone]
  pin <conv> <msg>                         read <conv>
  poll <conv> "question" "opt" "opt" ... [--multiple] [--anonymous] [--closes 1h|1d|1w]
  vote <conv> <msg> <option-number...>
  image <conv> ["caption"] [--file path]   voice <conv> [--file path] [--secs 4]
  file <conv> <path> ["caption"]           typing <conv> [--secs 5]
  messages <conv> [count]                  chats
Sparks
  sparks <conv>
  spark-create <conv> "subject" ["seed text"] [--seed <msg>] [--msg "text"]... [--msg "user: text"]...
  spark-reply <conv> <spark subject|id|last> "text"
  spark-add <conv> <spark> <msg>
  spark-burst <conv> "topic"               3 on-topic messages from you + 2 others (legacy engine auto-forms a Spark)
Calls (with @livekit/rtc-node installed, see lkmedia.js, the peer joins the room and sends a tone)
  call <user> [--video] [--hold 45] [--add u1,u2] [--keep]    ring <user> in your DM; hang up after --hold s
  accept-call [--wait 60] [--hold 120]     wait for a ringing call, answer, stay --hold s, hang up
  decline-call [--wait 60]                 end-call                call-add <user[,user]>
  group-call <room> [--hold 300]           voice chat in a group / community / faction room (calls are DM only)
  voice-join <room> [--hold 300]           voice-leave <room>
Game
  invite <conv> shrine|duel|raid [--target ID] [--place NAME] [--lat N --lng N] [--at ISO] [--note TEXT]
  share-result <conv> "text"               a plain text "result" message (no result card exists)
People
  follow <user>  unfollow <user>  online [--secs 60]
  notify <recipient> "message" [--type system|follow|mention|group]   (chat-local dev route)
Global (no user)
  signup <email> <username> [--first F] [--last L] [--faction icons] [--avatar adventurer] [--no-photo]
  forgot <email>    reset <email> <new-password> [--code 123456]    mail [email]    seed
`;

// ---------------------------------------------------------------------------
// args, seed, state
// ---------------------------------------------------------------------------
const BOOLEAN = new Set(['video', 'multiple', 'anonymous', 'everyone', 'keep', 'no-photo', 'online', 'json']);
function parseArgs(argv) {
  const pos = [];
  const flags = { msg: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (BOOLEAN.has(key)) flags[key] = true;
      else if (key === 'msg') flags.msg.push(argv[++i]);
      else flags[key] = argv[++i];
    } else pos.push(a);
  }
  return { pos, flags };
}

function loadSeed() {
  try {
    return JSON.parse(fs.readFileSync(SEED_OUT, 'utf8'));
  } catch {
    return null;
  }
}
const seed = loadSeed();
// Tokens and call ids from an earlier backend run are useless: start over when the seed changes.
const loadState = () => {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return state.seedStartedAt === seed?.startedAt ? state : {};
  } catch {
    return {};
  }
};
const saveState = (state) => fs.writeFileSync(STATE_FILE, `${JSON.stringify({ ...state, seedStartedAt: seed?.startedAt }, null, 2)}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = (label, value) => console.log(`[peer] ${label}${value === undefined ? '' : ` ${typeof value === 'string' ? value : JSON.stringify(value)}`}`);

function fail(message) {
  console.error(`[peer] error: ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
async function raw(method, urlPath, { token, body, form } = {}) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${API}${urlPath}`, { method, headers, body: payload });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, data };
}

class Peer {
  constructor(username) {
    this.username = username.toLowerCase();
    const state = loadState();
    this.token = state.tokens?.[this.username] || seed?.users?.[this.username]?.token || null;
  }

  async login() {
    // One session per account: signing in here would sign the phone out.
    if (this.username === (seed?.mainUser || 'ada') && process.env.PEER_ALLOW_MAIN_LOGIN !== '1') {
      fail(`${this.username}'s seed token no longer works (the phone signed in?). Signing in here would sign the phone out; set PEER_ALLOW_MAIN_LOGIN=1 to do it anyway.`);
    }
    const r = await raw('POST', '/api/auth/login', { body: { identifier: this.username, password: PASSWORD } });
    if (!r.ok) fail(`could not sign in as ${this.username}: ${r.status} ${JSON.stringify(r.data)}`);
    this.token = r.data.token;
    const state = loadState();
    state.tokens = { ...(state.tokens || {}), [this.username]: this.token };
    saveState(state);
    this.me = r.data.user;
  }

  async call(method, urlPath, body, opts = {}) {
    if (!this.token) await this.login();
    let r = await raw(method, urlPath, { token: this.token, body, form: opts.form });
    if (r.status === 401) {
      await this.login(); // the seed token was replaced by a real sign-in
      r = await raw(method, urlPath, { token: this.token, body, form: opts.form });
    }
    if (!r.ok && !opts.allowError) fail(`${method} ${urlPath}: ${r.status} ${JSON.stringify(r.data)}`);
    return opts.allowError ? r : r.data;
  }

  async whoami() {
    if (!this.meId) {
      const me = await this.call('GET', '/api/users/me');
      this.meId = me.user?.id || me.id;
    }
    return this.meId;
  }

  async userId(username) {
    const u = seed?.users?.[username.toLowerCase()];
    if (u) return u.id;
    const r = await this.call('GET', `/api/users/${encodeURIComponent(username)}/profile`);
    return r.user?.id || r.profile?.id || r.id;
  }

  // ----- conversations / messages -----
  async conv(ref) {
    if (!ref) fail('which conversation?');
    if (/^[a-f0-9]{24}$/i.test(ref)) return { id: ref, title: ref };
    if (seed?.conversations?.[ref]) return seed.conversations[ref];
    const { chats } = await this.call('GET', '/api/chats');
    const want = ref.toLowerCase().replace(/^@/, '');
    if (want === 'community') return chats.find((c) => c.type === 'community');
    if (want === 'faction') return chats.find((c) => c.type === 'faction');
    const dm = chats.find((c) => c.type === 'dm' && c.otherParticipant?.username?.toLowerCase() === want);
    if (dm) return dm;
    const exact = chats.find((c) => String(c.title || '').toLowerCase() === want);
    if (exact) return exact;
    const part = chats.find((c) => c.type !== 'dm' && String(c.title || '').toLowerCase().includes(want));
    if (part) return part;
    if (seed?.users?.[want] || /^[a-z0-9_]{3,20}$/.test(want)) {
      const r = await this.call('POST', '/api/chats/dm', { username: want }, { allowError: true });
      if (r.ok) return r.data.chat;
    }
    return fail(`no conversation "${ref}" for ${this.username}`);
  }

  async messages(convId, limit = 50) {
    return (await this.call('GET', `/api/chats/${convId}/messages?limit=${limit}`)).messages; // newest first
  }

  async message(convId, ref = 'last') {
    if (/^[a-f0-9]{24}$/i.test(ref)) return { id: ref };
    const me = await this.whoami();
    const list = await this.messages(convId);
    const mine = (m) => m.sender?.id === me;
    let found;
    if (ref === 'last') found = list.find((m) => !mine(m) && !m.deleted) || list[0];
    else if (ref === 'last-mine') found = list.find((m) => mine(m) && !m.deleted);
    else if (ref === 'last-poll') found = list.find((m) => m.kind === 'poll');
    else found = list.find((m) => String(m.content || '').toLowerCase().includes(ref.toLowerCase()));
    return found || fail(`no message "${ref}" in that conversation`);
  }

  async send(convId, content, extra = {}) {
    const r = await this.call('POST', `/api/chats/${convId}/messages`, { content, ...extra });
    return r.message;
  }

  async sendFile(convId, { buffer, name, type, content, waveform }) {
    const form = new FormData();
    if (content) form.append('content', content);
    if (waveform) form.append('waveform', JSON.stringify(waveform));
    form.append('media', new Blob([buffer], { type }), name);
    return (await this.call('POST', `/api/chats/${convId}/messages`, undefined, { form })).message;
  }

  async spark(convId, ref) {
    const { sparks } = await this.call('GET', `/api/chats/${convId}/sparks`);
    if (!sparks.length) fail('this conversation has no Sparks');
    if (!ref || ref === 'last') return sparks.sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt))[0];
    return sparks.find((s) => s.id === ref) || sparks.find((s) => s.subject.toLowerCase().includes(ref.toLowerCase())) || fail(`no Spark "${ref}"`);
  }

  // ----- socket (typing, presence) -----
  async socket() {
    if (!this.token) await this.login();
    await this.whoami(); // refreshes a stale token first
    const { io } = createRequire(path.join(BACKEND, 'package.json'))('socket.io-client');
    const socket = io(API, { auth: { token: this.token }, transports: ['websocket'] });
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }
}

function mimeOf(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
    '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.aac': 'audio/aac', '.mp4': 'video/mp4',
    '.pdf': 'application/pdf', '.txt': 'text/plain', '.csv': 'text/csv',
  }[ext] || 'application/octet-stream';
}

const brief = (m) => m && { id: m.id, kind: m.kind, from: m.sender?.username, content: m.content, spark: m.spark?.id || null, ...(m.media ? { media: m.media.url } : {}), ...(m.gameInvite ? { gameInvite: m.gameInvite } : {}) };
const callBrief = (c) => c && { id: c.id, status: c.status, type: c.type, isGroup: c.isGroup, members: (c.members || []).map((m) => `${m.user?.username || m.user?.id || m.user}:${m.status}`) };

// Keep a call open, printing status changes, until it ends or `seconds` pass.
async function holdCall(peer, callId, seconds, { keep, media } = {}) {
  let last = '';
  const until = Date.now() + seconds * 1000;
  let call = null;
  const leaveMedia = await joinMedia(media?.url, media?.token, { log: out }).catch((e) => {
    out('media join failed', String(e.message || e));
    return null;
  });
  const stop = async () => {
    if (leaveMedia) await leaveMedia();
    if (!keep) {
      const r = await peer.call('POST', `/api/calls/${callId}/end`, undefined, { allowError: true });
      out('hung up', callBrief(r.data.call) || r.data);
    }
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  while (Date.now() < until) {
    const r = await peer.call('GET', `/api/calls/${callId}`, undefined, { allowError: true });
    call = r.data.call;
    const now = JSON.stringify(callBrief(call));
    if (now !== last) {
      out('call', callBrief(call));
      last = now;
    }
    if (!call || ['declined', 'missed', 'cancelled', 'ended'].includes(call.status)) {
      if (leaveMedia) await leaveMedia();
      const state = loadState();
      if (state.calls) delete state.calls[peer.username];
      saveState(state);
      return call;
    }
    await sleep(2000);
  }
  await stop();
  return call;
}

async function holdVoice(peer, conv, seconds) {
  const joined = await peer.call('POST', `/api/chats/${conv.id}/voice/join`);
  const room = joined.voiceRoom;
  out('in voice chat', { room: room.id, conversation: conv.title, members: (room.members || []).map((m) => m.username || m.user?.username || m.id), livekitUrl: joined.livekitUrl });
  const state = loadState();
  state.voice = { ...(state.voice || {}), [peer.username]: room.id };
  saveState(state);
  const leaveMedia = await joinMedia(joined.livekitUrl, joined.token, { log: out }).catch((e) => {
    out('media join failed', String(e.message || e));
    return null;
  });
  const leave = async () => {
    if (leaveMedia) await leaveMedia();
    await peer.call('POST', `/api/voice/${room.id}/leave`, undefined, { allowError: true });
    out('left voice chat');
    process.exit(0);
  };
  process.once('SIGINT', leave);
  process.once('SIGTERM', leave);
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    await sleep(Math.min(25000, Math.max(1000, until - Date.now())));
    if (Date.now() >= until) break;
    const r = await peer.call('POST', `/api/voice/${room.id}/ping`, undefined, { allowError: true });
    if (!r.ok) {
      out('voice chat ended', r.data);
      return;
    }
  }
  await leave();
}

// ---------------------------------------------------------------------------
// global commands
// ---------------------------------------------------------------------------
async function signupFlow(email, username, flags) {
  if (!email || !username) fail('signup <email> <username>');
  const password = flags.password || 'Cosquest-dev-1!';
  const step = async (label, method, urlPath, body, opts) => {
    const r = await raw(method, urlPath, { body, ...(opts || {}) });
    out(`${r.ok ? 'ok ' : 'ERR'} ${r.status} ${label}: ${method} ${urlPath}`, r.ok ? undefined : r.data);
    if (!r.ok) process.exit(1);
    return r.data;
  };
  // 1. app/onboarding/signup.tsx
  const created = await step('sign up', 'POST', '/api/auth/signup', { identifier: email, password, confirmPassword: password });
  out('   token issued at sign-up, onboardingRequired =', created.onboardingRequired);
  // 2. app/onboarding/createProfile.tsx
  const check = await step('username check', 'GET', `/api/users/check-username?username=${encodeURIComponent(username)}&email=${encodeURIComponent(email)}`);
  out('   available =', check.available);
  await step('profile', 'PATCH', '/api/users/me/profile', { email, firstName: flags.first || 'Nia', lastName: flags.last || 'Newbie', username, age: 22, gender: 'Female' });
  // 3. app/onboarding/uploadPicture.tsx (photo, then preset avatar)
  if (!flags['no-photo']) {
    const form = new FormData();
    form.append('email', email);
    form.append('photo', new Blob([media.avatarPng('#ff9a9e', '#fad0c4')], { type: 'image/jpeg' }), 'profile-photo.jpg');
    const photo = await step('photo upload', 'POST', '/api/users/me/avatar/photo', undefined, { form });
    out('   avatarPhotoUrl =', photo.user?.profile?.avatarPhotoUrl || photo.user?.avatarPhotoUrl);
  }
  const avatar = flags.avatar || 'adventurer';
  await step('preset avatar', 'PATCH', '/api/users/me/avatar', { email, avatar });
  // 4. app/onboarding/interests.tsx
  const interests = ['anime', 'cosplay'];
  await step('interests', 'PUT', '/api/users/me/interests', { email, interests });
  // 5. app/onboarding/permissions.tsx (sent together)
  await step('notifications', 'PATCH', '/api/users/me/preferences/notifications', { email, notificationsEnabled: true });
  const location = { locationEnabled: true, radiusMiles: 50, lat: 6.5244, lng: 3.3792 };
  await step('location', 'PATCH', '/api/users/me/preferences/location', { email, ...location });
  // 6. app/onboarding/faction.tsx
  const faction = flags.faction || 'icons';
  await step('faction', 'POST', '/api/users/me/faction', { email, factionKey: faction });
  // 7. app/onboarding/ready.tsx
  const done = await step('complete', 'POST', '/api/users/me/onboarding/complete', {
    email,
    profile: { firstName: flags.first || 'Nia', lastName: flags.last || 'Newbie', username, age: 22, gender: 'Female', avatar },
    faction,
    interests,
    preferences: { notificationsEnabled: true },
    location,
  });
  out('   onboardingComplete =', done.user?.onboardingComplete);
  // app/onboarding/signin.tsx, then the chat list
  const login = await step('sign in', 'POST', '/api/auth/login', { identifier: email, password });
  const chats = await raw('GET', '/api/chats', { token: login.token });
  out(`ok  ${chats.status} chat list:`, chats.data.chats?.map((c) => c.title));
  out('password used:', password);
}

async function mail(email) {
  const r = await raw('GET', `/__dev/mail${email ? `?to=${encodeURIComponent(email)}` : ''}`);
  if (!r.ok) fail(`${r.status} ${JSON.stringify(r.data)}`);
  for (const m of r.data.mails) out(`${m.at} to ${m.to}: ${m.subject}${m.code ? ` code=${m.code}` : ''}`);
  return r.data.latest;
}

// ---------------------------------------------------------------------------
async function main() {
  const { pos, flags } = parseArgs(process.argv.slice(2));
  const [first, ...rest] = pos;
  if (!first || first === 'help' || first === '--help') return console.log(HELP);

  // ----- global commands -----
  if (first === 'signup') return signupFlow(rest[0], rest[1], flags);
  if (first === 'mail') return mail(rest[0]);
  if (first === 'seed') {
    if (!seed) fail(`no seed file at ${SEED_OUT}`);
    out('users', Object.keys(seed.users).join(', '));
    for (const [key, c] of Object.entries(seed.conversations)) out(`${key.padEnd(14)} ${c.id} ${c.title}`);
    for (const s of seed.sparks) out(`spark ${s.id} "${s.subject}" in ${s.conversation}`);
    return;
  }
  if (first === 'forgot') {
    const r = await raw('POST', '/api/auth/forgot-password', { body: { email: rest[0] } });
    out(`${r.status}`, r.data);
    await sleep(200);
    const latest = await mail(rest[0]);
    if (latest?.code) out('code', latest.code);
    return;
  }
  if (first === 'reset') {
    const [email, newPassword] = rest;
    let code = flags.code;
    if (!code) code = (await raw('GET', `/__dev/mail?to=${encodeURIComponent(email)}`)).data.latest?.code;
    if (!code) fail('no reset code: run `forgot <email>` first');
    const r = await raw('POST', '/api/auth/reset-password', { body: { email, code, newPassword, confirmPassword: newPassword } });
    out(`${r.status}`, r.ok ? { signedIn: Boolean(r.data.token), user: r.data.user?.username || r.data.user?.email } : r.data);
    return;
  }

  // ----- user commands -----
  const peer = new Peer(first);
  const [cmd, ...args] = rest;
  if (!cmd) return console.log(HELP);
  const C = (ref) => peer.conv(ref);

  switch (cmd) {
    case 'chats': {
      const { chats } = await peer.call('GET', '/api/chats');
      for (const c of chats) out(`${c.type.padEnd(9)} ${c.id} ${String(c.title).padEnd(26)} unread=${c.unreadCount} last="${c.lastMessage?.senderName}: ${c.lastMessage?.preview}"`);
      return;
    }
    case 'messages': {
      const conv = await C(args[0]);
      const list = (await peer.messages(conv.id, Number(args[1] || 15))).reverse();
      for (const m of list) out(`${m.createdAt} ${m.id} ${m.sender?.username || 'bot'} [${m.kind}${m.spark ? ` spark=${m.spark.id}` : ''}${m.replyTo ? ` reply=${m.replyTo.id}` : ''}${m.reactions?.length ? ` ${m.reactions.map((r) => r.emoji + r.count).join('')}` : ''}] ${m.content || m.media?.url || (m.gameInvite ? JSON.stringify(m.gameInvite) : '')}`);
      return;
    }
    case 'send': {
      const conv = await C(args[0]);
      return out('sent', brief(await peer.send(conv.id, args[1] || fail('send <conv> "text"'))));
    }
    case 'reply': {
      const conv = await C(args[0]);
      const target = await peer.message(conv.id, args[1]);
      return out('replied', brief(await peer.send(conv.id, args[2] || fail('reply <conv> <msg> "text"'), { replyTo: target.id })));
    }
    case 'mention': {
      const conv = await C(args[0]);
      const who = String(args[1] || fail('mention <conv> <user[,user]|everyone> "text"')).split(',');
      const everyone = who.includes('everyone');
      const mentions = everyone ? [] : await Promise.all(who.map((u) => peer.userId(u)));
      const text = `${who.map((u) => `@${u}`).join(' ')} ${args[2] || ''}`.trim();
      return out('sent', brief(await peer.send(conv.id, text, { mentions, ...(everyone ? { mentionsEveryone: true } : {}) })));
    }
    case 'react':
    case 'unreact': {
      const conv = await C(args[0]);
      const target = await peer.message(conv.id, args[1]);
      const emoji = args[2] || '👍';
      const r = await peer.call(cmd === 'react' ? 'POST' : 'DELETE', `/api/chats/${conv.id}/messages/${target.id}/reactions`, { emoji });
      return out(cmd === 'react' ? 'reacted' : 'unreacted', { messageId: target.id, reactions: r.reactions || r.message?.reactions || r });
    }
    case 'edit': {
      const conv = await C(args[0]);
      const target = await peer.message(conv.id, args[1] || 'last-mine');
      const r = await peer.call('PATCH', `/api/chats/${conv.id}/messages/${target.id}`, { content: args[2] || fail('edit <conv> <msg> "text"') });
      return out('edited', brief(r.message));
    }
    case 'delete': {
      const conv = await C(args[0]);
      const target = await peer.message(conv.id, args[1] || 'last-mine');
      const r = await peer.call('DELETE', `/api/chats/${conv.id}/messages/${target.id}?scope=${flags.everyone ? 'everyone' : 'me'}`);
      return out('deleted', r);
    }
    case 'pin': {
      const conv = await C(args[0]);
      const target = await peer.message(conv.id, args[1]);
      return out('pinned', (await peer.call('PATCH', `/api/chats/${conv.id}/pinned-message`, { messageId: target.id, duration: flags.duration || '7d' })).pinnedMessage);
    }
    case 'read': {
      const conv = await C(args[0]);
      return out('read', await peer.call('PATCH', `/api/chats/${conv.id}/read`));
    }
    case 'poll': {
      const conv = await C(args[0]);
      const [question, ...options] = args.slice(1);
      if (!question || options.length < 2) fail('poll <conv> "question" "option" "option" ...');
      const r = await peer.call('POST', `/api/chats/${conv.id}/polls`, { question, options, multiple: Boolean(flags.multiple), anonymous: Boolean(flags.anonymous), ...(flags.closes ? { closesIn: flags.closes } : {}) });
      return out('poll', { id: r.message.id, poll: r.message.poll });
    }
    case 'vote': {
      const conv = await C(args[0]);
      const target = await peer.message(conv.id, args[1] || 'last-poll');
      const optionIds = args.slice(2).map((n) => (String(n).startsWith('o') ? n : `o${n}`));
      const r = await peer.call('POST', `/api/chats/${conv.id}/messages/${target.id}/vote`, { optionIds });
      return out('voted', r.poll || r.message?.poll || r);
    }
    case 'image': {
      const conv = await C(args[0]);
      const file = flags.file;
      const buffer = file ? fs.readFileSync(file) : media.photoPng(Math.floor(Math.random() * 4));
      return out('sent', brief(await peer.sendFile(conv.id, { buffer, name: file ? path.basename(file) : 'photo.png', type: file ? mimeOf(file) : 'image/png', content: args[1] })));
    }
    case 'voice': {
      const conv = await C(args[0]);
      const file = flags.file;
      const buffer = file ? fs.readFileSync(file) : media.voiceWav(Number(flags.secs || 4), Date.now() % 7);
      const waveform = Array.from({ length: 32 }, (_, i) => Math.round((0.25 + 0.7 * Math.abs(Math.sin(i / 2.2))) * 100) / 100);
      return out('sent', brief(await peer.sendFile(conv.id, { buffer, name: file ? path.basename(file) : 'voice-note.wav', type: file ? mimeOf(file) : 'audio/wav', waveform })));
    }
    case 'file': {
      const conv = await C(args[0]);
      const file = args[1] || fail('file <conv> <path> ["caption"]');
      return out('sent', brief(await peer.sendFile(conv.id, { buffer: fs.readFileSync(file), name: path.basename(file), type: mimeOf(file), content: args[2] })));
    }
    case 'typing': {
      const conv = await C(args[0]);
      const socket = await peer.socket();
      socket.emit('conversation:join', conv.id, () => {});
      socket.emit('typing:start', conv.id);
      out(`typing in ${conv.title || conv.id} for ${flags.secs || 5}s`);
      await sleep(Number(flags.secs || 5) * 1000);
      socket.emit('typing:stop', conv.id);
      await sleep(200);
      socket.close();
      return;
    }
    case 'online': {
      const socket = await peer.socket();
      out(`${peer.username} online for ${flags.secs || 60}s`);
      await sleep(Number(flags.secs || 60) * 1000);
      socket.close();
      return;
    }

    // ----- Sparks -----
    case 'sparks': {
      const conv = await C(args[0]);
      const { sparks, canManage } = await peer.call('GET', `/api/chats/${conv.id}/sparks`);
      for (const s of sparks) out(`${s.id} "${s.subject}" active=${s.active} pinned=${s.pinned} messages=${s.messageCount} state=${s.state || ''}`);
      return out('canManage', canManage);
    }
    case 'spark-create': {
      const conv = await C(args[0]);
      const subject = args[1] || fail('spark-create <conv> "subject" ["seed text"]');
      const seedMessage = args[2] ? await peer.send(conv.id, args[2]) : await peer.message(conv.id, flags.seed || 'last');
      const r = await peer.call('POST', `/api/chats/${conv.id}/sparks`, { messageId: seedMessage.id, subject, force: true });
      out('spark', { id: r.spark.id, subject: r.spark.subject, seed: seedMessage.id, conversation: conv.id });
      for (const line of flags.msg) {
        const m = /^([a-z0-9_]{2,20}):\s+(.+)$/i.exec(line);
        const author = m && seed?.users?.[m[1].toLowerCase()] ? new Peer(m[1]) : peer;
        const text = m && seed?.users?.[m[1].toLowerCase()] ? m[2] : line;
        out('  in spark', brief(await author.send(conv.id, text, { sparkId: r.spark.id })));
      }
      return;
    }
    case 'spark-reply': {
      const conv = await C(args[0]);
      const s = await peer.spark(conv.id, args[1]);
      return out('sent', brief(await peer.send(conv.id, args[2] || fail('spark-reply <conv> <spark> "text"'), { sparkId: s.id })));
    }
    case 'spark-add': {
      const conv = await C(args[0]);
      const s = await peer.spark(conv.id, args[1]);
      const target = await peer.message(conv.id, args[2]);
      const r = await peer.call('POST', `/api/chats/${conv.id}/sparks/${s.id}/messages`, { messageId: target.id });
      return out('added', { spark: r.spark.id, messageCount: r.spark.messageCount });
    }
    case 'spark-burst': {
      const conv = await C(args[0]);
      const topic = args[1] || 'cosplay wig styling';
      const { members } = await peer.call('GET', `/api/chats/${conv.id}/members?limit=50`);
      const others = members.map((m) => m.username).filter((u) => seed?.users?.[u] && u !== peer.username && u !== 'ada').slice(0, 2);
      const lines = [
        [peer, `Anyone know a good ${topic} tutorial?`],
        [new Peer(others[0] || peer.username), `Yes! I learned ${topic} from a video last month`],
        [new Peer(others[1] || peer.username), `${topic} is so hard, send the link please`],
      ];
      for (const [author, text] of lines) out('sent', brief(await author.send(conv.id, text)));
      await sleep(1500);
      const { sparks } = await peer.call('GET', `/api/chats/${conv.id}/sparks`);
      out('sparks now', sparks.map((s) => `${s.subject} (${s.messageCount})`));
      out('note', 'the legacy engine forms a Spark from this by itself; the module engine needs phones running the Sparks SDK');
      return;
    }

    // ----- calls -----
    case 'call': {
      const target = args[0] || 'ada';
      const conv = await C(target);
      const r = await peer.call('POST', `/api/chats/${conv.id}/calls`, { type: flags.video ? 'video' : 'audio' });
      const state = loadState();
      state.calls = { ...(state.calls || {}), [peer.username]: r.call.id };
      saveState(state);
      out('ringing', { ...callBrief(r.call), livekitUrl: r.livekitUrl, token: r.token ? 'yes' : 'no' });
      if (flags.add) {
        const inv = await peer.call('POST', `/api/calls/${r.call.id}/invite`, { usernames: flags.add.split(',') }, { allowError: true });
        out(inv.ok ? 'added' : `add failed ${inv.status}`, inv.ok ? callBrief(inv.data.call) : inv.data);
      }
      await holdCall(peer, r.call.id, Number(flags.hold || 45), { keep: flags.keep, media: { url: r.livekitUrl, token: r.token } });
      return;
    }
    case 'accept-call':
    case 'decline-call': {
      const until = Date.now() + Number(flags.wait || 60) * 1000;
      let ringing = null;
      out(`waiting up to ${flags.wait || 60}s for a call to ${peer.username}...`);
      while (!ringing && Date.now() < until) {
        ringing = (await peer.call('GET', '/api/calls/incoming')).call;
        if (!ringing) await sleep(1500);
      }
      if (!ringing) fail('nothing rang');
      if (cmd === 'decline-call') return out('declined', callBrief((await peer.call('POST', `/api/calls/${ringing.id}/decline`)).call));
      const r = await peer.call('POST', `/api/calls/${ringing.id}/accept`);
      const state = loadState();
      state.calls = { ...(state.calls || {}), [peer.username]: ringing.id };
      saveState(state);
      out('answered', { ...callBrief(r.call), livekitUrl: r.livekitUrl });
      await holdCall(peer, ringing.id, Number(flags.hold || 120), { keep: flags.keep, media: { url: r.livekitUrl, token: r.token } });
      return;
    }
    case 'end-call': {
      const id = args[0] || loadState().calls?.[peer.username];
      if (!id) fail('no call to end (give a call id)');
      const r = await peer.call('POST', `/api/calls/${id}/end`, undefined, { allowError: true });
      const state = loadState();
      if (state.calls) delete state.calls[peer.username];
      saveState(state);
      return out('ended', callBrief(r.data.call) || r.data);
    }
    case 'call-add': {
      const id = flags.call || loadState().calls?.[peer.username];
      if (!id) fail('you are not in a call (start one with call / accept-call first, or --call <id>)');
      const r = await peer.call('POST', `/api/calls/${id}/invite`, { usernames: String(args[0] || fail('call-add <user[,user]>')).split(',') });
      return out('added', callBrief(r.call));
    }
    case 'group-call':
    case 'voice-join': {
      const conv = await C(args[0] || 'faction');
      if (cmd === 'group-call' && conv.type === 'dm') fail('group-call takes a group / community / faction room; for a multi-person call use: call <user> --add u1,u2');
      await holdVoice(peer, conv, Number(flags.hold || 300));
      return;
    }
    case 'voice-leave': {
      const conv = await C(args[0] || 'faction');
      const view = await peer.call('GET', `/api/chats/${conv.id}/voice`);
      const roomId = view.voiceRoom?.id || loadState().voice?.[peer.username];
      if (!roomId) fail('no voice chat there');
      return out('left', (await peer.call('POST', `/api/voice/${roomId}/leave`, undefined, { allowError: true })).data);
    }

    // ----- game -----
    case 'invite': {
      const conv = await C(args[0]);
      const type = args[1] || 'shrine';
      const body = {
        type,
        // The default is a real Quest Point on the staging game server (Caffè Nero, Trafalgar Square).
        targetId: flags.target || 'Ldf5686bcfc03',
        place: flags.place || 'Caffè Nero',
        ...(flags.lat ? { lat: Number(flags.lat), lng: Number(flags.lng) } : { lat: 51.507277, lng: -0.128365 }),
        ...(flags.at ? { startsAt: flags.at } : {}),
        note: flags.note || (type === 'duel' ? 'Duel me 😤' : 'Meet me here?'),
      };
      const r = await peer.call('POST', `/api/chats/${conv.id}/game-invites`, body, { allowError: true });
      if (r.status === 404 && /Route not found/.test(r.data.error || '')) fail('this backend has no game-invites route (MCJ main); use the main + merged-app backend');
      if (!r.ok) fail(`${r.status} ${JSON.stringify(r.data)}`);
      return out('invite sent', brief(r.data.message));
    }
    case 'share-result': {
      const conv = await C(args[0]);
      const text = args[1] || 'Won the duel at Trafalgar Square, 3 to 1';
      return out('sent', brief(await peer.send(conv.id, `🏆 ${text}`)));
    }

    // ----- people -----
    case 'follow':
    case 'unfollow':
      return out(cmd, await peer.call(cmd === 'follow' ? 'POST' : 'DELETE', `/api/users/${encodeURIComponent(args[0] || 'ada')}/follow`));
    case 'notify': {
      const [recipient, message] = args;
      const r = await raw('POST', '/__dev/notify', { body: { username: recipient || 'ada', message: message || `${peer.username} says hi`, type: flags.type || 'system', actor: peer.username } });
      if (!r.ok) fail(`${r.status} ${JSON.stringify(r.data)}`);
      return out('notified', r.data.notification);
    }
    default:
      return fail(`unknown command "${cmd}" (try: node e2e/seed/peer.js help)`);
  }
}

main().catch((error) => fail(error.stack || error.message));
