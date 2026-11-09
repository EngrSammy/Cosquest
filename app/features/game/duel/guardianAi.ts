// GuardianAi.cs: another player's hero, played by the machine.
//
// It plays through exactly the inputs a thumb can make, sees the opponent
// ReactionTicks late (a 128-tick history), and rolls a seeded chance of a
// plausible wrong call. Ported statement for statement: the ORDER of the RNG
// calls (including the ones inside short-circuited conditions) is part of
// the hash.

import { Fnv1a, XorShift, absDiff } from "./determinism.ts";
import type { ClassData } from "./frameData.ts";
import type { AiParams } from "./setup.ts";
import { DuelState, FighterState, isAttack, isNeutral, isStunned } from "./state.ts";
import { FighterAction, InputKind, MoveId, SpecialUse } from "./types.ts";

const HISTORY_LEN = 128;
/** Discrete inputs are at least this far apart: 12 a second, a fast human. */
const MIN_INPUT_GAP = 5;
/** DuelSim.BufferTicks. */
const BUFFER_TICKS = 8;

interface Seen {
  action: FighterAction;
  actionTick: number;
  startup: number;
  active: number;
  dist: number;
  connected: boolean;
  valid: boolean;
}

function isFinisher(m: MoveId): boolean {
  return m === MoveId.Light3 || m === MoveId.DashStrike || m === MoveId.Heavy ||
    m === MoveId.Special1 || m === MoveId.Special2;
}

function isLightish(a: FighterAction): boolean {
  return a === FighterAction.Light1 || a === FighterAction.Light2 || a === FighterAction.Light3 ||
    a === FighterAction.DashStrike;
}

export class GuardianAi {
  private readonly p: AiParams;
  private readonly history: Seen[] = [];
  private readonly rng: XorShift;
  private lastDiscrete = -1000;
  // A hold in progress: blocking until a tick, or charging for some ticks.
  private charging = false;
  private holdUntil = 0;
  private chargeWant = 0;
  // Walking intention, so the AI walks for a while instead of flickering.
  private moveDir = 0;
  private moveUntil = 0;
  // A punish planned the moment a finisher landed on this AI's block.
  private punishAt = -1;

  constructor(p: AiParams, seed: bigint, side: number) {
    this.p = p;
    this.rng = new XorShift(seed ^ (side === 0 ? 0xa5a5a5a5n : 0x5a5a5a5a00n));
    // The C# array of structs: preallocated, and overwritten in place.
    for (let i = 0; i < HISTORY_LEN; i++)
      this.history.push({ action: FighterAction.Idle, actionTick: 0, startup: 0, active: 0, dist: 0, connected: false, valid: false });
  }

  decide(s: DuelState, side: number, cls: readonly ClassData[]): InputKind {
    const p = this.p;
    const rng = this.rng;
    const me = s.fighter(side);
    const op = s.fighter(1 - side);
    this.record(s.tick, op, absDiff(op.x, me.x));

    const seenTick = s.tick - p.reactionTicks;
    if (seenTick < 1 || s.hitStop > 0) return InputKind.None;
    // Reading a slot the record above did not just write (ReactionTicks <= 120 < 128).
    const ob = this.history[seenTick % HISTORY_LEN];
    if (!ob.valid) return InputKind.None;

    const mine = cls[side];
    const theirs = cls[1 - side];

    // A hold in progress runs to its plan, unless the plan is a block and a
    // charged heavy is glowing in reach: a block only feeds it.
    if (me.holding && me.action === FighterAction.Block && ob.action === FighterAction.HeavyCharge &&
      ob.dist <= theirs.heavy.reachMm + theirs.heavy.lungeMm + 150 && rng.chance(p.dodgeBias + 450)) {
      this.charging = false;
      this.setWalk(s, -1, Math.trunc((theirs.heavy.reachMm + theirs.heavy.lungeMm + 150 - ob.dist) / mine.walkBackMmPerTick) + 4);
      return this.discrete(s, InputKind.HoldEnd);
    }
    if (me.holding) {
      if (this.charging) {
        if (isStunned(me.action)) {
          this.charging = false;
          return this.discrete(s, InputKind.HoldEnd);
        }
        if (me.action === FighterAction.HeavyCharge && me.chargeTicks >= this.chargeWant) {
          this.charging = false;
          return this.discrete(s, InputKind.HoldEnd);
        }
        return InputKind.None;
      }
      // Charged: throw the heavy when they are in reach and not swinging.
      if (me.action === FighterAction.HeavyCharge && ob.dist <= mine.heavy.reachMm + mine.heavy.lungeMm &&
        !(isAttack(ob.action) && ob.actionTick < ob.startup + ob.active) &&
        rng.chance(120 + Math.trunc(p.aggression / 3)))
        return this.discrete(s, InputKind.HoldEnd);
      // It felt a finisher land on its guard: let go and plan the punish.
      if (me.action === FighterAction.BlockStun && me.actionTick === 0 && isFinisher(me.blockedMove) &&
        rng.chance(300 + Math.trunc(p.blockBias / 2))) {
        this.punishAt = s.tick + Math.max(BUFFER_TICKS / 2, me.actionLength - BUFFER_TICKS + 2);
        return this.discrete(s, InputKind.HoldEnd);
      }
      if (s.tick >= this.holdUntil && !this.threat(ob, theirs) &&
        (me.action !== FighterAction.HeavyCharge || ob.dist > mine.heavy.reachMm + 600))
        return this.discrete(s, InputKind.HoldEnd);
      return InputKind.None;
    }

    if (this.punishAt >= 0 && s.tick >= this.punishAt && s.tick - this.lastDiscrete >= MIN_INPUT_GAP) {
      this.punishAt = -1;
      const d = absDiff(op.x, me.x);
      if (me.meter >= 100 && p.specialUse === SpecialUse.Greedy && d <= cls[side].special1.reachMm &&
        rng.chance(350))
        return this.discrete(s, InputKind.Special1);
      return this.discrete(s, d <= cls[side].light1.reachMm + cls[side].light1.lungeMm
        ? InputKind.Tap : InputKind.SwipeToward);
    }
    if (s.tick - this.lastDiscrete < MIN_INPUT_GAP) return this.walking(s);

    let k = this.choose(s, me, ob, mine, theirs);
    if (k !== InputKind.None && rng.chance(p.mistakePermille)) k = this.mistake();
    if (k === InputKind.None) return this.walking(s);

    if (k === InputKind.HoldStart && !this.charging && this.holdUntil <= s.tick)
      this.holdUntil = s.tick + 10 + rng.next(14);
    return this.discrete(s, k);
  }

