// The world map's ground, loaded as tiles round wherever the camera looks
// (features/game/mapTiles.ts has the why and the maths).
//
// Lives inside WorldMap's board view, so tiles are placed in board points and
// the camera's transform moves them with everything else. It watches the
// camera itself (quantised, on the UI thread) so a pan or pinch re-renders
// only this layer, never the pins. Cells are fetched nearest first, a few at
// a time, kept in a small LRU as drawable path strings, and faded in over a
// quiet placeholder rather than popping in over bare land.
import { memo, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { PixelRatio, StyleSheet } from "react-native";
import Animated, {
  type SharedValue,
  FadeIn,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg from "react-native-svg";

import { fromLocal, type LatLng } from "@/features/game/geo";
import { benchCount } from "@/features/game/mapBench";
import { buildLayers, type MapLayers } from "@/features/game/mapPaths";
import type { MapStyle } from "@/features/game/mapStyle";
import { cellRect, cellsCovering, cellViewBox, coverRadiusM, gridFor, rasterDensity, rasterDensityKeeping, type Cell } from "@/features/game/mapTiles";
import type { GroundGeometry } from "@/features/game/wire";

import { GroundPaths } from "./GroundPaths";

export type LoadGround = (lat: number, lng: number, radiusM: number) => Promise<GroundGeometry>;

/** Cells kept in memory (as path strings, ~20-60 KB each): a few screens' worth of panning. */
const CACHE_MAX = 48;
/** Requests in flight at once. */
const CONCURRENCY = 4;
/** Fetched (not drawn) this far past the cover radius, so a pan finds its ground ready. */
const PREFETCH_M = 300;
/** A failed cell is asked again after this long. */
const RETRY_MS = 8000;
/** The camera is watched in steps of this many board points (and zoom in 0.05 steps). */
const VIEW_STEP = 60;
/** A density change waits for the pinch to settle, so a zoom does not redraw every tile mid-gesture. */
const DENSITY_SETTLE_MS = 250;

type Tile = { origin: LatLng; layers: MapLayers | null };

// One map on screen at a time: the cache outlives the component, so leaving
// the map and coming back does not refetch what was just there.
const cache = new Map<string, Tile>();
const inflight = new Set<string>();
const failedAt = new Map<string, number>();
const listeners = new Set<() => void>();
let queue: Cell[] = [];

function remember(key: string, tile: Tile) {
  cache.delete(key);
  cache.set(key, tile);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function touch(key: string): Tile | undefined {
  const t = cache.get(key);
  if (t) {
    cache.delete(key);
    cache.set(key, t);
  }
  return t;
}

function pump(load: LoadGround) {
  while (inflight.size < CONCURRENCY && queue.length) {
    const cell = queue.shift()!;
    if (cache.has(cell.key) || inflight.has(cell.key)) continue;
    inflight.add(cell.key);
    load(cell.centre.lat, cell.centre.lng, cell.requestM)
      .then((g) => {
        remember(cell.key, {
          origin: g.origin,
          layers: g.covered === false ? null : buildLayers(g),
        });
        failedAt.delete(cell.key);
      })
      .catch(() => {
        failedAt.set(cell.key, Date.now());
      })
      .finally(() => {
        inflight.delete(cell.key);
        listeners.forEach((l) => l());
        pump(load);
      });
  }
}

/** Asks for the cells (nearest first) that are neither cached, in flight, nor recently failed. */
function want(cells: Cell[], load: LoadGround) {
  const now = Date.now();
  queue = cells.filter((c) => !cache.has(c.key) && !inflight.has(c.key) && now - (failedAt.get(c.key) ?? -Infinity) > RETRY_MS);
  pump(load);
}

type Props = {
  origin: LatLng;
  /** The board's half-size, metres (board point (0,0) is extent west and north of origin). */
  extent: number;
  /** Board points per metre. */
  scale: number;
  look: MapStyle;
  load: LoadGround;
  camX: SharedValue<number>;
  camY: SharedValue<number>;
  zoom: SharedValue<number>;
  /** The screen, and where the camera's centre sits on it. */
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
};

/** New or redrawn tiles are drawn at most one per this long: drawing one is a long frame, several at once a stall. */
const DRAW_EVERY_MS = 40;

export default function GroundTiles({ origin, extent, scale, look, load, camX, camY, zoom, width, height, anchorX, anchorY }: Props) {
  const reduceMotion = useReducedMotion();
  benchCount("tilesRender");
  const loadRef = useRef(load);
  loadRef.current = load;
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    listeners.add(bump);
    return () => {
      listeners.delete(bump);
    };
  }, []);

  const grid = useMemo(() => gridFor(origin.lat), [origin.lat]);
  const pixelRatio = PixelRatio.get();

  // What the camera can see, worked out on the JS side only when the camera
  // crosses a VIEW_STEP (or a 0.05 zoom step), and committed to React only
  // when the set of cells on screen actually changes: a pan re-renders this
  // layer a handful of times, not every few frames.
  const cover = (x: number, y: number, z: number) => {
    const centre = fromLocal(origin, {
      x: x / scale - extent,
      z: extent - y / scale,
    });
    const radius = coverRadiusM(width, height, anchorX, anchorY, Math.max(z, 0.05), scale);
    return {
      cells: cellsCovering(grid, centre, radius),
      ahead: cellsCovering(grid, centre, radius + PREFETCH_M),
    };
  };
  const [cells, setCells] = useState<Cell[]>(() => cover(camX.get(), camY.get(), Math.floor(zoom.get() * 20) / 20).cells);
  const cellsKey = useRef(cells.map((c) => c.key).join(","));
  const wantedKey = useRef("");
  // The density tiles are drawn at: follows the zoom with hysteresis, and only
  // once the camera has stopped (a redraw mid-gesture is a dropped frame).
  const [density, setDensity] = useState(() => rasterDensity(zoom.get(), pixelRatio));
  const densityRef = useRef(density);
  densityRef.current = density;
  const lastZoom = useRef(zoom.get());
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onView = (x: number, y: number, z: number) => {
    const { cells: now, ahead } = cover(x, y, z);
    const key = now.map((c) => c.key).join(",");
    if (key !== cellsKey.current) {
      cellsKey.current = key;
      setCells(now);
    }
    const wanted = ahead.map((c) => c.key).join(",");
    if (wanted !== wantedKey.current) {
      wantedKey.current = wanted;
      want(ahead, loadRef.current);
    }
    lastZoom.current = z;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      settle.current = null;
      const next = rasterDensityKeeping(lastZoom.current, pixelRatio, densityRef.current);
      if (next !== densityRef.current) setDensity(next);
    }, DENSITY_SETTLE_MS);
  };
  useEffect(() => {
    onView(camX.get(), camY.get(), zoom.get());
    return () => {
      if (settle.current) clearTimeout(settle.current);
    };
  }, [origin, extent, scale, width, height, anchorX, anchorY]); // eslint-disable-line react-hooks/exhaustive-deps

  useAnimatedReaction(
    () => ({
      qx: Math.round(camX.get() / VIEW_STEP),
      qy: Math.round(camY.get() / VIEW_STEP),
      qz: Math.floor(zoom.get() * 20),
    }),
    (now, before) => {
      if (before && now.qx === before.qx && now.qy === before.qy && now.qz === before.qz) return;
      runOnJS(onView)(now.qx * VIEW_STEP, now.qy * VIEW_STEP, zoom.get());
    },
  );

  // Which cells are drawn, and at what density. A loaded cell is drawn (or
  // redrawn at a new density) one at a time, DRAW_EVERY_MS apart, and kept
  // drawn at its old density until its turn: no stall when many tiles land
  // together or the zoom changes level.
  const drawn = useRef(new Map<string, number>());
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const visible = new Set(cells.map((c) => c.key));
  for (const k of [...drawn.current.keys()]) if (!visible.has(k)) drawn.current.delete(k);
  let budget = 1;
  let behind = false;
  const items = cells.map((cell) => {
    const tile = touch(cell.key);
    let d = drawn.current.get(cell.key);
    if (tile && d !== density) {
      if (budget > 0) {
        budget -= 1;
        d = density;
        drawn.current.set(cell.key, d);
      } else behind = true;
    }
    return { cell, tile, d };
  });
  useEffect(() => {
    if (!behind) return;
    const t = setTimeout(tick, DRAW_EVERY_MS);
    return () => clearTimeout(t);
  });

  return (
    <>
      {items.map(({ cell, tile, d }) => {
        const rect = cellRect(cell, origin, extent, scale);
        return tile && d !== undefined ? (
          <TileView key={cell.key} cell={cell} tile={tile} rect={rect} look={look} density={d} />
        ) : (
          <Placeholder key={cell.key} rect={rect} tint={look.grid} still={reduceMotion} />
        );
      })}
    </>
  );
}

