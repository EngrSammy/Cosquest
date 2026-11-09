// Quest Run and raid clocks on the lock screen (iOS Live Activity, Dynamic
// Island) and in the notification shade (Android ongoing notification with a
// chronometer). Phase 1 of the phone-hardware plan (cosquest-review
// phone-hardware-design-20261101.md, 2.6).
//
// The native halves only draw (ios/Embed/LiveTimers.swift + the widget
// extension, android LiveTimers.kt); this decides what they show. Each clock
// runs off its end date, so it keeps counting with the app closed; while the
// app runs, the score, the boss's HP and the crew size are pushed as they
// change, throttled. No APNs push in v1: the server stays the clock and the
// judge, this is display only.
//
// One clock per kind. A different run or raid replaces the old one; a finished
// one shows its result for a couple of minutes; leaving ends it at once.
//
// Pure: the native module, the clock and the timers are injected
// (features/game/__tests__/liveTimer.test.ts). The app's glue is
// components/game/liveTimers.ts.
import type { RunState } from "./run.ts";
import type { QuestPoint } from "./wire.ts";
import { parseServerDate } from "./wire.ts";

export type LiveTimerKind = "run" | "raid";

/** What the clock shows besides the time (the native record's fields). */
export type LiveTimerState = {
  line: string;
  hpPercent?: number | null;
  fighters?: number | null;
  finished?: boolean;
  headline?: string | null;
};

/** One clock: what it is about (key), its words and its end. */
export type LiveTimerSpec = {
  kind: LiveTimerKind;
  /** The run id or the raid boss's point id: a new key is a new clock. */
  key: string;
  title: string;
  subtitle: string;
  /** Where a tap goes. */
  link: string;
  /** ms since the epoch. */
  endsAt: number;
  state: LiveTimerState;
};

/** The platform module's four functions (modules/costquest-game/src). */
export type LiveTimerNative = {
  supported(): boolean;
  start(kind: LiveTimerKind, title: string, subtitle: string, link: string, endsAtMs: number, state: LiveTimerState): Promise<string | null>;
  update(id: string, state: LiveTimerState, endsAtMs: number | null): Promise<boolean>;
  /** id, kind, or "all"; with a final state the result lingers, without it goes now. */
  end(id: string, final: LiveTimerState | null): Promise<void>;
};

export const PLAY_LINK = "cosquest://play";
/** Pushes while the app runs, at most this often per clock (the last one always lands). */
export const UPDATE_EVERY_MS = 4_000;
/** An end date that moved less than this is the same end (server vs phone clock jitter). */
export const END_SLACK_MS = 2_000;

// ---------- what a run shows ----------

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

/** "420 pts · 4 of 10 points" */
export function runLine(run: Pick<RunState, "score" | "points">): string {
  const done = run.points.filter((p) => p.done).length;
  return `${plural(run.score, "pt", "pts")} · ${done} of ${run.points.length} points`;
}

/**
 * The run's clock, or null when there is none. `localEnd` is runModel's
 * deadline on this phone's clock (the server's seconds left); the server's
 * ends_at is the fallback.
 */
export function runSpec(run: RunState | null | undefined, localEnd: number | null): LiveTimerSpec | null {
  if (!run || run.finished) return null;
  const endsAt = localEnd ?? parseServerDate(run.ends_at);
  if (endsAt === null) return null;
  const pocket = run.mode === "pocket";
  return {
    kind: "run",
    key: run.run_id,
    title: pocket ? "Pocket Run" : "Quest Run",
    subtitle: pocket ? "Pocket run · anywhere" : "Daily run",
    link: PLAY_LINK,
    endsAt,
    state: { line: runLine(run) },
  };
}

/** The run's last word: "Run over · 420 pts". */
export function runFinal(run: Pick<RunState, "score" | "points">): LiveTimerState {
  return { line: runLine(run), finished: true, headline: `Run over · ${plural(run.score, "pt", "pts")}` };
}

// ---------- what a raid shows ----------

/** A boss this player fought: tracked until it leaves or falls. */
export type TrackedRaid = {
  pointId: string;
  name: string;
  place?: string | null;
  endsAt: number;
  hpLeft?: number | null;
  hpMax?: number | null;
  fighters?: number | null;
};

const intOf = (s: string | null | undefined): number | null => (s != null && /^-?\d+$/.test(s) ? Number(s) : null);

