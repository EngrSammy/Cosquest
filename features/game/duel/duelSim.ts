// DuelSim.cs: the Guardian Duel, one tick at a time, ported statement for
// statement so that the same setup and inputs give the same Hash() as the C#
// engine (Unity on iOS, the server's replay verifier).
//
// Integer rules used throughout: every value the C# keeps in an `int` stays a
// 32-bit integer here; integer division truncates toward zero (Math.trunc);
// sums of positions wrap like unchecked C# ints (`| 0`); the only 64-bit maths
// (damage, HP permille) stays far below 2^53 so doubles are exact.

import { Fnv1a, absDiff, hex16 } from "./determinism.ts";
import type { DuelEvent } from "./events.ts";
import { type ClassData, type MoveData, classDataFor, moveOf } from "./frameData.ts";
import { GuardianAi } from "./guardianAi.ts";
import { type DuelSetup, type FighterSetup, MIN_GAP_MM, TICKS_PER_SECOND, validateSetup } from "./setup.ts";
import { DuelState, FighterState, isAttack, isNeutral, isStunned } from "./state.ts";
import {
  DuelEventType,
  EndReason,
  FighterAction,
  HitReaction,
  type InputFrame,
  InputKind,
  MoveId,
} from "./types.ts";

export { isAttack, isNeutral, isStunned };

export const DuelConst = {
  TicksPerSecond: TICKS_PER_SECOND,
  /** An input waits this long for the fighter to be free (133 ms). */
  BufferTicks: 8,
  /** Ticks of blocking before the block is charged (HoldEnd then throws a heavy). */
  ChargeTicks: 25,
  /** Every heavy and special glows at least this long before it lands (400 ms). */
  TelegraphTicks: 24,
  MinGapMm: MIN_GAP_MM,
  MeterMax: 300,
  GuardMax: 100,
  HitLightTicks: 14,
  HitHeavyTicks: 22,
  KnockdownTicks: 40,
  GetUpTicks: 20,
  GuardBreakTicks: 45,
  MeterOnHitTaken: 2,
  BlockPushMm: 120,
  /** A dash can turn into a strike from this tick of the dash on. */
  DashStrikeFromTick: 3,
} as const;

const BUFFER_TICKS = 8;
const CHARGE_TICKS = 25;
const TELEGRAPH_TICKS = 24;
const METER_MAX = 300;
const GUARD_MAX = 100;
const HIT_LIGHT_TICKS = 14;
const HIT_HEAVY_TICKS = 22;
const KNOCKDOWN_TICKS = 40;
const GET_UP_TICKS = 20;
const GUARD_BREAK_TICKS = 45;
const METER_ON_HIT_TAKEN = 2;
const BLOCK_PUSH_MM = 120;
const DASH_STRIKE_FROM_TICK = 3;

/** DuelSim.Damage: (long)attack * permille * (1000 - mitigation) / 1e6, at least 1. */
export function damage(attack: number, permille: number, mitigationPermille: number): number {
  // < 2^31 * 400 * 1000 < 2^53: exact. Truncation toward zero as C# long division.
  const v = Math.trunc((attack * permille * (1000 - mitigationPermille)) / 1_000_000);
  return Math.max(1, v);
}

/** The share of a total covered at step k of n, so the sum is exact. */
function portion(total: number, k: number, n: number): number {
  if (k < 1 || k > n) return 0;
  return Math.trunc((total * k) / n) - Math.trunc((total * (k - 1)) / n);
}

interface Pending {
  has: boolean;
  move: MoveData | null;
  damage: number;
  blocked: boolean;
  guardBroken: boolean;
}

function inputKindOf(i: InputKind | InputFrame | null | undefined): InputKind {
  if (i == null) return InputKind.None;
  return typeof i === "number" ? i : i.kind;
}

export class DuelSim {
  readonly setup: DuelSetup;
  readonly state: DuelState;
  private readonly cls: ClassData[];
  private readonly ai: (GuardianAi | null)[] = [null, null];
  private filling: DuelEvent[] = [];
  private drained: DuelEvent[] = [];
  private readonly hits: Pending[] = [
    { has: false, move: null, damage: 0, blocked: false, guardBroken: false },
    { has: false, move: null, damage: 0, blocked: false, guardBroken: false },
  ];

