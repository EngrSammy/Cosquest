// The fixed-step runner: 60 Hz from real time whatever the frame rate, a cap
// on catch-up, and a finish payload the server's judge accepts and its
// verifier can replay.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { XorShift } from "../determinism.ts";
import { InputLog, type WireInput } from "../inputLog.ts";
import { DuelRunner, type FinishPayload, type InputSource } from "../runner.ts";
import { AiParams, DuelSetup, FighterSetup, FighterStats } from "../setup.ts";
import { Difficulty, Faction, type InputFrame, InputKind, Stance, WeaponClass } from "../types.ts";

/** A level-1 player against a point Guardian, as roam_duel.py sets them up. */
function siege(seed = 4242n, round = 3600): DuelSetup {
  const s = new DuelSetup();
  s.seed = seed;
  s.roundTicks = round;
  s.p1 = Object.assign(new FighterSetup(), { class: WeaponClass.Blade, stats: new FighterStats(1000, 460, 0) });
  s.p2 = Object.assign(new FighterSetup(), {
    class: WeaponClass.Fists,
    stats: new FighterStats(1000, 460, 0),
    ai: AiParams.create(Stance.Counter, Faction.Marvel, Difficulty.Normal),
  });
  return s;
}

/** A plausible thumb (the engine's InputRateTests player), as an InputSource. */
class Thumb implements InputSource {
  facing = 1;
  private holdLeft = 0;
  private cooldown = 0;
  private readonly r: XorShift;
  private readonly runner: () => DuelRunner;
  constructor(runner: () => DuelRunner, seed: bigint) {
    this.runner = runner;
    this.r = new XorShift(seed);
  }
  next(): InputKind {
    const s = this.runner().sim.state;
    if (this.holdLeft > 0) {
      this.holdLeft--;
      return this.holdLeft === 0 ? InputKind.HoldEnd : InputKind.None;
    }
    if (this.cooldown > 0) {
      this.cooldown--;
      return InputKind.None;
    }
    if (Math.abs(s.p1.x - s.p2.x) > 1100) return InputKind.MoveToward;
    const roll = this.r.next(100);
    if (roll < 55) { this.cooldown = 9 + this.r.next(8); return InputKind.Tap; }
    if (roll < 70) { this.holdLeft = 20 + this.r.next(30); return InputKind.HoldStart; }
    if (roll < 80) { this.cooldown = 18; return InputKind.SwipeAway; }
    if (roll < 88) { this.cooldown = 14; return InputKind.SwipeToward; }
    if (roll < 92) return s.p1.meter >= 300 ? InputKind.Special2 : InputKind.Special1;
    return InputKind.MoveAway;
  }
}

/** roam_duel.py judge(), the parts that need no clock or database (knobs at their defaults). */
function judge(setup: { round_ticks: number; p1: { max_hp: number }; p2: { max_hp: number } }, body: FinishPayload): string | null {
  const TICK_HZ = 60;
  const k = { duel_max_tick_ratio: 2.0, duel_max_inputs_per_s: 12.0, duel_max_burst_per_s: 20.0 };
  const { result, inputs, hash } = body;
  const ticks = result.ticks;
  if (!/^[0-9a-f]{16}$/.test(hash ?? "")) return "no state hash";
  if (ticks <= 0 || ticks > setup.round_ticks * k.duel_max_tick_ratio) return "tick count outside the round";
  const gameS = ticks / TICK_HZ;
  let free = 1;
  for (const item of inputs) {
    if (item.length !== 2 && item.length !== 3) return "a malformed input";
    const [tick, code] = item;
    const run = item.length === 3 ? item[2] : 1;
    if (tick < free || tick > ticks || !(code >= 1 && code <= 9)) return "inputs out of order or out of range";
    if (item.length === 3 && (![8, 9].includes(code) || run < 1 || tick + run - 1 > ticks)) return "an input run out of range";
    free = tick + run;
  }
  if (inputs.length > Math.max(k.duel_max_burst_per_s, k.duel_max_inputs_per_s * gameS)) return "more inputs than a thumb can make";
  const burst = k.duel_max_burst_per_s;
  for (let i = 0; i < inputs.length - burst; i++) if (inputs[i + burst][0] - inputs[i][0] < TICK_HZ) return "an input burst no thumb can make";
  const h1 = result.p1_hp;
  const h2 = result.p2_hp;
  if (!(h1 >= 0 && h1 <= setup.p1.max_hp && h2 >= 0 && h2 <= setup.p2.max_hp)) return "HP out of range";
  let expected: number;
  if (h1 === 0 && h2 === 0) expected = 0;
  else if (h2 === 0) expected = 1;
  else if (h1 === 0) expected = 2;
  else if (ticks < setup.round_ticks) return "both still standing before the clock ran out";
  else {
    const a = h1 * setup.p2.max_hp;
    const b = h2 * setup.p1.max_hp;
    expected = a > b ? 1 : b > a ? 2 : 0;
  }
  if (result.winner !== expected) return "the winner doesn't match the HP";
  return null;
}

