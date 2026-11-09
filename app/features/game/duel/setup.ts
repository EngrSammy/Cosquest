// Setup.cs (FighterStats, AiParams, FighterSetup, DuelSetup) and the Unity
// bridge's mapping of the server's setup JSON onto it (costquest-unity
// Assets/Scripts/Duel/DuelWire.cs, ToSim/Present). The server replay verifier
// must make exactly the same conversion, so it is ported line for line:
// floats in 0..1 become thousandths rounding half away from zero, and basis
// points of defence become thousandths by integer division.

import { toU64 } from "./determinism.ts";
import { DuelFormatError, DuelSetupError } from "./errors.ts";
import { parseJsonExact } from "./json.ts";
import { Difficulty, Faction, SpecialUse, Stance, WeaponClass } from "./types.ts";

export const TICKS_PER_SECOND = 60;
export const MIN_GAP_MM = 400;

/** A hero's numbers, computed by the server. The client never decides them. */
export class FighterStats {
  maxHp: number;
  attack: number;
  /** Damage taken is reduced by this many thousandths (0 to 400). */
  mitigationPermille: number;

  constructor(maxHp = 1000, attack = 1000, mitigationPermille = 100) {
    this.maxHp = maxHp;
    this.attack = attack;
    this.mitigationPermille = mitigationPermille;
  }
}

/** How a Guardian plays, in thousandths. Build one with AiParams.create. */
export class AiParams {
  /** The AI sees the world this many ticks late. */
  reactionTicks = 16;
  aggression = 500;
  blockBias = 400;
  dodgeBias = 300;
  /** Chance of continuing a light chain that connected. */
  chainChance = 750;
  /** Chance a decision is replaced by a plausible wrong one. */
  mistakePermille = 110;
  specialUse: SpecialUse = SpecialUse.Greedy;
  stance: Stance = Stance.Counter;
  faction: Faction = Faction.None;

  static create(stance: Stance, faction: Faction = Faction.None, difficulty: Difficulty = Difficulty.Normal): AiParams {
    const p = new AiParams();
    p.stance = stance;
    p.faction = faction;
    switch (stance) {
      case Stance.Aggressive: p.aggression = 640; p.blockBias = 340; p.dodgeBias = 240; break;
      case Stance.Counter: p.aggression = 450; p.blockBias = 450; p.dodgeBias = 450; break;
      case Stance.Turtle: p.aggression = 400; p.blockBias = 540; p.dodgeBias = 280; break;
    }
    switch (faction) {
      case Faction.Anime: p.aggression += 100; p.chainChance = 950; break;
      case Faction.Marvel: p.dodgeBias += 100; p.blockBias += 50; break;
      case Faction.DC: p.aggression -= 100; p.blockBias += 100; break;
      case Faction.Movies: p.specialUse = SpecialUse.Greedy; p.aggression += 50; break;
      case Faction.Gaming: p.dodgeBias += 150; break;
    }
    switch (difficulty) {
      case Difficulty.Easy: p.reactionTicks = 24; p.mistakePermille = 220; break;
      case Difficulty.Normal: p.reactionTicks = 16; p.mistakePermille = 110; break;
      case Difficulty.Hard: p.reactionTicks = 10; p.mistakePermille = 45; break;
    }
    p.clamp();
    return p;
  }

  /** Internal in C#; DuelSim's validation calls it on each AI, in place. */
  clamp(): void {
    this.aggression = Math.max(0, Math.min(1000, this.aggression));
    this.blockBias = Math.max(0, Math.min(1000, this.blockBias));
    this.dodgeBias = Math.max(0, Math.min(1000, this.dodgeBias));
    this.chainChance = Math.max(0, Math.min(1000, this.chainChance));
    this.mistakePermille = Math.max(0, Math.min(1000, this.mistakePermille));
    this.reactionTicks = Math.max(1, Math.min(120, this.reactionTicks));
  }
}

export class FighterSetup {
  name = "";
  class: WeaponClass = WeaponClass.Blade;
  stats: FighterStats = new FighterStats();
  /** null: a human drives this side through step()'s input. */
  ai: AiParams | null = null;
}

export class DuelSetup {
  /** A C# ulong. */
  seed: bigint = 1n;
  p1: FighterSetup = new FighterSetup();
  p2: FighterSetup = new FighterSetup();
  /** 60 s at 60 Hz. */
  roundTicks = 60 * TICKS_PER_SECOND;
  arenaHalfWidthMm = 5000;
  startGapMm = 2400;
}

function isInt32(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= -2147483648 && v <= 2147483647;
}

/**
 * DuelSetup.Validate, same checks and messages, plus one the C# type system
 * gives for free: every number must be a 32-bit integer (a fractional or huge
 * number here would silently break determinism). Clamps each AI in place.
 */
