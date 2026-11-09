// FrameData.cs: every weapon class's moves. Ticks at 60 Hz, distances in mm,
// damage in thousandths of the attacker's Attack stat. Plain data, built
// exactly as the C# builds it (Fists and the stubs are derived from Blade).

import { HitReaction, MoveId, WeaponClass } from "./types.ts";

export interface MoveData {
  readonly id: MoveId;
  readonly startup: number;
  readonly active: number;
  readonly recovery: number;
  readonly reachMm: number;
  readonly damagePermille: number;
  readonly hitStop: number;
  readonly meterOnHit: number;
  readonly knockbackMm: number;
  /** How far the attacker steps in over the startup. */
  readonly lungeMm: number;
  /** Guard drained when this is blocked. */
  readonly guardDamage: number;
  readonly breaksBlock: boolean;
  readonly reaction: HitReaction;
}

type MutableMove = { -readonly [K in keyof MoveData]: MoveData[K] };

export function moveLength(m: MoveData): number {
  return m.startup + m.active + m.recovery;
}

export interface ClassData {
  readonly class: WeaponClass;
  readonly light1: MoveData;
  readonly light2: MoveData;
  readonly light3: MoveData;
  readonly dashStrike: MoveData;
  readonly heavy: MoveData;
  readonly special1: MoveData;
  readonly special2: MoveData;
  readonly walkFwdMmPerTick: number;
  readonly walkBackMmPerTick: number;
  readonly dashMm: number;
  readonly dashMoveTicks: number;
  readonly dashTicks: number;
  readonly dodgeMm: number;
  readonly dodgeInvulnTicks: number;
  readonly dodgeTicks: number;
  /** Moves indexed by MoveId (index 0, None, is null). */
  readonly moves: readonly (MoveData | null)[];
}

type MutableClass = { -readonly [K in keyof ClassData]: ClassData[K] };

/** ClassData.Move(id): null for MoveId.None. */
export function moveOf(cd: ClassData, id: MoveId): MoveData | null {
  return cd.moves[id] ?? null;
}

function mv(p: Partial<MoveData> & { id: MoveId }): MutableMove {
  return {
    startup: 0,
    active: 0,
    recovery: 0,
    reachMm: 0,
    damagePermille: 0,
    hitStop: 0,
    meterOnHit: 0,
    knockbackMm: 0,
    lungeMm: 0,
    guardDamage: 0,
    breaksBlock: false,
    reaction: HitReaction.Light,
    ...p,
  };
}

function withChange(m: MoveData, change: (x: MutableMove) => void): MutableMove {
  const c: MutableMove = { ...m };
  change(c);
  return c;
}

/** C# Pct: Math.Max(1, v * pct / 100), integer division. */
function pct(v: number, p: number): number {
  return Math.max(1, Math.trunc((v * p) / 100));
}

function blade(): MutableClass {
  const c: MutableClass = {
    class: WeaponClass.Blade,
    light1: mv({ id: MoveId.Light1, startup: 5, active: 3, recovery: 10, reachMm: 900, lungeMm: 60, damagePermille: 40, hitStop: 3, meterOnHit: 8, knockbackMm: 60, guardDamage: 14, reaction: HitReaction.Light }),
    light2: mv({ id: MoveId.Light2, startup: 6, active: 3, recovery: 11, reachMm: 900, lungeMm: 100, damagePermille: 40, hitStop: 3, meterOnHit: 8, knockbackMm: 60, guardDamage: 14, reaction: HitReaction.Light }),
    light3: mv({ id: MoveId.Light3, startup: 8, active: 3, recovery: 18, reachMm: 900, lungeMm: 120, damagePermille: 70, hitStop: 5, meterOnHit: 10, knockbackMm: 600, guardDamage: 18, reaction: HitReaction.Heavy }),
    dashStrike: mv({ id: MoveId.DashStrike, startup: 7, active: 4, recovery: 20, reachMm: 1100, damagePermille: 60, hitStop: 5, meterOnHit: 10, knockbackMm: 300, guardDamage: 18, reaction: HitReaction.Heavy }),
    heavy: mv({ id: MoveId.Heavy, startup: 10, active: 4, recovery: 24, reachMm: 1000, lungeMm: 150, damagePermille: 120, hitStop: 7, meterOnHit: 14, knockbackMm: 900, guardDamage: 0, breaksBlock: true, reaction: HitReaction.Knockdown }),
    special1: mv({ id: MoveId.Special1, startup: 24, active: 8, recovery: 30, reachMm: 1400, lungeMm: 200, damagePermille: 180, hitStop: 10, meterOnHit: 0, knockbackMm: 700, guardDamage: 30, reaction: HitReaction.Heavy }),
    special2: mv({ id: MoveId.Special2, startup: 30, active: 12, recovery: 40, reachMm: 1600, lungeMm: 300, damagePermille: 320, hitStop: 12, meterOnHit: 0, knockbackMm: 1100, guardDamage: 45, reaction: HitReaction.Knockdown }),
    walkFwdMmPerTick: 37,
    walkBackMmPerTick: 30,
    dashMm: 1600,
    dashMoveTicks: 10,
    dashTicks: 14,
    dodgeMm: 1400,
    dodgeInvulnTicks: 15,
    dodgeTicks: 27,
    moves: [],
  };
  return c;
}

