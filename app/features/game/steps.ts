// Walking rewards: this week's distance, paid at 5, 25 and 50 km
// (costquest-ios Features/StepsFeature.swift StepsModel; server
// app/roam_steps.py). The TypeScript side of the feature, pure and
// Node-tested (features/game/__tests__/steps.test.ts); the phone glue is
// stepsDevice.ts and the card is components/game/StepsCard.tsx.
//
// What the server trusts: a week's total in metres for this UTC week or last
// week, signed. It keeps the largest figure it has believed, caps a week at
// 100 km, and refuses a rise faster than 20 km/h since the last figure it
// took ("That's faster than walking."). Milestones pay once per week. So, as
// on iOS, the phone reports the week's TOTAL (idempotent), never a delta.
//
// Where the figure comes from differs. iOS asks CMPedometer for the distance
// since Monday 00:00 UTC (Apple's own stride model): a "distance" answer from
// stepsDevice.ts, reported as it is. Android has no history
// to ask: the hardware step counter only says how many steps since boot. So
// this file keeps a ledger: the last reading, and the steps credited to each
// week from the difference between readings. Rules:
//   - Between two readings in the same boot, the steps between them are
//     exact. Elapsed time (not the wall clock) dates the gap.
//   - A reboot (the counter or the uptime went down) loses what was walked
//     before it; everything counted since the new boot is new.
//   - A boot time that moved without either going down is a clock change or
//     a reboot nobody can tell apart: only the counter's rise is credited, so
//     changing the clock never counts a walk twice.
//   - Android cannot say when inside a gap the steps were taken. A gap that
//     crosses Monday 00:00 UTC is shared between the weeks by time. The total
//     never exceeds what the phone counted (each share rounds down), and
//     weeks older than the server takes are dropped. The first reading on a
//     phone counts from boot the same way. Reading on every game open keeps
//     gaps short (noteSteps in stepsDevice.ts).
//   - Steps become metres at STRIDE_M a step (see there), rounded down.
import type { GameClient } from "./client.ts";

// ---------- wire (StepsStatus in StepsFeature.swift) ----------

export type StepsMilestone = { km: number; coins: number; xp: number; items: Record<string, number> };
export type StepsRewards = { xp: number; coins: number; items: Record<string, number> };
export type StepsPaid = { km: number; rewards: StepsRewards };

export type StepsStatus = {
  week_start: string;
  meters: number;
  km?: number;
  next_milestone_km: number | null;
  claimed: number[];
  milestones: StepsMilestone[];
  /** Only on a report: the milestones this report paid. */
  newly?: StepsPaid[];
};

/** The server's status with every optional part made safe to draw. */
export function normaliseStatus(raw: Partial<StepsStatus> | null | undefined): StepsStatus {
  const r = raw ?? {};
  return {
    week_start: typeof r.week_start === "string" ? r.week_start : "",
    meters: Math.max(0, Number(r.meters) || 0),
    km: typeof r.km === "number" ? r.km : undefined,
    next_milestone_km: typeof r.next_milestone_km === "number" ? r.next_milestone_km : null,
    claimed: Array.isArray(r.claimed) ? r.claimed.filter((k) => typeof k === "number") : [],
    milestones: Array.isArray(r.milestones)
      ? r.milestones.map((m) => ({ km: Number(m.km) || 0, coins: Number(m.coins) || 0, xp: Number(m.xp) || 0, items: m.items ?? {} }))
      : [],
    newly: Array.isArray(r.newly)
      ? r.newly.map((n) => ({ km: Number(n.km) || 0, rewards: { xp: Number(n.rewards?.xp) || 0, coins: Number(n.rewards?.coins) || 0, items: n.rewards?.items ?? {} } }))
      : undefined,
  };
}

// ---------- calls (GameClient.roamGet / roamPost on iOS) ----------

/** This week's distance and milestones. Read-only, so unsigned, like the bag. */
export async function stepsStatus(client: GameClient): Promise<StepsStatus> {
  const key = client.deviceKey();
  const got = await client.retrying(() => client.request<StepsStatus>("GET", "v1/roam/steps", { query: { device_key: key } }));
  return normaliseStatus(got);
}