  private choose(s: DuelState, me: FighterState, ob: Seen, mine: ClassData, theirs: ClassData): InputKind {
    const p = this.p;
    const rng = this.rng;
    const dist = ob.dist;
    // What a light actually covers: its reach plus the step it takes.
    const reach = mine.light1.reachMm + mine.light1.lungeMm - 20;

    // Keep a chain going while it connects.
    if ((me.action === FighterAction.Light1 || me.action === FighterAction.Light2) &&
      me.hitConnected && me.actionTick >= me.actionStartup + me.activeFrames - 1) {
      const chain = me.lastHitBlocked && me.action === FighterAction.Light2 ? Math.trunc(p.chainChance / 4) : p.chainChance;
      if (rng.chance(chain)) return InputKind.Tap;
      if (me.meter >= 100 && p.specialUse === SpecialUse.Greedy && rng.chance(400)) return InputKind.Special1;
      return InputKind.None;
    }
    if (me.action === FighterAction.DashIn)
      return me.actionTick >= 2 && rng.chance(300 + Math.trunc(p.aggression / 2)) ? InputKind.Tap : InputKind.None;
    if (!isNeutral(me.action)) return InputKind.None;

    const r = rng.next(1000);

    // Threats first: a glowing heavy, a special winding up, a light coming in.
    const heavyReach = theirs.heavy.reachMm + theirs.heavy.lungeMm + 150;
    if (ob.action === FighterAction.HeavyCharge && dist <= heavyReach) {
      if (r < p.dodgeBias + 450) {
        this.setWalk(s, -1, Math.trunc((heavyReach - dist) / mine.walkBackMmPerTick) + 4);
        return InputKind.None;
      }
      if (r < p.dodgeBias + 450 + Math.trunc(p.aggression / 4)) return InputKind.SwipeAway;
      return InputKind.HoldStart; // the wrong read: blocking a heavy
    }
    if (ob.action === FighterAction.HeavyRelease && ob.actionTick < ob.startup && dist <= theirs.heavy.reachMm + 300)
      return r < p.dodgeBias + 300 ? InputKind.SwipeAway : InputKind.HoldStart;
    if ((ob.action === FighterAction.Special1 || ob.action === FighterAction.Special2) &&
      ob.actionTick < ob.startup && dist <= theirs.special2.reachMm + 200)
      return r < p.dodgeBias + 200 ? InputKind.SwipeAway : InputKind.HoldStart;
    if (isLightish(ob.action) && ob.actionTick < ob.startup + ob.active && dist <= theirs.light1.reachMm + 150) {
      if (r < p.blockBias) return InputKind.HoldStart;
      if (r < p.blockBias + Math.trunc(p.dodgeBias / 3)) return InputKind.SwipeAway;
      return dist <= reach ? InputKind.Tap : InputKind.None;
    }

    // Punish what it saw: a stun, a guard break, a whiffed attack's recovery.
    const recovering = isAttack(ob.action) && ob.actionTick >= ob.startup + ob.active;
    const finisher = ob.action !== FighterAction.Light1 && ob.action !== FighterAction.Light2;
    const opening = (isStunned(ob.action) && ob.action !== FighterAction.BlockStun) ||
      (recovering && (!ob.connected || finisher));
    if (opening) {
      if (dist <= reach) {
        if (me.meter >= 300 && r < 500) return InputKind.Special2;
        if (me.meter >= 100 && p.specialUse === SpecialUse.Greedy && r < 250) return InputKind.Special1;
        return InputKind.Tap;
      }
      if (dist <= mine.dashMm + mine.dashStrike.reachMm && r < 400 + Math.trunc(p.aggression / 2))
        return InputKind.SwipeToward;
    }

    // A guard it can see is answered with the one thing that breaks it.
    if ((ob.action === FighterAction.Block || ob.action === FighterAction.HeavyCharge) &&
      dist <= mine.heavy.reachMm + mine.heavy.lungeMm && rng.chance(250 + Math.trunc(p.aggression / 2))) {
      this.charging = true;
      this.chargeWant = 1 + rng.next(6);
      return InputKind.HoldStart;
    }

    // Specials in neutral, by temperament.
    if (me.meter >= 300 && dist <= mine.special2.reachMm && r < 120) return InputKind.Special2;
    if (p.specialUse === SpecialUse.Greedy && me.meter >= 100 && dist <= mine.special1.reachMm && r < 90)
      return InputKind.Special1;

    // Guard before anything is thrown: defenders read the range.
    const lightThreat = theirs.light1.reachMm + theirs.light1.lungeMm + 150;
    const dashThreat = theirs.dashMm + theirs.dashStrike.reachMm;
    if ((dist <= lightThreat || (dist <= dashThreat && isNeutral(ob.action))) &&
      rng.chance(Math.trunc((p.blockBias * (1000 - p.aggression)) / 2600))) {
      this.holdUntil = s.tick + 20 + rng.next(40);
      return InputKind.HoldStart;
    }

    // Spacing.
    if (dist > reach) {
      if (r < Math.trunc(p.aggression / 5) && dist < mine.dashMm + mine.dashStrike.reachMm) return InputKind.SwipeToward;
      if (r < p.aggression) this.setWalk(s, 1, 8 + rng.next(16));
      else if (r > 1000 - Math.trunc((1000 - p.aggression) / 4) && dist < 3000) this.setWalk(s, -1, 6 + rng.next(10));
      return InputKind.None;
    }

    // In range, nothing to answer: pick a plan.
    const tap = Math.trunc((p.aggression * 55) / 100);
    const heavy = tap + Math.trunc(p.aggression / 6);
    const guard = heavy + Math.trunc((p.blockBias * (1000 - p.aggression)) / 5000);
    const back = guard + 60;
    if (r < tap) return InputKind.Tap;
    if (r < heavy) {
      this.charging = true;
      this.chargeWant = 2 + rng.next(10);
      return InputKind.HoldStart;
    }
    if (r < guard) return InputKind.HoldStart;
    if (r < back) return InputKind.SwipeAway;
    return InputKind.None;
  }

