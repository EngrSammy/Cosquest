// Touch to InputKind: one thumb anywhere below the HUD, as the Unity view's
// DuelInput reads it (costquest-unity Assets/Scripts/Duel/DuelInput.cs), with
// millisecond timestamps and React Native coordinates (y grows downwards).
//
// - tap (up within 300 ms, barely moved): Tap (a light attack)
// - flick (fast sideways, up within 250 ms): SwipeToward (dash) or SwipeAway (dodge)
// - hold still for 180 ms (11 ticks): HoldStart (block, and keep holding to
//   charge a heavy); letting go sends HoldEnd, which throws a charged heavy
// - drag sideways (after 150 ms) and keep the thumb there: MoveToward or
//   MoveAway on every tick
// - the special buttons: Special1 / Special2 (call special(n) from the button)
//
// "Toward" is always toward the Guardian: `facing` (the player's facing,
// +1 when the Guardian is to the right) turns screen left/right into
// toward/away. DuelRunner keeps it up to date when given this as its input.
//
// Discrete gestures queue and come out one per tick, in order, so two quick
// taps are two light attacks. Walking is a state, sent on every tick nothing
// else is. Gesture recognition is not part of the replay: the server only
// sees what next() returned, tick by tick.
//
// Pure TypeScript: feed it the touch events (press/move/release with their
// timestamps) and call poll(now) every frame, because a still thumb produces
// no move events and the hold must still be noticed.

import { type InputFrame, InputKind } from "./types.ts";

export const TAP_MS = 180;
export const HOLD_MS = 180;
export const FLICK_MS = 250;
/** HOLD_MS in ticks, rounded up: when a hold becomes a block. */
export const HOLD_START_TICKS = 11;

export interface GestureConfig {
  /** The touch area's width and height, in the same units as the touch positions. */
  width: number;
  height: number;
  /** Sideways travel (share of the width) that starts a walk. Default 0.07. */
  dragFraction?: number;
  /** Sideways travel (share of the width) a flick needs. Default 0.09. */
  flickFraction?: number;
  /** A tap moves less than this (share of the width). Default 0.05. */
  tapSlopFraction?: number;
  /** Touches that start in the top share of the area are the HUD's. Default 0.14. */
  hudTopFraction?: number;
}

const NONE: InputFrame = Object.freeze({ kind: InputKind.None });
const FRAMES: readonly InputFrame[] = Object.freeze(
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => Object.freeze({ kind: k as InputKind })),
);

/** An InputFrame without allocating (shared, frozen). */
export function frameOf(kind: InputKind): InputFrame {
  return FRAMES[kind] ?? NONE;
}

/** Milliseconds to ticks, for HoldEnd's advisory holdTicks. */
export function msToTicks(ms: number): number {
  return Math.max(0, Math.round((ms * 60) / 1000));
}

/**
 * What a lifted thumb that was neither holding nor walking meant: a flick
 * (fast and sideways), a tap (short and still), or nothing.
 */
export function classifyRelease(
  heldMs: number,
  dx: number,
  dy: number,
  width: number,
  facing: number,
  flickFraction = 0.09,
  tapSlopFraction = 0.05,
): InputKind {
  if (heldMs <= FLICK_MS && Math.abs(dx) > width * flickFraction && Math.abs(dx) > Math.abs(dy) * 1.2) {
    const dir = (dx > 0 ? 1 : -1) * facing;
    return dir > 0 ? InputKind.SwipeToward : InputKind.SwipeAway;
  }
  if (heldMs <= TAP_MS + 120 && Math.hypot(dx, dy) < width * tapSlopFraction) return InputKind.Tap;
  return InputKind.None;
}

export class GestureRecognizer {
  /** The player's facing: +1 when the Guardian is to the right of the player. */
  facing = 1;
  private cfg: Required<GestureConfig>;
  private enabled = true;
  private readonly queue: InputFrame[] = [];
  private moveDir = 0;

  // The one active touch.
  private down = false;
  private touchId: number | string = -1;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastY = 0;
  private startT = 0;
  private holding = false;
  private dragging = false;
  private holdStartT = 0;

  constructor(config: GestureConfig) {
    this.cfg = GestureRecognizer.withDefaults(config);
  }

  private static withDefaults(c: GestureConfig): Required<GestureConfig> {
    return {
      width: c.width,
      height: c.height,
      dragFraction: c.dragFraction ?? 0.07,
      flickFraction: c.flickFraction ?? 0.09,
      tapSlopFraction: c.tapSlopFraction ?? 0.05,
      hudTopFraction: c.hudTopFraction ?? 0.14,
    };
  }

