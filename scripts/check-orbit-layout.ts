// Quick check of the group-call orbit layout (components/calls/orbitLayout.ts)
// over two minutes of a simulated, lively 6-person call: people talk in
// bursts and over each other, and LiveKit reports who is speaking every
// 100 ms. No phone needed. Run:  npx tsx scripts/check-orbit-layout.ts
//
// It counts how often the middle circle changes hands. Each change resizes
// two live videos (the old and the new speaker), which is what made group
// video calls lag and freeze.
import type { OrbitPerson } from "../components/calls/OrbitCall";
import {
  CENTER_HOLD_MS,
  DECAY,
  TICK_MS,
  holdCenter,
  layoutKey,
  pickCenter,
  placeOrbit,
  type CenterHold,
} from "../components/calls/orbitLayout";

const BOX = { w: 390, h: 520 };
const EVENT_MS = 100;
const CALL_MS = 120_000;

let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
}

// Deterministic "random" (same numbers every run).
let seed = 42;
function random() {
  seed = (seed * 1103515245 + 12345) % 2 ** 31;
  return seed / 2 ** 31;
}

const ids = ["caller", "ada", "bola", "chidi", "dami", "efe"];
const person = (id: string, speaking: boolean): OrbitPerson => ({ id, name: id, speaking, micOff: false, hasVideo: true });

// Who is speaking at each 100 ms step: bursts of 0.3-4 s with gaps, two
// people overlap now and then, and short "breath" gaps inside a burst.
const timeline: boolean[][] = [];
const until = new Map<string, number>();
let current = "ada";
for (let t = 0; t < CALL_MS; t += EVENT_MS) {
  if ((until.get(current) ?? 0) <= t && random() < 0.35) {
    current = ids[Math.floor(random() * ids.length)];
    until.set(current, t + 300 + random() * 3700);
  }
  // Someone cuts in briefly.
  if (random() < 0.04) {
    const other = ids[Math.floor(random() * ids.length)];
    until.set(other, t + 200 + random() * 800);
  }
  timeline.push(ids.map((id) => (until.get(id) ?? 0) > t && random() > 0.08));
}

function run(hold: boolean) {
  const scores = new Map<string, number>();
  let center: CenterHold | null = null;
  let lastCenter: string | null = null;
  let lastKey = "";
  let swaps = 0;
  let layoutChanges = 0;
  let minGap = Infinity;
  let lastSwapAt = -Infinity;

  timeline.forEach((speaking, step) => {
    const now = step * EVENT_MS;
    const people = ids.map((id, i) => person(id, speaking[i]));
    if (now % TICK_MS === 0) {
      for (const p of people) scores.set(p.id, (scores.get(p.id) || 0) * DECAY + (p.speaking ? 1 : 0));
    }
    const want = pickCenter(people, "caller", scores);
    let centerId: string | null;
    if (hold) {
      center = holdCenter(center, people, want, now);
      centerId = center?.id ?? null;
    } else {
      centerId = want; // before: whoever LiveKit says is speaking, at once
    }
    if (lastCenter !== null && centerId !== lastCenter) {
      swaps++;
      minGap = Math.min(minGap, now - lastSwapAt);
      lastSwapAt = now;
    }
    lastCenter = centerId;
    const key = layoutKey(placeOrbit(people, BOX, scores, centerId), BOX);
    if (key !== lastKey) layoutChanges++;
    lastKey = key;
  });

  return { swaps, layoutChanges, minGap };
}

const before = run(false);
const after = run(true);
const perMinute = (n: number) => ((n * 60_000) / CALL_MS).toFixed(1);

console.log(`2-minute call, 6 people, speaker updates every ${EVENT_MS} ms`);
console.log(`  before: middle changed hands ${before.swaps} times (${perMinute(before.swaps)}/min), closest two ${before.minGap} ms apart`);
console.log(`  after:  middle changed hands ${after.swaps} times (${perMinute(after.swaps)}/min), closest two ${after.minGap} ms apart`);

check("the middle is held at least CENTER_HOLD_MS", after.minGap >= CENTER_HOLD_MS, `${after.minGap} ms`);
check("at most a third of the swaps (and video resizes) of before", after.swaps * 3 <= before.swaps, `${after.swaps} vs ${before.swaps}`);

// The middle still follows the conversation: someone who talks for 3 s
// gets it within the hold.
{
  let c: CenterHold | null = null;
  const scores = new Map<string, number>();
  const quiet = ids.map((id) => person(id, false));
  for (let t = 0; t <= 5000; t += EVENT_MS) c = holdCenter(c, quiet, pickCenter(quiet, "caller", scores), t);
  check("nobody talking: the pinned person has the middle", c?.id === "caller", String(c?.id));
  let tookAt = -1;
  for (let t = 5000; t <= 8000; t += EVENT_MS) {
    const people = ids.map((id) => person(id, id === "bola"));
    c = holdCenter(c, people, pickCenter(people, "caller", scores), t);
    if (tookAt < 0 && c?.id === "bola") tookAt = t - 5000;
  }
  check("a new speaker takes the middle within the hold", tookAt >= 0 && tookAt <= CENTER_HOLD_MS, `${tookAt} ms`);

  // A breath (0.4 s of silence) doesn't send the middle back to the pinned person.
  const breath = ids.map((id) => person(id, false));
  for (let t = 8100; t <= 8500; t += EVENT_MS) c = holdCenter(c, breath, pickCenter(breath, "caller", scores), t);
  check("a pause for breath keeps the speaker in the middle", c?.id === "bola", String(c?.id));

  // After a long silence it goes back.
  for (let t = 8600; t <= 11000; t += EVENT_MS) c = holdCenter(c, breath, pickCenter(breath, "caller", scores), t);
  check("long silence: back to the pinned person", c?.id === "caller", String(c?.id));

  // The person in the middle leaves: replaced at once.
  const left = ids.filter((id) => id !== "caller").map((id) => person(id, false));
  c = holdCenter(c, left, pickCenter(left, "caller", scores), 11100);
  check("the middle person leaves: someone else gets it at once", !!c && c.id !== "caller", String(c?.id));
}

// The score tick alone (nobody's ring changes) doesn't change the layout key,
// so the orbit doesn't re-render for it.
{
  const people = ids.map((id) => person(id, false));
  const scores = new Map<string, number>(ids.map((id) => [id, 0.5]));
  const k1 = layoutKey(placeOrbit(people, BOX, scores, "caller"), BOX);
  for (const id of ids) scores.set(id, 0.5 * DECAY);
  const k2 = layoutKey(placeOrbit(people, BOX, scores, "caller"), BOX);
  check("a score tick with no ring change keeps the layout", k1 === k2);
}

if (failed) {
  console.log(`${failed} check(s) failed`);
  process.exit(1);
}