function fists(): MutableClass {
  const b = blade();
  b.class = WeaponClass.Fists;
  b.light1 = withChange(b.light1, (m) => { m.startup -= 1; m.recovery -= 2; m.reachMm = 865; m.damagePermille = pct(m.damagePermille, 85); });
  b.light2 = withChange(b.light2, (m) => { m.startup -= 1; m.recovery -= 2; m.reachMm = 865; m.damagePermille = pct(m.damagePermille, 85); });
  b.light3 = withChange(b.light3, (m) => { m.startup -= 1; m.recovery -= 3; m.reachMm = 865; m.knockbackMm = 300; m.damagePermille = pct(m.damagePermille, 85); });
  b.dashStrike = withChange(b.dashStrike, (m) => { m.startup -= 2; m.reachMm = 1050; });
  b.heavy = withChange(b.heavy, (m) => { m.startup -= 1; m.reachMm = 900; m.damagePermille = pct(m.damagePermille, 90); });
  b.special1 = withChange(b.special1, (m) => { m.reachMm = 1100; m.damagePermille = pct(m.damagePermille, 85); });
  b.special2 = withChange(b.special2, (m) => { m.reachMm = 1300; m.damagePermille = pct(m.damagePermille, 85); });
  b.walkFwdMmPerTick = 42;
  b.dashMm = 1800;
  return b;
}

/** The stubs: Blade's shape with the class's reach, startup and damage. */
function scaled(c: WeaponClass, reachMm: number, startupDelta: number, damagePct: number): MutableClass {
  const b = blade();
  b.class = c;
  const s = (m: MoveData) =>
    withChange(m, (x) => {
      x.startup += startupDelta;
      x.damagePermille = pct(x.damagePermille, damagePct);
      if (x.id === MoveId.Light1 || x.id === MoveId.Light2 || x.id === MoveId.Light3) x.reachMm = reachMm;
      else x.reachMm = Math.max(x.reachMm, reachMm + 200);
    });
  b.light1 = s(b.light1);
  b.light2 = s(b.light2);
  b.light3 = s(b.light3);
  b.dashStrike = s(b.dashStrike);
  b.heavy = s(b.heavy);
  b.special1 = s(b.special1);
  b.special2 = s(b.special2);
  return b;
}

function freeze(c: MutableClass): ClassData {
  c.moves = [null, c.light1, c.light2, c.light3, c.dashStrike, c.heavy, c.special1, c.special2];
  for (const m of c.moves) if (m) Object.freeze(m);
  Object.freeze(c.moves);
  return Object.freeze(c);
}

const TABLE: readonly ClassData[] = [
  freeze(blade()),
  freeze(fists()),
  freeze(scaled(WeaponClass.Polearm, 1300, 2, 110)),
  freeze(scaled(WeaponClass.Blaster, 1500, 1, 80)),
  freeze(scaled(WeaponClass.Arcane, 1100, 2, 95)),
];

/** ClassData.For(c). */
export function classDataFor(c: WeaponClass): ClassData {
  const d = TABLE[c];
  if (!d) throw new RangeError(`unknown weapon class ${c}`);
  return d;
}
