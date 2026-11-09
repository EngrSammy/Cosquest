import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bandOffset, crystalPath, crystalPerimeter } from "../crystal.ts";

describe("crystal outline", () => {
  it("is a closed path of six softened corners", () => {
    const d = crystalPath(0, 0, 100, 108);
    assert.equal((d.match(/Q/g) ?? []).length, 6);
    assert.ok(d.startsWith("M") && d.endsWith("Z"));
  });

  it("measures a little under the sharp hexagon", () => {
    const w = 100;
    const h = 108;
    const sharp = 2 * Math.hypot(w / 2, h * 0.25) * 2 + 2 * (h * 0.5);
    const p = crystalPerimeter(0, 0, w, h);
    assert.ok(p < sharp && p > sharp * 0.95, `${p} vs ${sharp}`);
  });

  it("travels the band once per turn", () => {
    const p = 400;
    const a = bandOffset(p, 50, 0.2, 0);
    const b = bandOffset(p, 50, 0.2, 1);
    assert.ok(Math.abs(a - b) < 1e-9);
    assert.ok(a >= 0 && a < p);
    // A quarter turn on moves the band a quarter of the way round: the offset falls by p / 4.
    const q = bandOffset(p, 50, 0.2, 0.25);
    assert.ok(Math.abs(((a - q + p) % p) - p / 4) < 1e-9);
  });
});
