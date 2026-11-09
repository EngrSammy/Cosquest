// InputLog.cs: the human inputs of a duel, as the server receives them.
//
// Replaying the log against the same setup reproduces the duel exactly, AI
// and all, because the AI is seeded from the setup. Walking (MoveToward /
// MoveAway every tick the thumb is held to one side) is run-length encoded:
// a run of the same move on consecutive ticks is one entry [tick, code, ticks].

import { DuelSim } from "./duelSim.ts";
import { DuelFormatError } from "./errors.ts";
import type { DuelSetup } from "./setup.ts";
import { EndReason, type InputFrame, InputKind, MAX_INPUT_CODE } from "./types.ts";

export interface InputLogEntry {
  tick: number;
  /** 0 for P1, 1 for P2. */
  side: number;
  kind: InputKind;
  /** Consecutive ticks this input covers. 1 except for a run of walking. */
  length: number;
}

/** One wire entry: [tick, code] or [tick, code, ticks] (a walk longer than a tick). */
export type WireInput = [number, number] | [number, number, number];

export interface ReplayResult {
  hash: bigint;
  /** hash as 16 lowercase hex digits. */
  hashHex: string;
  winner: number;
  ticks: number;
  p1Hp: number;
  p2Hp: number;
  endReason: EndReason;
}

function isMove(k: number): boolean {
  return k === InputKind.MoveToward || k === InputKind.MoveAway;
}

function kindOf(f: InputKind | InputFrame): InputKind {
  return typeof f === "number" ? f : f.kind;
}

function isInt32(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= -2147483648 && v <= 2147483647;
}

export class InputLog {
  private readonly entries: InputLogEntry[] = [];

  get entryList(): readonly InputLogEntry[] {
    return this.entries;
  }

  record(tick: number, side: number, input: InputKind | InputFrame): void {
    const kind = kindOf(input);
    if (kind === InputKind.None) return;
    if (isMove(kind)) {
      // Extend this side's walk if it carries on from the tick before.
      for (let i = this.entries.length - 1; i >= 0; i--) {
        const e = this.entries[i];
        if (e.side !== side) continue;
        if (e.kind === kind && ((e.tick + e.length) | 0) === tick) {
          e.length++;
          return;
        }
        break;
      }
    }
    this.entries.push({ tick, side, kind, length: 1 });
  }

  /** Step the sim and log both sides' inputs (AI sides log nothing: they replay themselves). */
  static step(sim: DuelSim, log: InputLog, p1: InputKind | InputFrame, p2: InputKind | InputFrame): void {
    const tick = sim.state.tick + 1;
    if (sim.setup.p1.ai == null) log.record(tick, 0, p1);
    if (sim.setup.p2.ai == null) log.record(tick, 1, p2);
    sim.step(p1, p2);
  }

  /** The wire form for one side: [[tick, code], ...] and [tick, code, ticks] for a walk. */
  toWire(side: number): WireInput[] {
    const list: WireInput[] = [];
    for (const e of this.entries) {
      if (e.side !== side) continue;
      list.push(e.length > 1 ? [e.tick, e.kind, e.length] : [e.tick, e.kind]);
    }
    return list;
  }

  /**
   * Parse a side's wire log, refusing what the C# refuses: ticks out of order,
   * shared or overlapping ticks, unknown codes, and runs of anything but
   * walking. Also refuses what C# could never receive as an int[][]
   * (non-integers, values outside 32 bits).
   */
  static fromWire(side: number, wire: readonly (readonly number[] | null)[]): InputLog {
    if (!Array.isArray(wire)) throw new DuelFormatError("the inputs must be an array");
    const log = new InputLog();
    let last = 0; // first tick the next entry may use
    for (const pair of wire) {
      if (pair == null || !Array.isArray(pair) || (pair.length !== 2 && pair.length !== 3))
        throw new DuelFormatError("each input is [tick, code] or [tick, code, ticks]");
      for (const v of pair) if (!isInt32(v)) throw new DuelFormatError("each input is [tick, code] or [tick, code, ticks]");
      const tick = pair[0];
      const code = pair[1];
      const length = pair.length === 3 ? pair[2] : 1;
      if (tick < 1 || tick < last) throw new DuelFormatError("ticks must be positive, in order and not overlap");
      if (code <= 0 || code > MAX_INPUT_CODE) throw new DuelFormatError(`unknown input code ${code}`);
      if (length < 1) throw new DuelFormatError("a run lasts at least one tick");
      if (length > 1 && !isMove(code)) throw new DuelFormatError("only walking can span ticks");
      last = (tick + length) | 0; // an unchecked C# int: wraps
      log.entries.push({ tick, side, kind: code as InputKind, length });
    }
    return log;
  }

  /**
   * Play the setup with these inputs until the duel ends or maxTicks passes
   * (default RoundTicks * 4 + 1000, as hit-stop pauses the clock). What the
   * verifier does.
   */
  static replay(setup: DuelSetup, log: InputLog, maxTicks = 0): ReplayResult {
    const sim = new DuelSim(setup);
    if (maxTicks <= 0) maxTicks = (setup.roundTicks * 4 + 1000) | 0;
    // Expanded back to one input per tick per side: what the sim saw. Later
    // entries overwrite earlier ones, as the C# dictionary does. Ticks past
    // maxTicks (or past int range) are never read, so they are not expanded.
    const perTick = new Map<number, InputKind>();
    for (const e of log.entries) {
      const n = Math.max(1, e.length);
      for (let t = 0; t < n; t++) {
        const tick = e.tick + t;
        if (tick > maxTicks || tick > 2147483647) break;
        perTick.set(tick * 2 + e.side, e.kind);
      }
    }
    while (!sim.state.over && sim.state.tick < maxTicks) {
      const tick = sim.state.tick + 1;
      sim.step(perTick.get(tick * 2) ?? InputKind.None, perTick.get(tick * 2 + 1) ?? InputKind.None);
    }
    const s = sim.state;
    return {
      hash: sim.hash(),
      hashHex: sim.hashHex(),
      winner: s.winner,
      ticks: s.tick,
      p1Hp: s.p1.hp,
      p2Hp: s.p2.hp,
      endReason: s.endReason,
    };
  }
}