type Rect = { left: number; top: number; width: number; height: number };

const TileView = memo(
  function TileView({ cell, tile, rect, look, density }: { cell: Cell; tile: Tile; rect: Rect; look: MapStyle; density: number }) {
    // Drawn at `density` pixels a board point, then stretched to the cell
    // (react-native-svg's bitmap is the view's own size).
    benchCount("tileDraw");
    const pr = Math.max(1, PixelRatio.get());
    const k = Math.max(1, pr / density);
    const w = rect.width / k;
    const h = rect.height / k;
    return (
      <Animated.View entering={TILE_IN} pointerEvents="none" style={[styles.cell, rect]}>
        <Svg
          // Rasterised off the main thread (patches/react-native-svg+*.patch): a
          // tile landing mid-gesture does not stall the frame. It fades in over
          // the land, so the moment before it is drawn reads as part of the fade.
          nativeID="svg-async-tile"
          width={w}
          height={h}
          viewBox={cellViewBox(cell, tile.origin)}
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            left: (rect.width - w) / 2,
            top: (rect.height - h) / 2,
            transform: [{ scale: k }],
          }}
        >
          <GroundPaths layers={tile.layers} look={look} />
        </Svg>
      </Animated.View>
    );
  },
  (a, b) =>
    a.cell.key === b.cell.key &&
    a.tile === b.tile &&
    a.look === b.look &&
    a.density === b.density &&
    Math.abs(a.rect.left - b.rect.left) < 0.01 &&
    Math.abs(a.rect.top - b.rect.top) < 0.01,
);

/** Where a cell is still loading: the land, breathing faintly, so it reads as "coming" rather than empty. */
const Placeholder = memo(
  function Placeholder({ rect, tint, still }: { rect: Rect; tint: string; still: boolean }) {
    const t = useSharedValue(0);
    useEffect(() => {
      if (still) return;
      t.set(withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 700 })), -1));
    }, [still, t]);
    const style = useAnimatedStyle(() => ({ opacity: 0.25 + 0.35 * t.get() }));
    return <Animated.View pointerEvents="none" style={[styles.cell, rect, { backgroundColor: tint }, style]} />;
  },
  (a, b) => a.tint === b.tint && a.still === b.still && Math.abs(a.rect.left - b.rect.left) < 0.01 && Math.abs(a.rect.top - b.rect.top) < 0.01,
);

const TILE_IN = FadeIn.duration(220);

const styles = StyleSheet.create({
  cell: { position: "absolute", overflow: "hidden" },
});
