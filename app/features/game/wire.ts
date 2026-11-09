// What the game server sends and takes, in the shapes it writes them.
// Field names match the JSON exactly (snake_case), as costquest-ios
// Net/RoamWire.swift and Net/Wire.swift do, so there is no mapping layer to
// drift. See costquest-backend app/roam.py, app/roam_duel.py, docs/API.md.
// Pure types plus a few tolerant readers.

export type Faction = { id: string; name: string };

export type RoamConfig = {
  factions: Faction[];
  ranks: string[];
  max_level: number;
  open_radius_m: number;
  cooldown_s: number;
  hints?: { fifty: number; time: number; time_s: number } | null;
  windows_s?: Record<string, number>;
};

export type QuestPoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** landmark | signal | starter | wander */
  source: string;
  place_kind: string;
  /** starter | common | rare | epic */
  tier: string;
  realm: string;
  /** trivia | rebus | sequence | blitz | duel */
  challenge: string;
  distance_m?: number | null;
  cooling_until?: string | null;
  /** Short display facts features add (guardian, holder, spin rest...), flattened to strings. */
  extra?: Record<string, string> | null;
};

export type QuestPoints = { region: string; day: string; points: QuestPoint[]; attribution: string };

export type RoamStanding = {
  level: number;
  rank: string;
  xp: number;
  level_floor_xp: number;
  next_level_xp: number;
  into_level: number;
  level_span: number;
  max_level: boolean;
};

export type RoamDaily = {
  id: string;
  title: string;
  progress: number;
  target: number;
  done: boolean;
  reward: { xp: number; coins: number };
};

export type DuelMe = {
  stance?: string | null;
  stance_is_default?: boolean | null;
  fighter?: {
    weapon_class?: string | null;
    level?: number | null;
    max_hp?: number | null;
    attack?: number | null;
    defence_bp?: number | null;
  } | null;
  siege_mode?: string | null;
  point_mode?: string | null;
  raid_mode?: string | null;
  run_mode?: string | null;
  /** The 3D fight at a duel point is judged and pays (server knob point_fight3d, cq 019). */
  fight3d?: boolean | null;
  live?: { duel_id: string; mode?: string | null; target?: string | null; expires_at?: string | null } | null;
  /** Guardian Trials: one ladder per faction (DuelMe.trials). */
  trials?: Record<string, TrialLadder> | null;
};

export type HoldLost = { point_id: string; point_name?: string | null; by_faction?: string | null; by_faction_name?: string | null; at?: string | null };

/** Points this player took that a rival took back (RoamMe.holds_lost: features.siege.holds_lost). */
export function holdsLostOf(me: { features?: Record<string, unknown> | null } | null | undefined): HoldLost[] {
  const siege = (me?.features?.siege ?? null) as { holds_lost?: HoldLost[] | null } | null;
  return siege?.holds_lost ?? [];
}

/** The first loss not yet told, by point and time (RoamHomeView.noticeLost, cq.holdsLost.seen). */
export function freshLoss(lost: HoldLost[] | null | undefined, seen: ReadonlySet<string>): HoldLost | null {
  return (lost ?? []).find((l) => !seen.has(l.point_id + (l.at ?? ""))) ?? null;
}

export type TrialLadder = { cleared: number; rungs: number; next?: { rung: number; name: string; level: number } | null };

export type RoamMe = {
  device_key: string;
  handle?: string | null;
  faction?: string | null;
  faction_name?: string | null;
  faction_change_at?: string | null;
  standing: RoamStanding;
  coins: number;
  faction_points: number;
  streak: { days: number; best: number; played_today: boolean };
  tutorial_done: boolean;
  dailies: RoamDaily[];
  day: string;
  today?: { points_played: number; correct: number; xp: number; best_place?: string | null } | null;
  features?: {
    relics?: { equipped?: Relic | null; owned_count?: number | null } | null;
    duel?: DuelMe | null;
    [feature: string]: unknown;
  } | null;
};

export type AttemptQuestion = { id: string; q: string; choices: string[]; difficulty: number; clue?: string | null };
export type AttemptBeat = { id: string; text: string };

export type RoamAttempt = {
  attempt_id: string;
  point: QuestPoint;
  kind: string;
  realm: string;
  realm_name: string;
  tier: string;
  issued_at: string;
  deadline: string;
  seconds: number;
  challenge: { questions?: AttemptQuestion[] | null; prompt?: string | null; beats?: AttemptBeat[] | null };
  resumed: boolean;
  /** Seconds left by the server's clock when it answered. */
  remaining_s?: number | null;
};

/** An index for a question, a beat id for a sequence. */
export type RoamAnswer = number | string;

export type RewardLine = { label: string; xp: number; coins: number; faction_points: number };