function counting(): InputSource & { calls: number } {
  return { calls: 0, next() { this.calls++; return InputKind.None; } };
}

describe("DuelRunner fixed step", () => {
  it("1000 ms of uneven frames is exactly 60 ticks", () => {
    const frames = [16.7, 16.6, 16.7, 33.3, 8.3, 8.4, 16.7, 50, 16.6, 16.7, 0.5, 15.5];
    const total = frames.reduce((a, b) => a + b, 0); // 236 ms
    const runner = new DuelRunner(siege());
    let ticks = 0;
    let elapsed = 0;
    let i = 0;
    while (elapsed + frames[i % frames.length] <= 1000) {
      const f = frames[i++ % frames.length];
      elapsed += f;
      ticks += runner.advance(f).ticks;
    }
    ticks += runner.advance(Math.round((1000 - elapsed) * 1000) / 1000).ticks;
    assert.ok(total > 0);
    assert.equal(ticks, 60);
    assert.equal(runner.sim.state.tick, 60);
  });

  it("the same at 30, 60, 120 and 144 fps", () => {
    for (const fps of [30, 60, 120, 144, 47]) {
      const runner = new DuelRunner(siege());
      // Frame times as a display reports them: whole microseconds, summing to 2 s.
      let lastUs = 0;
      for (let f = 1; f <= fps * 2; f++) {
        const us = Math.round((f * 1_000_000) / fps);
        runner.advance((us - lastUs) / 1000);
        lastUs = us;
      }
      assert.equal(runner.sim.state.tick, 120, `${fps} fps`);
    }
  });

  it("asks the input source once per tick, and keeps its facing current", () => {
    const src = counting() as InputSource & { calls: number; facing: number };
    src.facing = 0;
    const runner = new DuelRunner(siege(), { input: src });
    runner.advance(100);
    assert.equal(src.calls, 6);
    assert.equal(src.facing, 1);
  });

  it("a 5 s stall is capped: a frame counts for 100 ms at most", () => {
    const runner = new DuelRunner(siege());
    assert.equal(runner.advance(5000).ticks, 6);
    assert.equal(runner.advance(16.667).ticks, 1);
  });

  it("at most maxTicksPerAdvance ticks per frame, and the rest is dropped, not owed", () => {
    const runner = new DuelRunner(siege(), { maxFrameMs: 10_000, maxTicksPerAdvance: 8 });
    assert.equal(runner.advance(5000).ticks, 8);
    assert.equal(runner.alpha, 0);
    assert.equal(runner.advance(16.667).ticks, 1);
  });

  it("ignores nonsense time and stops at the end", () => {
    const runner = new DuelRunner(siege(1n, 30));
    assert.equal(runner.advance(-5).ticks, 0);
    assert.equal(runner.advance(Number.NaN).ticks, 0);
    for (let i = 0; i < 20; i++) runner.advance(100);
    assert.equal(runner.over, true);
    assert.ok(runner.sim.state.tick >= 30); // hit-stop stops the round clock, not the tick count
    assert.equal(runner.sim.state.ticksLeft, 0);
    assert.deepEqual(runner.advance(100), { ticks: 0, events: [], alpha: 0, over: true });
  });

  it("hands every event over once, in order, and interpolates positions", () => {
    const seen: number[] = [];
    const runner = new DuelRunner(siege(), { onEvent: (e) => seen.push(e.tick) });
    const fromAdvance: number[] = [];
    for (let i = 0; i < 600 && !runner.over; i++) {
      for (const e of runner.advance(16.6667).events) fromAdvance.push(e.tick);
      const x = runner.drawX(1);
      const [a, b] = [runner.prevX[1], runner.sim.state.p2.x];
      assert.ok(x >= Math.min(a, b) && x <= Math.max(a, b));
    }
    assert.ok(seen.length > 0);
    assert.deepEqual(fromAdvance, seen);
    assert.deepEqual([...seen].sort((p, q) => p - q), seen);
  });
});

