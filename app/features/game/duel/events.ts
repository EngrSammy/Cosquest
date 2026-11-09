// Events.cs: what the view should show or play. Sides are 1 and 2.

import type { DuelEventType, MoveId } from "./types.ts";

export interface DuelEvent {
  readonly type: DuelEventType;
  readonly tick: number;
  readonly source: number;
  readonly target: number;
  readonly move: MoveId;
  readonly damage: number;
  readonly hitStop: number;
  /** Where it happened, mm (the target's position for hits). */
  readonly x: number;
}