export type RoamExtra = {
  kind: string;
  title: string;
  subtitle?: string | null;
  icon?: string | null;
  relic?: Relic | null;
  new?: boolean | null;
  shards?: number | null;
};

export type RoamVerdict = {
  attempt_id: string;
  point_id: string;
  point_name: string;
  kind: string;
  tier: string;
  late: boolean;
  correct: number;
  total: number;
  reveal: {
    correct?: number[] | null;
    marks?: boolean[] | null;
    correct_order?: string[] | null;
    correct_text?: string[] | null;
    positions_right?: number | null;
  };
  reward: { xp: number; coins: number; faction_points: number; lines: RewardLine[] };
  before: RoamStanding;
  after: RoamStanding;
  leveled_up: boolean;
  rank_up: boolean;
  answer_run: number;
  streak: number;
  dailies_completed: string[];
  cooling_until: string;
  me?: RoamMe | null;
  grade?: string | null;
  elapsed_s?: number | null;
  extras?: RoamExtra[] | null;
  can_retry?: boolean | null;
};

export type RoamHint = {
  removed?: number[] | null;
  coins: number;
  deadline: string;
  remaining_s?: number | null;
  paid_with?: string | null;
  bag?: Record<string, number> | null;
};

export type RoamStarter = { starter: QuestPoint | null; tutorial_done: boolean };

export type FactionWar = {
  region: string;
  week_start: string;
  ends_at: string;
  players: number;
  total: number;
  standings: { faction: string; name: string; points: number; share: number }[];
};

export type RoamLeaders = {
  region: string;
  leaders: { place: number; you: boolean; handle: string; faction?: string | null; week_xp: number; level: number }[];
};

export type RoamBag = { bag: Record<string, number>; names: Record<string, string> };

/** /v1/roam/items/spin: items, a little XP, then the point rests (RoamSpin). */
export type RoamSpin = {
  point_id: string;
  items: Record<string, number>;
  xp: number;
  streak_bonus: boolean;
  spins_in_window?: number | null;
  bag: Record<string, number>;
  names: Record<string, string>;
  spin_ready_at: string;
};

/** A point can be spun again once its rest is over (PointCard.spinReady). */
export function spinReady(p: Pick<QuestPoint, "extra">, now: number): boolean {
  const t = parseServerDate(p.extra?.spin_ready_at);
  return t === null || t <= now;
}

/** The spin banner: "+12 XP" or "Spin streak! ×2", and what went into the bag ("2× 50/50  1× Extra time"). */
export function spinBanner(r: Pick<RoamSpin, "items" | "xp" | "streak_bonus" | "names">): { title: string; subtitle: string } {
  const got = Object.entries(r.items)
    .map(([k, n]) => `${n}× ${r.names[k] ?? k}`)
    .sort()
    .join("  ");
  return { title: r.streak_bonus ? "Spin streak! ×2" : `+${r.xp} XP`, subtitle: got || "Bag full" };
}

export type Relic = {
  id: string;
  name: string;
  faction: string;
  rarity: string;
  kind: string;
  power: number;
  ability: string;
  lore?: string | null;
  ability_text?: string | null;
  faction_name?: string | null;
  level?: number | null;
  shards?: number | null;
  power_now?: number | null;
};

export type CodexCard = {
  point_id: string;
  point_name: string;
  realm: string;
  realm_name?: string | null;
  tier: string;
  region: string;
  region_name?: string | null;
  foil: boolean;
  first_at: string;
  times: number;
};

export type CodexPayload = {
  cards: CodexCard[];
  counts: { by_realm: Record<string, number>; total: number; foils: number };
  sets: { id: string; title: string; progress: number; target: number; done: boolean }[];
};

export type ProfileAvatar = { face: number; mark: number; tint: string };

export type Profile = {
  device_key: string;
  handle?: string | null;
  avatar: ProfileAvatar;
  since?: string | null;
  games_played: number;
  games_won: number;
};

export type GroundWay = { w: number; k: string; d?: string | null; p: number[][] };
export type GroundArea = { k?: string | null; p: number[][] };
export type GroundBuilding = { h: number; b?: number | null; p: number[][] };

/** Metres on a local plane: x east, z north, from `origin` (costquest-ios Map/GroundGeometry.swift). */
export type GroundGeometry = {
  v?: number;
  origin: { lat: number; lng: number };
  covered?: boolean;
  radius_m: number;
  attribution: string;
  roads: GroundWay[];
  water: GroundArea[];
  green: GroundArea[];
  buildings: GroundBuilding[];
  waterways?: GroundWay[] | null;
  paved?: GroundArea[] | null;
  /** [x, z, scale, variant] */
  trees?: number[][] | null;
};

