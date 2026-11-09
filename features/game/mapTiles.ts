// The world map's ground as tiles (components/game/WorldMap.tsx).
//
// The map used to draw one /v1/map/ground answer: a square 600 m each side of
// where the world was cut. That covered the screen at zoom 1, but zoom now
// goes out to 0.5 and the map pans and turns: at 0.5 the screen's far corner
// is ~770 m from the player (more once dragged away), so the corners, and
// everything past 600 m, were bare land.
//
// Now the ground is a grid of cells fixed to the earth (CELL_M square, so a
// cell's key never changes when the board is re-cut), each fetched on its own
// (/v1/map/ground around the cell centre, a little wider than the cell) and
// drawn clipped exactly to the cell, so neighbours meet without seams. The
// map asks for every cell inside the disc the screen can show at the current
// zoom, whatever the turn, plus a margin, nearest first, as the camera moves.
//
// Pure (tested in features/game/__tests__/mapTiles.test.ts).
import { fromLocal, M_PER_DEG, toLocal, type LatLng } from "./geo.ts";

/** A cell's side, metres. Small enough that each is a cheap request and bitmap, big enough that ~16 cover the widest view. */
export const CELL_M = 500;
/** Ground loaded past the edge of what the screen can show, metres: a short pan or fling never reaches bare land. */
export const COVER_MARGIN_M = 120;
/** The server snaps the requested centre to a 0.0005 degree grid (up to ~28 m off): asked this much wider, the cell is always covered. */
export const SNAP_MARGIN_M = 40;

const rad = (d: number) => (d * Math.PI) / 180;

/**
 * How far from the anchor (where the camera's centre sits on screen) the
 * screen reaches, in board points, at this zoom: the distance to the farthest
 * screen corner over the zoom. A disc, so it holds at any turn of the map.
 */
export function coverRadiusPts(width: number, height: number, anchorX: number, anchorY: number, zoom: number): number {
  const dx = Math.max(anchorX, width - anchorX);
  const dy = Math.max(anchorY, height - anchorY);
  return Math.hypot(dx, dy) / Math.max(zoom, 1e-3);
}

/** The ground that must be loaded around the camera centre, metres. */
export function coverRadiusM(width: number, height: number, anchorX: number, anchorY: number, zoom: number, ptsPerM: number): number {
  return coverRadiusPts(width, height, anchorX, anchorY, zoom) / ptsPerM + COVER_MARGIN_M;
}

/** The grid for a latitude band (whole degrees): cells are CELL_M square there. */
export type Grid = { band: number; dLat: number; dLng: number };

export function gridFor(lat: number): Grid {
  const band = Math.round(lat);
  const dLat = CELL_M / M_PER_DEG;
  return { band, dLat, dLng: CELL_M / (M_PER_DEG * Math.cos(rad(band))) };
}

export type Cell = {
  key: string;
  i: number;
  j: number;
  /** South-west and north-east corners. Neighbours share corners exactly. */
  sw: LatLng;
  ne: LatLng;
  centre: LatLng;
  /** The radius to ask /v1/map/ground for, metres: half the cell's side plus the snap margin. */
  requestM: number;
};

export function cellAt(grid: Grid, i: number, j: number): Cell {
  const sw = { lat: i * grid.dLat, lng: j * grid.dLng };
  const ne = { lat: (i + 1) * grid.dLat, lng: (j + 1) * grid.dLng };
  const centre = { lat: (sw.lat + ne.lat) / 2, lng: (sw.lng + ne.lng) / 2 };
  const half = toLocal(centre, ne);
  // The server's box is a square of side 2r round the (snapped) centre.
  const requestM = Math.ceil(Math.max(Math.abs(half.x), Math.abs(half.z)) + SNAP_MARGIN_M);
  return { key: `${grid.band}:${i}:${j}`, i, j, sw, ne, centre, requestM };
}

/** The cell holding a point. */
export function cellIndex(grid: Grid, p: LatLng): { i: number; j: number } {
  return { i: Math.floor(p.lat / grid.dLat), j: Math.floor(p.lng / grid.dLng) };
}

