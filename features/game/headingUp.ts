// Heading-up map (phone hardware design 2.2, 1 Nov 2026): the map turns as the
// phone turns, so the street ahead is up the screen. Pure so it can be tested;
// components/game/useHeadingUp.ts feeds it the compass and drives the camera.
//
// The compass is noisy (a few degrees of wobble at rest, spikes near metal), so
// each reading goes through a low-pass filter on the circle (never the long way
// round through 0/360), then a dead-band, then a rate limit: the camera is
// asked to turn at most RATE_MS apart and only when the smoothed heading moved
// DEAD_BAND_DEG. Between asks the camera eases (useHeadingUp), so it glides.

/** Low-pass time constant (ms): how long a turn takes to come through about 63%. */
export const SMOOTH_TAU_MS = 160;
/** The smallest turn (degrees) worth moving the map for: below it is wobble. */
export const DEAD_BAND_DEG = 3;
/** The camera is asked to turn at most this often (ms), about 15 a second. */
export const RATE_MS = 66;
/** A gap this long between readings starts the filter afresh (the sensor slept). */
export const RESTART_GAP_MS = 1500;
/** No reading this long after the compass starts: this phone has none. */
export const NO_COMPASS_MS = 3000;

/** The signed short turn from a to b, degrees in (-180, 180]. */
export function shortDeltaDeg(a: number, b: number): number {
  const d = (((b - a) % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}

/** Any angle as 0..360. */
export function wrapDeg(a: number): number {
  return ((a % 360) + 360) % 360;
}

/**
 * One step of the low-pass filter: `prev` moves toward `sample` by
 * 1 - exp(-dt/tau) of the short way round. dt <= 0 keeps prev.
 */
export function lowPassDeg(prev: number, sample: number, dtMs: number, tauMs = SMOOTH_TAU_MS): number {
  if (!(dtMs > 0)) return wrapDeg(prev);
  const a = 1 - Math.exp(-dtMs / Math.max(1, tauMs));
  return wrapDeg(prev + a * shortDeltaDeg(prev, sample));
}

/** The degrees a compass reading means: true north, else magnetic, else null. */
export function readingDeg(r: { trueHeading?: number; magHeading?: number }): number | null {
  for (const v of [r.trueHeading, r.magHeading]) {
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) return wrapDeg(v);
  }
  return null;
}

/**
 * Smooths compass readings and says when the map should turn.
 * push() returns the heading to turn to, or null when the map should stay.
 */
export class HeadingFilter {
  private smoothed: number | null = null;
  private lastAt = 0;
  private emitted: number | null = null;
  private emittedAt = -Infinity;

  private readonly tauMs: number;
  private readonly deadBandDeg: number;
  private readonly rateMs: number;

  constructor(tauMs = SMOOTH_TAU_MS, deadBandDeg = DEAD_BAND_DEG, rateMs = RATE_MS) {
    this.tauMs = tauMs;
    this.deadBandDeg = deadBandDeg;
    this.rateMs = rateMs;
  }

  reset(): void {
    this.smoothed = null;
    this.emitted = null;
    this.emittedAt = -Infinity;
  }

  /** The current smoothed heading (null before the first reading). */
  get value(): number | null {
    return this.smoothed;
  }

  push(deg: number, atMs: number): number | null {
    if (!Number.isFinite(deg)) return null;
    if (this.smoothed === null || atMs - this.lastAt > RESTART_GAP_MS) {
      this.smoothed = wrapDeg(deg);
    } else {
      this.smoothed = lowPassDeg(this.smoothed, deg, atMs - this.lastAt, this.tauMs);
    }
    this.lastAt = atMs;
    if (this.emitted !== null) {
      if (atMs - this.emittedAt < this.rateMs) return null;
      if (Math.abs(shortDeltaDeg(this.emitted, this.smoothed)) < this.deadBandDeg) return null;
    }
    this.emitted = this.smoothed;
    this.emittedAt = atMs;
    return this.smoothed;
  }
}

/**
 * The map turn (radians, as WorldMap's camera `rot`) that puts `headingDeg`
 * up the screen, picked as the equivalent angle nearest `currentRot` so the
 * map never spins the long way round when the heading crosses north.
 * The board is drawn north-up, so facing east (90) turns it a quarter left.
 */
export function rotForHeading(headingDeg: number, currentRot: number): number {
  const target = (-headingDeg * Math.PI) / 180;
  const t = 2 * Math.PI;
  const d = ((((target - currentRot + Math.PI) % t) + t) % t) - Math.PI;
  return currentRot + d;
}

/**
 * Does this reading's accuracy call for "wave your phone in a figure 8"?
 * expo-location reports 0 (none) .. 3 (high) on both platforms (iOS: 1 is
 * under 50 degrees of uncertainty, 0 worse).
 */
export function needsCalibration(accuracy: number | null | undefined): boolean {
  if (typeof accuracy !== "number" || !Number.isFinite(accuracy)) return false;
  return accuracy <= 1;
}

/** Poor accuracy this long without a good reading in between shows the hint once. */
export const CALIBRATE_AFTER_MS = 2000;

// ── the compass button ───────────────────────────────────────────────────────

export type CompassMode = "north" | "heading";
export type CompassState = { mode: CompassMode; available: boolean };
export type CompassEvent =
  /** The compass button. */
  | { t: "tap" }
  /** A two-finger twist turned the map by hand. */
  | { t: "twist" }
  /** The compass gave a reading. */
  | { t: "reading" }
  /** The compass failed or never answered: this phone has none. */
  | { t: "unavailable" };

export const COMPASS_START: CompassState = { mode: "north", available: true };

export function compassReduce(s: CompassState, e: CompassEvent): CompassState {
  switch (e.t) {
    case "tap":
      if (!s.available) return s;
      return { ...s, mode: s.mode === "heading" ? "north" : "heading" };
    case "twist":
      // Turning the map by hand means "I'll hold it": heading-up lets go.
      return s.mode === "heading" ? { ...s, mode: "north" } : s;
    case "reading":
      return s.available ? s : { ...s, available: true };
    case "unavailable":
      return { mode: "north", available: false };
  }
}
