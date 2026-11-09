// Sieges, holds and wandering spawns: the pure half of three costquest-ios
// features, against costquest-backend app/roam_siege.py and the points'
// `extra` facts.
//
//   - Siege (Features/SiegeFeature.swift): a point a rival faction holds is
//     taken by beating its Guardian over up to 7 rounds of 15 s questions. The
//     server marks every answer, deals the damage and the Guardian's strikes,
//     keeps the focus and flips the hold. With the server's siege_mode "duel"
//     a siege is a Guardian Duel instead (mode "siege" of /v1/duel/start).
//   - Holds (Features/HoldsFeature.swift): who holds a point and how strongly,
//     from extra.holder / holder_name / hold_strength.
//   - Spawns (Features/SpawnsFeature.swift): wandering challenges (source
//     "wander"), their expiry line and the radar strip above the Nearby tray.
//
// Pure: no React Native. The client and the clock are passed in (tested in
// features/game/__tests__/siege.test.ts).
import { type GameClient, GameError } from "./client.ts";
import type { QuestPoint, Relic, RoamExtra, RoamMe } from "./wire.ts";
import { parseServerDate } from "./wire.ts";

const intOf = (s: string | null | undefined): number | null => (typeof s === "string" && /^[-+]?\d+$/.test(s) ? Number(s) : null);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const optNum = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const optStr = (v: unknown): string | null => (typeof v === "string" ? v : null);
const optBool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

// =====================================================================
// Holds (HoldLook, HoldLine)
// =====================================================================

/** The holding faction's id, if the point is held right now. */
export function holderOf(p: QuestPoint): string | null {
  const h = p.extra?.holder;
  return h ? h : null;
}

/** 0...100. A missing or garbled number reads as full rather than hiding a flag the server says is there. */
export function holdStrength(p: QuestPoint): number {
  const n = intOf(p.extra?.hold_strength);
  return n === null ? 100 : Math.min(100, Math.max(0, n));
}

export type Hold = {
  state: "mine" | "rival" | "unheld";
  /** The holding faction's id (null when unheld). */
  holderFaction: string | null;
  /** The server's holder_name, else the faction's name from `factionName`, else the id. */
  holderName: string | null;
  /** 0...100; 0 when unheld. */
  strength: number;
};

/** Who holds this point, from where the player stands (HoldsFeature.swift 39-99). */
export function holdOf(p: QuestPoint, myFaction: string | null | undefined, factionName?: (id: string) => string): Hold {
  const holder = holderOf(p);
  if (!holder) return { state: "unheld", holderFaction: null, holderName: null, strength: 0 };
  return {
    state: myFaction && holder === myFaction ? "mine" : "rival",
    holderFaction: holder,
    holderName: p.extra?.holder_name ?? (factionName ? factionName(holder) : holder),
    strength: holdStrength(p),
  };
}

export type HoldLineCopy = {
  kind: "held" | "unclaimed";
  /** The faction whose colour the line is drawn in (the holder's, or the player's for unclaimed). */
  faction: string;
  text: string;
  accessibilityLabel: string;
  /** 0...100 for a held point; null for unclaimed (no bar). */
  strength: number | null;
};

/**
 * The point card's hold line, word for word as HoldLine draws it, or null
 * when it draws nothing: an unheld starter (one new player's alone, never
 * held), or an unheld point before the player has a faction.
 */
export function holdLine(
  p: QuestPoint,
  me: { faction?: string | null } | null | undefined,
  factionName: (id: string) => string,
): HoldLineCopy | null {
  const mine = me?.faction ?? null;
  const hold = holdOf(p, mine, factionName);
  if (hold.state !== "unheld" && hold.holderFaction) {
    const ours = hold.state === "mine";
    const name = hold.holderName ?? hold.holderFaction;
    return {
      kind: "held",
      faction: hold.holderFaction,
      text: ours ? "Held by your faction: defend it" : `Held by ${name}`,
      accessibilityLabel: ours
        ? `Held by your faction, strength ${hold.strength} of 100. Play it to defend it.`
        : `Held by ${name}, strength ${hold.strength} of 100.`,
      strength: hold.strength,
    };
  }
  if (p.source === "starter" || !mine) return null;
  const text = `Unclaimed: take it for ${factionName(mine)}`;
  return { kind: "unclaimed", faction: mine, text, accessibilityLabel: text, strength: null };
}

