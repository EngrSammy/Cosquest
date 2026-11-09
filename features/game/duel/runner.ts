// The fixed-step driver (the Unity DuelRunner's fight phase, without the show).
//
// Feed it real elapsed time; it steps the sim at exactly 60 Hz from an
// accumulator, as many ticks as the time covers, never tied to the frame
// rate. A hitch is capped (like Unity: a frame counts at most 100 ms, and at
// most 8 ticks run per frame, the rest dropped) so a stall never fast-forwards
// the fight past the player. The player's inputs are logged as they are
// stepped, and the finish payload is the exact /v1/duel/finish body (minus
// device_key and duel_id) that Unity's DuelWire.FinishJson writes.

import { DuelSim } from "./duelSim.ts";
import type { DuelEvent } from "./events.ts";
import { InputLog, type WireInput } from "./inputLog.ts";
import type { DuelSetup } from "./setup.ts";
import { type InputFrame, InputKind } from "./types.ts";

/** The finish body's `result`. 1 the player won, 2 the Guardian, 0 a draw. */
export interface FinishResult {
  winner: number;
  ticks: number;
  p1_hp: number;
  p2_hp: number;
}

/** POST /v1/duel/finish's `result`, `inputs` and `hash` (Swift adds device_key and duel_id). */
export interface FinishPayload {
  result: FinishResult;
  /** InputLog.ToWire(0): [tick, code] or [tick, code, ticks] for a walk, in tick order. */
  inputs: WireInput[];
  /** Hash() as 16 lowercase hex digits. */
  hash: string;
}

/** The finish body from a sim and its log (DuelWire.FinishJson's object, same key order). */
export function finishPayload(sim: DuelSim, log: InputLog): FinishPayload {
  const st = sim.state;
  return {
    result: { winner: st.winner, ticks: st.tick, p1_hp: st.p1.hp, p2_hp: st.p2.hp },
    inputs: log.toWire(0),
    hash: sim.hashHex(),
  };
}

/** The finish body as JSON text, byte for byte what Unity sends. */
export function finishJson(sim: DuelSim, log: InputLog): string {
  return JSON.stringify(finishPayload(sim, log));
}

/** Where the player's input comes from: one InputFrame (or kind) per tick. */
export interface InputSource {
  next(): InputKind | InputFrame;
  /** If present, set to the player's facing before every tick (+1: the Guardian is to the right). */
  facing?: number;
}

export interface RunnerOptions {
  /** The player's input, consulted once per tick. Default: none (an idle P1). */
  input?: InputSource;
  /** Called for every sim event, in order, as its tick is stepped. */
  onEvent?: (e: DuelEvent) => void;
  /** Never run more than this many ticks in one advance (default 8, as Unity). */
  maxTicksPerAdvance?: number;
  /** A frame counts for at most this much time (default 100 ms, as Unity). */
  maxFrameMs?: number;
}

export interface AdvanceResult {
  /** Ticks stepped by this call. */
  ticks: number;
  /** The events those ticks emitted, in order (shared empty array when none). */
  events: readonly DuelEvent[];
  /** How far towards the next tick the accumulator is, 0 to 1: for interpolation. */
  alpha: number;
  over: boolean;
}

const NO_EVENTS: readonly DuelEvent[] = Object.freeze([]);
/** Accumulator units: microseconds times 60, so one tick is exactly 1e6 units. */
const TICK_UNITS = 1_000_000;

export class DuelRunner {
  readonly sim: DuelSim;
  readonly log: InputLog;
  /** Each fighter's x (mm) before the last tick, for interpolating the draw. */
  readonly prevX: [number, number];
  input: InputSource | null;
  onEvent: ((e: DuelEvent) => void) | null;
  private readonly maxTicks: number;
  private readonly maxFrameUs: number;
  private acc = 0;

  constructor(setup: DuelSetup, options: RunnerOptions = {}) {
    this.sim = new DuelSim(setup);
    this.log = new InputLog();
    this.input = options.input ?? null;
    this.onEvent = options.onEvent ?? null;
    this.maxTicks = Math.max(1, Math.floor(options.maxTicksPerAdvance ?? 8));
    this.maxFrameUs = Math.round((options.maxFrameMs ?? 100) * 1000);
    this.prevX = [this.sim.state.p1.x, this.sim.state.p2.x];
  }

  get over(): boolean {
    return this.sim.state.over;
  }

  /** 0 to 1: the share of the next tick already accumulated. */
  get alpha(): number {
    return Math.min(1, this.acc / TICK_UNITS);
  }

  /**
   * Real time has passed (ms, fractions allowed): run every whole tick it
   * covers, up to the caps. Call it once per rendered frame.
   */
  advance(elapsedMs: number): AdvanceResult {
    if (!(elapsedMs > 0) || this.sim.state.over) return { ticks: 0, events: NO_EVENTS, alpha: this.alpha, over: this.sim.state.over };
    const us = Math.min(this.maxFrameUs, Math.round(elapsedMs * 1000));
    this.acc += us * 60;
    let n = 0;
    let events: DuelEvent[] | null = null;
    while (this.acc >= TICK_UNITS && n < this.maxTicks && !this.sim.state.over) {
      const ev = this.tick();
      if (ev.length > 0) {
        if (events == null) events = [];
        for (const e of ev) events.push(e);
      }
      this.acc -= TICK_UNITS;
      n++;
    }
    // A hitch: the time the cap refused is dropped, not owed.
    if (n === this.maxTicks) this.acc = 0;
    if (this.sim.state.over) this.acc = 0;
    return { ticks: n, events: events ?? NO_EVENTS, alpha: this.alpha, over: this.sim.state.over };
  }

  /** One tick now, whatever the clock says (tests, or a manual step). */
  tick(input?: InputKind | InputFrame): readonly DuelEvent[] {
    const st = this.sim.state;
    if (st.over) return NO_EVENTS;
    this.prevX[0] = st.p1.x;
    this.prevX[1] = st.p2.x;
    let p1: InputKind | InputFrame = InputKind.None;
    if (input !== undefined) p1 = input;
    else if (this.input) {
      if ("facing" in this.input) this.input.facing = st.p1.facing;
      p1 = this.input.next();
    }
    InputLog.step(this.sim, this.log, p1, InputKind.None);
    const events = this.sim.drainEvents();
    if (this.onEvent) for (const e of events) this.onEvent(e);
    return events;
  }

  /**
   * Where to draw a fighter (mm): between its last two tick positions by
   * alpha, held still during hit-stop. side 0 = P1, 1 = P2.
   */
  drawX(side: number): number {
    const st = this.sim.state;
    const x = st.fighter(side).x;
    if (st.hitStop > 0) return x;
    const from = this.prevX[side];
    return from + (x - from) * this.alpha;
  }

  /** The /v1/duel/finish body (result, inputs, hash). Meaningful once over. */
  finishPayload(): FinishPayload {
    return finishPayload(this.sim, this.log);
  }

  finishJson(): string {
    return finishJson(this.sim, this.log);
  }
}
