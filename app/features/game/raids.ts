// Boss raids: co-op Boss Trivia at a boss point (source "raid"). The pure half
// of costquest-ios Features/RaidsFeature.swift (RaidLook, RaidModel and the
// wire), against costquest-backend app/roam_raids.py.
//
// A boss is out for the first half of every hour. The crew standing at it
// joins one lobby, anyone starts, and everyone gets the same five questions
// and 45 seconds. The server marks every swing and keeps the HP; the phone
// polls once a second and draws what it is told. Nothing here decides a hit.
// (Polling, not a websocket: roam_raids.py polls on purpose, and the iOS raid
// never opens Game/LiveLink.swift.)
//
// With the server's raid_duel knob on, a boss is fought as a Guardian Duel
// instead (mode "raid" of /v1/duel/start, app/roam_duel_modes.py): the quiz
// routes then refuse ("Raids are fights now."), and the helpers at the bottom
// serve the duel screen.
//
// Pure: no React Native. The client, the clock and the timer are injected
// (tested in features/game/__tests__/raids.test.ts).
import { type GameClient, GameError } from "./client.ts";
import { HELD_LINE } from "./duelFlow.ts";
import type { DuelOutcome, DuelStart, QuestPoint, RoamExtra, RoamMe, RoamStanding } from "./wire.ts";
import { parseServerDate } from "./wire.ts";

// ---------- wire (roam_raids._state) ----------

export type RaidPlayer = { handle: string; damage: number; you: boolean };
export type RaidQuestion = { id: string; q: string; choices: string[]; clue?: string | null };
export type RaidReward = { xp: number; coins: number; faction_points: number; items?: Record<string, number> | null };
export type RaidYou = { member: boolean; damage: number; answered: number[]; answered_count: number };

export type RaidState = {
  /** quiz | duel (a duel lobby's state reads here too, for its HP). */
  kind?: string | null;
  lobby_id: string;
  boss_name: string;
  realm: string;
  /** lobby | fight | won | lost */
  phase: string;
  hp: number;
  max_hp: number;
  players: RaidPlayer[];
  max_players: number;
  window_ends_at: string;
  fight_seconds: number;
  seconds_left: number;
  damage_per_hit: number;
  questions: RaidQuestion[];
  /** The key, only once the fight is over. */
  reveal?: { correct: number[] } | null;
  /** This player's pay, once over and only if they swung. */
  reward?: RaidReward | null;
  you: RaidYou;
};

export type RaidAnswerResult = { accepted: boolean; hit: boolean; damage: number; state: RaidState };

/** The questions the server deals (roam_raids.QUESTIONS); the lobby doesn't send them yet. */
export const RAID_QUESTIONS = 5;

const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);

/** Tolerant: a missing field is a default, never a crash. */
export function normaliseRaidState(raw: unknown): RaidState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const you = (r.you && typeof r.you === "object" ? r.you : {}) as Record<string, unknown>;
  const reveal = r.reveal && typeof r.reveal === "object" ? (r.reveal as Record<string, unknown>) : null;
  const reward = r.reward && typeof r.reward === "object" ? (r.reward as Record<string, unknown>) : null;
  const answered = Array.isArray(you.answered) ? you.answered.filter((n): n is number => typeof n === "number") : [];
  return {
    kind: typeof r.kind === "string" ? r.kind : null,
    lobby_id: str(r.lobby_id),
    boss_name: str(r.boss_name, "The boss"),
    realm: str(r.realm),
    phase: str(r.phase, "lobby"),
    hp: num(r.hp),
    max_hp: num(r.max_hp, 100),
    players: Array.isArray(r.players)
      ? r.players.map((p) => {
          const o = (p ?? {}) as Record<string, unknown>;
          return { handle: str(o.handle, "Player"), damage: num(o.damage), you: o.you === true };
        })
      : [],
    max_players: num(r.max_players, 20),
    window_ends_at: str(r.window_ends_at),
    fight_seconds: num(r.fight_seconds, 45),
    seconds_left: num(r.seconds_left),
    damage_per_hit: num(r.damage_per_hit),
    questions: Array.isArray(r.questions)
      ? r.questions.map((q, i) => {
          const o = (q ?? {}) as Record<string, unknown>;
          return {
            id: str(o.id, String(i)),
            q: str(o.q),
            choices: Array.isArray(o.choices) ? o.choices.map((c) => String(c)) : [],
            clue: typeof o.clue === "string" ? o.clue : null,
          };
        })
      : [],
    reveal: reveal ? { correct: Array.isArray(reveal.correct) ? reveal.correct.map((n) => num(n, -1)) : [] } : null,
    reward: reward
      ? {
          xp: num(reward.xp),
          coins: num(reward.coins),
          faction_points: num(reward.faction_points),
          items: reward.items && typeof reward.items === "object" ? (reward.items as Record<string, number>) : {},
        }
      : null,
    you: { member: you.member === true, damage: num(you.damage), answered, answered_count: num(you.answered_count, answered.length) },
  };
}

