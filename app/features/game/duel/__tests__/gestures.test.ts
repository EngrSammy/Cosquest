// Touch to InputKind, as the Unity view's DuelInput reads a thumb.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GestureRecognizer,
  HOLD_MS,
  HOLD_START_TICKS,
  classifyRelease,
  msToTicks,
} from "../gestures.ts";
import { DuelRunner } from "../runner.ts";
import { DuelSetup, FighterSetup, FighterStats } from "../setup.ts";
import { FighterAction, InputKind } from "../types.ts";

const W = 400;
const H = 800;
const { Tap, SwipeToward, SwipeAway, HoldStart, HoldEnd, Special1, Special2, MoveToward, MoveAway, None } = InputKind;

function rec(facing = 1): GestureRecognizer {
  const g = new GestureRecognizer({ width: W, height: H });
  g.facing = facing;
  return g;
}

/** The next n ticks' input kinds. */
function drain(g: GestureRecognizer, n: number): InputKind[] {
  const out: InputKind[] = [];
  for (let i = 0; i < n; i++) out.push(g.next().kind);
  return out;
}

describe("taps and flicks", () => {
  it("a quick still touch is a Tap, then nothing", () => {
    const g = rec();
    g.press(1000, 200, 500);
    g.move(1060, 203, 502);
    g.release(1120, 204, 501);
    assert.deepEqual(drain(g, 3), [Tap, None, None]);
  });

  it("a touch that moved too far is not a tap", () => {
    const g = rec();
    g.press(0, 200, 500);
    g.release(100, 200, 540); // 40 px down: not sideways enough to flick, too far to tap
    assert.deepEqual(drain(g, 1), [None]);
  });

  it("a fast sideways flick is a dash toward or a dodge away, by facing", () => {
    const cases: [number, number, InputKind][] = [
      [1, 70, SwipeToward],
      [1, -70, SwipeAway],
      [-1, 70, SwipeAway],
      [-1, -70, SwipeToward],
    ];
    for (const [facing, dx, want] of cases) {
      const g = rec(facing);
      g.press(0, 200, 500);
      g.move(60, 200 + dx / 2, 505);
      g.release(120, 200 + dx, 508);
      assert.deepEqual(drain(g, 2), [want, None], `facing ${facing} dx ${dx}`);
    }
  });

  it("a mostly vertical flick is nothing", () => {
    const g = rec();
    g.press(0, 200, 500);
    g.release(100, 250, 450);
    assert.deepEqual(drain(g, 1), [None]);
  });

  it("classifyRelease is the same rule as a pure function", () => {
    assert.equal(classifyRelease(100, 0, 0, W, 1), Tap);
    assert.equal(classifyRelease(301, 0, 0, W, 1), None);
    assert.equal(classifyRelease(200, 50, 0, W, 1), SwipeToward);
    assert.equal(classifyRelease(251, 50, 0, W, 1), None);
    assert.equal(classifyRelease(200, -50, 0, W, -1), SwipeToward);
  });
});

describe("holds", () => {
  it("a still thumb becomes HoldStart at 180 ms (11 ticks), noticed by poll", () => {
    assert.equal(msToTicks(HOLD_MS), HOLD_START_TICKS);
    const g = rec();
    g.press(0, 200, 500);
    g.poll(100);
    assert.equal(g.pending, 0);
    g.poll(179);
    assert.equal(g.pending, 0);
    g.poll(180);
    assert.deepEqual(drain(g, 2), [HoldStart, None]);
    for (let t = 200; t < 800; t += 16) g.poll(t);
    g.release(800, 201, 499);
    const end = g.next();
    assert.equal(end.kind, HoldEnd);
    assert.equal(end.holdTicks, 37); // (800 - 180) ms
    assert.equal(g.next().kind, None);
  });

  it("a still touch released at 250 ms with no poll in between is a short block, not a tap", () => {
    const g = rec();
    g.press(0, 200, 500);
    g.release(250, 200, 500);
    assert.deepEqual(drain(g, 3), [HoldStart, HoldEnd, None]);
  });

  it("a thumb that wanders while waiting does not hold", () => {
    const g = rec();
    g.press(0, 200, 500);
    g.move(150, 200, 540); // 40 px off, but not sideways: neither drag nor hold
    g.poll(300);
    assert.equal(g.pending, 0);
  });
});

