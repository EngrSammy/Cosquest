// How often the game asks the phone where it is (runtime.ts startLocation).
// It used to ask for the best fix the phone can give every 2 s / 3 m, which
// woke the GPS and re-rendered the map about every 2 s (audit B8); this asks
// for a high-accuracy fix every 5 s or 5 m, whichever comes later. Pure, so the
// in-reach consequence is unit tested (__tests__/locationWatch.test.ts).
import { distanceM, type LatLng } from "./geo.ts";

export const LOCATION_WATCH = { timeIntervalMs: 5000, distanceIntervalM: 5 } as const;

/** How far the last fix can trail a player moving at `speedMs` (m/s). */
export function watchLagM(speedMs: number, watch: { timeIntervalMs: number; distanceIntervalM: number } = LOCATION_WATCH): number {
  return Math.max(watch.distanceIntervalM, (Math.max(0, speedMs) * watch.timeIntervalMs) / 1000);
}

/**
 * The fixes a watch would deliver along a path sampled every second: a new fix
 * once at least timeIntervalMs has passed and the phone has moved at least
 * distanceIntervalM since the last one (how Android's and iOS's filters combine).
 */
export function watchFixes(
  path: readonly LatLng[],
  watch: { timeIntervalMs: number; distanceIntervalM: number } = LOCATION_WATCH,
): { at: number; fix: LatLng }[] {
  const out: { at: number; fix: LatLng }[] = [];
  path.forEach((p, i) => {
    const at = i * 1000;
    const last = out[out.length - 1];
    if (!last || (at - last.at >= watch.timeIntervalMs && distanceM(last.fix, p) >= watch.distanceIntervalM)) out.push({ at, fix: p });
  });
  return out;
}
