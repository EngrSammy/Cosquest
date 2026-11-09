import assert from "node:assert/strict";
import { test } from "node:test";

import { distanceM, fromLocal, toLocal } from "../geo.ts";
import { toBoard } from "../mapCameraMath.ts";
import {
  CELL_M,
  COVER_MARGIN_M,
  cellAt,
  cellIndex,
  cellRect,
  cellsCovering,
  cellViewBox,
  coverRadiusM,
  coverRadiusPts,
  distanceToCellM,
  gridFor,
  rasterDensity,
  SNAP_MARGIN_M,
  viewBitmapBytes,
} from "../mapTiles.ts";

const LONDON = { lat: 51.50092, lng: -0.12424 };
const MAP_SCALE = 1.5;
// iPhone Pro Max-ish screen, player at 56% of the height (WorldMap PLAYER_Y).
const W = 440;
const H = 956;
const AX = W / 2;
const AY = H * 0.56;

test("fromLocal undoes toLocal", () => {
  for (const m of [{ x: 0, z: 0 }, { x: 812.5, z: -340 }, { x: -1500, z: 1500 }]) {
    const back = toLocal(LONDON, fromLocal(LONDON, m));
    assert.ok(Math.abs(back.x - m.x) < 1e-6 && Math.abs(back.z - m.z) < 1e-6);
  }
});

test("the cover radius reaches every screen corner at any zoom and any turn", () => {
  for (const zoom of [0.5, 0.75, 1, 1.6, 2.2]) {
    const r = coverRadiusPts(W, H, AX, AY, zoom);
    for (const rot of [0, 0.4, Math.PI / 4, 1.9, -2.7, Math.PI]) {
      const cam = { x: 5000, y: 5000, zoom, rot };
      for (const corner of [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: 0, y: H }, { x: W, y: H }]) {
        const b = toBoard(cam, { x: AX, y: AY }, corner);
        assert.ok(Math.hypot(b.x - cam.x, b.y - cam.y) <= r + 1e-6, `corner past the cover at zoom ${zoom} rot ${rot}`);
      }
    }
  }
});

test("zoomed out to 0.5 the screen needs ~770 m, more than the old 600 m board", () => {
  const r = coverRadiusM(W, H, AX, AY, 0.5, MAP_SCALE);
  assert.ok(r - COVER_MARGIN_M > 600, `${r}`);
  assert.ok(r - COVER_MARGIN_M < 800, `${r}`);
  // Half-diagonal of the screen over the zoom is a looser bound (the anchor is off centre): never smaller.
  assert.ok(coverRadiusPts(W, H, W / 2, H / 2, 0.5) <= coverRadiusPts(W, H, AX, AY, 0.5));
});

test("cells are CELL_M square and neighbours share edges exactly", () => {
  const g = gridFor(LONDON.lat);
  const { i, j } = cellIndex(g, LONDON);
  const c = cellAt(g, i, j);
  const size = toLocal(c.sw, c.ne);
  assert.ok(Math.abs(size.z - CELL_M) < 1e-6);
  assert.ok(Math.abs(size.x - CELL_M) < 10, `${size.x}`);
  const east = cellAt(g, i, j + 1);
  const north = cellAt(g, i + 1, j);
  assert.equal(east.sw.lng, c.ne.lng);
  assert.equal(north.sw.lat, c.ne.lat);
  // On the board, too: no gap or overlap between neighbours.
  const r = cellRect(c, LONDON, 600, MAP_SCALE);
  const re = cellRect(east, LONDON, 600, MAP_SCALE);
  const rn = cellRect(north, LONDON, 600, MAP_SCALE);
  assert.ok(Math.abs(r.left + r.width - re.left) < 1e-6);
  assert.ok(Math.abs(rn.top + rn.height - r.top) < 1e-6);
  // The point lies in its own cell.
  assert.equal(distanceToCellM(LONDON, c), 0);
});

test("a cell's request covers the whole cell even after the server snaps its centre", () => {
  const g = gridFor(LONDON.lat);
  const c = cellAt(g, ...(Object.values(cellIndex(g, LONDON)) as [number, number]));
  // Worst-case snap: 0.00025 degrees off in both directions.
  const snapped = { lat: c.centre.lat + 0.00025, lng: c.centre.lng - 0.00025 };
  for (const corner of [c.sw, c.ne, { lat: c.sw.lat, lng: c.ne.lng }, { lat: c.ne.lat, lng: c.sw.lng }]) {
    const p = toLocal(snapped, corner);
    assert.ok(Math.max(Math.abs(p.x), Math.abs(p.z)) <= c.requestM, `corner outside the ${c.requestM} m request`);
  }
  // Not much wider than needed (the grid is square at the band's latitude, so a few metres either way).
  assert.ok(c.requestM <= CELL_M / 2 + SNAP_MARGIN_M + 10, `${c.requestM}`);
});