export function raidIsOver(s: RaidState | null | undefined): boolean {
  return s?.phase === "won" || s?.phase === "lost";
}

// ---------- routes (/v1/roam/raids) ----------

export type RaidFix = { lat: number; lng: number; accuracy: number };

// Every raid write is idempotent on the server (a second join is the same
// membership, a second start the same fight, a second answer to a question is
// not accepted), so the client's one retry is safe on all of them.

/** Join the lobby of the boss you are standing at. The server judges reach. */
export async function raidJoin(client: GameClient, pointId: string, fix: RaidFix): Promise<RaidState> {
  const body = {
    device_key: client.deviceKey(),
    point_id: pointId,
    lat: fix.lat,
    lng: fix.lng,
    accuracy_m: Math.min(5000, Math.max(0, fix.accuracy)),
  };
  return normaliseRaidState(await client.retrying(() => client.request("POST", "v1/roam/raids/join", { body, signed: true })));
}

/** Any member starts the fight, once. */
export async function raidStart(client: GameClient, lobbyId: string): Promise<RaidState> {
  const body = { device_key: client.deviceKey(), lobby_id: lobbyId };
  return normaliseRaidState(await client.retrying(() => client.request("POST", "v1/roam/raids/start", { body, signed: true })));
}

/** The lobby as everyone sees it. Public and unsigned; the key only marks "you". */
export async function raidState(client: GameClient, lobbyId: string): Promise<RaidState> {
  const query = { lobby_id: lobbyId, device_key: client.deviceKey() };
  return normaliseRaidState(await client.retrying(() => client.request("GET", "v1/roam/raids/state", { query })));
}

/** One swing: a question and a choice, marked by the server. */
export async function raidAnswer(client: GameClient, lobbyId: string, question: number, choice: number): Promise<RaidAnswerResult> {
  const body = { device_key: client.deviceKey(), lobby_id: lobbyId, question, choice };
  const r = (await client.retrying(() => client.request("POST", "v1/roam/raids/answer", { body, signed: true }))) as Record<string, unknown>;
  return { accepted: r.accepted === true, hit: r.hit === true, damage: num(r.damage), state: normaliseRaidState(r.state) };
}

// ---------- look (RaidLook) ----------

/** Magenta-purple: no tier, realm or faction uses it, so a boss reads as a boss from across the map. */
export const RAID_COLOR = "#c221d6";

export function isRaidPoint(p: QuestPoint | null | undefined): boolean {
  return p?.source === "raid";
}

/** The map tint of a boss point, or null. */
export function raidTint(p: QuestPoint): string | null {
  return isRaidPoint(p) ? RAID_COLOR : null;
}

/** When the boss leaves the map (ms), from the point's extra. */
export function raidUntil(p: QuestPoint): number | null {
  return parseServerDate(p.extra?.raid_until);
}