/**
 * Which colour a map pin takes (RoamHomeView.swift 461): a boss's raid tint
 * first, else its holder's faction colour, else its tier colour. Colours stay
 * in components/game/theme.ts; this only says which rule applies.
 */
export type PinTint = { kind: "raid" } | { kind: "holder"; faction: string } | { kind: "tier"; tier: string };

export function pinTint(p: QuestPoint): PinTint {
  if (p.source === "raid") return { kind: "raid" };
  const holder = holderOf(p);
  if (holder) return { kind: "holder", faction: holder };
  return { kind: "tier", tier: p.tier };
}

// =====================================================================
// Siege: look (SiegeLook)
// =====================================================================

/** The Guardian's HP when the server says this point can be sieged (whole numbers only, as Int(raw)). */
export function guardianHp(p: QuestPoint): number | null {
  const e = p.extra ?? {};
  return intOf(e.siege_guardian_hp ?? e["siege.guardian_hp"] ?? e.guardian_hp);
}

/** Whose Guardian stands here: the siege's faction, else the holder. */
export function siegeFaction(p: QuestPoint): string | null {
  return p.extra?.siege_faction ?? p.extra?.["siege.faction"] ?? holderOf(p);
}

export type SiegeInfo = {
  guardianHp: number;
  /** The Guardian's faction id (null if the server named none). */
  faction: string | null;
  factionName: string;
};

/**
 * A rival's Guardian stands here (SiegeLook.isSiege): the server put a
 * Guardian HP on it, it is not a boss or a starter, and (an unsigned read tags
 * every held point) the Guardian is not the player's own faction. Null when
 * there is no siege to fight.
 */
export function siegeOf(p: QuestPoint, me: RoamMe | { faction?: string | null } | null | undefined, factionName?: (id: string) => string): SiegeInfo | null {
  const hp = guardianHp(p);
  if (hp === null || p.source === "raid" || p.source === "starter") return null;
  const faction = siegeFaction(p);
  const mine = me?.faction ?? null;
  if (mine && faction === mine) return null;
  const e = p.extra ?? {};
  const name =
    e.siege_faction_name ?? e["siege.faction_name"] ?? e.holder_name ?? (faction ? (factionName ? factionName(faction) : faction) : "No faction");
  return { guardianHp: hp, faction, factionName: name };
}

export function isSiege(p: QuestPoint, me: RoamMe | { faction?: string | null } | null | undefined): boolean {
  return siegeOf(p, me) !== null;
}

/** A siege is fought as a Guardian Duel when the server says so (me.features.duel.siege_mode). */
export function siegePlaysAsDuel(me: RoamMe | null | undefined): boolean {
  return me?.features?.duel?.siege_mode === "duel";
}

/** The damage pop's colour by grade (SiegeLook.gradeColor): sun, mint, else sky. */
export function gradeTone(grade: string | null | undefined): "sun" | "mint" | "sky" {
  return grade === "Flawless" ? "sun" : grade === "Brilliant" ? "mint" : "sky";
}

// =====================================================================
// Siege: wire (SiegeQuestion, SiegeReward, SiegeState, SiegeAnswerResult)
// =====================================================================

export type SiegeQuestion = {
  id?: string | null;
  q: string;
  choices: string[];
  clue?: string | null;
  /** Choices Insight took away. */
  removed?: number[] | null;
  /** The round's full window, and what is left of it by the server's clock. */
  seconds?: number | null;
  remaining_s?: number | null;
  /** 0-based. */
  round?: number | null;
};