test("the covering cells cover the whole disc, nearest first", () => {
  const g = gridFor(LONDON.lat);
  const centre = fromLocal(LONDON, { x: 900, z: -650 });
  const radius = coverRadiusM(W, H, AX, AY, 0.5, MAP_SCALE);
  const cells = cellsCovering(g, centre, radius);
  const keys = new Set(cells.map((c) => c.key));
  // Sample the disc: every sample lies in a returned cell.
  for (let a = 0; a < 64; a++) {
    for (const f of [0, 0.3, 0.7, 0.999]) {
      const p = fromLocal(centre, { x: Math.cos(a) * radius * f, z: Math.sin(a) * radius * f });
      const { i, j } = cellIndex(g, p);
      assert.ok(keys.has(`${g.band}:${i}:${j}`), `uncovered sample at ${a}, ${f}`);
    }
  }
  // Nearest first: the camera's own cell leads.
  assert.equal(distanceToCellM(centre, cells[0]), 0);
  for (let k = 1; k < cells.length; k++) assert.ok(distanceToCellM(centre, cells[k - 1]) <= distanceToCellM(centre, cells[k]) + 1e-9);
  // And no far cells: each one reaches into the disc.
  for (const c of cells) assert.ok(distanceToCellM(centre, c) <= radius);
  // Widest view stays a modest number of tiles.
  assert.ok(cells.length <= 25, `${cells.length} cells`);
});

test("the viewBox shows exactly the cell in the tile's own metres", () => {
  const g = gridFor(LONDON.lat);
  const c = cellAt(g, 11446, -25);
  const tileOrigin = { lat: c.centre.lat + 0.0002, lng: c.centre.lng + 0.0001 };
  const [x, y, w, h] = cellViewBox(c, tileOrigin).split(" ").map(Number);
  const sw = toLocal(tileOrigin, c.sw);
  const ne = toLocal(tileOrigin, c.ne);
  assert.ok(Math.abs(x - sw.x) < 0.01);
  assert.ok(Math.abs(y - -ne.z) < 0.01);
  assert.ok(Math.abs(w - (ne.x - sw.x)) < 0.02);
  assert.ok(Math.abs(h - (ne.z - sw.z)) < 0.02);
  assert.ok(distanceM(c.sw, c.ne) > CELL_M);
});

test("tile bitmaps stay within budget at every zoom", () => {
  const g = gridFor(LONDON.lat);
  for (const zoom of [0.5, 0.7, 0.85, 1, 1.39, 1.4, 2.2]) {
    const n = cellsCovering(g, LONDON, coverRadiusM(W, H, AX, AY, zoom, MAP_SCALE)).length;
    const bytes = viewBitmapBytes(n, zoom, 3, MAP_SCALE);
    assert.ok(bytes < 200 * 1024 * 1024, `zoom ${zoom}: ${n} tiles, ${Math.round(bytes / 1048576)} MB`);
  }
  // Coarser zoomed out, finer zoomed in, never finer than the screen.
  assert.ok(rasterDensity(0.5, 3) < rasterDensity(1, 3));
  assert.ok(rasterDensity(1, 3) < rasterDensity(2, 3));
  assert.equal(rasterDensity(2, 2), 2);
});

test("the drawing density only changes once the zoom is clearly past a level's edge", async () => {
  const { rasterDensityKeeping, rasterDensity: rd } = await import("../mapTiles.ts");
  const at1 = rd(1, 3);
  // Just under the 0.85 edge: still drawn as at zoom 1.
  assert.equal(rasterDensityKeeping(0.84, 3, at1), at1);
  // Well under: the coarser level.
  assert.equal(rasterDensityKeeping(0.7, 3, at1), rd(0.7, 3));
  // Just over the 1.4 edge from zoom 1's level: kept; well over: finer.
  assert.equal(rasterDensityKeeping(1.42, 3, at1), at1);
  assert.equal(rasterDensityKeeping(1.7, 3, at1), rd(1.7, 3));
  // Coming back down from the finer level near the edge: kept finer.
  assert.equal(rasterDensityKeeping(1.38, 3, rd(1.7, 3)), rd(1.7, 3));
});
