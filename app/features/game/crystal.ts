// The Relic crystal's outline (RelicsFeature.swift CrystalFrame): a
// pointy-topped hexagon with softened corners, as SVG path data, and its
// length, which the turning legendary rim needs to travel a colour band
// round it. Pure, so the geometry is tested.
type Pt = [number, number];

function corners(x: number, y: number, w: number, h: number): Pt[] {
  return [
    [x + w / 2, y],
    [x + w, y + h * 0.25],
    [x + w, y + h * 0.75],
    [x + w / 2, y + h],
    [x, y + h * 0.75],
    [x, y + h * 0.25],
  ];
}

function toward(p: Pt, q: Pt, k: number): Pt {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const len = Math.max(0.001, Math.hypot(dx, dy));
  return [p[0] + (dx / len) * k, p[1] + (dy / len) * k];
}

/** Each corner as [where its curve starts, its control point, where it ends]. */
function curves(x: number, y: number, w: number, h: number): [Pt, Pt, Pt][] {
  const pts = corners(x, y, w, h);
  const k = Math.min(w, h) * 0.1;
  return pts.map((b, i) => {
    const a = pts[(i + pts.length - 1) % pts.length];
    const c = pts[(i + 1) % pts.length];
    return [toward(b, a, k), b, toward(b, c, k)];
  });
}

/** CrystalFrame as path data in (x, y, w, h). */
export function crystalPath(x: number, y: number, w: number, h: number): string {
  const f = (n: number) => n.toFixed(2);
  let d = "";
  curves(x, y, w, h).forEach(([from, b, to], i) => {
    d += `${i === 0 ? "M" : "L"}${f(from[0])} ${f(from[1])} Q${f(b[0])} ${f(b[1])} ${f(to[0])} ${f(to[1])} `;
  });
  return `${d}Z`;
}

/** The outline's length: its straight runs plus its quadratic corners, sampled. */
export function crystalPerimeter(x: number, y: number, w: number, h: number): number {
  const cs = curves(x, y, w, h);
  let total = 0;
  cs.forEach(([from, b, to], i) => {
    const prevTo = cs[(i + cs.length - 1) % cs.length][2];
    total += Math.hypot(from[0] - prevTo[0], from[1] - prevTo[1]);
    let last = from;
    for (let s = 1; s <= 16; s++) {
      const t = s / 16;
      const u = 1 - t;
      const p: Pt = [u * u * from[0] + 2 * u * t * b[0] + t * t * to[0], u * u * from[1] + 2 * u * t * b[1] + t * t * to[1]];
      total += Math.hypot(p[0] - last[0], p[1] - last[1]);
      last = p;
    }
  });
  return total;
}

/**
 * Where a dash pattern [seg, perimeter - seg] must start so that a band
 * centred `centre` (0..1 round the outline) at `turn` (0..1 of a revolution)
 * shows. strokeDashoffset is that start, negated and wrapped to 0..perimeter.
 */
export function bandOffset(perimeter: number, seg: number, centre: number, turn: number): number {
  const start = centre * perimeter - seg / 2 + turn * perimeter;
  return (((-start) % perimeter) + perimeter) % perimeter;
}