export type SiegeRewardLine = { label: string; xp: number; coins: number; faction_points: number };

export type SiegeReward = {
  xp?: number | null;
  coins?: number | null;
  faction_points?: number | null;
  lines?: SiegeRewardLine[] | null;
  relic?: RoamExtra | null;
  extras?: RoamExtra[] | null;
};

export type SiegeState = {
  siege_id: string;
  point_id?: string | null;
  point_name?: string | null;
  faction_attacked?: string | null;
  faction_attacked_name?: string | null;
  ability?: string | null;
  resumed?: boolean | null;
  cooldown_until?: string | null;
  relic_id?: string | null;
  relic?: Relic | null;
  relic_power?: number | null;
  guardian_hp: number;
  max_hp: number;
  focus: number;
  /** 0-based: the question being asked now. */
  round: number;
  rounds?: number | null;
  max_rounds?: number | null;
  /** fight | won | lost */
  phase: string;
  question?: SiegeQuestion | null;
  seconds?: number | null;
  remaining_s?: number | null;
  deadline?: string | null;
  reward?: SiegeReward | null;
  extras?: RoamExtra[] | null;
};

export type SiegeAnswerResult = {
  correct: boolean;
  grade?: string | null;
  damage?: number | null;
  guardian_hp: number;
  focus: number;
  struck?: boolean | null;
  blocked?: boolean | null;
  phase: string;
  next?: SiegeQuestion | null;
  answer_index?: number | null;
  /** The round just answered, 0-based. */
  round?: number | null;
  late?: boolean | null;
  cooldown_until?: string | null;
  reward?: SiegeReward | null;
  extras?: RoamExtra[] | null;
  /** Ability effects that fired on this answer ("cleave", "surge"). */
  effects?: string[] | null;
  remaining_s?: number | null;
  seconds?: number | null;
  me?: RoamMe | null;
};

/** iOS's defaults: up to 7 rounds of 15 seconds, the 50/50 (Insight) only in round 0. */
export const SIEGE_ROUNDS = 7;
export const SIEGE_ROUND_SECONDS = 15;
/** The Guardian's HP when a point names none (SiegeView.init). */
export const SIEGE_DEFAULT_HP = 40;
/** How long a lost siege rests before the next try (the result's copy). */
export const SIEGE_COOLDOWN_MIN = 10;

const bad = (what: string) => new GameError("decoding", `The server sent a siege without ${what}.`);

function need<T>(v: T | null, what: string): T {
  if (v === null) throw bad(what);
  return v;
}

const numList = (v: unknown): number[] | null => (Array.isArray(v) ? v.filter((n): n is number => typeof n === "number") : null);
const strList = (v: unknown): string[] | null => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : null);

/** A RoamExtra, as RoamExtra.init(from:): `kind` required, `title` falls back to the relic's name. */
function parseExtra(raw: unknown): RoamExtra | null {
  if (!isObj(raw) || typeof raw.kind !== "string") return null;
  const relic = isObj(raw.relic) && typeof raw.relic.id === "string" ? (raw.relic as unknown as Relic) : null;
  return {
    kind: raw.kind,
    title: optStr(raw.title) ?? relic?.name ?? "",
    subtitle: optStr(raw.subtitle),
    icon: optStr(raw.icon),
    relic,
    new: optBool(raw.new),
    shards: optNum(raw.shards),
  };
}

const extrasOf = (v: unknown): RoamExtra[] | null =>
  Array.isArray(v) ? v.map(parseExtra).filter((e): e is RoamExtra => e !== null) : null;

/** A question, or null when it has no text or choices (Swift would refuse to decode it). */
export function parseSiegeQuestion(raw: unknown): SiegeQuestion | null {
  if (!isObj(raw) || typeof raw.q !== "string" || !Array.isArray(raw.choices)) return null;
  return {
    id: optStr(raw.id),
    q: raw.q,
    choices: raw.choices.map((c) => String(c)),
    clue: optStr(raw.clue),
    removed: numList(raw.removed),
    seconds: optNum(raw.seconds),
    remaining_s: optNum(raw.remaining_s),
    round: optNum(raw.round),
  };
}

