// Map pins that would sit on top of each other are spread apart (F-37: about
// 20 Quest Points around Trafalgar Square drew as one heap, and a tap opened
// whichever pin happened to be on top). Each pin keeps a thin leader line to
// its real spot (components/game/WorldMap.tsx). Pure and deterministic: the
// same points always land in the same places, so pins never jitter.

export type PinSpot = { id: string; x: number; y: number };
export type PinOffset = { dx: number; dy: number };

/** Two pins' centres stay at least this far apart (pixels); a pin is 46 wide. */
export const PIN_GAP = 52;

function hashAngle(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 3600) / 3600 * Math.PI * 2;
}

/**
 * Offsets that keep every pair of pins at least `gap` apart, moving each pin
 * as little as it can: overlapping pairs push each other apart along the line
 * between them (pins on the very same spot fan out by their ids), and every
 * pin is pulled gently back towards its real spot. Pins far from all others
 * get no offset.
 */
export function spreadPins(spots: PinSpot[], gap = PIN_GAP, iterations = 60): Map<string, PinOffset> {
  const pins = [...spots].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((s) => ({ ...s, px: s.x, py: s.y }));
  const out = new Map<string, PinOffset>();
  // Only pins with a neighbour closer than the gap take part.
  const crowded = new Set<number>();
  for (let i = 0; i < pins.length; i += 1) {
    for (let j = i + 1; j < pins.length; j += 1) {
      if (Math.hypot(pins[i].x - pins[j].x, pins[i].y - pins[j].y) < gap) {
        crowded.add(i);
        crowded.add(j);
      }
    }
  }
  if (crowded.size) {
    const idx = [...crowded];
    for (let step = 0; step < iterations; step += 1) {
      let moved = false;
      for (let a = 0; a < idx.length; a += 1) {
        for (let b = a + 1; b < idx.length; b += 1) {
          const p = pins[idx[a]];
          const q = pins[idx[b]];
          let dx = q.px - p.px;
          let dy = q.py - p.py;
          let d = Math.hypot(dx, dy);
          if (d >= gap) continue;
          if (d < 0.01) {
            const angle = hashAngle(q.id);
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            d = 1;
          }
          const push = (gap - d) / 2 + 0.01;
          const ux = dx / d;
          const uy = dy / d;
          p.px -= ux * push;
          p.py -= uy * push;
          q.px += ux * push;
          q.py += uy * push;
          moved = true;
        }
      }
      // A light pull home keeps the group tight around the real spots.
      for (const i of idx) {
        const p = pins[i];
        p.px += (p.x - p.px) * 0.04;
        p.py += (p.y - p.py) * 0.04;
      }
      if (!moved) break;
    }
    // The pull can leave pairs a hair closer than the gap: a final pass pushes only.
    for (let pass = 0; pass < 30; pass += 1) {
      let moved = false;
      for (let a = 0; a < idx.length; a += 1) {
        for (let b = a + 1; b < idx.length; b += 1) {
          const p = pins[idx[a]];
          const q = pins[idx[b]];
          const dx = q.px - p.px;
          const dy = q.py - p.py;
          const d = Math.hypot(dx, dy) || 1;
          if (d >= gap) continue;
          const push = (gap - d) / 2 + 0.01;
          p.px -= (dx / d) * push;
          p.py -= (dy / d) * push;
          q.px += (dx / d) * push;
          q.py += (dy / d) * push;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }
  for (const p of pins) {
    const dx = p.px - p.x;
    const dy = p.py - p.y;
    out.set(p.id, Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 ? { dx: 0, dy: 0 } : { dx, dy });
  }
  return out;
}