export function validateSetup(s: DuelSetup): void {
  if (s.p1 == null || s.p2 == null) throw new DuelSetupError("both fighters are required");
  const ints: [string, unknown][] = [["RoundTicks", s.roundTicks], ["ArenaHalfWidthMm", s.arenaHalfWidthMm], ["StartGapMm", s.startGapMm]];
  for (const f of [s.p1, s.p2]) {
    if (f.stats == null) throw new DuelSetupError("fighter stats are required");
    ints.push(["MaxHp", f.stats.maxHp], ["Attack", f.stats.attack], ["MitigationPermille", f.stats.mitigationPermille], ["Class", f.class]);
    if (f.ai) {
      const a = f.ai;
      ints.push(["ReactionTicks", a.reactionTicks], ["Aggression", a.aggression], ["BlockBias", a.blockBias], ["DodgeBias", a.dodgeBias],
        ["ChainChance", a.chainChance], ["MistakePermille", a.mistakePermille], ["SpecialUse", a.specialUse], ["Stance", a.stance], ["Faction", a.faction]);
    }
  }
  for (const [name, v] of ints) if (!isInt32(v)) throw new DuelSetupError(`${name} must be a 32-bit integer`);
  if (typeof s.seed !== "bigint") throw new DuelSetupError("Seed must be a bigint");
  if (s.p1.class < 0 || s.p1.class > 4 || s.p2.class < 0 || s.p2.class > 4) throw new DuelSetupError("unknown weapon class");
  for (const f of [s.p1, s.p2]) {
    if (f.stats.maxHp <= 0) throw new DuelSetupError("MaxHp must be positive");
    if (f.stats.attack < 0) throw new DuelSetupError("Attack must not be negative");
    if (f.stats.mitigationPermille < 0 || f.stats.mitigationPermille > 400)
      throw new DuelSetupError("MitigationPermille must be 0 to 400");
    f.ai?.clamp();
  }
  if (s.roundTicks <= 0) throw new DuelSetupError("RoundTicks must be positive");
  // C# `2 * ArenaHalfWidthMm` is an unchecked int multiply: it wraps.
  if (s.startGapMm < MIN_GAP_MM || s.startGapMm > ((2 * s.arenaHalfWidthMm) | 0))
    throw new DuelSetupError("StartGapMm out of range");
}

// ── the server's setup JSON (the Unity bridge's DuelWire) ─────────────────

/** What the view needs beyond the sim: names, colours and levels (DuelWire.Present). */
export interface DuelPresentation {
  p1Name: string;
  p2Name: string;
  p1Faction: string;
  p2Faction: string;
  p1Level: number;
  p2Level: number;
}

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A member, as Newtonsoft finds it: the exact name first, then ignoring case. */
function member(o: Obj, name: string): unknown {
  if (Object.prototype.hasOwnProperty.call(o, name) && o[name] !== undefined) return o[name];
  for (const k of Object.keys(o)) if (k.toLowerCase() === name && o[k] !== undefined) return o[k];
  return undefined;
}

function intField(o: Obj, name: string, nullable: true): number | null;
function intField(o: Obj, name: string, nullable?: false): number;
function intField(o: Obj, name: string, nullable = false): number | null {
  const v = member(o, name);
  if (v === undefined) return nullable ? null : 0;
  if (v === null) {
    if (nullable) return null;
    throw new DuelFormatError(`${name} must be an integer, not null`);
  }
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "bigint") n = Number(v);
  else if (typeof v === "string" && /^\s*-?\d+\s*$/.test(v)) n = Number(v);
  else throw new DuelFormatError(`${name} must be an integer`);
  if (!isInt32(n)) throw new DuelFormatError(`${name} must be a 32-bit integer`);
  return n;
}

function doubleField(o: Obj, name: string): number | null {
  const v = member(o, name);
  if (v === undefined || v === null) return null;
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "bigint") n = Number(v);
  else if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) n = Number(v);
  else throw new DuelFormatError(`${name} must be a number`);
  return n;
}

function stringField(o: Obj, name: string): string | null {
  const v = member(o, name);
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "True" : "False";
  throw new DuelFormatError(`${name} must be a string`);
}

function objField(o: Obj, name: string): Obj | null {
  const v = member(o, name);
  if (v === undefined || v === null) return null;
  if (!isObj(v)) throw new DuelFormatError(`${name} must be an object`);
  return v;
}

const U64_MAX = (1n << 64n) - 1n;

function seedFrom(v: unknown, what: string): bigint {
  let b: bigint;
  if (typeof v === "bigint") b = v;
  else if (typeof v === "string" && /^\s*\d+\s*$/.test(v)) b = BigInt(v.trim());
  else if (typeof v === "number") {
    if (!Number.isSafeInteger(v) || v < 0)
      throw new DuelFormatError(
        `${what} ${v} is not exact: a 62-bit seed does not survive JSON.parse. ` +
          "Pass the seed's digits (seed_text) or the raw JSON text instead.",
      );
    b = BigInt(v);
  } else throw new DuelFormatError(`${what} must be an unsigned integer`);
  if (b < 0n || b > U64_MAX) throw new DuelFormatError(`${what} is out of range for a ulong`);
  return b;
}

/** DuelWire.Permille: clamp to 0..1, times 1000, round half away from zero. */
export function permille(v: number): number {
  const x = Math.max(0.0, Math.min(1.0, v)) * 1000.0;
  if (Number.isNaN(x)) throw new DuelFormatError("NaN is not a permille");
  const t = Math.trunc(x);
  return x - t >= 0.5 ? t + 1 : t;
}

