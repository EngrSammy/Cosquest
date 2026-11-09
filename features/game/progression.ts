// Progression from Wale's "CosQuest AI Build Brief" (7 Nov 2026): the faction
// entry test, the 10-rank ladder with its three gates (XP, rank test, rank
// weapon), the faction weapon ladder, season XP vs event points.
//
// Against costquest-backend:
//   app/progression.py   /v1/progression/*   (feature `progression`)
//   app/trivia_banks.py  /v1/trivia/tests/*  (feature `trivia_banks`)
//
// The server judges everything: whether a test passed, whether a gate holds,
// whether a weapon is on sale. This file only asks and shapes the answers for
// the screens. Every number shown (thresholds, pass marks, prices) comes from
// the server, because the brief says they are drafts the team will change.
//
// Each feature is off on the server until an operator names it, and a route of
// a feature that is off answers 404. So a 404 here means "not on yet", not an
// error, and the screens fall back to a quiet "not open yet" line.
//
// Pure: the client is injected (tested in features/game/__tests__/progression.test.ts).
import { type GameClient, GameError } from "./client.ts";

// ---------- wire: progression ----------

export type ProgFaction = {
  id: string;
  name: string;
  realm: string;
  themes: string;
  placeholder?: boolean;
  ip_review?: boolean;
};

export type ProgRank = {
  number: number;
  name: string;
  xp_threshold: number;
  /** Percent, 0..100. Null for rank 1, whose gate is the entry test. */
  pass_mark_pct: number | null;
  test_kind?: string | null;
  weapon_tier: number;
};

export type ProgWeapon = {
  id: string;
  faction: string;
  tier: number;
  tier_label?: string | null;
  name: string;
  description?: string | null;
  /** CosCoin price; null = not set by the team yet. */
  cc_price: number | null;
  starter?: boolean;
  account_bound_capstone?: boolean;
  names_reviewed?: boolean;
  placeholder?: boolean;
};

export type WeaponState = "owned" | "available" | "locked";

export type LadderWeapon = ProgWeapon & {
  state: WeaponState;
  xp_needed?: number | null;
  unlocks_at_rank?: number | null;
};

export type ProgGates = {
  rank: number;
  name: string;
  xp: { ok: boolean; need: number; have: number; short: number };
  weapon: { ok: boolean; tier: number; available: boolean };
  test: { ok: boolean; pass_mark_pct: number | null; kind?: string | null };
};

export type ProgSeason = { id: string; name: string; starts_at: string; ends_at: string };

export type ProgConfig = {
  factions: ProgFaction[];
  ranks: ProgRank[];
  weapons: ProgWeapon[];
  seasons?: ProgSeason[];
  rules?: {
    purchase_mode?: string | null;
    entry_test_required?: boolean | null;
    switching_enabled?: boolean | null;
    switch_fee_cc?: number | null;
    switch_xp_keep_pct?: number | null;
  } | null;
  draft?: boolean;
};

export type ProgMe = {
  device_key: string;
  /** Null until the player has passed an entry test and joined. */
  faction: string | null;
  faction_name?: string | null;
  pending: { faction: string; membership_id: number; test: { rank: number; kind: string; passed: boolean } } | null;
  rank?: { number: number; name: string | null };
  xp?: number;
  season?: { id: string | null; xp: number };
  next?: ProgGates | null;
  inventory?: ProgWeapon[];
  ladder?: LadderWeapon[];
  purchase_mode?: string | null;
  /**
   * The events this player has quest points in, when the server sends them
   * (asked of progression.py for /me; read if present, never required).
   */
  events?: { event_ref: string; title?: string | null; points: number; place?: number | null; open?: boolean | null }[] | null;
};

export type Promotion = { from: number; to: number; name: string };

export type JoinResult = {
  status: "active" | "pending_entry_test";
  faction: string;
  starter_weapon?: string | null;
  promoted?: Promotion[];
  me?: ProgMe;
};

export type BuyResult = {
  weapon: string;
  owned: boolean;
  repeat: boolean;
  source?: string;
  price_cc?: number | null;
  promoted: Promotion[];
  me?: ProgMe;
};

export type EventBoard = {
  event_ref: string;
  rows?: { handle?: string | null; device_key?: string; points: number; place?: number }[];
  me?: { points: number; place?: number | null } | null;
  [k: string]: unknown;
};

// ---------- wire: trivia tests ----------

export type TestKind = "entry" | "rank";

export type TestQuestion = { idx: number; q: string; choices: string[] };

export type TestPaper = {
  test_id: string;
  faction: string;
  faction_name?: string;
  test: TestKind | "quest";
  rank: number | null;
  name?: string;
  /** Percent, 0..100. */
  pass_mark: number;
  started_at?: string;
  expires_at: string;
  questions: TestQuestion[];
  resumed: boolean;
};

