import assert from "node:assert/strict";
import { test } from "node:test";

import { ceremonyTimeline, COUNT_MS, dailiesDone, factionLine, ioniconForSymbol, lineAmount, standingProgress } from "../rewardCeremony.ts";

test("standing progress is the fraction of the level, full at the top", () => {
  assert.equal(standingProgress({ into_level: 30, level_span: 120, max_level: false }), 0.25);
  assert.equal(standingProgress({ into_level: 0, level_span: 0, max_level: false }), 0);
  assert.equal(standingProgress({ into_level: 5, level_span: 100, max_level: true }), 1);
  assert.equal(standingProgress({ into_level: 500, level_span: 100, max_level: false }), 1);
  assert.equal(standingProgress(null), 0);
});

test("lines land every 90 ms from 160 ms (art direction 7), the count a beat after the last", () => {
  const t = ceremonyTimeline(3, 100, false);
  assert.deepEqual(t.lineAt, [160, 250, 340]);
  assert.equal(t.xp[0].atMs, 160 + 90 * 3 + 60 + 25);
});

test("XP rolls up over rewardCount (600 ms), easing out, whole numbers, landing on the total", () => {
  const t = ceremonyTimeline(2, 87, false);
  assert.equal(t.xp.length, 24);
  assert.equal(t.xp[23].value, 87);
  for (let i = 1; i < 24; i++) assert.ok(t.xp[i].value >= t.xp[i - 1].value);
  for (const s of t.xp) assert.equal(s.value, Math.floor(s.value));
  // Ease-out: more than half the total in the first half of the time.
  assert.ok(t.xp[11].value > 87 / 2);
  assert.equal(t.xpDoneAt - (t.xp[0].atMs - 25), COUNT_MS);
  assert.equal(COUNT_MS, 600);
});

test("no level-up: the bar fills with the count", () => {
  const t = ceremonyTimeline(1, 10, false);
  assert.equal(t.level, null);
  assert.equal(t.settleAt, t.xpDoneAt - COUNT_MS);
  assert.equal(t.settleMs, COUNT_MS);
});

test("level-up: bar fills in 450 ms after the count, the overlay pops 250 ms later, the bar settles then", () => {
  const t = ceremonyTimeline(1, 10, true);
  assert.deepEqual(t.level, { fillAt: t.xpDoneAt, fillMs: 450, popAt: t.xpDoneAt + 700 });
  assert.equal(t.settleAt, t.xpDoneAt + 700);
});

test("no lines and no XP still has a timeline", () => {
  const t = ceremonyTimeline(0, 0, false);
  assert.deepEqual(t.lineAt, []);
  assert.equal(t.xp[23].value, 0);
});

test("a line shows XP only, never coins", () => {
  assert.equal(lineAmount({ xp: 12, factionPoints: 3 }), "+12 XP");
  assert.equal(lineAmount({ xp: 0, factionPoints: 3 }), "+3 FP");
  // A line that pays nothing is a note: no "+0 XP".
  assert.equal(lineAmount({ xp: 0, factionPoints: 0 }), "");
  assert.equal(factionLine(4), "+4 for your faction");
  assert.equal(factionLine(0), null);
});

test("completed dailies are named by their title", () => {
  const dailies = [
    { id: "play3", title: "Play three points" },
    { id: "walk", title: "Walk a kilometre" },
  ];
  const done = dailiesDone(["walk", "mystery"], dailies);
  assert.deepEqual(done.map((d) => d.title), ["Walk a kilometre", "Daily quest"]);
  assert.equal(done[0].daily?.id, "walk");
  assert.equal(done[1].daily, null);
  assert.deepEqual(dailiesDone(["x"], null).map((d) => d.title), ["Daily quest"]);
});

test("the server's SF Symbol maps to an Ionicon, else by kind", () => {
  assert.equal(ioniconForSymbol("rectangle.stack.fill", "codex"), "albums");
  assert.equal(ioniconForSymbol("sparkles", "x"), "sparkles");
  assert.equal(ioniconForSymbol("bolt.circle.fill", "x"), "flash");
  assert.equal(ioniconForSymbol(null, "stamps"), "ribbon");
  assert.equal(ioniconForSymbol("weird.symbol", "other"), "sparkles");
});