export function parseSiegeReward(raw: unknown): SiegeReward | null {
  if (!isObj(raw)) return null;
  return {
    xp: optNum(raw.xp),
    coins: optNum(raw.coins),
    faction_points: optNum(raw.faction_points),
    lines: Array.isArray(raw.lines)
      ? raw.lines.filter(isObj).map((l) => ({
          label: String(l.label ?? ""),
          xp: optNum(l.xp) ?? 0,
          coins: optNum(l.coins) ?? 0,
          faction_points: optNum(l.faction_points) ?? 0,
        }))
      : null,
    relic: parseExtra(raw.relic),
    extras: extrasOf(raw.extras),
  };
}

/** Wherever the server put the drop (SiegeReward.drop). */
export function siegeDrop(r: SiegeReward | null | undefined): RoamExtra | null {
  return r?.relic ?? r?.extras?.find((e) => e.kind === "relic") ?? null;
}

/** POST v1/roam/siege/start's reply. Throws a decoding error where Swift's decoder would. */
export function parseSiegeState(raw: unknown): SiegeState {
  if (!isObj(raw)) throw bad("a body");
  const r = raw;
  if (typeof r.siege_id !== "string") throw bad("an id");
  return {
    siege_id: r.siege_id,
    point_id: optStr(r.point_id),
    point_name: optStr(r.point_name),
    faction_attacked: optStr(r.faction_attacked),
    faction_attacked_name: optStr(r.faction_attacked_name),
    ability: optStr(r.ability),
    resumed: optBool(r.resumed),
    cooldown_until: optStr(r.cooldown_until),
    relic_id: optStr(r.relic_id),
    relic: isObj(r.relic) && typeof r.relic.id === "string" ? (r.relic as unknown as Relic) : null,
    relic_power: optNum(r.relic_power),
    guardian_hp: need(optNum(r.guardian_hp), "the Guardian's HP"),
    max_hp: need(optNum(r.max_hp), "the Guardian's max HP"),
    focus: need(optNum(r.focus), "your focus"),
    round: need(optNum(r.round), "a round"),
    rounds: optNum(r.rounds),
    max_rounds: optNum(r.max_rounds),
    phase: need(optStr(r.phase), "a phase"),
    question: parseSiegeQuestion(r.question),
    seconds: optNum(r.seconds),
    remaining_s: optNum(r.remaining_s),
    deadline: optStr(r.deadline),
    reward: parseSiegeReward(r.reward),
    extras: extrasOf(r.extras),
  };
}

/** POST v1/roam/siege/answer's reply. */
export function parseSiegeAnswer(raw: unknown): SiegeAnswerResult {
  if (!isObj(raw)) throw bad("a body");
  const r = raw;
  if (typeof r.correct !== "boolean") throw bad("a verdict");
  return {
    correct: r.correct,
    grade: optStr(r.grade),
    damage: optNum(r.damage),
    guardian_hp: need(optNum(r.guardian_hp), "the Guardian's HP"),
    focus: need(optNum(r.focus), "your focus"),
    struck: optBool(r.struck),
    blocked: optBool(r.blocked),
    phase: need(optStr(r.phase), "a phase"),
    next: parseSiegeQuestion(r.next),
    answer_index: optNum(r.answer_index),
    round: optNum(r.round),
    late: optBool(r.late),
    cooldown_until: optStr(r.cooldown_until),
    reward: parseSiegeReward(r.reward),
    extras: extrasOf(r.extras),
    effects: strList(r.effects),
    remaining_s: optNum(r.remaining_s),
    seconds: optNum(r.seconds),
    me: isObj(r.me) ? (r.me as unknown as RoamMe) : null,
  };
}

export function totalRounds(s: Pick<SiegeState, "rounds" | "max_rounds"> | null | undefined): number {
  return s?.rounds ?? s?.max_rounds ?? SIEGE_ROUNDS;
}

