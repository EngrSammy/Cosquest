// InputLog: run-length walking, the wire form, what FromWire refuses, and
// that a replay from the wire reproduces the fight (the verifier's check).
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { XorShift } from "../determinism.ts";
import { DuelSim } from "../duelSim.ts";
import { DuelFormatError } from "../errors.ts";
import { InputLog, type WireInput } from "../inputLog.ts";
import { AiParams, DuelSetup, FighterSetup, FighterStats } from "../setup.ts";
import { InputKind, Stance, WeaponClass } from "../types.ts";

const { Tap, SwipeToward, SwipeAway, HoldStart, HoldEnd, Special1, Special2, MoveToward, MoveAway, None } = InputKind;

function humans(gap = 800): DuelSetup {
  const s = new DuelSetup();
  s.seed = 7n;
  s.startGapMm = gap;
  s.p1 = Object.assign(new FighterSetup(), { name: "p1" });
  s.p2 = Object.assign(new FighterSetup(), { name: "p2" });
  return s;
}

function vsAi(seed: bigint): DuelSetup {
  const s = new DuelSetup();
  s.seed = seed;
  s.p1 = Object.assign(new FighterSetup(), { class: WeaponClass.Blade });
  s.p2 = Object.assign(new FighterSetup(), { class: WeaponClass.Blade, ai: AiParams.create(Stance.Counter) });
  return s;
}

describe("InputLog wire form", () => {
  it("a walk is one entry and expands back tick for tick (the C# test)", () => {
    const setup = humans(4000);
    const sim = new DuelSim(setup);
    const log = new InputLog();
    for (let i = 0; i < 90; i++) InputLog.step(sim, log, i < 60 ? MoveToward : i === 60 ? Tap : MoveAway, None);
    const wire = log.toWire(0);
    assert.deepEqual(wire, [[1, MoveToward, 60], [61, Tap], [62, MoveAway, 29]]);
    assert.equal(InputLog.replay(setup, InputLog.fromWire(0, wire), sim.state.tick).hashHex, sim.hashHex());
  });

  it("runs only join the same move on consecutive ticks of the same side", () => {
    const log = new InputLog();
    log.record(1, 0, MoveToward);
    log.record(1, 1, MoveToward); // the other side, same tick
    log.record(2, 0, MoveToward); // still extends side 0, past side 1's entry
    log.record(3, 0, MoveAway); // a different move starts a new entry
    log.record(5, 0, MoveAway); // a gap starts a new entry
    log.record(6, 0, { kind: MoveAway, holdTicks: 3 });
    log.record(7, 0, None); // never logged
    log.record(8, 0, Tap);
    log.record(9, 0, Tap); // only walking runs
    assert.deepEqual(log.toWire(0), [[1, 8, 2], [3, 9], [5, 9, 2], [8, 1], [9, 1]]);
    assert.deepEqual(log.toWire(1), [[1, 8]]);
  });

  it("round-trips through JSON and FromWire", () => {
    const sim = new DuelSim(vsAi(99n));
    const log = new InputLog();
    const script = new XorShift(1234n);
    const kinds = [Tap, SwipeToward, SwipeAway, HoldStart, HoldEnd, Special1, Special2, MoveToward, MoveAway];
    while (!sim.state.over) {
      const k = script.chance(180) ? kinds[script.next(kinds.length)] : script.chance(300) ? MoveToward : None;
      InputLog.step(sim, log, k, None);
    }
    const wire = log.toWire(0);
    const back = InputLog.fromWire(0, JSON.parse(JSON.stringify(wire)) as WireInput[]);
    assert.deepEqual(back.toWire(0), wire);
    assert.deepEqual(back.entryList, log.entryList);
    const r = InputLog.replay(vsAi(99n), back);
    assert.equal(r.hashHex, sim.hashHex());
    assert.equal(r.winner, sim.state.winner);
    assert.equal(r.ticks, sim.state.tick);
    assert.equal(r.hash, sim.hash());
  });

  it("a tampered log does not reproduce (the C# test)", () => {
    const setup = new DuelSetup();
    setup.seed = 5n;
    setup.p2.ai = AiParams.create(Stance.Aggressive);
    const sim = new DuelSim(setup);
    const log = new InputLog();
    for (let i = 0; i < 600 && !sim.state.over; i++) InputLog.step(sim, log, i % 9 === 0 ? Tap : MoveToward, None);
    const wire = log.toWire(0);
    assert.equal(wire[0][1], Tap);
    wire[0][1] = SwipeAway;
    const replay = InputLog.replay(setup, InputLog.fromWire(0, wire), sim.state.tick);
    assert.notEqual(replay.hashHex, sim.hashHex());
  });

  it("an AI side logs nothing", () => {
    const setup = vsAi(3n);
    const sim = new DuelSim(setup);
    const log = new InputLog();
    for (let i = 0; i < 300; i++) InputLog.step(sim, log, None, Tap);
    assert.deepEqual(log.toWire(1), []);
  });
});

