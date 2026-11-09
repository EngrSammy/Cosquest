// How long a tick takes: 60 s of fight (3600 ticks) with the Guardian AI.
// The budget on a phone is 16.7 ms per frame for everything; the sim should
// be a rounding error in it. The bound asserted here is deliberately loose
// (it only catches a pathological regression); the numbers are reported as
// test diagnostics. `node --jitless --test ...` approximates an interpreter
// such as Hermes.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DuelSim } from "../duelSim.ts";
import { InputLog } from "../inputLog.ts";
import { AiParams, DuelSetup, FighterSetup, FighterStats } from "../setup.ts";
import { Difficulty, Faction, InputKind, Stance, WeaponClass } from "../types.ts";

function setup(bothAi: boolean): DuelSetup {
  const s = new DuelSetup();
  s.seed = 1266451243158746731n;
  s.roundTicks = 3600;
  // HP high enough that nobody is knocked out: the full 3600 ticks run.
  s.p1 = Object.assign(new FighterSetup(), {
    class: WeaponClass.Blade,
    stats: new FighterStats(1_000_000, 460, 0),
    ai: bothAi ? AiParams.create(Stance.Aggressive, Faction.Anime, Difficulty.Hard) : null,
  });
  s.p2 = Object.assign(new FighterSetup(), {
    class: WeaponClass.Fists,
    stats: new FighterStats(1_000_000, 460, 0),
    ai: AiParams.create(Stance.Counter, Faction.Marvel, Difficulty.Normal),
  });
  return s;
}

function fight(bothAi: boolean): { ms: number; ticks: number } {
  const sim = new DuelSim(setup(bothAi));
  const log = new InputLog();
  let i = 0;
  const t0 = performance.now();
  while (!sim.state.over && sim.state.tick < 3600) {
    // A busy thumb for the human side: walk in, tap, hold now and then.
    const k = i % 23 === 0 ? InputKind.Tap : i % 97 < 30 ? InputKind.None : i % 151 === 0 ? InputKind.HoldStart : i % 151 === 40 ? InputKind.HoldEnd : InputKind.MoveToward;
    InputLog.step(sim, log, k, InputKind.None);
    sim.drainEvents();
    i++;
  }
  const ms = performance.now() - t0;
  return { ms, ticks: sim.state.tick };
}

describe("performance", () => {
  for (const bothAi of [false, true]) {
    it(`3600 ticks, ${bothAi ? "AI v AI" : "player v AI"}`, (t) => {
      fight(bothAi); // warm up
      const runs = [fight(bothAi), fight(bothAi), fight(bothAi)];
      const best = runs.reduce((a, b) => (a.ms / a.ticks < b.ms / b.ticks ? a : b));
      assert.ok(best.ticks >= 3600);
      const perTick = best.ms / best.ticks;
      t.diagnostic(`${best.ticks} ticks in ${best.ms.toFixed(1)} ms: ${(perTick * 1000).toFixed(2)} µs per tick`);
      assert.ok(perTick < 1, `${perTick} ms per tick`);
    });
  }

  it("Hash() cost", (t) => {
    const sim = new DuelSim(setup(true));
    for (let i = 0; i < 600; i++) sim.step();
    const n = 2000;
    const t0 = performance.now();
    let x = "";
    for (let i = 0; i < n; i++) x = sim.hashHex();
    const us = ((performance.now() - t0) / n) * 1000;
    assert.equal(x.length, 16);
    t.diagnostic(`hashHex(): ${us.toFixed(2)} µs`);
  });
});