// =====================================================================
// Siege: routes (/v1/roam/siege)
// =====================================================================

export type SiegeFix = { lat: number; lng: number; accuracy: number };

/**
 * Lay siege where you stand. The server judges reach and cooldown (a refusal
 * comes back in its words) and resumes a siege already running. Not retried,
 * as iOS's roamPost isn't.
 */
export async function siegeStart(client: GameClient, point: Pick<QuestPoint, "id">, fix: SiegeFix | null): Promise<SiegeState> {
  if (!fix) throw new GameError("http", "Waiting for your location.");
  const body = {
    device_key: client.deviceKey(),
    point_id: point.id,
    lat: fix.lat,
    lng: fix.lng,
    // iOS sends max(0, accuracy); the 5000 cap is the one every other route here keeps.
    accuracy_m: Math.min(5000, Math.max(0, fix.accuracy)),
  };
  return parseSiegeState(await client.request("POST", "v1/roam/siege/start", { body, signed: true }));
}

/** One answer: the round, the choice (-1 for time ran out) and how long it took. Marked by the server. */
export async function siegeAnswer(client: GameClient, siegeId: string, round: number, choice: number, elapsedMs: number): Promise<SiegeAnswerResult> {
  const body = {
    device_key: client.deviceKey(),
    siege_id: siegeId,
    round,
    choice,
    elapsed_ms: Math.max(0, Math.round(elapsedMs)),
  };
  return parseSiegeAnswer(await client.request("POST", "v1/roam/siege/answer", { body, signed: true }));
}

// =====================================================================
// Siege: the fight's state (SiegeView's @State and its transitions)
// =====================================================================

export type SiegePhase = "intro" | "starting" | "fight" | "judging" | "result" | "failed";

export type SiegeModel = {
  phase: SiegePhase;
  failure: string | null;
  state: SiegeState | null;
  question: SiegeQuestion | null;
  /** 0-based, as the server counts; shown +1. */
  round: number;
  /** Right answers in a row, for naming the Surge when it fires. */
  run: number;
  hp: number;
  maxHp: number;
  focus: number;
  picked: number | null;
  /** The right answer, once the server shows it. */
  reveal: number | null;
  /** When this question was put (this phone's clock, ms). */
  askedAt: number;
  /** When it times out, by the server's seconds laid on this phone's clock (ms). */
  deadline: number;
  seconds: number;
  won: boolean;
  reward: SiegeReward | null;
  lastResult: SiegeAnswerResult | null;
  roundsUsed: number;
};

export function initialSiege(point: QuestPoint): SiegeModel {
  const hp = guardianHp(point) ?? SIEGE_DEFAULT_HP;
  return {
    phase: "intro",
    failure: null,
    state: null,
    question: null,
    round: 0,
    run: 0,
    hp,
    maxHp: hp,
    focus: 100,
    picked: null,
    reveal: null,
    askedAt: 0,
    deadline: 0,
    seconds: SIEGE_ROUND_SECONDS,
    won: false,
    reward: null,
    lastResult: null,
    roundsUsed: 0,
  };
}

/** Attack pressed: only from the intro. */
export function siegeBegin(m: SiegeModel): SiegeModel {
  return m.phase === "intro" ? { ...m, phase: "starting" } : m;
}

export function siegeFailed(m: SiegeModel, why: string): SiegeModel {
  return { ...m, phase: "failed", failure: why };
}

/**
 * Put a question (present()): the round from the question, its window, and a
 * deadline from the seconds the server says are left, so a phone whose clock
 * is wrong still gets the whole window.
 */
export function siegePresent(m: SiegeModel, q: SiegeQuestion | null | undefined, now: number): SiegeModel {
  if (!q) return m;
  const seconds = Math.max(1, q.seconds ?? SIEGE_ROUND_SECONDS);
  return {
    ...m,
    picked: null,
    reveal: null,
    round: q.round ?? m.round,
    seconds,
    askedAt: now,
    deadline: now + (q.remaining_s ?? seconds) * 1000,
    question: q,
    phase: "fight",
  };
}

