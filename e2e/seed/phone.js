/**
 * Quick adb taps on the emulator for the moments Maestro is too slow for.
 *
 * After every command Maestro re-reads the screen and waits for it to go
 * idle. The game's quiz timer bar and fight scene never go idle, so each
 * Maestro step there takes 20 to 40 s: longer than a quiz question's clock.
 * While Maestro is running nothing else can read the screen either (one UI
 * automation session at a time), so these taps go to fixed spots, and the quiz
 * answer comes from the local game backend's database (test rig only).
 *
 * A flow starts these in the background through peer-server.js (args start
 * with "phone"), then taps Play or Fight itself:
 *
 *   node e2e/seed/phone.js quiz [--timeout 60]        answer the next quiz right
 *   node e2e/seed/phone.js taps <n> [--after 3] [--x .55 --y .45]   tap to strike
 *   node e2e/seed/phone.js net off|on          the phone's wifi and data (task 059)
 *   node e2e/seed/phone.js shade [close]        the notification shade
 *
 * Uses adb from ANDROID_HOME (default ~/cq-work/tools/android-sdk) and the
 * game Postgres container cx054-game-pg (e2e-game/game-up.sh).
 */
const { execFileSync } = require('child_process');
const path = require('path');

const ADB = path.join(process.env.ANDROID_HOME || path.join(process.env.HOME || '', 'cq-work/tools/android-sdk'), 'platform-tools/adb');
const PG = process.env.GAME_PG_CONTAINER || 'cx054-game-pg';
const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8' });
// GAME_PG_USER / GAME_PG_DB for a rig with its own database (cq 056: cq056-pg, postgres, costquest_rig).
const PG_ARGS = ['-U', process.env.GAME_PG_USER || 'costquest', ...(process.env.GAME_PG_DB ? ['-d', process.env.GAME_PG_DB] : [])];
const sql = (q) => execFileSync('docker', ['exec', PG, 'psql', ...PG_ARGS, '-At', '-c', q], { encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Answer rows on the quiz screen (components/game/Encounter.tsx, one-codebase
// layout: four full-width rows at the bottom) on a 1080x2400 phone; x is right
// of centre to keep clear of the Chats bubble.
const CHOICE_Y = [1695, 1872, 2049, 2226];
const CHOICE_X = 600;

// Where the answer rows really are: the rows move with the question's
// length, so fixed positions missed when it wrapped. A raw screenshot is read
// down a column near the right edge (inside the rows, clear of the Chats
// bubble and most text) and compared with a column just outside the rows (the
// background at the same height, which is a gradient): the rows are the tall
// bands where the two differ. null when it can't tell (then CHOICE_Y is used).
function choiceRows() {
  const raw = execFileSync(ADB, ['exec-out', 'screencap'], { maxBuffer: 64 * 1024 * 1024 });
  const w = raw.readUInt32LE(0);
  const h = raw.readUInt32LE(4);
  const header = raw.length - w * h * 4;
  if (header < 12 || header > 16) return null;
  const px = (x, y) => {
    const o = header + (y * w + x) * 4;
    return [raw[o], raw[o + 1], raw[o + 2]];
  };
  const x = Math.round(w * 0.94);
  const outside = Math.round(w * 0.995);
  const differs = (y) => {
    const a = px(x, y);
    const b = px(outside, y);
    return a.reduce((d, c, k) => d + Math.abs(c - b[k]), 0) > 60;
  };
  const bands = [];
  let start = -1;
  for (let y = Math.round(h * 0.2); y < Math.round(h * 0.97); y += 1) {
    if (differs(y)) {
      if (start < 0) start = y;
    } else if (start >= 0) {
      if (y - start >= h * 0.03) bands.push(Math.round((start + y) / 2));
      start = -1;
    }
  }
  // The answers are the last four bands (anything above is the question area).
  return bands.length >= 2 ? bands.slice(-4) : null;
}

function screen() {
  const m = adb('shell', 'wm', 'size').match(/(\d+)x(\d+)/);
  return { w: Number(m[1]), h: Number(m[2]) };
}

async function quiz(timeoutS) {
  const since = Date.now() / 1000 - 2;
  const until = Date.now() + timeoutS * 1000;
  let row = '';
  while (!row && Date.now() < until) {
    row = sql(`select kind || '|' || (expected->'answers')::text || '|' || extract(epoch from issued_at) from roam_attempts where issued_at > to_timestamp(${since}) and answered_at is null order by issued_at desc limit 1`);
    if (!row) await sleep(250);
  }
  if (!row) throw new Error('no quiz started');
  const [kind, answersJson, issued] = row.split('|');
  const answers = JSON.parse(answersJson);
  if (kind === 'sequence') throw new Error('sequence quizzes are not supported here');
  const { h } = screen();
  const scale = h / 2400;
  // let "The shrine is waking" pass and the card appear
  await sleep(Math.max(0, Number(issued) * 1000 + 2500 - Date.now()));
  let rows = null;
  try {
    rows = choiceRows();
  } catch (e) {
    console.error(`screencap: ${e.message}`);
  }
  const ys = rows && rows.length > Math.max(...answers) ? rows : CHOICE_Y.map((y) => Math.round(y * scale));
  for (const i of answers) {
    adb('shell', 'input', 'tap', String(Math.round(CHOICE_X * scale)), String(ys[i]));
    await sleep(900);
  }
  console.log(`${kind}: tapped ${answers.join(',')} at y ${answers.map((i) => ys[i]).join(',')}${rows ? '' : ' (fixed rows)'}`);
}

async function taps(n, afterS, fx, fy) {
  await sleep(afterS * 1000);
  const { w, h } = screen();
  const x = Math.round(w * fx);
  const y = Math.round(h * fy);
  adb('shell', `for i in $(seq ${n}); do input tap ${x} ${y}; done`);
  console.log(`${n} taps at ${x},${y}`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = {};
  const args = [];
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i].startsWith('--')) {
      flags[rest[i].slice(2)] = rest[i + 1];
      i += 1;
    } else args.push(rest[i]);
  }
  if (cmd === 'quiz') await quiz(Number(flags.timeout || 60));
  else if (cmd === 'taps') await taps(Number(args[0] || 60), Number(flags.after || 3), Number(flags.x || 0.55), Number(flags.y || 0.45));
  // Task 059: the phone's network off / on (the offline-send journey). The
  // adb tunnels to this machine are not network, so the backends stay
  // reachable; what changes is what the app is told (NetInfo).
  else if (cmd === 'net') {
    const on = args[0] === 'on';
    adb('shell', 'svc', 'wifi', on ? 'enable' : 'disable');
    adb('shell', 'svc', 'data', on ? 'enable' : 'disable');
  } else if (cmd === 'shade') {
    // Pull the notification shade down (push tap journey).
    adb('shell', 'cmd', 'statusbar', args[0] === 'close' ? 'collapse' : 'expand-notifications');
  } else throw new Error('phone.js quiz | taps <n> | net on|off | shade [close]');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
