// A scripted run over the world map (components/game/WorldMap.tsx) that
// measures how smooth the camera is, the same way every time: drags with
// flings, a slow pan, pinches in and out, twists, all three at once, double
// taps, and a long drag into ground that is not loaded yet. Each frame the
// script hands the map the finger movement a person would make, and the map
// applies it with the very functions its gestures use, so everything below
// the touch recogniser (the camera, pins, tiles, their loading) is exercised.
//
// Only in builds made with EXPO_PUBLIC_MAP_BENCH=1 (MAP_BENCH_ON): in every
// other build the link is not recognised and nothing here runs. Start it with
// cosquest://mapbench (app/+native-intent.tsx); the result goes to
// Documents/mapbench.json (and "[mapbench] ..." lines where the log shows them).
//
// Pure (tested in features/game/__tests__/mapBench.test.ts).

export const MAP_BENCH_ON = process.env.EXPO_PUBLIC_MAP_BENCH === "1";

/** What the script does this frame (screen points and seconds, like a gesture's events). */
export type BenchInput = {
  phase: number;
  pan: { dx: number; dy: number } | null;
  /** A finger lifted mid-drag: the speed to glide on with (points a second). */
  fling: { vx: number; vy: number } | null;
  pinch: { fx: number; fy: number; scaleChange: number } | null;
  twist: { ax: number; ay: number; rotChange: number } | null;
  doubleTap: { x: number; y: number } | null;
  done: boolean;
};

type Seg = {
  phase: number;
  ms: number;
  pan?: { vx: number; vy: number };
  /** Fling at the segment's start. */
  fling?: { vx: number; vy: number };
  /** Zoom rate, ln(scale) a second, about (fx, fy) as screen shares. */
  zoomRate?: number;
  twistRate?: number;
  /** A double tap at the segment's start. */
  tap?: boolean;
  /** A wobble in zoom (combo): amplitude of ln(scale) a second, period ms. */
  wobble?: number;
};

export const PHASES = ["idle", "drag+fling", "slow pan", "pinch", "rotate", "combo", "double tap", "explore"] as const;

const drag = (vx: number, vy: number): Seg[] => [
  { phase: 1, ms: 450, pan: { vx, vy } },
  { phase: 1, ms: 1300, fling: { vx, vy } },
];

/** The script, in order. ~27 s. */
export const BENCH_SCRIPT: Seg[] = [
  { phase: 0, ms: 1500 },
  ...drag(1500, 0),
  ...drag(0, 1500),
  ...drag(-1500, 0),
  ...drag(0, -1500),
  ...drag(1100, 1100),
  { phase: 2, ms: 3000, pan: { vx: -220, vy: 160 } },
  // ln(2.2) / 1.2 s in, ln(0.5/2.2) / 2 s out, back to ~1.
  { phase: 3, ms: 1200, zoomRate: Math.log(2.2) / 1.2 },
  { phase: 3, ms: 2000, zoomRate: Math.log(0.5 / 2.2) / 2 },
  { phase: 3, ms: 1000, zoomRate: Math.log(2) / 1 },
  { phase: 4, ms: 1500, twistRate: 1.6 / 1.5 },
  { phase: 4, ms: 1500, twistRate: -1.6 / 1.5 },
  { phase: 5, ms: 3000, pan: { vx: 420, vy: -260 }, twistRate: 0.6, wobble: 0.9 },
  { phase: 6, ms: 900, tap: true },
  { phase: 6, ms: 900, tap: true },
  { phase: 6, ms: 900, zoomRate: Math.log(1 / 2.56) / 0.9 },
  { phase: 7, ms: 2200, pan: { vx: -1700, vy: -900 } },
  { phase: 7, ms: 2200, fling: { vx: -1700, vy: -900 } },
];

export const BENCH_MS = BENCH_SCRIPT.reduce((n, s) => n + s.ms, 0);

/**
 * The input for the frame from `prevMs` to `nowMs` after the start, on a
 * screen `width` x `height`. A segment's one-off (fling, tap) fires on the
 * first frame inside it.
 */