  private threat(ob: Seen, theirs: ClassData): boolean {
    return isAttack(ob.action) && ob.actionTick < ob.startup + ob.active && ob.dist <= theirs.special2.reachMm;
  }

  private mistake(): InputKind {
    switch (this.rng.next(4)) {
      case 0: return InputKind.Tap;
      case 1: return InputKind.SwipeAway;
      case 2: return InputKind.HoldStart;
      default: return InputKind.None;
    }
  }

  private discrete(s: DuelState, k: InputKind): InputKind {
    this.lastDiscrete = s.tick;
    return k;
  }

  private setWalk(s: DuelState, dir: number, ticks: number): void {
    this.moveDir = dir;
    this.moveUntil = s.tick + ticks;
  }

  private walking(s: DuelState): InputKind {
    if (this.moveDir === 0 || s.tick >= this.moveUntil) {
      this.moveDir = 0;
      return InputKind.None;
    }
    return this.moveDir > 0 ? InputKind.MoveToward : InputKind.MoveAway;
  }

  private record(tick: number, op: FighterState, dist: number): void {
    const e = this.history[tick % HISTORY_LEN];
    e.action = op.action;
    e.actionTick = op.actionTick;
    e.startup = op.actionStartup;
    e.active = op.activeFrames;
    e.dist = dist;
    e.connected = op.hitConnected;
    e.valid = true;
  }

  hashInto(h: Fnv1a): void {
    h.addU64(this.rng.hi, this.rng.lo);
    h.addInt(this.lastDiscrete);
    h.addBool(this.charging);
    h.addInt(this.holdUntil);
    h.addInt(this.chargeWant);
    h.addInt(this.moveDir);
    h.addInt(this.moveUntil);
    h.addInt(this.punishAt);
  }
}