export type TestResult = {
  passed: boolean;
  /** Percent, 0..100. */
  score: number;
  correct: number;
  total: number;
  pass_mark: number;
  outcome?: "submitted" | "timeout" | string;
  results: boolean[];
  xp: { correct?: number; streak?: number; perfect?: number; total: number };
  retry_at?: string | null;
};

export type TestStanding = {
  test: string;
  rank: number | null;
  name?: string;
  questions: number;
  pass_mark: number | null;
  time_limit_s: number;
  can_start: boolean;
  reason: string | null;
  retry_at: string | null;
  passed: boolean;
};

export type TestsStatus = {
  faction: string;
  entry: TestStanding;
  ranks: TestStanding[];
  open: { test_id: string; test: string; rank: number | null; expires_at: string; expired: boolean }[];
};

// ---------- "not on yet" ----------

/** A route of a feature the server has not switched on answers 404 (roam_ext DEFAULT_OFF). */
export function isFeatureOff(e: unknown): boolean {
  return e instanceof GameError && e.kind === "http" && e.status === 404 && /not found/i.test(e.message);
}

/**
 * Whether this build shows progression at all: `EXPO_PUBLIC_PROGRESSION=0`
 * hides it whatever the server says (a kill switch for a bad build), anything
 * else leaves it to the server's flag, read from /v1/roam/me features.
 */
export function progressionAllowed(flag: string | undefined | null): boolean {
  return (flag ?? "").trim() !== "0";
}

/** /v1/roam/me features.progression: {on: true, ...} when the server has it on. */
export function progressionOn(me: { features?: Record<string, unknown> | null } | null | undefined): boolean {
  const p = me?.features?.progression as { on?: unknown } | null | undefined;
  return !!p && p.on === true;
}

// ---------- calls ----------

export async function fetchConfig(client: GameClient): Promise<ProgConfig> {
  return client.retrying(() => client.request<ProgConfig>("GET", "v1/progression/config"));
}

export async function fetchMe(client: GameClient): Promise<ProgMe> {
  const key = client.deviceKey();
  return client.retrying(() => client.request<ProgMe>("GET", "v1/progression/me", { query: { device_key: key } }));
}

/** Pick a faction. Answers pending_entry_test until its entry test is passed; asking again after the pass finishes the join. */
export async function joinFaction(client: GameClient, faction: string, confirmSwitch = false): Promise<JoinResult> {
  return client.request("POST", "v1/progression/join", {
    body: { device_key: client.deviceKey(), faction, confirm_switch: confirmSwitch },
    signed: true,
  });
}

export async function checkRankUp(client: GameClient): Promise<{ promoted: Promotion[]; me: ProgMe }> {
  return client.request("POST", "v1/progression/rank-up", { body: { device_key: client.deviceKey() }, signed: true });
}

export async function buyWeapon(client: GameClient, weaponId: string): Promise<BuyResult> {
  return client.request("POST", "v1/progression/weapons/buy", {
    body: { device_key: client.deviceKey(), weapon_id: weaponId },
    signed: true,
  });
}

export async function fetchEventBoard(client: GameClient, eventRef: string): Promise<EventBoard> {
  const key = client.deviceKey();
  return client.request("GET", `v1/progression/events/${encodeURIComponent(eventRef)}/board`, { query: { device_key: key, limit: 10 } });
}

export async function fetchTestsStatus(client: GameClient, faction: string): Promise<TestsStatus> {
  const key = client.deviceKey();
  return client.retrying(() => client.request<TestsStatus>("GET", "v1/trivia/tests/status", { query: { device_key: key, faction } }));
}

/** Start (or resume: same questions, same clock) a test. Refusals come back as GameError with the server's reason. */
export async function startTest(client: GameClient, faction: string, test: TestKind, rank?: number): Promise<TestPaper> {
  const body: Record<string, unknown> = { device_key: client.deviceKey(), faction, test };
  if (test === "rank") body.rank = rank;
  return client.request("POST", "v1/trivia/tests/start", { body, signed: true });
}

/** One answer index per question, -1 for a skip. Judged once on the server. */
export async function submitTest(client: GameClient, testId: string, answers: number[]): Promise<TestResult> {
  return client.request("POST", "v1/trivia/tests/submit", {
    body: { device_key: client.deviceKey(), test_id: testId, answers },
    signed: true,
  });
}

// ---------- shaping for the screens ----------