  constructor(setup: DuelSetup) {
    if (setup == null) throw new TypeError("setup is required");
    validateSetup(setup);
    this.setup = setup;
    const gap = setup.startGapMm;
    const p1 = DuelSim.newFighter(0, setup.p1, Math.trunc(-gap / 2));
    const p2 = DuelSim.newFighter(1, setup.p2, gap - Math.trunc(gap / 2));
    this.state = new DuelState(p1, p2);
    this.state.ticksLeft = setup.roundTicks;
    this.cls = [classDataFor(setup.p1.class), classDataFor(setup.p2.class)];
    for (let i = 0; i < 2; i++) {
      const fs = i === 0 ? setup.p1 : setup.p2;
      this.state.fighter(i).dodgeInvulnTicksCache = this.cls[i].dodgeInvulnTicks;
      if (fs.ai != null) this.ai[i] = new GuardianAi(fs.ai, setup.seed, i);
    }
    this.face();
  }

  private static newFighter(side: number, fs: FighterSetup, x: number): FighterState {
    const f = new FighterState(side + 1, fs.class, fs.stats);
    f.x = x;
    f.facing = side === 0 ? 1 : -1;
    f.hp = fs.stats.maxHp;
    f.guard = GUARD_MAX;
    f.action = FighterAction.Idle;
    return f;
  }

  classOf(side: number): ClassData {
    return this.cls[side];
  }

  /** True when that side (0 or 1) is played by the Guardian AI. */
  isAi(side: number): boolean {
    return this.ai[side] != null;
  }

  /**
   * Events since the last drain. The returned array stays valid until the
   * next drain (double buffered, like C#).
   */
  drainEvents(): readonly DuelEvent[] {
    const t = this.drained;
    this.drained = this.filling;
    this.filling = t;
    this.filling.length = 0;
    return this.drained;
  }

  /**
   * Advance one tick. An AI-driven side's input is ignored and generated.
   * Does nothing once the duel is over.
   */
  step(p1: InputKind | InputFrame = InputKind.None, p2: InputKind | InputFrame = InputKind.None): void {
    const s = this.state;
    if (s.over) return;
    s.tick++;

    const a0 = this.ai[0];
    const a1 = this.ai[1];
    const in1 = a0 != null ? a0.decide(s, 0, this.cls) : inputKindOf(p1);
    const in2 = a1 != null ? a1.decide(s, 1, this.cls) : inputKindOf(p2);
    this.receive(s.p1, in1);
    this.receive(s.p2, in2);

    // Hit-stop freezes the fight, not the fingers: inputs made during it are
    // buffered, and they do not age until it lifts.
    if (s.hitStop > 0) {
      s.hitStop--;
      s.p1.hitStop = s.p2.hitStop = s.hitStop;
      s.p1.moveDir = s.p2.moveDir = 0;
      return;
    }

    this.advance(0);
    this.advance(1);
    this.resolveHits();
    this.separate();
    this.face();
    this.regenGuard(s.p1);
    this.regenGuard(s.p2);
    s.p1.hitStop = s.p2.hitStop = s.hitStop;

    s.ticksLeft--;
    this.checkEnd();
  }

  // ── input ───────────────────────────────────────────────────────────

  private receive(f: FighterState, kind: InputKind): void {
    f.lastInput = kind;
    switch (kind) {
      case InputKind.None: break;
      case InputKind.HoldStart: f.holding = true; break;
      case InputKind.HoldEnd: f.holding = false; break;
      case InputKind.MoveToward: f.moveDir = 1; break;
      case InputKind.MoveAway: f.moveDir = -1; break;
      default:
        f.buffered = kind;
        f.bufferAge = 0;
        break;
    }
  }

  // ── one fighter's tick ──────────────────────────────────────────────