/** Distance (metres) from `c` to the nearest point of the cell, 0 inside it. */
export function distanceToCellM(c: LatLng, cell: Cell): number {
  const a = toLocal(c, cell.sw);
  const b = toLocal(c, cell.ne);
  const dx = Math.max(a.x, 0, -b.x);
  const dz = Math.max(a.z, 0, -b.z);
  return Math.hypot(dx, dz);
}

/** Every cell that reaches into the disc of `radiusM` round `c`, nearest first. */
export function cellsCovering(grid: Grid, c: LatLng, radiusM: number): Cell[] {
  const lo = cellIndex(grid, fromLocal(c, { x: -radiusM, z: -radiusM }));
  const hi = cellIndex(grid, fromLocal(c, { x: radiusM, z: radiusM }));
  const out: { cell: Cell; d: number; dc: number }[] = [];
  for (let i = lo.i; i <= hi.i; i++) {
    for (let j = lo.j; j <= hi.j; j++) {
      const cell = cellAt(grid, i, j);
      const d = distanceToCellM(c, cell);
      if (d > radiusM) continue;
      const m = toLocal(c, cell.centre);
      out.push({ cell, d, dc: Math.hypot(m.x, m.z) });
    }
  }
  return out.sort((a, b) => a.d - b.d || a.dc - b.dc).map((o) => o.cell);
}

/** Where a cell sits on the board (points), given the board's origin, half-size (metres) and scale. */
export function cellRect(cell: Cell, origin: LatLng, extentM: number, ptsPerM: number): { left: number; top: number; width: number; height: number } {
  const a = toLocal(origin, cell.sw);
  const b = toLocal(origin, cell.ne);
  return {
    left: (a.x + extentM) * ptsPerM,
    top: (extentM - b.z) * ptsPerM,
    width: (b.x - a.x) * ptsPerM,
    height: (b.z - a.z) * ptsPerM,
  };
}

/** The SVG viewBox that shows exactly the cell, in the coordinates of a ground answer cut at `tileOrigin` (x east, y = -north). */
export function cellViewBox(cell: Cell, tileOrigin: LatLng): string {
  const a = toLocal(tileOrigin, cell.sw);
  const b = toLocal(tileOrigin, cell.ne);
  const r = (n: number) => Math.round(n * 100) / 100;
  return `${r(a.x)} ${r(-b.z)} ${r(b.x - a.x)} ${r(b.z - a.z)}`;
}

/**
 * Pixels per board point to draw the ground at, by zoom. react-native-svg
 * draws each tile into a bitmap of its own size; the camera's scale only
 * stretches it. Zoomed out, a tile covers few screen pixels and many tiles
 * show, so they are drawn coarser; zoomed in, few show and they are drawn
 * finer. That keeps the bitmaps near a screen or two's worth whatever the zoom.
 */
export function rasterDensity(zoom: number, pixelRatio: number): number {
  const level = zoom < 0.85 ? 1.25 : zoom < 1.4 ? 2.25 : 3;
  // Never finer than the screen itself (a stepped value, so it only changes when the level does).
  return Math.min(level, Math.max(1, pixelRatio));
}

/** Rough bytes for the tiles of a view (4 bytes a pixel): what the density choice is held to. */
export function viewBitmapBytes(tiles: number, zoom: number, pixelRatio: number, ptsPerM: number): number {
  const side = CELL_M * ptsPerM * rasterDensity(zoom, pixelRatio);
  return tiles * side * side * 4;
}

/** How far past a level's edge the zoom must go before the drawing density follows it (a share of the edge). */
export const DENSITY_HYSTERESIS = 0.08;

/**
 * rasterDensity with hysteresis: the density being drawn (`current`) is kept
 * until the zoom is clearly into another level, so a zoom resting near an
 * edge (0.85, 1.4) does not redraw every tile back and forth.
 */
export function rasterDensityKeeping(zoom: number, pixelRatio: number, current: number): number {
  const next = rasterDensity(zoom, pixelRatio);
  if (next === current) return current;
  const lo = rasterDensity(zoom * (1 - DENSITY_HYSTERESIS), pixelRatio);
  const hi = rasterDensity(zoom * (1 + DENSITY_HYSTERESIS), pixelRatio);
  // Still within reach of the current level on either side: keep it.
  return lo === current || hi === current ? current : next;
}