describe("FromWire refuses what the C# refuses", () => {
  const bad: [string, unknown[]][] = [
    ["out of order", [[5, 1], [3, 1]]],
    ["a shared tick", [[5, 1], [5, 2]]],
    ["an unknown code", [[5, 99]]],
    ["code 0 (None)", [[5, 0]]],
    ["a negative code", [[5, -1]]],
    ["too short", [[5]]],
    ["too long", [[5, 8, 2, 9]]],
    ["tick 0", [[0, 1]]],
    ["a negative tick", [[-3, 1]]],
    ["a run of taps", [[5, Tap, 3]]],
    ["an input inside a run", [[5, MoveToward, 10], [9, Tap]]],
    ["a run of zero ticks", [[5, MoveToward, 0]]],
    ["null", [null]],
    ["not an array", ["5,1"]],
    // What C# could never receive as int[][]:
    ["a fraction", [[5.5, 1]]],
    ["a string", [["5", 1]]],
    ["a tick past 32 bits", [[2 ** 31, 1]]],
  ];
  for (const [what, wire] of bad)
    it(what, () => {
      assert.throws(() => InputLog.fromWire(0, wire as number[][]), DuelFormatError);
    });

  it("accepts touching runs and an empty log", () => {
    assert.equal(InputLog.fromWire(0, [[5, MoveToward, 5], [10, MoveAway, 2], [12, Tap]]).entryList.length, 3);
    assert.equal(InputLog.fromWire(0, []).entryList.length, 0);
  });

  it("the next-free-tick counter wraps like a C# int (an overflowing run lets anything follow)", () => {
    // tick + run overflows int, so `last` goes negative and C# accepts the next entry.
    const log = InputLog.fromWire(0, [[2147483640, MoveToward, 100], [3, Tap]]);
    assert.equal(log.entryList.length, 2);
  });
});

describe("Replay", () => {
  it("stops at maxTicks, and the default is RoundTicks * 4 + 1000", () => {
    const setup = humans();
    setup.roundTicks = 100000;
    const r = InputLog.replay(setup, new InputLog(), 50);
    assert.equal(r.ticks, 50);
  });

  it("a long fight replays to the same hash with a run that outlasts it", () => {
    const setup = humans(4000);
    setup.roundTicks = 120;
    const log = InputLog.fromWire(0, [[1, MoveToward, 1_000_000]]);
    const r = InputLog.replay(setup, log);
    const live = new DuelSim(Object.assign(humans(4000), { roundTicks: 120 }));
    while (!live.state.over) live.step(MoveToward, None);
    assert.equal(r.hashHex, live.hashHex());
    assert.equal(r.ticks, 120);
  });

  it("works with plain stats objects too", () => {
    const setup = humans();
    setup.p1.stats = new FighterStats(1, 1, 0);
    setup.roundTicks = 10;
    assert.equal(InputLog.replay(setup, new InputLog()).endReason, 2);
  });
});
