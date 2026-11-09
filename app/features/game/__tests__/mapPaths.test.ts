// The ground turned into a few SVG paths.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildLayers } from "../mapPaths.ts";
import type { GroundGeometry } from "../wire.ts";

const ground: GroundGeometry = {
  origin: { lat: 51.5, lng: -0.12 },
  radius_m: 500,
  attribution: "© OpenStreetMap contributors",
  roads: [
    { w: 11, k: "major_road", p: [[0, 0], [10, 10]] },
    { w: 6, k: "minor_road", p: [[0, 0], [0, 20]] },
    { w: 2, k: "path", p: [[1, 1], [2, 2]] },
    { w: 6, k: "minor_road", p: [[5, 5]] },
  ],
  water: [{ p: [[0, 0], [1, 0], [1, 1]] }],
  green: [{ k: "grass", p: [[0, 0], [1, 0]] }],
  buildings: [{ h: 10, p: [[0, 0], [4, 0], [4, 3], [0, 3]] }],
};

describe("map layers", () => {
  it("one path per layer, y flipped (north is up), degenerate shapes dropped", () => {
    const layers = buildLayers(ground);
    assert.equal(layers.buildings, "M0 0L4 0L4 -3L0 -3Z");
    assert.equal(layers.water, "M0 0L1 0L1 -1Z");
    assert.equal(layers.green, "", "a two-point area is no area");
    assert.deepEqual(layers.roads.map((r) => r.kind), ["major", "minor", "path"]);
    assert.equal(layers.roads[1].d, "M0 0L0 -20", "the one-point road is dropped");
    assert.equal(layers.extent, 500);
  });

  it("lifts buildings by height (2.5D), splits woods from parks, leaves sidewalks off, draws trees", () => {
    const layers = buildLayers({
      ...ground,
      roads: [...ground.roads, { w: 2, k: "path", d: "sidewalk", p: [[0, 0], [9, 0]] }],
      green: [
        { k: "park", p: [[0, 0], [2, 0], [2, 2]] },
        { k: "wood", p: [[5, 5], [6, 5], [6, 6]] },
      ],
      buildings: [
        { h: 6, p: [[0, 0], [4, 0], [4, 3]] },
        { h: 40, p: [[10, 0], [14, 0], [14, 3]] },
      ],
      trees: [[1, 2, 1, 0]],
    });
    assert.deepEqual(layers.blocks.map((b) => b.lift), [1.4, 4]);
    assert.equal(layers.green, "M0 0L2 0L2 -2Z");
    assert.equal(layers.wood, "M5 -5L6 -5L6 -6Z");
    assert.ok(!layers.roads.some((r) => r.d.includes("L9 0")), "the sidewalk is left off");
    assert.ok(layers.trees.startsWith("M-1.2 -2a2.2 2.2"), layers.trees);
  });
});