export type ModelFile = { file: string; url: string; bytes: number; sha256: string };
export type ModelManifest = {
  version: string;
  label: string;
  model: ModelFile;
  tokenizer: ModelFile;
  min_ram_bytes: number;
  variants?: { label: string; model: ModelFile; tokenizer: ModelFile; min_ram_bytes: number }[] | null;
};

/** POST /v1/sso/cosquest (costquest-backend docs/SSO.md, branch cosquest-sso). */
export type SsoSession = {
  provider: string;
  subject: string;
  created: boolean;
  player: { device_key: string; handle?: string | null; faction?: string | null; chat_faction?: string | null };
  key: { alg: string; seed_hex: string };
  nonce_floor: number;
};

// ---------- the Guardian Duel (app/roam_duel.py, costquest-ios Features/DuelFeature.swift) ----------

export type DuelFighterPeek = {
  name: string;
  faction?: string | null;
  weapon_class?: string | null;
  level?: number | null;
  max_hp?: number | null;
  attack?: number | null;
  relic?: { name?: string | null; kind?: string | null } | null;
  ai?: { stance?: string | null; personality?: string | null } | null;
};

export type DuelStart = {
  duel_id: string;
  mode: string;
  target: string;
  /** Lossy: a 62-bit integer through JSON.parse. Use seed_text. */
  seed: number;
  /** The seed's exact digits (client.parseDuelStart). */
  seed_text: string;
  /** Handed to the sim exactly as the server wrote it (its `seed` is lossy too: use seed_text). */
  setup: Record<string, unknown> & { p1?: DuelFighterPeek; p2?: DuelFighterPeek; kind?: string };
  point?: { point_id?: string; point_name?: string; tier?: string; realm?: string; guardian?: string } | null;
  expires_at?: string | null;
  resumed?: boolean;
};

export type DuelResult = {
  winner: number;
  ticks: number;
  p1_hp: number;
  p2_hp: number;
  /** The fantasy battle's own words (GuardianDefeated | HeroDefeated | Timeout); the side-on duel leaves them out. */
  end_reason?: string;
  kills?: number;
};

/** The finish body's payload: what the sim reports at the end. */
export type DuelFinished = { result: DuelResult; inputs: number[][]; hash: string };

export type DuelPay = {
  xp?: number | null;
  faction_points?: number | null;
  lines?: { label: string; xp?: number | null; faction_points?: number | null }[] | null;
};

export type DuelOutcome = {
  duel_id: string;
  mode: string;
  /** won | lost | held */
  status: string;
  repeat?: boolean | null;
  result?: DuelResult | null;
  point?: {
    point_id?: string | null;
    won?: boolean | null;
    reward?: DuelPay | null;
    leveled_up?: boolean | null;
    cooling_until?: string | null;
    extras?: RoamExtra[] | null;
    /** The level bar before and after the pay (roam_duel_modes.close_point). */
    before?: RoamStanding | null;
    after?: RoamStanding | null;
  } | null;
  reward?: { xp?: number | null; faction_points?: number | null } | null;
  message?: string | null;
};

/** The point's fight mode on this server: `me.features.duel.point_mode`, else the point's own challenge. */
export function pointPlaysAsDuel(point: QuestPoint, me: RoamMe | null | undefined): boolean {
  const mode = me?.features?.duel?.point_mode;
  if (mode === "duel") return true;
  if (mode === "quiz") return false;
  return point.challenge === "duel";
}

/**
 * `extra` is a flat map of strings, but a feature may send a number or a small
 * object (the siege's Guardian). Flatten like QuestPoint.init(from:) does:
 * nested keys become "siege.guardian_hp", arrays and nulls are dropped.
 */
export function flattenExtra(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  const walk = (value: unknown, key: string) => {
    if (typeof value === "string") out[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = Number.isInteger(value) && Math.abs(value) < 1e15 ? String(value) : String(value);
    } else if (typeof value === "boolean") out[key] = value ? "true" : "false";
    else if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = "object";
      for (const [k, v] of Object.entries(value)) walk(v, `${key}.${k}`);
    }
  };
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) walk(v, k);
  return out;
}

/** Python's isoformat writes microseconds sometimes; Date.parse takes both. */
export function parseServerDate(s: string | null | undefined): number | null {
  if (!s) return null;
  // Trim microseconds to milliseconds: some engines refuse 6 fractional digits.
  const ms = Date.parse(s.replace(/(\.\d{3})\d+/, "$1"));
  return Number.isFinite(ms) ? ms : null;
}

export function isCooling(point: QuestPoint, now: number = Date.now()): boolean {
  const until = parseServerDate(point.cooling_until);
  return until !== null && until > now;
}