/** The boss's HP left, 0..100 (rounded up: a boss on 0.4% is not shown dead). */
export function hpPercent(left: number | null | undefined, max: number | null | undefined): number | null {
  if (left == null || max == null || max <= 0) return null;
  return Math.max(0, Math.min(100, Math.ceil((Math.max(0, left) / max) * 100)));
}

/**
 * The raid to track from a duel start's raid block (roam_duel_modes raid) and
 * the boss point; null when neither says when the boss leaves.
 */
export function trackRaid(
  point: Pick<QuestPoint, "id" | "name" | "extra">,
  info: { boss_name?: string | null; hp_max?: number | null; hp_left?: number | null; ends_at?: string | null; fighters?: number | null } | null,
): TrackedRaid | null {
  const e = point.extra ?? {};
  const endsAt = parseServerDate(info?.ends_at) ?? parseServerDate(e.raid_until);
  if (endsAt === null) return null;
  return {
    pointId: point.id,
    name: info?.boss_name || e.guardian || point.name,
    place: point.name,
    endsAt,
    hpLeft: info?.hp_left ?? intOf(e.raid_hp ?? e.hp_left),
    hpMax: info?.hp_max ?? intOf(e.raid_hp_max ?? e.hp_max),
    fighters: info?.fighters ?? intOf(e.raid_players),
  };
}

/** The tracked raid with what the map now says about its boss point (HP, crew, leaving time). */
export function refreshRaid(t: TrackedRaid, point: Pick<QuestPoint, "id" | "extra"> | null | undefined): TrackedRaid {
  if (!point || point.id !== t.pointId) return t;
  const e = point.extra ?? {};
  const left = intOf(e.raid_hp ?? e.hp_left);
  const max = intOf(e.raid_hp_max ?? e.hp_max);
  const crew = intOf(e.raid_players);
  const until = parseServerDate(e.raid_until);
  return {
    ...t,
    hpLeft: left ?? t.hpLeft,
    hpMax: max ?? t.hpMax,
    fighters: crew ?? t.fighters,
    endsAt: until ?? t.endsAt,
  };
}

export function raidDown(t: TrackedRaid): boolean {
  return t.hpLeft != null && t.hpLeft <= 0;
}

/** The raid's clock, or null once it is over (the boss left or fell). */
export function raidSpec(t: TrackedRaid | null | undefined, now: number): LiveTimerSpec | null {
  if (!t || raidDown(t) || t.endsAt <= now) return null;
  const hp = hpPercent(t.hpLeft, t.hpMax);
  return {
    kind: "raid",
    key: t.pointId,
    title: t.name,
    subtitle: t.place && t.place !== t.name ? `Boss raid · ${t.place}` : "Boss raid",
    link: `${PLAY_LINK}?raid=${encodeURIComponent(t.pointId)}`,
    endsAt: t.endsAt,
    state: { line: hp === null ? "Boss raid" : `Boss ${hp}% HP`, hpPercent: hp, fighters: t.fighters ?? null },
  };
}

/** The raid's last word: down, or gone. */
export function raidFinal(t: TrackedRaid): LiveTimerState {
  const down = raidDown(t);
  return {
    line: down ? "The crew brought it down" : "It left before it fell",
    hpPercent: hpPercent(t.hpLeft, t.hpMax),
    fighters: t.fighters ?? null,
    finished: true,
    headline: down ? "Boss down!" : "The boss got away",
  };
}

// ---------- the controller ----------

type Shown = { key: string; id: string | null; endsAt: number; state: LiveTimerState; sentAt: number };

const sameState = (a: LiveTimerState, b: LiveTimerState) =>
  a.line === b.line &&
  (a.hpPercent ?? null) === (b.hpPercent ?? null) &&
  (a.fighters ?? null) === (b.fighters ?? null) &&
  !!a.finished === !!b.finished &&
  (a.headline ?? null) === (b.headline ?? null);

export type LiveTimersDeps = {
  native: LiveTimerNative | null;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
  /** Android 13+: ask for notifications the first time a clock starts. True when allowed. */
  askPermission?: () => Promise<boolean>;
  log?: (msg: string) => void;
};