const intOf = (s: string | undefined): number | null => (s !== undefined && /^-?\d+$/.test(s) ? Number(s) : null);

/** The boss's live health, when the server puts it on the point (duel raids). */
export function raidHp(p: QuestPoint): { left: number; max: number } | null {
  const e = p.extra ?? {};
  const left = intOf(e.raid_hp ?? e.hp_left);
  const max = intOf(e.raid_hp_max ?? e.hp_max);
  if (left === null || max === null || max <= 0) return null;
  return { left, max };
}

/** How many are already in the boss's lobby this hour. */
export function raidPlayerCount(p: QuestPoint): number | null {
  return intOf(p.extra?.raid_players);
}

export function minutesLeftText(end: number, now: number): string {
  const mins = Math.ceil((end - now) / 60000);
  return mins <= 1 ? "1 min left" : `${mins} min left`;
}

/** The point card's line: "BOSS RAID · 3 players · 12 min left". */
export function raidLineText(p: QuestPoint, now: number): string {
  const parts = ["BOSS RAID"];
  const n = raidPlayerCount(p);
  if (n !== null) parts.push(n === 1 ? "1 player" : `${n} players`);
  const end = raidUntil(p);
  if (end !== null) parts.push(end > now ? minutesLeftText(end, now) : "leaving now");
  return parts.join(" · ");
}

/** The banner's boss: the nearest raid point still out. `nearestFirst` is sorted already. */
export function nearestBoss(nearestFirst: QuestPoint[], now: number): QuestPoint | null {
  return (
    nearestFirst.find((p) => {
      if (!isRaidPoint(p)) return false;
      const end = raidUntil(p);
      return end === null || end > now;
    }) ?? null
  );
}

/** A boss is fought as a duel when the server says so (DuelModes.raid). */
export function raidPlaysAsDuel(p: QuestPoint, me: RoamMe | null | undefined): boolean {
  return isRaidPoint(p) && (p.challenge === "duel" || me?.features?.duel?.raid_mode === "duel");
}

// ---------- the raid screen's reading of a state ----------

/** The lobby's clock line. */
export function lobbyClockText(s: RaidState, now: number): string | null {
  const end = parseServerDate(s.window_ends_at);
  if (end === null) return null;
  return end > now ? `The boss leaves in ${minutesLeftText(end, now).replace(" left", "")}` : "The boss is leaving: start now!";
}

export function rulesText(s: RaidState): string {
  return `${RAID_QUESTIONS} questions · ${s.fight_seconds} seconds · each right answer hits for ${s.damage_per_hit}`;
}

/** Most damage first; ties keep the server's (join) order. */
export function crewByDamage(players: RaidPlayer[]): RaidPlayer[] {
  return players
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.damage - a.p.damage || a.i - b.i)
    .map((x) => x.p);
}

/** The key, question by question, once the server shows it. */
export function revealRows(s: RaidState): { q: string; answer: string | null }[] {
  if (!s.reveal || !s.questions.length) return [];
  return s.questions.map((q, i) => {
    const c = s.reveal?.correct[i];
    return { q: q.q, answer: c !== undefined && c >= 0 && c < q.choices.length ? q.choices[c] : null };
  });
}

/** Reward items, sorted by id, named from the bag's names when known. */
export function rewardItems(r: RaidReward, names: Record<string, string> = {}): { id: string; text: string }[] {
  return Object.entries(r.items ?? {})
    .filter(([, n]) => typeof n === "number" && n > 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, n]) => ({ id, text: `${n} × ${names[id] ?? id.charAt(0).toUpperCase() + id.slice(1)}` }));
}

// ---------- the session (RaidModel) ----------

