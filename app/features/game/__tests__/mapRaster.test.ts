import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groundRaster, MAX_GROUND_PX } from "../mapRaster.ts";

const ANDROID_MAX_BITMAP_BYTES = 100 * 1024 * 1024;

describe("world map ground raster", () => {
  it("the 1,800-point board at 3.5x (560 dpi) stays under Android's 100 MB bitmap limit", () => {
    const uncapped = (1800 * 3.5) ** 2 * 4;
    assert.ok(uncapped > ANDROID_MAX_BITMAP_BYTES, "the crash this fixes");
    const r = groundRaster(1800, 3.5);
    const px = r.drawn * 3.5;
    assert.ok(Math.abs(px - MAX_GROUND_PX) < 1e-6);
    assert.ok(px * px * 4 < ANDROID_MAX_BITMAP_BYTES);
    assert.ok(Math.abs(r.drawn * r.scale - 1800) < 1e-6, "scaled back to the board");
  });
  it("covers the board exactly once scaled about its centre", () => {
    const r = groundRaster(1800, 3.5);
    const centre = r.offset + r.drawn / 2;
    assert.ok(Math.abs(centre - r.drawn * r.scale / 2) < 1e-6);
  });
  it("leaves small boards and low-density screens alone", () => {
    assert.deepEqual(groundRaster(1800, 2), { drawn: 1800, scale: 1, offset: 0 });
    assert.deepEqual(groundRaster(900, 3.5), { drawn: 900, scale: 1, offset: 0 });
  });
});
