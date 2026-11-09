// The ground (GET /v1/map/ground: metres east/north of an origin) turned into
// a handful of SVG path strings, one per layer, so the map is a few <Path>s
// rather than thousands of elements. Screen y is -north.
// Pure (tested in features/game/__tests__).
import type { GroundArea, GroundGeometry, GroundWay } from "./wire.ts";

export type MapLayers = {
  water: string;
  /** Parks, grass, gardens, pitches (everything green but woods). */
  green: string;
  /** Woods, scrub and wetland: a deeper green. */
  wood: string;
  /** Plazas, pedestrian streets, platforms, piers. */
  paved: string;
  buildings: string;
  /**
   * The buildings again, bucketed by height for the 2.5D lift: each bucket's
   * roof is drawn `lift` metres north of its footprint, the wall between.
   * Lowest first.
   */
  blocks: { lift: number; d: string }[];
  /** Tree canopies as one path of small circles (capped, so a wooded tile stays cheap). */
  trees: string;
  /** Roads by class, widest first: [width in metres, path]. */
  roads: { width: number; kind: "major" | "minor" | "path" | "rail"; d: string }[];
  waterways: { width: number; d: string }[];
  /** Half-size of the square the ground covers, in metres. */
  extent: number;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

function ring(points: number[][]): string {
  if (points.length < 2) return "";
  let d = `M${r1(points[0][0])} ${r1(-points[0][1])}`;
  for (let i = 1; i < points.length; i++) d += `L${r1(points[i][0])} ${r1(-points[i][1])}`;
  return d;
}

function areas(list: GroundArea[] | null | undefined): string {
  if (!list) return "";
  return list.map((a) => (a.p.length >= 3 ? `${ring(a.p)}Z` : "")).join("");
}

/** Green areas that read as woodland on the map (a deeper green). */
const WOODY = new Set(["wood", "forest", "scrub", "wetland", "heath"]);

/** Footway detail that is part of a street, not a path of its own: left off so the map stays calm. */
const STREET_PARTS = new Set(["sidewalk", "crossing", "traffic_island"]);

/**
 * The 2.5D lift by height (art direction 6.4: extruded 0.6 x real height,
 * max 12 m), seen from a little south of overhead: a third of that shows.
 */
const LIFT_BUCKETS = [
  { upTo: 8, lift: 1.4 },
  { upTo: 18, lift: 2.6 },
  { upTo: Infinity, lift: 4 },
] as const;

/** At most this many tree canopies a tile. */
const MAX_TREES = 700;

function circle(x: number, y: number, r: number): string {
  const rr = r1(r);
  return `M${r1(x - r)} ${r1(y)}a${rr} ${rr} 0 1 0 ${r1(2 * r)} 0a${rr} ${rr} 0 1 0 ${r1(-2 * r)} 0`;
}

function roadClass(way: GroundWay): "major" | "minor" | "path" | "rail" {
  if (way.k === "rail") return "rail";
  if (way.k === "major_road" || way.w >= 9) return "major";
  if (way.k === "path" || way.w <= 3) return "path";
  return "minor";
}

export function buildLayers(ground: GroundGeometry): MapLayers {
  const groups = new Map<string, { width: number; kind: MapLayers["roads"][number]["kind"]; parts: string[] }>();
  for (const way of ground.roads) {
    if (way.p.length < 2) continue;
    if (way.k === "path" && way.d && STREET_PARTS.has(way.d)) continue;
    const kind = roadClass(way);
    // Bucket widths so a few strokes cover every road.
    const width = kind === "major" ? Math.max(9, Math.min(16, Math.round(way.w / 2) * 2)) : kind === "minor" ? 6 : kind === "rail" ? 2 : 2.5;
    const key = `${kind}:${width}`;
    let g = groups.get(key);
    if (!g) {
      g = { width, kind, parts: [] };
      groups.set(key, g);
    }
    g.parts.push(ring(way.p));
  }
  const order = { major: 0, minor: 1, path: 2, rail: 3 } as const;
  const roads = [...groups.values()]
    .sort((a, b) => order[a.kind] - order[b.kind] || b.width - a.width)
    .map((g) => ({ width: g.width, kind: g.kind, d: g.parts.join("") }));
  const waterways = (ground.waterways ?? [])
    .filter((w) => w.p.length >= 2)
    .map((w) => ({ width: Math.max(3, w.w), d: ring(w.p) }));
  const greens = ground.green ?? [];
  const blockParts: string[][] = LIFT_BUCKETS.map(() => []);
  for (const b of ground.buildings) {
    if (b.p.length < 3) continue;
    const i = LIFT_BUCKETS.findIndex((k) => (b.h || 0) <= k.upTo);
    blockParts[i < 0 ? LIFT_BUCKETS.length - 1 : i].push(`${ring(b.p)}Z`);
  }
  const trees = (ground.trees ?? []).slice(0, MAX_TREES).filter((t) => t.length >= 2).map((t) => circle(t[0], -t[1], 2.2 * Math.max(0.6, Math.min(1.6, t[2] ?? 1))));
  return {
    water: areas(ground.water),
    green: areas(greens.filter((a) => !WOODY.has(a.k ?? ""))),
    wood: areas(greens.filter((a) => WOODY.has(a.k ?? ""))),
    paved: areas(ground.paved),
    buildings: ground.buildings.map((b) => (b.p.length >= 3 ? `${ring(b.p)}Z` : "")).join(""),
    blocks: LIFT_BUCKETS.map((k, i) => ({ lift: k.lift, d: blockParts[i].join("") })).filter((b) => b.d),
    trees: trees.join(""),
    roads,
    waterways,
    extent: ground.radius_m,
  };
}