/**
 * The week's total so far. Signed. Safe to repeat (the server keeps the
 * largest figure and pays each milestone once), so a lost reply is retried.
 * A refusal ("That's faster than walking.", "That week is over.") is the
 * server's answer and is not retried.
 */
export async function reportSteps(client: GameClient, weekStart: string, meters: number): Promise<StepsStatus> {
  const body = { device_key: client.deviceKey(), week_start: weekStart, meters: Math.max(0, Math.floor(meters)) };
  const got = await client.retrying(() => client.request<StepsStatus>("POST", "v1/roam/steps/report", { body, signed: true }));
  return normaliseStatus(got);
}

// ---------- dates (StepsModel.utcMonday / isoDay) ----------

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** Monday 00:00 UTC of the week holding `ms`: the server's week, whatever the phone's time zone. */
export function utcMonday(ms: number): number {
  const day = Math.floor(ms / DAY_MS) * DAY_MS;
  // getUTCDay: Sunday = 0, Monday = 1.
  const back = (new Date(day).getUTCDay() + 6) % 7;
  return day - back * DAY_MS;
}

export function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// ---------- the step ledger ----------

/**
 * Metres a step. The server wants metres and iOS sends CMPedometer's
 * distance, which Apple calibrates per person with GPS; Android's counter
 * gives steps only, and the game knows nobody's height. 0.7 m is a
 * deliberately short adult walking step (typical adults measure about
 * 0.7 to 0.8 m), so the estimate errs low: 5 km is about 7,150 steps.
 */
export const STRIDE_M = 0.7;

export function metersFor(steps: number): number {
  return Math.max(0, Math.floor(Math.max(0, steps) * STRIDE_M));
}

/** One read of the hardware counter (StepCounter.kt). */
export type CounterReading = { steps: number; elapsedRealtimeMs: number; wallClockMs: number };

export type StepLedger = {
  v: 1;
  /** The last reading, with the boot time it implied. */
  last: { steps: number; elapsedMs: number; wallMs: number; bootMs: number } | null;
  /** Steps credited per UTC week (key: its Monday, YYYY-MM-DD). Only this week and last are kept. */
  weeks: Record<string, number>;
  /** Metres the server has accepted per week, so last week is only sent when it grew. */
  sent: Record<string, number>;
  /** The permission prompt has been shown once by the card opening by itself. */
  asked?: boolean;
};

export const LEDGER_KEY = "cq.game.steps.ledger";

/** A boot time that moves less than this is the clocks' own jitter. */
const BOOT_SLACK_MS = 5 * 60_000;

export function emptyLedger(): StepLedger {
  return { v: 1, last: null, weeks: {}, sent: {} };
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

function numberMap(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k) && finite(v) && v >= 0) out[k] = Math.floor(v);
  }
  return out;
}

/** The saved ledger, or an empty one when there is none or it is unreadable. */
export function parseLedger(text: string | null | undefined): StepLedger {
  if (!text) return emptyLedger();
  try {
    const raw = JSON.parse(text) as Partial<StepLedger>;
    if (!raw || raw.v !== 1) return emptyLedger();
    const l = raw.last;
    const last =
      l && finite(l.steps) && finite(l.elapsedMs) && finite(l.wallMs) && finite(l.bootMs) && l.steps >= 0 && l.elapsedMs >= 0
        ? { steps: l.steps, elapsedMs: l.elapsedMs, wallMs: l.wallMs, bootMs: l.bootMs }
        : null;
    return { v: 1, last, weeks: numberMap(raw.weeks), sent: numberMap(raw.sent), asked: raw.asked === true };
  } catch {
    return emptyLedger();
  }
}

export function isValidReading(r: Partial<CounterReading> | null | undefined): r is CounterReading {
  return !!r && finite(r.steps) && r.steps >= 0 && finite(r.elapsedRealtimeMs) && r.elapsedRealtimeMs >= 0 && finite(r.wallClockMs);
}

/**
 * `steps` taken somewhere in [startMs, endMs], shared between UTC weeks by
 * time. Each share rounds down, so the shares never add up to more than
 * `steps`. An empty or backwards gap goes wholly to the week of `endMs`.
 */
