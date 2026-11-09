// The Guardian Duel's enums, ported from CosQuest.Duel (Types.cs, FrameData.cs,
// Events.cs). The numbers are the C# enum values: they are hashed, and the
// InputKind values are the wire codes the server receives, so they must never
// change independently of the C# engine.
//
// Plain `as const` objects instead of TS enums: Node's type stripping (the
// test runner) does not support enums, and these also inline cheaply in Hermes.

/** The weapon a hero fights with. Blade and Fists are complete; the rest are stubs. */
export const WeaponClass = { Blade: 0, Fists: 1, Polearm: 2, Blaster: 3, Arcane: 4 } as const;
export type WeaponClass = (typeof WeaponClass)[keyof typeof WeaponClass];

/** What a fighter is doing this tick: one Animator state (or sprite set) each. */
export const FighterAction = {
  Idle: 0,
  WalkFwd: 1,
  WalkBack: 2,
  Light1: 3,
  Light2: 4,
  Light3: 5,
  DashIn: 6,
  DashStrike: 7,
  HeavyCharge: 8,
  HeavyRelease: 9,
  Block: 10,
  BlockStun: 11,
  GuardBreak: 12,
  HitLight: 13,
  HitHeavy: 14,
  Knockdown: 15,
  GetUp: 16,
  DodgeBack: 17,
  Special1: 18,
  Special2: 19,
  Victory: 20,
  Defeat: 21,
} as const;
export type FighterAction = (typeof FighterAction)[keyof typeof FighterAction];

/**
 * One gesture for one tick. These numbers ARE the wire codes of the finish
 * payload's `inputs` ([tick, code] / [tick, code, ticks]).
 * MoveToward/MoveAway are continuous (sent every tick the thumb is dragged to
 * one side); everything else is a one-tick event.
 */
export const InputKind = {
  None: 0,
  Tap: 1,
  SwipeToward: 2,
  SwipeAway: 3,
  HoldStart: 4,
  HoldEnd: 5,
  Special1: 6,
  Special2: 7,
  MoveToward: 8,
  MoveAway: 9,
} as const;
export type InputKind = (typeof InputKind)[keyof typeof InputKind];

/** The highest valid input code (MoveAway). */
export const MAX_INPUT_CODE = 9;

/**
 * An input for one tick. `holdTicks` is advisory (how long a HoldEnd's hold
 * lasted): the sim counts the hold itself, it is neither hashed nor logged.
 */
export interface InputFrame {
  readonly kind: InputKind;
  readonly holdTicks?: number;
}

export const Stance = { Aggressive: 0, Counter: 1, Turtle: 2 } as const;
export type Stance = (typeof Stance)[keyof typeof Stance];

/** Flavour on top of the stance: how each house fights. */
export const Faction = { None: 0, Anime: 1, Marvel: 2, DC: 3, Movies: 4, Gaming: 5 } as const;
export type Faction = (typeof Faction)[keyof typeof Faction];

export const SpecialUse = { Greedy: 0, SaveForTwo: 1 } as const;
export type SpecialUse = (typeof SpecialUse)[keyof typeof SpecialUse];

export const Difficulty = { Easy: 0, Normal: 1, Hard: 2 } as const;
export type Difficulty = (typeof Difficulty)[keyof typeof Difficulty];

export const EndReason = { None: 0, KO: 1, Timeout: 2 } as const;
export type EndReason = (typeof EndReason)[keyof typeof EndReason];

export const MoveId = {
  None: 0,
  Light1: 1,
  Light2: 2,
  Light3: 3,
  DashStrike: 4,
  Heavy: 5,
  Special1: 6,
  Special2: 7,
} as const;
export type MoveId = (typeof MoveId)[keyof typeof MoveId];

/** What a clean hit does to the one it lands on. */
export const HitReaction = { Light: 0, Heavy: 1, Knockdown: 2 } as const;
export type HitReaction = (typeof HitReaction)[keyof typeof HitReaction];

export const DuelEventType = {
  /** A clean hit. damage, hitStop and move are set. */
  Hit: 0,
  /** A blocked hit; damage is the chip. */
  Blocked: 1,
  GuardBreak: 2,
  Knockdown: 3,
  /** A heavy's charge or a special's startup began: start the glow. */
  Telegraph: 4,
  SpecialStart: 5,
  DodgeStart: 6,
  DashStart: 7,
  KO: 8,
  Timeout: 9,
} as const;
export type DuelEventType = (typeof DuelEventType)[keyof typeof DuelEventType];

/** Names by value, for logs and debugging (index = the numeric value). */
function namesOf<T extends Record<string, number>>(o: T): readonly string[] {
  const out: string[] = [];
  for (const k of Object.keys(o)) out[o[k]] = k;
  return out;
}
export const FighterActionName = namesOf(FighterAction);
export const InputKindName = namesOf(InputKind);
export const MoveIdName = namesOf(MoveId);
export const DuelEventTypeName = namesOf(DuelEventType);
export const WeaponClassName = namesOf(WeaponClass);