export function createLiveTimers(deps: LiveTimersDeps) {
  const now = deps.now ?? (() => Date.now());
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const log = deps.log ?? (() => {});
  const shown: Partial<Record<LiveTimerKind, Shown>> = {};
  const pending: Partial<Record<LiveTimerKind, { timer: unknown; spec: LiveTimerSpec }>> = {};
  const queue: Record<LiveTimerKind, Promise<void>> = { run: Promise.resolve(), raid: Promise.resolve() };
  let asked: Promise<boolean> | null = null;
  let cleared = false;

  /** Native calls for one kind run one after another: a start is never overtaken by its update. */
  const serial = (kind: LiveTimerKind, fn: () => Promise<void>) => {
    queue[kind] = queue[kind].then(fn).catch((e) => log(`[liveTimer] ${kind}: ${String(e)}`));
    return queue[kind];
  };

  const native = deps.native;
  const usable = () => {
    if (!native) return false;
    try {
      return native.supported();
    } catch {
      return false;
    }
  };

  const allowed = () => {
    if (!deps.askPermission) return Promise.resolve(true);
    asked ??= deps.askPermission().catch(() => false);
    return asked;
  };

  function cancelPending(kind: LiveTimerKind) {
    const p = pending[kind];
    if (p) clearTimer(p.timer);
    delete pending[kind];
  }

  function send(spec: LiveTimerSpec) {
    const cur = shown[spec.kind];
    if (!cur || !native) return;
    cur.state = spec.state;
    cur.endsAt = spec.endsAt;
    cur.sentAt = now();
    const id = cur.id;
    if (!id) return;
    void serial(spec.kind, async () => {
      await native.update(id, spec.state, spec.endsAt);
    });
  }

  const api = {
    /**
     * The clock of this kind should be `spec` (null: none). `final` is shown
     * when a clock ends because its run or raid is over (not when left).
     */
    sync(kind: LiveTimerKind, spec: LiveTimerSpec | null, final: LiveTimerState | null = null) {
      if (!native) return;
      const cur = shown[kind];
      if (!spec) {
        if (!cur) return;
        cancelPending(kind);
        delete shown[kind];
        const id = cur.id;
        void serial(kind, async () => {
          if (id) await native.end(id, final);
        });
        return;
      }
      if (!cur || cur.key !== spec.key) {
        cancelPending(kind);
        const old = cur?.id ?? null;
        const next: Shown = { key: spec.key, id: null, endsAt: spec.endsAt, state: spec.state, sentAt: now() };
        shown[kind] = next;
        void serial(kind, async () => {
          if (old) await native.end(old, null);
          if (!usable() || !(await allowed())) return;
          // The phone may have moved on while this waited its turn.
          if (shown[kind] !== next) return;
          next.id = await native.start(kind, spec.title, spec.subtitle, spec.link, next.endsAt, next.state);
          if (shown[kind] !== next && next.id) await native.end(next.id, null);
        });
        return;
      }
      const moved = Math.abs(cur.endsAt - spec.endsAt) > END_SLACK_MS;
      if (!moved && sameState(cur.state, spec.state)) {
        cancelPending(kind);
        return;
      }
      const wait = cur.sentAt + UPDATE_EVERY_MS - now();
      if (moved || wait <= 0) {
        cancelPending(kind);
        send(spec);
        return;
      }
      // Too soon: hold the latest and send it when the gap is up.
      const p = pending[kind];
      if (p) {
        p.spec = spec;
        return;
      }
      const entry = {
        spec,
        timer: setTimer(() => {
          const e = pending[kind];
          delete pending[kind];
          if (e && shown[kind]?.key === e.spec.key) send(e.spec);
        }, wait),
      };
      pending[kind] = entry;
    },

    /**
     * Once at launch: clocks a killed app left on the lock screen go (a live
     * run or raid starts its own again straight after).
     */
    clearLeftovers() {
      if (!native || cleared) return;
      cleared = true;
      void serial("run", () => native.end("run", null));
      void serial("raid", () => native.end("raid", null));
    },

    /** Everything off now (sign-out, a different player). */
    endAll() {
      (["run", "raid"] as const).forEach((k) => api.sync(k, null));
    },

    /** For tests: what each kind shows. */
    peek: () => ({ run: shown.run ? { ...shown.run } : null, raid: shown.raid ? { ...shown.raid } : null }),
    /** For tests: wait for the native calls queued so far. */
    settled: () => Promise.all([queue.run, queue.raid]).then(() => undefined),
  };
  return api;
}

export type LiveTimers = ReturnType<typeof createLiveTimers>;