describe("the finish payload", () => {
  function fight(seed: bigint, fps: number) {
    let runner!: DuelRunner;
    const thumb = new Thumb(() => runner, seed * 7919n);
    runner = new DuelRunner(siege(seed), { input: thumb });
    let guard = 0;
    while (!runner.over && guard++ < 100_000) runner.advance(1000 / fps);
    return runner;
  }

  for (const seed of [1n, 2n, 3n, 77n]) {
    it(`seed ${seed}: passes the judge's checks and replays to the same hash`, () => {
      const runner = fight(seed, 60);
      assert.equal(runner.over, true);
      const body = runner.finishPayload();
      const setup = siege(seed);
      assert.equal(judge({ round_ticks: setup.roundTicks, p1: { max_hp: 1000 }, p2: { max_hp: 1000 } }, body), null);
      // Only the run-length move codes carry a third number.
      for (const e of body.inputs) if (e.length === 3) assert.ok(e[1] === 8 || e[1] === 9);
      assert.ok(body.inputs.some((e) => e.length === 3), "walking was run-length encoded");
      // Exactly the wire shape the server wants, key order included.
      assert.deepEqual(Object.keys(body), ["result", "inputs", "hash"]);
      assert.deepEqual(Object.keys(body.result), ["winner", "ticks", "p1_hp", "p2_hp"]);
      assert.equal(runner.finishJson(), JSON.stringify(body));
      // The verifier's replay.
      const r = InputLog.replay(siege(seed), InputLog.fromWire(0, body.inputs as WireInput[]));
      assert.equal(r.hashHex, body.hash);
      assert.deepEqual([r.winner, r.ticks, r.p1Hp, r.p2Hp], [body.result.winner, body.result.ticks, body.result.p1_hp, body.result.p2_hp]);
    });
  }

  it("the fight does not depend on the frame rate", () => {
    const a = fight(9n, 60).finishPayload();
    const b = fight(9n, 144).finishPayload();
    const c = fight(9n, 24).finishPayload();
    assert.deepEqual(b, a);
    assert.deepEqual(c, a);
  });

  it("the judge mirror refuses what the server refuses", () => {
    const setup = { round_ticks: 3600, p1: { max_hp: 1000 }, p2: { max_hp: 1000 } };
    const ok: FinishPayload = { result: { winner: 1, ticks: 2000, p1_hp: 10, p2_hp: 0 }, inputs: [[1, 8, 30], [40, 1]], hash: "0123456789abcdef" };
    assert.equal(judge(setup, ok), null);
    assert.equal(judge(setup, { ...ok, hash: "0123456789ABCDEF" }), "no state hash");
    assert.equal(judge(setup, { ...ok, inputs: [[1, 1, 3]] }), "an input run out of range");
    assert.equal(judge(setup, { ...ok, inputs: [[5, 1], [5, 2]] }), "inputs out of order or out of range");
    assert.equal(judge(setup, { ...ok, result: { ...ok.result, winner: 2 } }), "the winner doesn't match the HP");
  });

  it("an InputFrame input with holdTicks is logged by kind only", () => {
    const frames: InputFrame[] = [{ kind: InputKind.HoldStart }, { kind: InputKind.None }, { kind: InputKind.HoldEnd, holdTicks: 40 }];
    let i = 0;
    const runner = new DuelRunner(siege(), { input: { next: () => frames[i++] ?? { kind: InputKind.None } } });
    runner.advance(100);
    assert.deepEqual(runner.finishPayload().inputs, [[1, 4], [3, 5]]);
  });
});