export function benchInput(prevMs: number, nowMs: number, width: number, height: number): BenchInput {
  "worklet";
  const out: BenchInput = { phase: 0, pan: null, fling: null, pinch: null, twist: null, doubleTap: null, done: false };
  let start = 0;
  let seg: Seg | null = null;
  for (let i = 0; i < BENCH_SCRIPT.length; i++) {
    const s = BENCH_SCRIPT[i];
    if (nowMs < start + s.ms) {
      seg = s;
      break;
    }
    start += s.ms;
  }
  if (!seg) {
    out.done = true;
    out.phase = PHASES.length - 1;
    return out;
  }
  out.phase = seg.phase;
  const dt = Math.max(0, Math.min(nowMs - prevMs, 100)) / 1000;
  const first = prevMs < start;
  if (seg.pan) out.pan = { dx: seg.pan.vx * dt, dy: seg.pan.vy * dt };
  if (seg.fling && first) out.fling = seg.fling;
  let lnZoom = (seg.zoomRate ?? 0) * dt;
  if (seg.wobble) lnZoom += seg.wobble * Math.cos(((nowMs - start) / 1500) * 2 * Math.PI) * dt;
  // Pinch about a point off centre, as two real fingers rarely straddle the middle.
  if (lnZoom) out.pinch = { fx: width * 0.42, fy: height * 0.48, scaleChange: Math.exp(lnZoom) };
  if (seg.twistRate) out.twist = { ax: width * 0.5, ay: height * 0.52, rotChange: seg.twistRate * dt };
  if (seg.tap && first) out.doubleTap = { x: width * 0.6, y: height * 0.4 };
  return out;
}

/** Frame times for one phase. */
export type FrameStats = { frames: number; ms: number; over10: number; over20: number; over34: number; worst: number };

export function emptyStats(): FrameStats[] {
  "worklet";
  const out: FrameStats[] = [];
  for (let i = 0; i < PHASES.length; i++) out.push({ frames: 0, ms: 0, over10: 0, over20: 0, over34: 0, worst: 0 });
  return out;
}

/**
 * Adds one frame's time (ms since the one before). Over 10 ms is a missed
 * 120 Hz frame; over 20 a missed 60 Hz one (the visible kind); over 34 a stall.
 */
export function addFrame(stats: FrameStats[], phase: number, dt: number) {
  "worklet";
  const s = stats[phase];
  if (!s) return;
  s.frames += 1;
  s.ms += dt;
  if (dt > 10) s.over10 += 1;
  if (dt > 20) s.over20 += 1;
  if (dt > 34) s.over34 += 1;
  if (dt > s.worst) s.worst = dt;
}

export function totalStats(stats: FrameStats[]): FrameStats {
  const t: FrameStats = { frames: 0, ms: 0, over10: 0, over20: 0, over34: 0, worst: 0 };
  for (const s of stats) {
    t.frames += s.frames;
    t.ms += s.ms;
    t.over10 += s.over10;
    t.over20 += s.over20;
    t.over34 += s.over34;
    t.worst = Math.max(t.worst, s.worst);
  }
  return t;
}

/** One line for the log: fps, missed 120 Hz frames, missed 60 Hz frames, stalls, worst frame. */
export function statsLine(name: string, s: FrameStats): string {
  const fps = s.ms > 0 ? (s.frames * 1000) / s.ms : 0;
  const pct = (n: number) => (s.frames ? ((100 * n) / s.frames).toFixed(1) : "0.0");
  return `${name}: ${fps.toFixed(1)} fps, >10ms ${s.over10} (${pct(s.over10)}%), >20ms ${s.over20} (${pct(s.over20)}%), >34ms ${s.over34}, worst ${s.worst.toFixed(1)}ms, ${s.frames} frames`;
}

// The link and the map meet here: the link may arrive before the map is up.
let pending = false;
const waiting = new Set<() => void>();

/** Asks the map to run the bench (now, or once it is on screen). */
export function requestMapBench() {
  if (!MAP_BENCH_ON) return;
  pending = true;
  waiting.forEach((l) => l());
}

/** The map takes a pending request (once). */
export function takeMapBench(): boolean {
  const was = pending;
  pending = false;
  return was;
}

export function onMapBench(listener: () => void): () => void {
  waiting.add(listener);
  return () => {
    waiting.delete(listener);
  };
}

/** Counters the map's layers bump during a run (renders, tiles mounted). */
export const benchCounters: Record<string, number> = {};
export function benchCount(name: string) {
  if (!MAP_BENCH_ON) return;
  benchCounters[name] = (benchCounters[name] ?? 0) + 1;
}
