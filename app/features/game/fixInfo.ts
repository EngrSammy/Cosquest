// What the server is told about the phone's fix, beside its lat/lng (sensors
// audit R3, server branch anticheat-location, app/anticheat.py):
//
//   accuracy_m   the fix's horizontal accuracy, metres (0 to 5000)
//   fix_age_s    how old the fix was when the action was taken, seconds
//   mocked       Android: the fix came from a mock provider (expo-location `mocked`)
//   simulated    iOS 15+: CLLocationSourceInformation.isSimulatedBySoftware
//
// Every field is optional on the server and only sent when known. mocked and
// simulated are EVIDENCE ONLY: the server records them (an audit row and a
// suspicion score the operator sees) and never refuses a request for them,
// so a developer phone whose location Xcode simulates still plays.
//
// fix_age_s does matter: a located action in a Room or a paid venue game whose
// fix is older than 30 s comes back {code:"need_location", retry:true}
// (not journalled), and the app gets a fresh fix and sends it again
// (nextLocationRetry). Pure, so it is unit tested (__tests__/fixInfo.test.ts).

/** What the app knows about its latest fix (store.ts Fix carries these). */
export type FixInfo = {
  accuracy: number;
  /** Epoch ms the OS took the fix (expo-location `timestamp`). */
  at: number;
  mocked?: boolean | null;
  simulated?: boolean | null;
};

export type FixFields = {
  accuracy_m?: number;
  fix_age_s?: number;
  mocked?: boolean;
  simulated?: boolean;
};

/** The server refuses a located Room or venue action whose fix is older than this (anticheat KNOBS fix_max_age_s). */
export const SERVER_FIX_MAX_AGE_S = 30;
/** Before a located Room action, a fix older than this is refreshed first: well inside the server's 30 s. */
export const FIX_FRESH_S = 15;
/** The server's own words for a refusal for want of a fix (anticheat.NEED_LOCATION). */
export const NEED_LOCATION_TEXT = "Waiting for your location. Try again in a moment.";
/** Shown while the app waits for a fix to send an action again. */
export const WAITING_FOR_LOCATION = "Waiting for your location…";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Seconds since the fix, to 0.1 s; never negative (a phone clock a little behind the fix's). Null when unknown. */
export function fixAgeS(at: number | null | undefined, now: number): number | null {
  if (!finite(at) || !finite(now) || at <= 0) return null;
  return Math.round(Math.max(0, now - at) / 100) / 10;
}

/** The fields for a fix, now. Only what is known is included. */
export function fixFields(fix: FixInfo | null | undefined, now: number): FixFields {
  if (!fix) return {};
  const out: FixFields = {};
  if (finite(fix.accuracy) && fix.accuracy >= 0) out.accuracy_m = Math.min(5000, fix.accuracy);
  const age = fixAgeS(fix.at, now);
  if (age !== null) out.fix_age_s = age;
  if (typeof fix.mocked === "boolean") out.mocked = fix.mocked;
  if (typeof fix.simulated === "boolean") out.simulated = fix.simulated;
  return out;
}

/**
 * A request body with the fix fields added, when it says where the player is
 * (a plain object with a finite lat and lng). Keys the caller set are kept;
 * anything else (no position, an array, a string) comes back as it was.
 */
export function withFixFields<T>(body: T, fields: FixFields | null | undefined): T {
  if (!fields || !body || typeof body !== "object" || Array.isArray(body)) return body;
  const b = body as Record<string, unknown>;
  if (!finite(b.lat) || !finite(b.lng)) return body;
  const add = Object.entries(fields).filter(([k, v]) => v !== undefined && b[k] === undefined);
  return add.length ? ({ ...b, ...Object.fromEntries(add) } as T) : body;
}

/** True when the fix is younger than `maxS` seconds. */
export function fixIsFresh(fix: { at?: number | null } | null | undefined, now: number, maxS = FIX_FRESH_S): boolean {
  const age = fixAgeS(fix?.at, now);
  return age !== null && age <= maxS;
}

/** A verdict or reply that refused the action for want of a usable fix, and may be sent again. */
export function isNeedLocation(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  if (r.ok === true) return false;
  if (r.code === "need_location") return r.retry !== false;
  return r.reason === NEED_LOCATION_TEXT;
}

/** How hard the app tries before showing the refusal: three more sends inside 20 s. */
export const NEED_LOCATION_RETRY = { tries: 3, budgetMs: 20000, waitMs: [1500, 3000, 5000] } as const;

/**
 * Wait this long (ms) for a fresh fix before send number `attempt` (1 = the
 * first resend), or null to stop and show the server's reason. `elapsedMs`
 * is the time since the first refusal.
 */
export function nextLocationRetry(attempt: number, elapsedMs: number, policy: { tries: number; budgetMs: number; waitMs: readonly number[] } = NEED_LOCATION_RETRY): number | null {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > policy.tries) return null;
  const wait = policy.waitMs[Math.min(attempt, policy.waitMs.length) - 1] ?? 0;
  if (!finite(elapsedMs) || elapsedMs < 0 || elapsedMs + wait > policy.budgetMs) return null;
  return wait;
}

/** How often iOS is asked whether the location is simulated (it rarely changes mid-session). */
export const SIMULATED_PROBE_EVERY_MS = 60000;

/** Ask iOS again: never asked, or the last answer is older than SIMULATED_PROBE_EVERY_MS. */
export function shouldProbeSimulated(lastAt: number | null, now: number, everyMs = SIMULATED_PROBE_EVERY_MS): boolean {
  return lastAt === null || !finite(lastAt) || now - lastAt >= everyMs || now < lastAt;
}