/** The server's reply to start: into the fight, or straight to the result when it is already over. */
export function siegeStarted(m: SiegeModel, s: SiegeState, now: number): SiegeModel {
  const next: SiegeModel = {
    ...m,
    state: s,
    hp: s.guardian_hp,
    maxHp: Math.max(1, s.max_hp),
    focus: s.focus,
    round: s.question?.round ?? s.round,
  };
  if (s.phase !== "fight") return siegeFinish(next, s.phase === "won", s.reward ?? null);
  return siegePresent(next, s.question, now);
}

/**
 * A choice (or -1 when the clock ran out): only while the question is open.
 * Returns what to send, or null when the tap doesn't count.
 */
export function siegePick(m: SiegeModel, choice: number, now: number): { model: SiegeModel; send: { siegeId: string; round: number; choice: number; elapsedMs: number } } | null {
  if (m.phase !== "fight" || !m.state) return null;
  return {
    model: { ...m, picked: choice >= 0 ? choice : null, phase: "judging" },
    send: { siegeId: m.state.siege_id, round: m.round, choice, elapsedMs: Math.max(0, Math.round(now - m.askedAt)) },
  };
}

export type SiegeBeat = "hit" | "blocked" | "struck";

/** How the screen stages an answer: a hit, the Relic's ward blocking, or the Guardian striking back. */
export function beatOf(r: SiegeAnswerResult): SiegeBeat {
  return r.correct ? "hit" : r.blocked === true ? "blocked" : "struck";
}

/** The damage pop for a hit: "-12  FLAWLESS!". */
export function hitLabel(r: Pick<SiegeAnswerResult, "damage" | "grade">): string {
  const label = `-${Math.round(r.damage ?? 0)}`;
  return r.grade ? `${label}  ${r.grade.toUpperCase()}!` : label;
}

/**
 * The ability effects to name on a hit: the server's, else what iOS infers
 * (a Flawless with cleave; surge from the third right answer in a row).
 * `run` counts this answer.
 */
export function effectsOf(r: Pick<SiegeAnswerResult, "effects" | "grade">, ability: string | null | undefined, run: number): string[] {
  const fx = r.effects ?? [];
  if (fx.length) return fx;
  if (ability === "cleave" && r.grade === "Flawless") return ["cleave"];
  if (ability === "surge" && run >= 3) return ["surge"];
  return [];
}

export function effectLabel(effect: string): string {
  return effect === "surge" ? "SURGE ×2" : (effect.charAt(0).toUpperCase() + effect.slice(1)).toUpperCase();
}

/** The answer has come back (land()): reveal, HP, focus, the run. The staging is the screen's. */
export function siegeLanded(m: SiegeModel, r: SiegeAnswerResult): SiegeModel {
  return {
    ...m,
    lastResult: r,
    roundsUsed: (r.round ?? m.round) + 1,
    reveal: r.answer_index ?? null,
    run: r.correct ? m.run + 1 : 0,
    // The server's numbers, always (iOS moves the HP only on a hit, where it changes).
    hp: r.guardian_hp,
    focus: r.focus,
  };
}

/** After the beat has played: the next question, or the end. */
export function siegeAfter(m: SiegeModel, r: SiegeAnswerResult, now: number): SiegeModel {
  if (r.phase === "fight" && r.next) return siegePresent(m, r.next, now);
  return siegeFinish(m, r.phase === "won", r.reward ?? { extras: r.extras ?? null });
}

export function siegeFinish(m: SiegeModel, won: boolean, reward: SiegeReward | null): SiegeModel {
  return { ...m, won, reward, phase: "result" };
}

/** Which choices are greyed out: Insight's removals, only in round 0 and only before the reveal. */
export function removedChoices(m: Pick<SiegeModel, "round" | "question" | "reveal">): number[] {
  if (m.round !== 0 || m.reveal !== null) return [];
  return m.question?.removed ?? [];
}

