// F-37: crowded map pins are spread so each tap hits the pin you see.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PIN_GAP, spreadPins, type PinSpot } from "../pinSpread.ts";

function placed(spots: PinSpot[], gap = PIN_GAP) {
  const offsets = spreadPins(spots, gap);
  return spots.map((s) => {
    const o = offsets.get(s.id)!;
    return { id: s.id, x: s.x + o.dx, y: s.y + o.dy, moved: Math.hypot(o.dx, o.dy) };
  });
}

function minDistance(pins: { x: number; y: number }[]) {
  let min = Infinity;
  for (let i = 0; i < pins.length; i += 1)
    for (let j = i + 1; j < pins.length; j += 1) min = Math.min(min, Math.hypot(pins[i].x - pins[j].x, pins[i].y - pins[j].y));
  return min;
}

describe("spreadPins", () => {
  it("leaves pins that are already apart where they are", () => {
    const out = placed([
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 200, y: 0 },
      { id: "c", x: 0, y: 200 },
    ]);
    assert.ok(out.every((p) => p.moved === 0));
  });

  it("spreads a Trafalgar Square heap (20 points within ~40 m) to at least a pin's width apart", () => {
    // 1.5 px per metre: 20 points scattered over 60 x 60 px, some on the same spot.
    const spots: PinSpot[] = [];
    for (let i = 0; i < 20; i += 1) spots.push({ id: `p${i}`, x: 500 + ((i * 37) % 60), y: 500 + ((i * 53) % 60) });
    spots.push({ id: "same-1", x: 520, y: 520 }, { id: "same-2", x: 520, y: 520 });
    const out = placed(spots);
    assert.ok(minDistance(out) >= PIN_GAP - 0.5, `closest pair ${minDistance(out).toFixed(1)} px`);
    // Still near home: nobody is thrown across the map.
    assert.ok(Math.max(...out.map((p) => p.moved)) < PIN_GAP * 4);
  });

  it("is the same every time, whatever order the points come in", () => {
    const spots: PinSpot[] = [
      { id: "x", x: 10, y: 10 },
      { id: "y", x: 12, y: 11 },
      { id: "z", x: 10, y: 10 },
    ];
    const a = spreadPins(spots);
    const b = spreadPins([...spots].reverse());
    for (const s of spots) assert.deepEqual(a.get(s.id), b.get(s.id));
  });

  it("a tap at a spread pin's centre is nearest that pin and no other", () => {
    const spots: PinSpot[] = Array.from({ length: 8 }, (_, i) => ({ id: `q${i}`, x: 300 + (i % 3) * 5, y: 300 + Math.floor(i / 3) * 5 }));
    const out = placed(spots);
    for (const p of out) {
      const nearest = out.reduce((best, q) => (Math.hypot(q.x - p.x, q.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? q : best));
      assert.equal(nearest.id, p.id);
      // A pin is 46 wide: its whole face is closer to it than to any neighbour.
      for (const q of out) if (q.id !== p.id) assert.ok(Math.hypot(q.x - p.x, q.y - p.y) >= 46);
    }
  });
});
