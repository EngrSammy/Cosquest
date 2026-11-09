// State.cs: what the view reads. Everything the sim decides with is here (and
// in the AI), so Hash() covers it all. Fields are plain and mutable for speed;
// only the sim should write them.

import type { FighterStats } from "./setup.ts";
import { EndReason, FighterAction, InputKind, MoveId, WeaponClass } from "./types.ts";

export function isNeutral(a: FighterAction): boolean {
  return a === FighterAction.Idle || a === FighterAction.WalkFwd || a === FighterAction.WalkBack;
}

export function isAttack(a: FighterAction): boolean {
  switch (a) {
    case FighterAction.Light1:
    case FighterAction.Light2:
    case FighterAction.Light3:
    case FighterAction.DashStrike:
    case FighterAction.HeavyRelease:
    case FighterAction.Special1:
    case FighterAction.Special2:
      return true;
    default:
      return false;
  }
}

export function isStunned(a: FighterAction): boolean {
  return a === FighterAction.HitLight || a === FighterAction.HitHeavy ||
    a === FighterAction.GuardBreak || a === FighterAction.BlockStun;
}

/** One fighter, as the view reads it. */
export class FighterState {
  /** 1 or 2. */
  side: number;
  class: WeaponClass;
  stats: FighterStats;

  /** Centre of the body, millimetres from the arena centre. */
  x = 0;
  /** +1 facing right (towards +x), -1 facing left. */
  facing = 1;

  action: FighterAction = FighterAction.Idle;
  /** Ticks since the action began, 0 on its first tick. */
  actionTick = 0;
  /** The action's full length in ticks, 0 when it has none (Idle, Block...). */
  actionLength = 0;
  /** The attack's startup this time (a heavy's grows with a short charge). */
  actionStartup = 0;
  move: MoveId = MoveId.None;

  hp = 0;
  /** 0 to 300: three bars of 100. */
  meter = 0;
  /** 0 to 100. Blocking drains it; at 0 the guard breaks. */
  guard = 0;
  /** Mirrors the duel's hit-stop, so the view can freeze this fighter. */
  hitStop = 0;

  holding = false;
  /** Ticks spent blocking in this hold; a heavy charges at CHARGE_TICKS. */
  holdTicks = 0;
  /** Ticks spent in HeavyCharge (the glowing telegraph). */
  chargeTicks = 0;
  comboStep = 0;
  hitThisAction = false;
  /** The current attack hit or was blocked: opens cancels. */
  hitConnected = false;

  buffered: InputKind = InputKind.None;
  bufferAge = 0;
  /** The input applied this tick (the AI's, for an AI side). */
  lastInput: InputKind = InputKind.None;

  // Internal in C#.
  moveDir = 0;
  /** Distance the current attack still steps in over its startup. */
  lunge = 0;
  /** The move this fighter last blocked. */
  blockedMove: MoveId = MoveId.None;
  /** This fighter's last hit was blocked rather than clean. */
  lastHitBlocked = false;
  activeFrames = 0;
  dodgeInvulnTicksCache = 15;

  constructor(side: number, cls: WeaponClass, stats: FighterStats) {
    this.side = side;
    this.class = cls;
    this.stats = stats;
  }

  get invulnerable(): boolean {
    const a = this.action;
    return (a === FighterAction.DodgeBack && this.actionTick < this.dodgeInvulnTicksCache) ||
      a === FighterAction.Knockdown || a === FighterAction.GetUp;
  }

  /** HP as thousandths of max, the timeout's tiebreak ((long)Hp * 1000 / MaxHp). */
  get hpPermille(): number {
    return Math.trunc((this.hp * 1000) / this.stats.maxHp);
  }

  get inActiveFrames(): boolean {
    return isAttack(this.action) && this.actionTick >= this.actionStartup &&
      this.actionTick < this.actionStartup + this.activeFrames;
  }
}

export class DuelState {
  tick = 0;
  ticksLeft = 0;
  /** Global freeze after a hit; both fighters hold their pose (and the clock stops). */
  hitStop = 0;
  over = false;
  /** 1 or 2, or 0 for a draw (or while the duel is on). */
  winner = 0;
  endReason: EndReason = EndReason.None;

  readonly p1: FighterState;
  readonly p2: FighterState;

  constructor(p1: FighterState, p2: FighterState) {
    this.p1 = p1;
    this.p2 = p2;
  }

  /** 0 for P1, 1 for P2. */
  fighter(side: number): FighterState {
    return side === 0 ? this.p1 : this.p2;
  }
}