export type RaidSnapshot = {
  state: RaidState | null;
  /** Why the raid can't go on (too far, boss gone, full...), in the server's words. */
  failure: string | null;
  /** A refused tap or a shaky line, shown without leaving the screen. */
  notice: string | null;
  /** A start is on its way. */
  busy: boolean;
  /** The last swing: true hit, false miss, null nothing to show. */
  lastHit: boolean | null;
  lastDamage: number;
  /** Counts accepted swings, so the hit/miss flash can re-key. */
  swings: number;
  /** When the fight ends by this phone's clock, rebased on every state, so a wrong clock still counts down right. */
  fightEndsAt: number | null;
  /** Questions answered here but not yet confirmed, so a double tap never swings twice. */
  pending: readonly number[];
};

const EMPTY: RaidSnapshot = {
  state: null,
  failure: null,
  notice: null,
  busy: false,
  lastHit: null,
  lastDamage: 0,
  swings: 0,
  fightEndsAt: null,
  pending: [],
};

export function answeredOf(snap: RaidSnapshot): Set<number> {
  return new Set([...(snap.state?.you.answered ?? []), ...snap.pending]);
}

/** The next question for this player, or null when all are in. */
export function currentQuestion(snap: RaidSnapshot): number | null {
  const s = snap.state;
  if (!s) return null;
  const done = answeredOf(snap);
  const i = s.questions.findIndex((_, n) => !done.has(n));
  return i < 0 ? null : i;
}

export function secondsLeft(snap: RaidSnapshot, now: number): number {
  if (snap.fightEndsAt === null) return 0;
  return Math.max(0, Math.ceil((snap.fightEndsAt - now) / 1000));
}

export type RaidSessionDeps = {
  client: GameClient;
  pointId: string;
  /** Where the player is now. */
  fix: () => RaidFix | null;
  now?: () => number;
  /** A one-shot timer; returns its cancel. */
  schedule?: (fn: () => void, ms: number) => () => void;
  /** iOS: once a second. */
  pollMs?: number;
  /** The fight just ended (seen live, not on joining a finished one). */
  onFinished?: (s: RaidState) => void;
  /** An accepted swing (for haptics). */
  onSwing?: (hit: boolean) => void;
};

/** Polls that may fail in a row before the screen says the line is shaky. */
const SHAKY_AFTER = 2;

/**
 * Join, then poll while the lobby or fight is on. A tiny store: `get()` is an
 * immutable snapshot, `subscribe` for useSyncExternalStore.
 */