export function splitByWeek(startMs: number, endMs: number, steps: number): Record<string, number> {
  const whole = Math.max(0, Math.floor(steps));
  if (whole === 0) return {};
  if (!(endMs > startMs)) return { [isoDay(utcMonday(endMs))]: whole };
  const out: Record<string, number> = {};
  const span = endMs - startMs;
  for (let monday = utcMonday(startMs); monday < endMs; monday += WEEK_MS) {
    const from = Math.max(startMs, monday);
    const to = Math.min(endMs, monday + WEEK_MS);
    const share = Math.floor((whole * (to - from)) / span);
    if (share > 0) out[isoDay(monday)] = share;
  }
  return out;
}

export type Advance = {
  ledger: StepLedger;
  /** Steps this reading added, per week (only the weeks the server still takes). */
  added: Record<string, number>;
  /** How this reading was read against the last one. */
  kind: "first" | "same-boot" | "reboot" | "boot-moved";
};

/**
 * Take a new reading into the ledger. Pure: returns a new ledger. Weeks
 * before last week are dropped (the server refuses them).
 */
export function advance(ledger: StepLedger, r: CounterReading): Advance {
  const nowWall = r.wallClockMs;
  const boot = r.wallClockMs - r.elapsedRealtimeMs;
  const last = ledger.last;
  let kind: Advance["kind"];
  let delta: number;
  let start: number;
  if (!last) {
    // Everything the counter holds was walked since it booted.
    kind = "first";
    delta = r.steps;
    start = boot;
  } else if (r.steps < last.steps || r.elapsedRealtimeMs < last.elapsedMs) {
    // The counter or the uptime went down: the phone restarted. What was
    // walked between the last reading and the restart is gone.
    kind = "reboot";
    delta = r.steps;
    start = boot;
  } else if (boot - last.bootMs > BOOT_SLACK_MS && boot >= last.wallMs - BOOT_SLACK_MS) {
    // Booted after the last reading, by the wall clock, yet nothing went
    // down: a long reboot, or the clock set forward. Credit only the rise.
    kind = "boot-moved";
    delta = r.steps - last.steps;
    start = Math.max(boot, nowWall - (r.elapsedRealtimeMs - last.elapsedMs));
  } else {
    kind = "same-boot";
    delta = r.steps - last.steps;
    // Dated by elapsed time, anchored to now: a clock change since the last
    // reading does not move the gap.
    start = nowWall - (r.elapsedRealtimeMs - last.elapsedMs);
  }
  const oldest = utcMonday(nowWall) - WEEK_MS;
  const split = splitByWeek(start, nowWall, delta);
  const added: Record<string, number> = {};
  const weeks: Record<string, number> = {};
  for (const [week, n] of Object.entries(ledger.weeks)) if (Date.parse(`${week}T00:00:00Z`) >= oldest) weeks[week] = n;
  for (const [week, n] of Object.entries(split)) {
    if (Date.parse(`${week}T00:00:00Z`) < oldest) continue;
    added[week] = n;
    weeks[week] = (weeks[week] ?? 0) + n;
  }
  const sent: Record<string, number> = {};
  for (const [week, m] of Object.entries(ledger.sent)) if (Date.parse(`${week}T00:00:00Z`) >= oldest) sent[week] = m;
  return {
    ledger: {
      ...ledger,
      last: { steps: r.steps, elapsedMs: r.elapsedRealtimeMs, wallMs: nowWall, bootMs: boot },
      weeks,
      sent,
    },
    added,
    kind,
  };
}

export type StepsReport = { week_start: string; meters: number };

/**
 * What to send now: last week first, only when it grew past what the server
 * accepted (a walk that ran over Sunday midnight), then always this week
 * (as iOS: the status comes back with it, and a report of what the server
 * already has is harmless).
 */
export function reportsDue(ledger: StepLedger, nowMs: number): StepsReport[] {
  const thisWeek = isoDay(utcMonday(nowMs));
  const lastWeek = isoDay(utcMonday(nowMs) - WEEK_MS);
  const out: StepsReport[] = [];
  const lastMeters = metersFor(ledger.weeks[lastWeek] ?? 0);
  if (lastMeters > (ledger.sent[lastWeek] ?? 0)) out.push({ week_start: lastWeek, meters: lastMeters });
  out.push({ week_start: thisWeek, meters: metersFor(ledger.weeks[thisWeek] ?? 0) });
  return out;
}

