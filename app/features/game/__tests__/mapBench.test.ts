import assert from "node:assert/strict";
import { test } from "node:test";

import { addFrame, BENCH_MS, benchInput, emptyStats, MAP_BENCH_ON, PHASES, statsLine, totalStats } from "../mapBench.ts";

test("the bench is off unless the build asks for it", () => {
  assert.equal(MAP_BENCH_ON, process.env.EXPO_PUBLIC_MAP_BENCH === "1");
});

test("the script walks every phase in order and then ends", () => {
  const seen: number[] = [];
  let flings = 0;
  let taps = 0;
  for (let t = 0; t <= BENCH_MS; t += 8) {
    const inp = benchInput(t - 8, t, 440, 956);
    if (inp.done) break;
    if (seen[seen.length - 1] !== inp.phase) seen.push(inp.phase);
    if (inp.fling) flings += 1;
    if (inp.doubleTap) taps += 1;
  }
  assert.deepEqual(seen, PHASES.map((_, i) => i));
  assert.equal(flings, 6);
  assert.equal(taps, 2);
  assert.equal(benchInput(BENCH_MS, BENCH_MS + 8, 440, 956).done, true);
});

test("a pinch phase zooms to ~2.2x and back down to ~1", () => {
  let z = 1;
  let t = 0;
  while (t < BENCH_MS) {
    const inp = benchInput(t, t + 8, 440, 956);
    if (inp.phase === 3 && inp.pinch) z *= inp.pinch.scaleChange;
    t += 8;
  }
  // 1 -> 2.2 -> 0.5 -> 1 (per-frame steps, so not exact).
  assert.ok(Math.abs(z - 1) < 0.05, `ended at ${z}`);
});

test("frame times are counted against 120 Hz and 60 Hz budgets", () => {
  const s = emptyStats();
  addFrame(s, 1, 8.3);
  addFrame(s, 1, 16.7);
  addFrame(s, 1, 40);
  const t = totalStats(s);
  assert.equal(t.frames, 3);
  assert.equal(t.over10, 2);
  assert.equal(t.over20, 1);
  assert.equal(t.over34, 1);
  assert.equal(t.worst, 40);
  assert.match(statsLine("x", t), /^x: \d+\.\d fps/);
});