/** Seconds left on the round clock (fractional). */
export function timeLeft(m: Pick<SiegeModel, "deadline">, now: number): number {
  return Math.max(0, (m.deadline - now) / 1000);
}

/** The ring timer's numbers: seconds shown (rounded up), the fraction left, and the last five's heat. */
export function ringOf(m: Pick<SiegeModel, "deadline" | "seconds">, now: number): { shown: number; fraction: number; hot: boolean } {
  const left = timeLeft(m, now);
  return { shown: Math.ceil(left), fraction: m.seconds > 0 ? Math.min(1, left / m.seconds) : 0, hot: left < 5 };
}

/** The bars' share: 0...1. */
export function hpShare(m: Pick<SiegeModel, "hp" | "maxHp">): number {
  return Math.min(1, Math.max(0, m.hp) / Math.max(1, m.maxHp));
}

/** The focus bar's colour band: mint when full, sun, then berry as it drains. */
export function focusTone(focus: number): "mint" | "sun" | "berry" {
  const v = focus / 100;
  return v > 0.5 ? "mint" : v > 0.25 ? "sun" : "berry";
}

/** The result's foot line: "3 rounds · 40 focus left". */
export function roundsLine(m: Pick<SiegeModel, "roundsUsed" | "focus">): string {
  return `${m.roundsUsed} ${m.roundsUsed === 1 ? "round" : "rounds"} · ${m.focus} focus left`;
}

/** The result's pay lines: the server's lines, else one line for the XP. */
export function rewardRows(m: Pick<SiegeModel, "reward" | "won">): { label: string; xp: number }[] {
  const lines = m.reward?.lines ?? [];
  if (lines.length) return lines.map((l) => ({ label: l.label, xp: l.xp }));
  const xp = m.reward?.xp;
  return typeof xp === "number" ? [{ label: m.won ? "Hold taken" : "For trying", xp }] : [];
}

/**
 * The point after a won siege, before the next fetch says so (store.patchPoint
 * in finish()): held by the player's faction at 60, the siege facts gone.
 */
export function pointAfterSiege(p: QuestPoint, myFaction: string, myFactionName: string): QuestPoint {
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(p.extra ?? {})) if (!k.startsWith("siege")) extra[k] = v;
  extra.holder = myFaction;
  extra.holder_name = myFactionName;
  extra.hold_strength = "60";
  return { ...p, extra };
}

/** The reward screen's summary for a siege (Reward.tsx RewardSummary, field for field). */
export type SiegeRewardSummary = {
  pointName: string;
  realm: string;
  win: boolean;
  headline: string;
  xp: number;
  coins: number;
  factionPoints: number;
  lines: { label: string; xp: number; coins: number; factionPoints: number }[];
  before: RoamMe["standing"] | null;
  after: RoamMe["standing"] | null;
  leveledUp: boolean;
  rankUp: boolean;
  dailiesCompleted: string[];
  extras: RoamExtra[];
  note: string | null;
};

export function siegeRewardSummary(
  m: Pick<SiegeModel, "won" | "reward" | "roundsUsed" | "focus">,
  point: QuestPoint,
  before: RoamMe["standing"] | null,
  after: RoamMe["standing"] | null,
): SiegeRewardSummary {
  const r = m.reward;
  const drop = siegeDrop(r);
  const extras = [...(drop ? [drop] : []), ...(r?.extras ?? []).filter((e) => e.kind !== "relic")];
  return {
    pointName: point.name,
    realm: point.realm,
    win: m.won,
    headline: m.won ? "Taken!" : "Repelled",
    xp: r?.xp ?? 0,
    // CosCoins are bought, not earned: never shown as pay (as rewardFromDuel).
    coins: 0,
    factionPoints: r?.faction_points ?? 0,
    lines: (r?.lines ?? []).map((l) => ({ label: l.label, xp: l.xp, coins: 0, factionPoints: l.faction_points })),
    before,
    after,
    leveledUp: !!before && !!after && after.level > before.level,
    rankUp: !!before && !!after && after.rank !== before.rank,
    dailiesCompleted: [],
    extras,
    note: roundsLine(m),
  };
}

