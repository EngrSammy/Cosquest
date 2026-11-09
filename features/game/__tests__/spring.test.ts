import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { settle, SPRING_DROP_FLIP, SPRING_PRESS, SPRING_RAID_HP, SPRING_RELIC_DETAIL, SPRING_ROOM_HOST, SPRING_ROOM_TOGGLE, SPRING_SHARD_BAR, springOf } from "../spring.ts";

/** A damped spring from 0 to 1 (unit mass), stepped: the furthest it gets. */
function peak(c: { stiffness: number; damping: number; mass: number }, ms = 3000): number {
  let x = 0;
  let v = 0;
  let top = 0;
  const dt = 1 / 2000;
  for (let t = 0; t < ms / 1000; t += dt) {
    const a = (-c.stiffness * (x - 1) - c.damping * v) / c.mass;
    v += a * dt;
    x += v * dt;
    top = Math.max(top, x);
  }
  return top;
}

describe("springOf", () => {
  it("converts Swift response/damping to Reanimated numbers", () => {
    const s = springOf(0.45, 0.7);
    assert.ok(Math.abs(s.stiffness - 195) < 1);
    assert.ok(Math.abs(s.damping - 19.5) < 0.2);
    assert.equal(s.mass, 1);
  });
  it("is critically damped at fraction 1", () => {
    const s = springOf(1, 1);
    assert.equal(s.mass, 1);
    assert.ok(Math.abs(s.damping - 2 * Math.sqrt(s.stiffness)) < 1e-9);
  });
});

describe("settle", () => {
  it("never overshoots, and every game spring is one", () => {
    for (const c of [settle(0.3), SPRING_RAID_HP, SPRING_DROP_FLIP, SPRING_RELIC_DETAIL, SPRING_SHARD_BAR, SPRING_ROOM_HOST, SPRING_ROOM_TOGGLE, SPRING_PRESS]) {
      assert.equal(c.mass, 1, "mass must be explicit (Reanimated 4 defaults to 4)");
      assert.equal(c.overshootClamping, true);
      assert.ok(c.damping >= 2 * Math.sqrt(c.stiffness * c.mass) - 1e-9, "under-damped");
      assert.ok(peak(c) <= 1 + 1e-6, `overshot to ${peak(c)}`);
    }
  });
  it("the old under-damped configs did overshoot (the bounce that was removed)", () => {
    // Run countdown: ZoomIn.springify().stiffness(440).damping(10), Reanimated 4 mass 4.
    assert.ok(peak({ stiffness: 440, damping: 10, mass: 4 }) > 1.5);
    // Banner: damping 14, stiffness 160, mass 4.
    assert.ok(peak({ stiffness: 160, damping: 14, mass: 4 }) > 1.3);
  });
  it("still arrives in about its response", () => {
    const c = settle(0.4);
    let x = 0;
    let v = 0;
    const dt = 1 / 2000;
    let t = 0;
    while (x < 0.98 && t < 2) {
      v += ((-c.stiffness * (x - 1) - c.damping * v) / c.mass) * dt;
      x += v * dt;
      t += dt;
    }
    assert.ok(t < 0.5, `took ${t}s`);
  });
});