/** The server took a week's figure (its status.meters is what it now believes). */
export function markSent(ledger: StepLedger, week: string, meters: number): StepLedger {
  return { ...ledger, sent: { ...ledger.sent, [week]: Math.max(ledger.sent[week] ?? 0, Math.floor(meters)) } };
}

// ---------- one update (StepsModel.update) ----------

/** What the phone's counter said, or why it could not say. */
export type SensorAnswer =
  | { kind: "reading"; reading: CounterReading }
  /** iOS: CMPedometer's own distance since this UTC week's Monday (no ledger needed: iOS keeps the history). */
  | { kind: "distance"; meters: number }
  /** iOS: the Motion & Fitness question has not been asked yet and this read was not allowed to ask. Not a refusal: no note. */
  | { kind: "undetermined" }
  | { kind: "unavailable" }
  | { kind: "denied" }
  | { kind: "error" };

export type StepsView = {
  status: StepsStatus | null;
  /** Milestones the last update paid (kept until a later update pays more). */
  newly: StepsPaid[];
  note: string | null;
  noteIsProblem: boolean;
  motionDenied: boolean;
  /** This update paid something: XP and the bag moved (refresh `me`, play the fanfare). */
  justPaid: boolean;
};

export const EMPTY_STEPS_VIEW: StepsView = { status: null, newly: [], note: null, noteIsProblem: false, motionDenied: false, justPaid: false };

export const STEPS_NOTES = {
  unavailable: "This phone can't count walking distance.",
  /** Android's permission is called Physical activity. */
  denied: "Allow Physical activity in Settings to count your walks.",
  /** iOS (StepsFeature.swift deny()): the permission is Motion & Fitness. */
  deniedIos: "Allow Motion & Fitness in Settings to count your walks.",
  error: "Couldn't read your steps just now.",
} as const;

export type StepsPlatform = "ios" | "android";

/** The permission as the phone's Settings calls it. */
export function permissionName(platform: StepsPlatform | undefined): string {
  return platform === "ios" ? "Motion & Fitness" : "Physical activity";
}

/**
 * Metres from a CMPedometer answer. A phone that can count steps but not
 * distance answers meters 0 with its steps: those become metres at STRIDE_M.
 */
export function pedometerMeters(meters: unknown, steps: unknown): number | null {
  const m = typeof meters === "number" && Number.isFinite(meters) ? meters : NaN;
  const n = typeof steps === "number" && Number.isFinite(steps) ? steps : 0;
  if (Number.isNaN(m) || m < 0) return null;
  return m > 0 ? m : metersFor(n);
}

export type StepsDeps = {
  client: GameClient;
  /** Read the counter (asking for the permission when `ask`). */
  sense: (ask: boolean) => Promise<SensorAnswer>;
  load: () => Promise<string | null>;
  save: (text: string) => Promise<void>;
  now: () => number;
  /** Which phone: only the wording of the denied note (and Settings label) differs. Default Android. */
  platform?: StepsPlatform;
};

const messageOf = (error: unknown) => (error instanceof Error && error.message ? error.message : "Something went wrong.");

/**
 * Read the counter, tell the server, return what to show. When the phone
 * cannot count (no sensor, no permission) the card still shows the server's
 * figure, so a denied permission is a note, not a dead card.
 * `ask`: the player pressed the button (or this phone was never asked).
 * Never throws.
 */