  /** The touch area changed size (rotation, layout). */
  resize(width: number, height: number): void {
    this.cfg = { ...this.cfg, width, height };
  }

  /** While disabled nothing is recognised; disabling mid-touch lets go of it (a held block ends). */
  setEnabled(on: boolean, now: number): void {
    if (!on && this.down) this.release(now, this.lastX, this.lastY, this.touchId);
    this.enabled = on;
    if (!on) this.moveDir = 0;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Forget everything: a new fight. */
  clear(): void {
    this.queue.length = 0;
    this.moveDir = 0;
    this.down = this.holding = this.dragging = false;
    this.touchId = -1;
  }

  /** True while a touch is being tracked. */
  get touching(): boolean {
    return this.down;
  }

  /** The walking state right now: +1 toward, -1 away, 0 still. */
  get walking(): number {
    return this.moveDir;
  }

  /** Discrete gestures waiting for their tick. */
  get pending(): number {
    return this.queue.length;
  }

  /** The input for the next sim tick (DuelRunner calls this once per tick). */
  next(): InputFrame {
    const q = this.queue.shift();
    if (q) return q;
    if (this.moveDir !== 0) return frameOf(this.moveDir > 0 ? InputKind.MoveToward : InputKind.MoveAway);
    return NONE;
  }

  /** A special button was pressed (1 or 2). */
  special(n: 1 | 2): void {
    if (!this.enabled) return;
    this.queue.push(frameOf(n === 1 ? InputKind.Special1 : InputKind.Special2));
  }

  /** A finger touched down at (x, y), time t (ms). Only the first finger counts. */
  press(t: number, x: number, y: number, id: number | string = 0): void {
    if (!this.enabled || this.down) return;
    // The top of the screen is the HUD's, not the thumb's.
    if (y < this.cfg.height * this.cfg.hudTopFraction) return;
    this.down = true;
    this.touchId = id;
    this.startX = this.lastX = x;
    this.startY = this.lastY = y;
    this.startT = t;
    this.holding = this.dragging = false;
  }

  /** The tracked finger moved (or, from poll, stayed). */
  move(t: number, x: number, y: number, id: number | string = 0): void {
    if (!this.enabled || !this.down || id !== this.touchId) return;
    this.lastX = x;
    this.lastY = y;
    const dx = x - this.startX;
    const held = t - this.startT;
    const drag = this.cfg.width * this.cfg.dragFraction;

    // A slow sideways drag becomes walking (a fast one is a flick, decided on release).
    if (!this.dragging && Math.abs(dx) > drag && held > FLICK_MS * 0.6) {
      if (this.holding) {
        this.queue.push({ kind: InputKind.HoldEnd, holdTicks: msToTicks(t - this.holdStartT) });
        this.holding = false;
      }
      this.dragging = true;
    }
    if (this.dragging) {
      // Hysteresis: back near the start point stops the walk.
      if (Math.abs(dx) < drag * 0.45) this.moveDir = 0;
      else this.moveDir = (dx > 0 ? 1 : -1) * this.facing;
      return;
    }

    if (!this.holding && held >= HOLD_MS && Math.hypot(dx, y - this.startY) < drag) {
      this.holding = true;
      this.holdStartT = t;
      this.queue.push(frameOf(InputKind.HoldStart));
    }
  }

  /** Time passed with no touch event: notices a still thumb becoming a hold. Call every frame. */
  poll(t: number): void {
    if (this.down) this.move(t, this.lastX, this.lastY, this.touchId);
  }

  /** The tracked finger lifted at (x, y). */
  release(t: number, x: number, y: number, id: number | string = 0): void {
    if (!this.down || id !== this.touchId) return;
    // A hold may have become due since the last event (as if polled just before).
    this.poll(t);
    this.down = false;
    this.touchId = -1;
    const held = t - this.startT;
    const dx = x - this.startX;
    const dy = y - this.startY;

    if (this.holding) {
      this.queue.push({ kind: InputKind.HoldEnd, holdTicks: msToTicks(t - this.holdStartT) });
      this.holding = false;
    } else if (this.dragging) {
      this.dragging = false;
      this.moveDir = 0;
    } else {
      const k = classifyRelease(held, dx, dy, this.cfg.width, this.facing, this.cfg.flickFraction, this.cfg.tapSlopFraction);
      if (k !== InputKind.None) this.queue.push(frameOf(k));
    }
    this.moveDir = 0;
  }

  /** The system took the touch away (a call, a gesture): a release where it last was. */
  cancel(t: number, id: number | string = this.touchId): void {
    if (this.down) this.release(t, this.lastX, this.lastY, id);
  }
}