  private advance(side: number): void {
    const f = this.state.fighter(side);
    const o = this.state.fighter(1 - side);
    const cd = this.cls[side];
    f.actionTick++;

    switch (f.action) {
      case FighterAction.Light1:
      case FighterAction.Light2:
      case FighterAction.Light3:
      case FighterAction.DashStrike:
      case FighterAction.HeavyRelease:
      case FighterAction.Special1:
      case FighterAction.Special2:
        if (f.actionTick <= f.actionStartup && f.lunge > 0)
          this.stepToward(f, o, portion(f.lunge, f.actionTick, Math.max(1, f.actionStartup)));
        if (f.actionTick >= f.actionLength) this.toNeutral(f);
        break;

      case FighterAction.HitLight:
      case FighterAction.HitHeavy:
      case FighterAction.BlockStun:
      case FighterAction.GuardBreak:
        if (f.actionTick >= f.actionLength) this.toNeutral(f);
        break;

      case FighterAction.DashIn:
        if (f.actionTick <= cd.dashMoveTicks)
          this.stepToward(f, o, portion(cd.dashMm, f.actionTick, cd.dashMoveTicks));
        if (f.actionTick >= cd.dashTicks) this.toNeutral(f);
        break;

      case FighterAction.DodgeBack:
        if (f.actionTick <= cd.dodgeInvulnTicks)
          this.stepAway(f, portion(cd.dodgeMm, f.actionTick, cd.dodgeInvulnTicks));
        if (f.actionTick >= cd.dodgeTicks) this.toNeutral(f);
        break;

      case FighterAction.Knockdown:
        if (f.actionTick >= KNOCKDOWN_TICKS) this.set(f, FighterAction.GetUp, GET_UP_TICKS);
        break;

      case FighterAction.GetUp:
        if (f.actionTick >= GET_UP_TICKS) this.toNeutral(f);
        break;

      case FighterAction.Block:
        if (!f.holding) this.toNeutral(f);
        else if (++f.holdTicks >= CHARGE_TICKS) {
          this.set(f, FighterAction.HeavyCharge, 0);
          f.chargeTicks = 0;
          this.emit(DuelEventType.Telegraph, f.side, o.side, MoveId.Heavy, 0, f.x, 0);
        }
        break;

      case FighterAction.HeavyCharge:
        f.chargeTicks++;
        if (!f.holding) this.startMove(f, cd, MoveId.Heavy);
        break;
    }

    this.tryConsume(f, o, cd);

    if (isNeutral(f.action) && f.holding) {
      this.set(f, FighterAction.Block, 0);
      f.holdTicks = 0;
    }

    if (isNeutral(f.action)) {
      if (f.moveDir > 0) {
        this.walk(f, FighterAction.WalkFwd);
        this.stepToward(f, o, cd.walkFwdMmPerTick);
      } else if (f.moveDir < 0) {
        this.walk(f, FighterAction.WalkBack);
        this.stepAway(f, cd.walkBackMmPerTick);
      } else if (f.action !== FighterAction.Idle) this.set(f, FighterAction.Idle, 0);
    }
    f.moveDir = 0;

    if (f.buffered !== InputKind.None && ++f.bufferAge > BUFFER_TICKS) {
      f.buffered = InputKind.None;
      f.bufferAge = 0;
    }
  }

  private tryConsume(f: FighterState, o: FighterState, cd: ClassData): void {
    const k = f.buffered;
    if (k === InputKind.None) return;
    let used = false;

    if (isNeutral(f.action)) {
      used = true;
      switch (k) {
        case InputKind.Tap: this.startMove(f, cd, MoveId.Light1); break;
        case InputKind.SwipeToward:
          this.set(f, FighterAction.DashIn, cd.dashTicks);
          this.emit(DuelEventType.DashStart, f.side, o.side, MoveId.None, 0, f.x, 0);
          break;
        case InputKind.SwipeAway: this.startDodge(f, o); break;
        case InputKind.Special1: this.trySpecial(f, o, cd, MoveId.Special1); break;
        case InputKind.Special2: this.trySpecial(f, o, cd, MoveId.Special2); break;
      }
    } else if (isAttack(f.action) && f.actionTick >= f.actionStartup + f.activeFrames) {
      // Recovery. Lights chain into the next light; anything that connected
      // can be cancelled into a dodge or a special.
      const chain = f.action === FighterAction.Light1 || f.action === FighterAction.Light2;
      if (k === InputKind.Tap && chain) {
        this.startMove(f, cd, f.action === FighterAction.Light1 ? MoveId.Light2 : MoveId.Light3);
        used = true;
      } else if (f.hitConnected && f.action !== FighterAction.Special1 && f.action !== FighterAction.Special2) {
        if (k === InputKind.SwipeAway) {
          this.startDodge(f, o);
          used = true;
        } else if (k === InputKind.Special1 || k === InputKind.Special2)
          used = this.trySpecial(f, o, cd, k === InputKind.Special1 ? MoveId.Special1 : MoveId.Special2);
      }
    } else if (f.action === FighterAction.DashIn && f.actionTick >= DASH_STRIKE_FROM_TICK && k === InputKind.Tap) {
      // The strike carries what is left of the dash.
      let travelled = 0;
      const upTo = Math.min(f.actionTick, cd.dashMoveTicks);
      for (let t = 1; t <= upTo; t++) travelled += portion(cd.dashMm, t, cd.dashMoveTicks);
      this.startMove(f, cd, MoveId.DashStrike);
      f.lunge += cd.dashMm - travelled;
      used = true;
    }

    if (used) {
      f.buffered = InputKind.None;
      f.bufferAge = 0;
    }
  }