export async function updateSteps(deps: StepsDeps, previous: StepsView, ask: boolean): Promise<StepsView> {
  const view: StepsView = { status: previous.status, newly: previous.newly, note: null, noteIsProblem: false, motionDenied: false, justPaid: false };
  try {
    deps.client.deviceKey();
    let ledger = parseLedger(await deps.load());
    const firstAsk = !ledger.asked;
    const answer = await deps.sense(ask || firstAsk);
    if (firstAsk) {
      ledger = { ...ledger, asked: true };
      await deps.save(JSON.stringify(ledger));
    }
    if (answer.kind === "distance") {
      // As StepsModel.update on iOS: this week's total, straight from the pedometer.
      const thisWeek = isoDay(utcMonday(deps.now()));
      const got = await reportSteps(deps.client, thisWeek, answer.meters);
      if (got.newly?.length) {
        view.newly = got.newly;
        view.justPaid = true;
      }
      view.status = got;
      return view;
    }
    if (answer.kind !== "reading") {
      if (answer.kind === "undetermined") {
        // Never asked, and this read could not ask: show the server's figure quietly (no red note, no Settings button).
      } else if (answer.kind === "denied") {
        view.note = deps.platform === "ios" ? STEPS_NOTES.deniedIos : STEPS_NOTES.denied;
        view.noteIsProblem = true;
        view.motionDenied = true;
      } else {
        view.note = STEPS_NOTES[answer.kind];
        view.noteIsProblem = answer.kind !== "unavailable";
      }
      view.status = await stepsStatus(deps.client);
      return view;
    }
    ledger = advance(ledger, answer.reading).ledger;
    await deps.save(JSON.stringify(ledger));
    const now = deps.now();
    const thisWeek = isoDay(utcMonday(now));
    const fresh: StepsPaid[] = [];
    try {
      for (const report of reportsDue(ledger, now)) {
        try {
          const got = await reportSteps(deps.client, report.week_start, report.meters);
          ledger = markSent(ledger, report.week_start, got.meters);
          fresh.push(...(got.newly ?? []));
          if (report.week_start === thisWeek) view.status = got;
        } catch (error) {
          if (report.week_start === thisWeek) throw error;
          // Last week's refusal is shown, and this week still reports.
          view.note = `Last week: ${messageOf(error)}`;
          view.noteIsProblem = true;
        }
      }
    } finally {
      // Paid milestones stay paid on the server; keep what it took either way.
      if (fresh.length) {
        view.newly = fresh;
        view.justPaid = true;
      }
      await deps.save(JSON.stringify(ledger));
    }
    return view;
  } catch (error) {
    view.note = messageOf(error);
    view.noteIsProblem = true;
    return view;
  }
}

/**
 * Take a reading into the ledger without telling anyone (the game opening,
 * coming back to the front). Short gaps are what make the weekly split
 * exact. Never asks for the permission, never throws.
 */
export async function noteSteps(deps: Pick<StepsDeps, "sense" | "load" | "save">): Promise<void> {
  try {
    const answer = await deps.sense(false);
    if (answer.kind !== "reading") return;
    const ledger = advance(parseLedger(await deps.load()), answer.reading).ledger;
    await deps.save(JSON.stringify(ledger));
  } catch {
    // A missed reading only makes the next gap longer.
  }
}

// ---------- drawing helpers ----------

/** "3.4": one decimal, as StepsModel.km. */
export function km(meters: number): string {
  return (Math.max(0, meters) / 1000).toFixed(1);
}

export const ITEM_NAMES: Record<string, string> = { fifty: "50/50", time: "Extra time", retry: "Second chance" };

/** "+150 XP, 1 × Second chance". CosCoins are bought, not earned: a milestone never shows coins. */
export function describeRewards(r: { xp: number; items: Record<string, number> }, short = false): string {
  const parts: string[] = [];
  if (r.xp > 0) parts.push(`+${r.xp} XP`);
  for (const item of Object.keys(r.items ?? {}).sort()) {
    const n = r.items[item];
    if (!(n > 0)) continue;
    const name = ITEM_NAMES[item] ?? item;
    parts.push(short ? `${n} ${name}` : `${n} × ${name}`);
  }
  return parts.join(short ? "\n" : ", ");
}

export type MilestoneState = "done" | "next" | "locked";

export function milestoneState(s: StepsStatus, kmMark: number): MilestoneState {
  return s.claimed.includes(kmMark) ? "done" : kmMark === s.next_milestone_km ? "next" : "locked";
}

/** The bar towards the next milestone, and its line under it. */
export function progressTo(s: StepsStatus): { value: number; line: string; allDone: boolean } {
  const next = s.next_milestone_km;
  if (next == null) return { value: 1, line: "Every milestone done this week!", allDone: true };
  const from = Math.max(0, ...s.milestones.map((m) => m.km).filter((k) => k < next));
  const span = Math.max(1, next - from) * 1000;
  return {
    value: Math.max(0, Math.min(1, (s.meters - from * 1000) / span)),
    line: `${km(Math.max(0, next * 1000 - s.meters))} km to ${next} km`,
    allDone: false,
  };
}