export function classOf(s: string | null): WeaponClass {
  switch ((s ?? "").toLowerCase()) {
    case "fists": return WeaponClass.Fists;
    case "polearm": return WeaponClass.Polearm;
    case "blaster": return WeaponClass.Blaster;
    case "arcane": return WeaponClass.Arcane;
    default: return WeaponClass.Blade;
  }
}

export function stanceOf(s: string | null): Stance {
  switch ((s ?? "").toLowerCase()) {
    case "aggressive": return Stance.Aggressive;
    case "turtle": return Stance.Turtle;
    default: return Stance.Counter;
  }
}

export function factionOf(s: string | null): Faction {
  switch ((s ?? "").toLowerCase()) {
    case "anime": return Faction.Anime;
    case "marvel": return Faction.Marvel;
    case "dc": return Faction.DC;
    case "movies": return Faction.Movies;
    case "gaming": return Faction.Gaming;
    default: return Faction.None;
  }
}

function fighterFromServer(f: Obj): FighterSetup {
  const fs = new FighterSetup();
  fs.name = stringField(f, "name") ?? "";
  fs.class = classOf(stringField(f, "weapon_class"));
  const defence = intField(f, "defence_bp");
  fs.stats = new FighterStats(
    Math.max(1, intField(f, "max_hp")),
    Math.max(0, intField(f, "attack")),
    Math.max(0, Math.min(400, Math.trunc(defence / 10))),
  );
  const ai = objField(f, "ai");
  const stance = ai ? stringField(ai, "stance") : null;
  if (ai && stance) {
    const p = AiParams.create(stanceOf(stance), factionOf(stringField(ai, "personality") ?? stringField(f, "faction")));
    const reaction = intField(ai, "reaction_ticks", true);
    if (reaction !== null) p.reactionTicks = reaction;
    const aggression = doubleField(ai, "aggression");
    if (aggression !== null) p.aggression = permille(aggression);
    const block = doubleField(ai, "block_bias");
    if (block !== null) p.blockBias = permille(block);
    const dodge = doubleField(ai, "dodge_bias");
    if (dodge !== null) p.dodgeBias = permille(dodge);
    const special = stringField(ai, "special_use");
    if (special) p.specialUse = special === "save" ? SpecialUse.SaveForTwo : SpecialUse.Greedy;
    fs.ai = p;
  }
  return fs;
}

function setupObject(setup: unknown): Obj {
  const w = typeof setup === "string" ? parseJsonExact(setup) : setup;
  if (!isObj(w)) throw new DuelFormatError("duel setup needs p1 and p2");
  const p1 = objField(w, "p1");
  const p2 = objField(w, "p2");
  if (!p1 || !p2) throw new DuelFormatError("duel setup needs p1 and p2");
  return w;
}

/**
 * The server's duel setup (the `setup` object of POST /v1/duel/start, as
 * roam_duel.py writes it) mapped onto a DuelSetup exactly as the Unity bridge
 * does (DuelWire.ToSim).
 *
 * The seed is a 62-bit integer, which JSON.parse rounds. Give it exactly:
 * - `seedText`: the seed's decimal digits (features/game/client.ts
 *   parseDuelStart's `seed_text`) or a bigint. It wins over `setup.seed`.
 * - or pass `setup` as the raw JSON text: it is parsed here keeping big
 *   integers exact.
 * A lossy number in `setup.seed` with no `seedText` is refused, never guessed.
 */
export function setupFromServer(setup: unknown, seedText?: string | bigint): DuelSetup {
  const w = setupObject(setup);
  const tickHz = intField(w, "tick_hz");
  if (tickHz !== 0 && tickHz !== TICKS_PER_SECOND)
    throw new DuelFormatError(`tick_hz ${tickHz} is not the engine's ${TICKS_PER_SECOND}`);
  const rawSeed = seedText !== undefined ? seedText : member(w, "seed");
  const seed = rawSeed === undefined || rawSeed === null ? 0n : seedFrom(rawSeed, seedText !== undefined ? "seedText" : "setup.seed");
  const s = new DuelSetup();
  s.seed = seed === 0n ? 1n : toU64(seed);
  s.p1 = fighterFromServer(objField(w, "p1")!);
  s.p2 = fighterFromServer(objField(w, "p2")!);
  const round = intField(w, "round_ticks");
  if (round > 0) s.roundTicks = round;
  return s;
}

/** DuelWire.Present: names (with the view's defaults), factions and levels. */
export function presentationFromServer(setup: unknown): DuelPresentation {
  const w = setupObject(setup);
  const p1 = objField(w, "p1")!;
  const p2 = objField(w, "p2")!;
  return {
    p1Name: stringField(p1, "name") || "You",
    p2Name: stringField(p2, "name") || "Guardian",
    p1Faction: stringField(p1, "faction") ?? "",
    p2Faction: stringField(p2, "faction") ?? "",
    p1Level: intField(p1, "level"),
    p2Level: intField(p2, "level"),
  };
}