  private trySpecial(f: FighterState, o: FighterState, cd: ClassData, id: MoveId): boolean {
    const cost = id === MoveId.Special1 ? 100 : 300;
    if (f.meter < cost) return true; // spent the input on nothing, as a real button would
    f.meter -= cost;
    this.startMove(f, cd, id);
    this.emit(DuelEventType.SpecialStart, f.side, o.side, id, 0, f.x, 0);
    this.emit(DuelEventType.Telegraph, f.side, o.side, id, 0, f.x, 0);
    return true;
  }

  private startDodge(f: FighterState, o: FighterState): void {
    this.set(f, FighterAction.DodgeBack, this.cls[f.side - 1].dodgeTicks);
    f.comboStep = 0;
    this.emit(DuelEventType.DodgeStart, f.side, o.side, MoveId.None, 0, f.x, 0);
  }

  private startMove(f: FighterState, cd: ClassData, id: MoveId): void {
    const m = moveOf(cd, id)!;
    let startup = m.startup;
    // The glow must be on screen for the full telegraph before the hit lands.
    if (id === MoveId.Heavy) startup = Math.max(m.startup, TELEGRAPH_TICKS - f.chargeTicks);
    let a: FighterAction;
    switch (id) {
      case MoveId.Light1: a = FighterAction.Light1; f.comboStep = 1; break;
      case MoveId.Light2: a = FighterAction.Light2; f.comboStep = 2; break;
      case MoveId.Light3: a = FighterAction.Light3; f.comboStep = 3; break;
      case MoveId.DashStrike: a = FighterAction.DashStrike; f.comboStep = 0; break;
      case MoveId.Heavy: a = FighterAction.HeavyRelease; f.comboStep = 0; break;
      case MoveId.Special1: a = FighterAction.Special1; f.comboStep = 0; break;
      default: a = FighterAction.Special2; f.comboStep = 0; break;
    }
    this.set(f, a, startup + m.active + m.recovery);
    f.move = id;
    f.actionStartup = startup;
    f.activeFrames = m.active;
    f.lunge = m.lungeMm;
  }

  private set(f: FighterState, a: FighterAction, length: number): void {
    f.action = a;
    f.actionTick = 0;
    f.actionLength = length;
    f.actionStartup = 0;
    f.activeFrames = 0;
    f.move = MoveId.None;
    f.lunge = 0;
    f.hitThisAction = false;
    f.hitConnected = false;
  }

  private walk(f: FighterState, a: FighterAction): void {
    if (f.action !== a) this.set(f, a, 0);
  }

  private toNeutral(f: FighterState): void {
    this.set(f, FighterAction.Idle, 0);
    f.comboStep = 0;
    f.holdTicks = 0;
    f.chargeTicks = 0;
  }

  // ── contact ─────────────────────────────────────────────────────────

