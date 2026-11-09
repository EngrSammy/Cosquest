import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COUNT_STEPS,
  countAt,
  dailyToShow,
  easeOutCubic,
  fightHighlights,
  fightRewardTimeline,
  LOSS_TIPS,
  lossTip,
  REWARD_COUNT_MS,
  ROW_EVERY_MS,
  SHEET_DELAY_MS,
} from "../fightReward.ts";

test("rows land 90 ms apart after the sheet's delay", () => {
  const t = fightRewardTimeline(3, 120, false);
  assert.deepEqual(t.rowAt, [SHEET_DELAY_MS, SHEET_DELAY_MS + ROW_EVERY_MS, SHEET_DELAY_MS + 2 * ROW_EVERY_MS]);
  assert.ok(t.countStart > t.rowAt[2]);
});

test("the XP count is rewardCount: 600 ms, ease-out, lands exactly on the total", () => {
  const t = fightRewardTimeline(0, 137, false);
  assert.equal(t.count.length, COUNT_STEPS);
  assert.equal(t.count.at(-1)?.value, 137);
  assert.equal(t.countDone - t.countStart, REWARD_COUNT_MS);
  for (let i = 1; i < t.count.length; i++) assert.ok(t.count[i].value >= t.count[i - 1].value);
  // ease-out: past half the total before half the time
  assert.ok(countAt(100, REWARD_COUNT_MS / 2) > 50);
  assert.equal(countAt(100, 0), 0);
  assert.equal(countAt(100, 10_000), 100);
  assert.equal(easeOutCubic(1), 1);
  assert.equal(easeOutCubic(-1), 0);
});

test("no XP: no count, no wait", () => {
  const t = fightRewardTimeline(0, 0, false);
  assert.equal(t.count.length, 0);
  assert.equal(t.countDone, t.countStart);
  assert.equal(t.level, null);
});

test("a level up fills the bar after the count, then pops its own screen", () => {
  const t = fightRewardTimeline(2, 80, true);
  assert.ok(t.level);
  assert.equal(t.level?.fillAt, t.countDone);
  assert.ok((t.level?.popAt ?? 0) > t.countDone);
  assert.ok(t.dropAt > t.countDone);
});

test("highlights come from Godot's record, zeros left out, at most four", () => {
  const h = fightHighlights({ damage_dealt: 5992, crits: 12, combo_max: 3, parries: 0, time_s: 19.8 });
  assert.deepEqual(h.map((x) => x.id), ["dealt", "crits", "combo", "time"]);
  assert.equal(h[0].value, "5992");
  assert.equal(h[2].value, "×3");
  assert.equal(h[3].value, "20 s");
  assert.deepEqual(fightHighlights(null), []);
  assert.equal(fightHighlights({ damage_dealt: 1, crits: 1, combo_max: 2, parries: 2, time_s: 75 }).length, 4);
});

test("the daily shown is the nearest to done, never a done one", () => {
  const d = [
    { id: "a", title: "A", progress: 1, target: 5, done: false },
    { id: "b", title: "B", progress: 2, target: 3, done: false },
    { id: "c", title: "C", progress: 3, target: 3, done: true },
  ];
  assert.equal(dailyToShow(d)?.id, "b");
  assert.equal(dailyToShow([]), null);
  assert.equal(dailyToShow([{ id: "c", title: "C", progress: 3, target: 3, done: true }]), null);
});

test("the loss tip is one calm line, the same for the same fight", () => {
  assert.equal(lossTip(239), lossTip(239));
  assert.ok(LOSS_TIPS.includes(lossTip(-7)));
  for (const t of LOSS_TIPS) assert.ok(t.length < 100 && !t.includes("\n"));
});
