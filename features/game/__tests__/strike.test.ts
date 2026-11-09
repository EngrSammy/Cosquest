import assert from "node:assert/strict";
import { test } from "node:test";

import {
  challengeLabel,
  choiceLook,
  choiceState,
  deadlineView,
  gradeColorKey,
  hintDisabled,
  isWin,
  PULSE_INTERVAL_MS,
  PULSE_SCALES,
  pulseHaptic,
  resolveHaptics,
  resultTitle,
  scrimOpacity,
  secondChanceLabel,
  springOf,
  STRIKE_MS,
  tierName,
} from "../strike.ts";

test("the Strike is three pulses 420 ms apart that swell 1.12, 1.18, 1.24", () => {
  assert.equal(PULSE_INTERVAL_MS, 420);
  assert.deepEqual([...PULSE_SCALES], [1.12, 1.18, 1.24]);
  assert.equal(STRIKE_MS, 1260);
});

test("the pulses rise: Light, Medium, Heavy", () => {
  assert.deepEqual([0, 1, 2].map(pulseHaptic), ["Light", "Medium", "Heavy"]);
});

test("win: Heavy, Rigid 180 ms later, then Success", () => {
  const steps = resolveHaptics(true);
  assert.deepEqual(steps[0], { atMs: 0, haptic: { kind: "impact", style: "Heavy" } });
  assert.deepEqual(steps[1], { atMs: 180, haptic: { kind: "impact", style: "Rigid" } });
  const last = steps[steps.length - 1];
  assert.deepEqual(last.haptic, { kind: "notify", type: "Success" });
});

test("loss: Soft twice 120 ms apart, then Error", () => {
  const steps = resolveHaptics(false);
  assert.deepEqual(steps.slice(0, 2).map((s) => [s.atMs, s.haptic]), [
    [0, { kind: "impact", style: "Soft" }],
    [120, { kind: "impact", style: "Soft" }],
  ]);
  assert.deepEqual(steps[2].haptic, { kind: "notify", type: "Error" });
  assert.ok(steps[2].atMs >= 120);
});

test("springOf converts response/damping to stiffness/damping", () => {
  const s = springOf(0.35, 0.6);
  assert.ok(Math.abs(s.stiffness - (2 * Math.PI / 0.35) ** 2) < 1e-9);
  assert.ok(Math.abs(s.damping - 2 * 0.6 * Math.sqrt(s.stiffness)) < 1e-9);
  assert.equal(s.mass, 1);
  assert.ok(Math.abs(springOf(0.5, 0.8).stiffness - 157.91) < 0.01);
});

test("a win is a right answer in time", () => {
  assert.equal(isWin({ correct: 1, late: false }), true);
  assert.equal(isWin({ correct: 1, late: true }), false);
  assert.equal(isWin({ correct: 0, late: false }), false);
});

test("the result line", () => {
  assert.deepEqual(resultTitle({ correct: 1, total: 1, late: false, kind: "trivia" }), { text: "Correct!", size: 38, win: true });
  assert.deepEqual(resultTitle({ correct: 0, total: 1, late: false, kind: "trivia" }), { text: "The crystal resisted", size: 30, win: false });
  assert.equal(resultTitle({ correct: 1, total: 1, late: true, kind: "trivia" }).text, "Time's up!");
  // The clock sent it with nothing given: time's up, not "the crystal resisted" (day1-trivia).
  assert.equal(resultTitle({ correct: 0, total: 1, late: false, kind: "rebus" }, true).text, "Time's up!");
  assert.equal(resultTitle({ correct: 2, total: 5, late: false, kind: "blitz" }, true).text, "2 of 5!");
  assert.equal(resultTitle({ correct: 3, total: 5, late: false, kind: "blitz" }).text, "3 of 5!");
});

test("grade chip colours: Flawless sun, Brilliant mint, else sky", () => {
  assert.equal(gradeColorKey("Flawless"), "sun");
  assert.equal(gradeColorKey("Brilliant"), "mint");
  assert.equal(gradeColorKey("Good"), "sky");
});

test("header words are Swift's", () => {
  assert.equal(tierName("epic"), "Epic");
  assert.equal(challengeLabel("rebus"), "Rebus");
  assert.equal(challengeLabel("duel"), "Duel");
  assert.equal(challengeLabel("anything"), "Trivia");
  assert.equal(scrimOpacity("approach"), 0.25);
  assert.equal(scrimOpacity("opening"), 0.25);
  assert.equal(scrimOpacity("playing"), 0.7);
});

test("a hint is usable with a bag item even when the coins are short", () => {
  const base = { allowed: true, busy: false, cost: 25 };
  assert.equal(hintDisabled({ ...base, item: 2, coins: 0 }), false);
  assert.equal(hintDisabled({ ...base, item: 0, coins: 24 }), true);
  assert.equal(hintDisabled({ ...base, item: 0, coins: 25 }), false);
  assert.equal(hintDisabled({ ...base, item: 0, coins: 100, allowed: false }), true);
  assert.equal(hintDisabled({ ...base, item: 3, coins: 100, busy: true }), true);
});

test("the deadline bar turns berry under 6 seconds", () => {
  assert.deepEqual(deadlineView(20), { seconds: 20, hot: false });
  assert.deepEqual(deadlineView(6), { seconds: 6, hot: false });
  assert.deepEqual(deadlineView(5.99), { seconds: 6, hot: true });
  assert.deepEqual(deadlineView(-3), { seconds: 0, hot: true });
});

test("choices after the verdict: the key mint 1.03, the wrong pick berry, the rest grey 0.45", () => {
  assert.equal(choiceState(2, 0, [], 2), "right");
  assert.equal(choiceState(0, 0, [], 2), "wrong");
  assert.equal(choiceState(1, 0, [], 2), "dim");
  assert.equal(choiceState(1, null, [1], null), "removed");
  assert.equal(choiceState(0, 0, [], null), "picked");
  assert.equal(choiceState(3, 0, [], null), "idle");
  assert.deepEqual(choiceLook("right"), { opacity: 1, scale: 1.03, face: "mint" });
  assert.deepEqual(choiceLook("dim"), { opacity: 0.45, scale: 1, face: "grey" });
  assert.equal(choiceLook("removed").opacity, 0.22);
});

test("second chance label counts the bag", () => {
  assert.equal(secondChanceLabel(2), "Second chance (2 left)");
  assert.equal(secondChanceLabel(-1), "Second chance (0 left)");
});