  private resolveHits(): void {
    const s = this.state;
    const hits = this.hits;
    for (let a = 0; a < 2; a++) {
      const h = hits[a];
      h.has = false;
      h.move = null;
      h.damage = 0;
      h.blocked = false;
      h.guardBroken = false;
    }
    for (let a = 0; a < 2; a++) {
      const f = s.fighter(a);
      const d = s.fighter(1 - a);
      if (!f.inActiveFrames || f.hitThisAction) continue;
      const m = moveOf(this.cls[a], f.move);
      if (m == null) continue;
      if (absDiff(d.x, f.x) > m.reachMm) continue;
      if (d.invulnerable) continue; // a whiff; the active frames keep looking
      f.hitThisAction = true;
      this.judge(f, d, m, hits[a]);
    }

    // Both judged before either applies, so a trade is a trade.
    let stop = 0;
    for (let a = 0; a < 2; a++) {
      const h = hits[a];
      if (!h.has) continue;
      const mv = h.move!;
      const f = s.fighter(a);
      const d = s.fighter(1 - a);
      f.hitConnected = true;
      d.hp = Math.max(0, d.hp - h.damage);
      d.buffered = InputKind.None;
      d.bufferAge = 0;
      d.comboStep = 0;
      const dir = d.x >= f.x ? 1 : -1;

      f.lastHitBlocked = h.blocked && !h.guardBroken;
      if (h.blocked && !h.guardBroken) {
        d.blockedMove = mv.id;
        d.guard = Math.max(0, d.guard - mv.guardDamage);
        this.set(d, FighterAction.BlockStun, mv.guardDamage >= 18 ? 12 : 8);
        // Blocked hits push harder than clean ones relative to their weight.
        this.push(d, dir * Math.max(BLOCK_PUSH_MM, Math.trunc(mv.knockbackMm / 3)));
        f.meter = Math.min(METER_MAX, f.meter + Math.trunc(mv.meterOnHit / 2));
        const hs = Math.max(2, mv.hitStop - 1);
        stop = Math.max(stop, hs);
        this.emit(DuelEventType.Blocked, f.side, d.side, mv.id, h.damage, d.x, hs);
        continue;
      }

      if (h.guardBroken) {
        this.set(d, FighterAction.GuardBreak, GUARD_BREAK_TICKS);
        d.guard = GUARD_MAX / 2;
        this.emit(DuelEventType.GuardBreak, f.side, d.side, mv.id, h.damage, d.x, mv.hitStop);
        if (h.blocked && !mv.breaksBlock) {
          // Drained by lights: the break is the reward, the hit was chip.
          f.meter = Math.min(METER_MAX, f.meter + Math.trunc(mv.meterOnHit / 2));
          stop = Math.max(stop, mv.hitStop);
          continue;
        }
      } else {
        switch (mv.reaction) {
          case HitReaction.Light: this.set(d, FighterAction.HitLight, HIT_LIGHT_TICKS); break;
          case HitReaction.Heavy: this.set(d, FighterAction.HitHeavy, HIT_HEAVY_TICKS); break;
          default:
            this.set(d, FighterAction.Knockdown, KNOCKDOWN_TICKS + GET_UP_TICKS);
            this.emit(DuelEventType.Knockdown, f.side, d.side, mv.id, 0, d.x, 0);
            break;
        }
      }
      this.push(d, dir * mv.knockbackMm);
      f.meter = Math.min(METER_MAX, f.meter + mv.meterOnHit);
      d.meter = Math.min(METER_MAX, d.meter + METER_ON_HIT_TAKEN);
      stop = Math.max(stop, mv.hitStop);
      this.emit(DuelEventType.Hit, f.side, d.side, mv.id, h.damage, d.x, mv.hitStop);
    }
    if (stop > 0) s.hitStop = Math.max(s.hitStop, stop);
  }

  private judge(f: FighterState, d: FighterState, m: MoveData, out: Pending): void {
    const dmg = damage(f.stats.attack, m.damagePermille, d.stats.mitigationPermille);
    out.has = true;
    out.move = m;
    // A charged hold is still a block: the heavy's risk is its release.
    const blocking = d.action === FighterAction.Block || d.action === FighterAction.BlockStun ||
      d.action === FighterAction.HeavyCharge;
    if (!blocking) {
      out.damage = dmg;
      return;
    }
    out.blocked = true;
    if (m.breaksBlock) {
      out.damage = dmg;
      out.guardBroken = true;
      return;
    }
    out.damage = Math.max(1, Math.trunc(dmg / 10));
    out.guardBroken = d.guard - m.guardDamage <= 0;
  }

  // ── space ───────────────────────────────────────────────────────────

  private stepToward(f: FighterState, o: FighterState, mm: number): void {
    const dir = o.x >= f.x ? 1 : -1;
    const gap = (absDiff(o.x, f.x) - MIN_GAP_MM) | 0;
    f.x = (f.x + dir * Math.max(0, Math.min(mm, gap))) | 0;
    this.clamp(f);
  }

  private stepAway(f: FighterState, mm: number): void {
    f.x = (f.x - f.facing * mm) | 0;
    this.clamp(f);
  }

  private push(f: FighterState, mm: number): void {
    f.x = (f.x + mm) | 0;
    this.clamp(f);
  }

  private clamp(f: FighterState): void {
    const w = this.setup.arenaHalfWidthMm;
    if (f.x < -w) f.x = -w;
    if (f.x > w) f.x = w;
  }

  private separate(): void {
    const a = this.state.p1;
    const b = this.state.p2;
    let gap = absDiff(b.x, a.x);
    if (gap >= MIN_GAP_MM) return;
    const need = MIN_GAP_MM - gap;
    const dir = b.x >= a.x ? 1 : -1;
    a.x = (a.x - dir * Math.trunc(need / 2)) | 0;
    b.x = (b.x + dir * (need - Math.trunc(need / 2))) | 0;
    this.clamp(a);
    this.clamp(b);
    // Against a wall the other one gives way.
    gap = absDiff(b.x, a.x);
    if (gap < MIN_GAP_MM) {
      if (Math.abs(a.x) === this.setup.arenaHalfWidthMm) b.x = (a.x + dir * MIN_GAP_MM) | 0;
      else a.x = (b.x - dir * MIN_GAP_MM) | 0;
    }
  }