/** The server's refusal reasons, in words a player reads. Unknown reasons are shown as the server wrote them. */
export function reasonText(reason: string, retryAt?: string | null, now: Date = new Date()): string {
  const wait = retryAt ? waitText(retryAt, now) : "";
  switch (reason) {
    case "already_passed":
      return "You've already passed this test.";
    case "previous_test_needed":
      return "Pass the test for the rank before this one first.";
    case "cooldown":
      return wait ? `You can try again in ${wait}.` : "You can try again later.";
    case "daily_limit":
      return wait ? `That's today's tries used. Back in ${wait}.` : "That's today's tries used.";
    case "bank_not_ready":
      return "This faction's questions aren't ready yet.";
    case "xp_below_threshold":
      return "Reach this rank's XP first.";
    case "already_settled":
      return "This test has already been marked.";
    default:
      return reason;
  }
}

/** "3 h 20 min", "12 min", "under a minute". */
export function waitText(iso: string, now: Date = new Date()): string {
  const ms = Date.parse(iso) - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const min = Math.ceil(ms / 60000);
  if (min < 1) return "under a minute";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export type GateRow = {
  id: "xp" | "test" | "weapon";
  title: string;
  detail: string;
  ok: boolean;
  /** 0..1 for the XP bar; null for yes/no gates. */
  progress: number | null;
};

/** The three gates for the next rank, top to bottom as the brief orders them. */
export function gateRows(g: ProgGates, weaponName?: string | null): GateRow[] {
  const xpProgress = g.xp.need > 0 ? Math.max(0, Math.min(1, g.xp.have / g.xp.need)) : 1;
  const mark = g.test.pass_mark_pct;
  return [
    {
      id: "xp",
      title: "Rank XP",
      detail: g.xp.ok ? `${fmt(g.xp.need)} XP reached` : `${fmt(g.xp.have)} of ${fmt(g.xp.need)} XP · ${fmt(g.xp.short)} to go`,
      ok: g.xp.ok,
      progress: xpProgress,
    },
    {
      id: "test",
      title: "Rank test",
      detail: g.test.ok ? "Passed" : mark != null ? `Pass mark ${mark}%` : "Not passed yet",
      ok: g.test.ok,
      progress: null,
    },
    {
      id: "weapon",
      title: "Rank weapon",
      detail: g.weapon.ok
        ? `${weaponName ?? `Tier ${g.weapon.tier}`} owned`
        : g.weapon.available
          ? `${weaponName ?? `Tier ${g.weapon.tier}`} is on sale now`
          : `${weaponName ?? `Tier ${g.weapon.tier}`} unlocks at ${fmt(g.xp.need)} XP`,
      ok: g.weapon.ok,
      progress: null,
    },
  ];
}

/** How many of the three gates hold. */
export function gatesDone(g: ProgGates): number {
  return [g.xp.ok, g.test.ok, g.weapon.ok].filter(Boolean).length;
}

/** The weapon a gate asks for, from the player's ladder. */
export function weaponForTier(ladder: LadderWeapon[] | undefined, tier: number): LadderWeapon | null {
  return ladder?.find((w) => w.tier === tier) ?? null;
}

export type LadderAction =
  | { kind: "none"; label: string }
  | { kind: "buy"; label: string; price: number | null }
  | { kind: "price_unset"; label: string };

/** What a ladder row offers. A weapon on sale with no price yet cannot be bought unless the server grants without payment (stub mode). */
export function ladderAction(w: LadderWeapon, purchaseMode: string | null | undefined): LadderAction {
  if (w.state === "owned") return { kind: "none", label: w.starter ? "Starter · owned" : "Owned" };
  if (w.state === "locked") {
    const at = w.xp_needed != null ? `${fmt(w.xp_needed)} XP to unlock` : "Locked";
    return { kind: "none", label: at };
  }
  if (purchaseMode === "disabled") return { kind: "none", label: "Unlocked · shop opens soon" };
  if (purchaseMode === "coins" && w.cc_price == null) return { kind: "price_unset", label: "Unlocked · price not set" };
  return { kind: "buy", label: w.cc_price != null ? `Buy · ${fmt(w.cc_price)} CC` : "Get it", price: w.cc_price };
}

/** Sorted T0..T9, with the label the brief uses ("T3 Rare"). */
export function tierLabel(w: { tier: number; tier_label?: string | null }): string {
  return w.tier_label ? `T${w.tier} ${w.tier_label}` : `T${w.tier}`;
}

export function sortedLadder(ladder: LadderWeapon[] | undefined): LadderWeapon[] {
  return [...(ladder ?? [])].sort((a, b) => a.tier - b.tier);
}

/** The rank to take a test for: the next rank (whose gate the test is), or null at the top. */
export function nextTestRank(me: ProgMe): number | null {
  return me.next?.rank ?? null;
}

// ---------- the test, as a small state machine ----------

export type TestFlow =
  | { step: "idle" }
  | { step: "loading" }
  | { step: "question"; paper: TestPaper; index: number; answers: number[] }
  | { step: "submitting"; paper: TestPaper; answers: number[] }
  | { step: "result"; paper: TestPaper; result: TestResult }
  | { step: "refused"; message: string };

export type TestEvent =
  | { type: "start" }
  | { type: "paper"; paper: TestPaper }
  | { type: "answer"; choice: number }
  | { type: "skip" }
  | { type: "submit" }
  | { type: "result"; result: TestResult }
  | { type: "refused"; message: string }
  | { type: "reset" };

export function testReducer(s: TestFlow, e: TestEvent): TestFlow {
  switch (e.type) {
    case "start":
      return { step: "loading" };
    case "paper":
      return { step: "question", paper: e.paper, index: 0, answers: e.paper.questions.map(() => -1) };
    case "answer":
    case "skip": {
      if (s.step !== "question") return s;
      const answers = [...s.answers];
      answers[s.index] = e.type === "answer" ? e.choice : -1;
      const index = s.index + 1;
      if (index >= s.paper.questions.length) return { step: "submitting", paper: s.paper, answers };
      return { ...s, index, answers };
    }
    case "submit":
      if (s.step !== "question") return s;
      return { step: "submitting", paper: s.paper, answers: s.answers };
    case "result":
      if (s.step !== "submitting") return s;
      return { step: "result", paper: s.paper, result: e.result };
    case "refused":
      return { step: "refused", message: e.message };
    case "reset":
      return { step: "idle" };
  }
}

/** Seconds left on a paper's clock. */
export function secondsLeft(paper: TestPaper, now: Date = new Date()): number {
  const ms = Date.parse(paper.expires_at) - now.getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
}

/** The refusal in a GameError, as words. */
export function refusalText(e: unknown, now: Date = new Date()): string {
  // errorFrom keeps only the reason; the wait is read from the tests status before a start.
  if (e instanceof GameError) return reasonText(e.message, null, now);
  return "Something went wrong. Try again.";
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

// ---------- seasons and event-bound friends (app/seasons.py, app/event_social.py) ----------

export type SeasonInfo = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  phase: "upcoming" | "live" | "ended" | "closed" | "draft" | string;
  seconds_left: number | null;
};

export type SeasonMe = {
  season: SeasonInfo | null;
  season_xp: number;
  place: number | null;
  faction_contribution: Record<string, number>;
};

export type EventConnection = {
  friend_key: string;
  handle: string;
  game_id: string;
  event_title: string | null;
  event_starts_at: string | null;
  made_at: string;
  method: string;
};

/** Your season XP and place (feature `seasons`). Signed: read scope. */
export async function fetchSeasonMe(client: GameClient): Promise<SeasonMe> {
  const key = client.deviceKey();
  return client.retrying(() => client.request<SeasonMe>("GET", "v1/seasons/me", { query: { device_key: key }, signed: true }));
}

/** The friends you made at events, each with the event (feature `event_friends`). Signed. */
export async function fetchEventConnections(client: GameClient): Promise<EventConnection[]> {
  const key = client.deviceKey();
  const got = await client.retrying(() =>
    client.request<{ connections?: EventConnection[] | null }>("GET", "v1/events/connections", { query: { device_key: key }, signed: true }),
  );
  return got.connections ?? [];
}

/** "12 days left", "6 h left", "Ended". */
export function seasonTimeText(s: SeasonInfo | null | undefined): string {
  if (!s) return "";
  if (s.phase === "upcoming") return "Starts soon";
  if (s.phase !== "live") return "Ended";
  const left = s.seconds_left ?? 0;
  const days = Math.floor(left / 86400);
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"} left`;
  const h = Math.max(1, Math.floor(left / 3600));
  return `${h} h left`;
}

/** Friends grouped by the event they were made at, newest event first. */
export function connectionsByEvent(list: EventConnection[]): { title: string; game_id: string; friends: EventConnection[] }[] {
  const groups = new Map<string, { title: string; game_id: string; friends: EventConnection[]; at: string }>();
  for (const c of list) {
    const g = groups.get(c.game_id) ?? { title: c.event_title || "A CosQuest", game_id: c.game_id, friends: [], at: c.made_at };
    g.friends.push(c);
    if (c.made_at > g.at) g.at = c.made_at;
    groups.set(c.game_id, g);
  }
  return [...groups.values()].sort((a, b) => (a.at < b.at ? 1 : -1)).map(({ title, game_id, friends }) => ({ title, game_id, friends }));
}