export function createRaidSession(deps: RaidSessionDeps) {
  const now = deps.now ?? (() => Date.now());
  const schedule =
    deps.schedule ??
    ((fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms);
      return () => clearTimeout(t);
    });
  const pollMs = deps.pollMs ?? 1000;
  const listeners = new Set<() => void>();
  let snap: RaidSnapshot = EMPTY;
  let cancelTimer: (() => void) | null = null;
  let running = false;
  let paused = false;
  let joining = false;
  let failedPolls = 0;
  // Replies can cross: only a reply to a later request replaces the state.
  let issued = 0;
  let applied = 0;

  const set = (patch: Partial<RaidSnapshot>) => {
    snap = { ...snap, ...patch };
    listeners.forEach((l) => l());
  };

  const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

  /** Takes the server's state if it is the newest; true when it did. */
  const apply = (s: RaidState, seq: number, extra: Partial<RaidSnapshot> = {}): boolean => {
    // An older reply, or one that would take a finished raid back to an
    // unfinished one (a poll sent before the winning answer was locked in):
    // the server never un-finishes a raid, so neither does the screen.
    if (seq < applied || (snap.state && raidIsOver(snap.state) && !raidIsOver(s))) {
      if (Object.keys(extra).length) set(extra);
      return false;
    }
    applied = seq;
    const finished = !!snap.state && !raidIsOver(snap.state) && raidIsOver(s);
    set({ ...extra, state: s, fightEndsAt: s.phase === "fight" ? now() + s.seconds_left * 1000 : null });
    if (finished) deps.onFinished?.(s);
    return true;
  };

  const stopTimer = () => {
    cancelTimer?.();
    cancelTimer = null;
  };

  const loop = () => {
    stopTimer();
    if (!running || paused || !snap.state || raidIsOver(snap.state)) return;
    cancelTimer = schedule(async () => {
      cancelTimer = null;
      await session.refresh();
      loop();
    }, pollMs);
  };

  const session = {
    get: () => snap,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async join(): Promise<void> {
      if (joining) return;
      const here = deps.fix();
      if (!here) {
        set({ failure: "Waiting for your location." });
        return;
      }
      joining = true;
      set({ failure: null, notice: null });
      const seq = ++issued;
      try {
        apply(await raidJoin(deps.client, deps.pointId, here), seq);
      } catch (error) {
        set({ failure: message(error) });
      } finally {
        joining = false;
      }
    },

    /** Join (unless in already), then poll until it is over or stopped. */
    async run(): Promise<void> {
      running = true;
      if (!snap.state) await session.join();
      loop();
    },

    stop() {
      running = false;
      stopTimer();
    },

    /** Off screen: no polling. The server's clock runs on regardless. */
    pause() {
      paused = true;
      stopTimer();
    },

    resume() {
      if (!paused) return;
      paused = false;
      if (!running || !snap.state) return;
      void session.refresh().then(loop);
    },

    /** "Try again" after a failed join. */
    async retry(): Promise<void> {
      set({ failure: null });
      await session.run();
    },

    async refresh(): Promise<void> {
      const s = snap.state;
      if (!s) return;
      const seq = ++issued;
      try {
        const fresh = await raidState(deps.client, s.lobby_id);
        failedPolls = 0;
        apply(fresh, seq, { notice: null });
      } catch {
        // One dropped poll is not a failure: the next one a second later
        // usually lands. Say so only if it keeps happening.
        failedPolls += 1;
        if (failedPolls >= SHAKY_AFTER) set({ notice: "Connection is shaky…" });
      }
    },

    async start(): Promise<void> {
      const s = snap.state;
      if (!s || snap.busy) return;
      set({ busy: true, notice: null });
      const seq = ++issued;
      try {
        apply(await raidStart(deps.client, s.lobby_id), seq);
      } catch (error) {
        set({ notice: message(error) });
      } finally {
        set({ busy: false });
      }
    },

    async answer(question: number, choice: number): Promise<void> {
      const s = snap.state;
      if (!s || s.phase !== "fight" || answeredOf(snap).has(question)) return;
      set({ pending: [...snap.pending, question] });
      const seq = ++issued;
      try {
        const r = await raidAnswer(deps.client, s.lobby_id, question, choice);
        const flash = r.accepted ? { lastHit: r.hit, lastDamage: r.damage, swings: snap.swings + 1 } : {};
        apply(r.state, seq, flash);
        if (r.accepted) deps.onSwing?.(r.hit);
      } catch (error) {
        // The server never saw it: let the player try that question again.
        set({ pending: snap.pending.filter((q) => q !== question), notice: message(error) });
      }
    },
  };
  return session;
}

export type RaidSession = ReturnType<typeof createRaidSession>;

// ---------- a boss fought as a duel (raid_duel on) ----------

/** Start the boss fight: mode "raid", the boss point's id, where you stand. */
export async function raidDuelStart(
  client: GameClient,
  point: QuestPoint,
  fix: RaidFix | null,
  how: { fight3d?: boolean; fallback2d?: boolean } = {},
): Promise<DuelStart> {
  if (!fix) throw new GameError("http", "Waiting for your location.");
  const start = await client.duelStart({ mode: "raid", target: point.id, lat: fix.lat, lng: fix.lng, accuracy_m: fix.accuracy, ...how });
  for (const l of raidDuelListeners) {
    try {
      l(point, start);
    } catch {
      // A listener (the lock-screen clock) never breaks the fight.
    }
  }
  return start;
}

const raidDuelListeners = new Set<(point: QuestPoint, start: DuelStart) => void>();