  private face(): void {
    const a = this.state.p1;
    const b = this.state.p2;
    if (b.x > a.x) {
      a.facing = 1;
      b.facing = -1;
    } else if (b.x < a.x) {
      a.facing = -1;
      b.facing = 1;
    }
  }

  private regenGuard(f: FighterState): void {
    // The guard recovers only once the fighter is out of it.
    if (f.action === FighterAction.Block || f.action === FighterAction.BlockStun ||
      f.action === FighterAction.HeavyCharge || f.action === FighterAction.GuardBreak) return;
    if (f.guard < GUARD_MAX && this.state.tick % 3 === 0) f.guard++;
  }

  // ── the end ─────────────────────────────────────────────────────────

  private checkEnd(): void {
    const s = this.state;
    const ko1 = s.p1.hp <= 0;
    const ko2 = s.p2.hp <= 0;
    if (ko1 || ko2) {
      s.over = true;
      s.endReason = EndReason.KO;
      s.winner = ko1 && ko2 ? 0 : ko2 ? 1 : 2;
      this.emit(DuelEventType.KO, s.winner, s.winner === 1 ? 2 : 1, MoveId.None, 0, ko2 ? s.p2.x : s.p1.x, 0);
    } else if (s.ticksLeft <= 0) {
      s.over = true;
      s.endReason = EndReason.Timeout;
      const a = s.p1.hpPermille;
      const b = s.p2.hpPermille;
      s.winner = a === b ? 0 : a > b ? 1 : 2;
      this.emit(DuelEventType.Timeout, s.winner, 0, MoveId.None, 0, 0, 0);
    }
    if (!s.over) return;
    this.setEnd(s.p1, s.winner === 1);
    this.setEnd(s.p2, s.winner === 2);
  }

  private setEnd(f: FighterState, won: boolean): void {
    this.set(f, won ? FighterAction.Victory : FighterAction.Defeat, 0);
    f.holding = false;
    f.buffered = InputKind.None;
  }

  private emit(type: DuelEventType, source: number, target: number, move: MoveId, dmg: number, x: number, hitStop: number): void {
    this.filling.push({ type, tick: this.state.tick, source, target, move, damage: dmg, hitStop, x });
  }

  // ── hash ────────────────────────────────────────────────────────────

  private hashState(): Fnv1a {
    const h = new Fnv1a();
    const s = this.state;
    h.addInt(s.tick);
    h.addInt(s.ticksLeft);
    h.addInt(s.hitStop);
    h.addBool(s.over);
    h.addInt(s.winner);
    h.addInt(s.endReason);
    DuelSim.hashFighter(h, s.p1);
    DuelSim.hashFighter(h, s.p2);
    for (let i = 0; i < 2; i++) {
      const ai = this.ai[i];
      if (ai == null) {
        h.addInt(0);
        continue;
      }
      ai.hashInto(h);
    }
    return h;
  }

  /** FNV-1a over everything the next tick depends on (a C# ulong). */
  hash(): bigint {
    return this.hashState().value;
  }

  /** hash() as 16 lowercase hex digits: the finish payload's `hash`. */
  hashHex(): string {
    const h = this.hashState();
    return hex16(h.hi, h.lo);
  }

  private static hashFighter(h: Fnv1a, f: FighterState): void {
    h.addInt(f.x);
    h.addInt(f.facing);
    h.addInt(f.action);
    h.addInt(f.actionTick);
    h.addInt(f.actionLength);
    h.addInt(f.actionStartup);
    h.addInt(f.activeFrames);
    h.addInt(f.move);
    h.addInt(f.lunge);
    h.addInt(f.blockedMove);
    h.addBool(f.lastHitBlocked);
    h.addInt(f.hp);
    h.addInt(f.meter);
    h.addInt(f.guard);
    h.addBool(f.holding);
    h.addInt(f.holdTicks);
    h.addInt(f.chargeTicks);
    h.addInt(f.comboStep);
    h.addBool(f.hitThisAction);
    h.addBool(f.hitConnected);
    h.addInt(f.buffered);
    h.addInt(f.bufferAge);
  }
}