// =====================================================================
// Spawns (Spawns, SpawnLine, NearbyRadar)
// =====================================================================

export function isWandering(p: QuestPoint): boolean {
  return p.source === "wander" || p.extra?.wander === "1";
}

/** When a wandering challenge leaves (ms), from extra.expires_at. */
export function expiresAt(p: QuestPoint): number | null {
  return parseServerDate(p.extra?.expires_at);
}

/** Time is up, before the next points refresh removes it. Everything without an expiry is never gone. */
export function isGone(p: QuestPoint, now: number): boolean {
  const until = expiresAt(p);
  return until !== null && until <= now;
}

/** "12 min", or seconds in the last minute, where every second counts (Spawns.span). */
export function spanText(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return `${s} s`;
  return `${Math.ceil(s / 60)} min`;
}

/** The point card's line, or null for a point with no expiry. */
export function spawnLineText(p: QuestPoint, now: number): string | null {
  const until = expiresAt(p);
  if (until === null) return null;
  const left = (until - now) / 1000;
  return left > 0 ? `Wandering · gone in ${spanText(left)}` : "Wandered off. Look for the next one";
}

export function spawnLineLabel(p: QuestPoint, now: number): string | null {
  const until = expiresAt(p);
  if (until === null) return null;
  const left = (until - now) / 1000;
  return left > 0 ? `Wandering challenge, gone in ${spanText(left)}` : "This wandering challenge has gone";
}

/** GET v1/roam/spawns/next: when the next wandering challenge appears nearby. */
export type SpawnNext = { next_at?: string | null; in_s?: number | null; alive: number };

/** Public and unsigned (the server derives spawns from place and time), with iOS roamGet's one retry. */
export async function spawnsNext(client: GameClient, lat: number, lng: number): Promise<SpawnNext> {
  const raw = await client.retrying(() => client.request<unknown>("GET", "v1/roam/spawns/next", { query: { lat, lng } }));
  const r = isObj(raw) ? raw : {};
  const alive = optNum(r.alive);
  if (alive === null) throw new GameError("decoding", "The server sent something unexpected.");
  return { next_at: optStr(r.next_at), in_s: optNum(r.in_s), alive };
}

/** When the next one appears on this phone's clock, from the server's "in N seconds" (never its timestamp). */
export function nextAtFrom(r: SpawnNext | null, now: number): number | null {
  return r && typeof r.in_s === "number" ? now + r.in_s * 1000 : null;
}

export function radarParts(reach: number, wandering: number, nextAt: number | null, now: number): string[] {
  const parts: string[] = [];
  if (reach > 0) parts.push(`${reach} in reach`);
  if (wandering > 0) parts.push(`${wandering} wandering`);
  if (nextAt !== null) {
    const left = (nextAt - now) / 1000;
    if (left > 0) parts.push(`next in ${spanText(left)}`);
  }
  return parts;
}

/** The radar's counts: points in reach and wanderers, neither counting one whose time is up. */
export function radarCounts(points: QuestPoint[], inReach: (p: QuestPoint) => boolean, now: number): { reach: number; wandering: number } {
  let reach = 0;
  let wandering = 0;
  for (const p of points) {
    if (isGone(p, now)) continue;
    if (inReach(p)) reach += 1;
    if (isWandering(p)) wandering += 1;
  }
  return { reach, wandering };
}

/** "2 in reach · 1 wandering · next in 4 min", or "" when there is nothing to say. */
export function radarText(points: QuestPoint[], inReach: (p: QuestPoint) => boolean, nextAt: number | null, now: number): string {
  const { reach, wandering } = radarCounts(points, inReach, now);
  return radarParts(reach, wandering, nextAt, now).join(" · ");
}