/** Told of every boss fight that starts (components/game/liveTimers.ts puts its clock on the lock screen). */
export function onRaidDuelStarted(listener: (point: QuestPoint, start: DuelStart) => void): () => void {
  raidDuelListeners.add(listener);
  return () => {
    raidDuelListeners.delete(listener);
  };
}

export type RaidDuelInfo = {
  raid_id?: string | null;
  boss_name?: string | null;
  hp_max?: number | null;
  hp_left?: number | null;
  ends_at?: string | null;
  phase?: string | null;
  fighters?: number | null;
};

export type RaidDuelOutcome = {
  damage?: number | null;
  hp_left?: number | null;
  hp_max?: number | null;
  defeated?: boolean | null;
  reward?: { xp?: number | null; coins?: number | null; faction_points?: number | null } | null;
};

/** The raid block of a duel start: beside the setup, or inside it. */
export function raidDuelInfo(start: DuelStart): RaidDuelInfo | null {
  const top = (start as unknown as { raid?: RaidDuelInfo | null }).raid;
  const inner = (start.setup as { raid?: RaidDuelInfo | null } | undefined)?.raid;
  return top ?? inner ?? null;
}

export function raidDuelOutcome(o: DuelOutcome): RaidDuelOutcome | null {
  return (o as unknown as { raid?: RaidDuelOutcome | null }).raid ?? null;
}

/** The briefing's line for a boss fought as a duel. */
export function raidDuelBlurb(point: QuestPoint): string {
  const n = raidPlayerCount(point);
  const crew = n ? ` ${n === 1 ? "1 fighter has" : `${n} fighters have`} hit it this hour.` : "";
  return `One fight each. Every hit you land comes off the crew's shared pool; bring ${point.name} down before it leaves.${crew}`;
}

/** The reward screen's summary for a raid duel (Reward.tsx RewardSummary, field for field). */
export type RaidDuelReward = {
  pointName: string;
  realm: string;
  win: boolean;
  headline: string;
  xp: number;
  coins: number;
  factionPoints: number;
  lines: { label: string; xp: number; coins: number; factionPoints: number }[];
  before: RoamStanding | null;
  after: RoamStanding | null;
  leveledUp: boolean;
  rankUp: boolean;
  dailiesCompleted: string[];
  extras: RoamExtra[];
  note: string | null;
};

/**
 * What a raid duel paid and did. The pay is the ledger's (only once the boss
 * falls or the hour ends); the damage and HP are the server's.
 */
export function raidDuelReward(
  o: DuelOutcome,
  point: QuestPoint,
  before: RoamStanding | null,
  after: RoamStanding | null,
): RaidDuelReward {
  const raid = raidDuelOutcome(o);
  const pay = o.reward ?? raid?.reward ?? null;
  const held = o.status === "held";
  const defeated = raid?.defeated === true;
  const boss = point.name;
  let note: string;
  if (held) note = HELD_LINE;  // our own words: the server's "being checked" read as an accusation
  else {
    const said = defeated
      ? `${boss} is down. Everyone who landed a hit is paid.`
      : `Every hit you landed counts toward the crew's. Bring ${boss} down before it leaves.`;
    const hp = raid?.hp_max ? ` Boss HP ${Math.max(0, raid.hp_left ?? 0)} / ${raid.hp_max}.` : "";
    note = `You dealt ${raid?.damage ?? 0} damage.${hp} ${said}`;
  }
  return {
    pointName: boss,
    realm: point.realm,
    win: defeated || o.status === "won",
    headline: held ? "Checking the score" : defeated ? "Boss down!" : o.status === "won" ? "Knocked out!" : "The boss stands",
    xp: pay?.xp ?? 0,
    // CosCoins are bought, not earned: like iOS and rewardFromDuel, never shown as pay.
    coins: 0,
    factionPoints: pay?.faction_points ?? 0,
    lines: [],
    before,
    after,
    leveledUp: !!before && !!after && after.level > before.level,
    rankUp: !!before && !!after && after.rank !== before.rank,
    dailiesCompleted: [],
    extras: [],
    note,
  };
}