describe("walking", () => {
  it("a slow sideways drag walks every tick, with hysteresis near the start", () => {
    const g = rec();
    g.press(0, 200, 500);
    g.move(100, 240, 500); // too early to be a drag (150 ms)
    assert.equal(g.walking, 0);
    g.move(160, 245, 500);
    assert.deepEqual(drain(g, 3), [MoveToward, MoveToward, MoveToward]);
    g.move(300, 210, 500); // back within 0.45 of the drag distance: stop
    assert.deepEqual(drain(g, 1), [None]);
    g.move(400, 150, 500);
    assert.deepEqual(drain(g, 2), [MoveAway, MoveAway]);
    g.release(500, 150, 500);
    assert.deepEqual(drain(g, 1), [None]);
  });

  it("walking follows facing: right is away when the Guardian is on the left", () => {
    const g = rec(-1);
    g.press(0, 200, 500);
    g.move(200, 260, 500);
    assert.deepEqual(drain(g, 1), [MoveAway]);
  });

  it("dragging out of a hold ends the hold first", () => {
    const g = rec();
    g.press(0, 200, 500);
    g.poll(200);
    g.move(300, 260, 500);
    assert.deepEqual(drain(g, 4), [HoldStart, HoldEnd, MoveToward, MoveToward]);
  });

  it("discrete gestures come out one per tick, before walking resumes", () => {
    const g = rec();
    g.press(0, 200, 500);
    g.move(200, 260, 500);
    g.special(1);
    g.special(2);
    assert.deepEqual(drain(g, 4), [Special1, Special2, MoveToward, MoveToward]);
  });
});

describe("what is ignored", () => {
  it("touches on the HUD at the top", () => {
    const g = rec();
    g.press(0, 200, 50);
    g.release(80, 200, 50);
    assert.deepEqual(drain(g, 1), [None]);
    assert.equal(g.touching, false);
  });

  it("a second finger", () => {
    const g = rec();
    g.press(0, 200, 500, 1);
    g.press(10, 100, 500, 2);
    g.move(20, 300, 500, 2);
    g.release(30, 300, 500, 2);
    assert.equal(g.touching, true);
    g.release(90, 201, 500, 1);
    assert.deepEqual(drain(g, 2), [Tap, None]);
  });

  it("everything while disabled; disabling mid-hold lets go", () => {
    const g = rec();
    g.press(0, 200, 500);
    g.poll(200);
    g.setEnabled(false, 300);
    assert.deepEqual(drain(g, 3), [HoldStart, HoldEnd, None]);
    g.press(400, 200, 500);
    g.special(1);
    assert.equal(g.touching, false);
    assert.equal(g.pending, 0);
    g.setEnabled(true, 500);
    g.press(600, 200, 500);
    g.cancel(650);
    assert.deepEqual(drain(g, 1), [Tap]);
  });

  it("clear() forgets a fight", () => {
    const g = rec();
    g.special(1);
    g.press(0, 200, 500);
    g.clear();
    assert.equal(g.pending, 0);
    assert.equal(g.touching, false);
  });
});

describe("gestures driving the sim", () => {
  function humans(): DuelSetup {
    const s = new DuelSetup();
    s.seed = 3n;
    s.startGapMm = 800;
    s.p1 = Object.assign(new FighterSetup(), { stats: new FighterStats(1000, 460, 0) });
    s.p2 = Object.assign(new FighterSetup(), { stats: new FighterStats(1000, 460, 0) });
    return s;
  }

  it("a 1 s hold blocks, charges and throws a heavy that knocks down", () => {
    const g = rec();
    const runner = new DuelRunner(humans(), { input: g });
    const actions = new Set<number>();
    const frame = 1000 / 60;
    let t = 0;
    g.press(t, 200, 500);
    for (let i = 0; i < 150; i++) {
      t += frame;
      if (i === 60) g.release(t, 200, 500);
      else g.poll(t);
      runner.advance(frame);
      actions.add(runner.sim.state.p1.action);
    }
    for (const a of [FighterAction.Block, FighterAction.HeavyCharge, FighterAction.HeavyRelease]) assert.ok(actions.has(a), `P1 was in action ${a}`);
    assert.equal(runner.sim.state.p2.hp < 1000, true);
    const inputs = runner.finishPayload().inputs;
    assert.equal(inputs.length, 2);
    assert.deepEqual(inputs.map((e) => e[1]), [HoldStart, HoldEnd]);
    assert.ok(Math.abs(inputs[0][0] - HOLD_START_TICKS) <= 1, `HoldStart on tick ${inputs[0][0]}`);
  });

  it("a tap is a light attack on the next tick", () => {
    const g = rec();
    const runner = new DuelRunner(humans(), { input: g });
    g.press(0, 200, 500);
    g.release(90, 200, 500);
    runner.advance(1000 / 60);
    assert.equal(runner.sim.state.p1.action, FighterAction.Light1);
    assert.deepEqual(runner.finishPayload().inputs, [[1, Tap]]);
  });
});
