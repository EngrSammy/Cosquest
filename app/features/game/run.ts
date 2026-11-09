// The Quest Run, the core loop: "the real world is the game board, your phone
// is the scorecard". Fifteen minutes and ten Quest Points of different value;
// the route between them is the game. Pocket runs are the same ten
// challenges with no walking, XP only and not on the board. The pure half of
// costquest-ios Features/RunFeature.swift (the wire, the routes, RunLook, the
// tray's order, the words); the state is components/game/runModel.ts and the
// screens components/game/Run.tsx. The server deals, times, marks and pays.
// Pure: no React Native imports (tested in __tests__/run.test.ts).
import type { GameClient } from "./client.ts";
import { distanceText } from "./geo.ts";
import type { QuestPoint, RoamAnswer, RoamAttempt, RoamStanding, RoamVerdict } from "./wire.ts";

// ---------- the wire ----------

export type RunPoint = {
  idx: number;
  id: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
  value: number;
  kind?: string | null;
  tier?: string | null;
  realm?: string | null;
  done: boolean;
  earned: number;
  hidden: boolean;
  forbidden: boolean;
};

export type RunState = {
  run_id: string;
  /** daily | pocket */
  mode: string;
  /** A trivia run (the front door): a Pocket Run with no fights, no location, on the global board. */
  trivia?: boolean;
  region: string;
  day: string;
  started_at: string;
  ends_at: string;
  remaining_s: number;
  score: number;
  finished: boolean;
  powers: { radar: number; surge: number };
  surge_armed: boolean;
  points: RunPoint[];
};

export type RunFinish = {
  run: RunState;
  reward: RoamVerdict["reward"];
  before: RoamStanding;
  after: RoamStanding;
  leveled_up: boolean;
  rank_up: boolean;
  board_place?: number | null;
  /** The UTC day the run belongs to (the day it started); the board is asked for it. */
  board_day?: string | null;
};

export type RunCurrent = { run?: RunState | null; settled?: RunFinish | null };

export type RunAnswerResult = {
  correct: number;
  total: number;
  reveal: RoamVerdict["reveal"];
  late: boolean;
  earned: number;
  speed_mult: number;
  surged: boolean;
  stake_result?: { stake: number; won: boolean } | null;
  run: RunState;
};

/** /run/open: the challenge (a Roam attempt), and the stake the server holds for it. */
export type RunOpened = { attempt: RoamAttempt; stake: number };

export type RunBoard = {
  region: string;
  day: string;
  entries: { place: number; handle: string; faction?: string | null; score: number; points_done: number; you: boolean }[];
  factions: { faction: string; name: string; total: number }[];
  you?: { place: number; score: number; approx?: boolean | null } | null;
  resets_at?: string | null;
};

export const isPocket = (r: Pick<RunState, "mode">): boolean => r.mode === "pocket";
export const isTrivia = (r: Pick<RunState, "trivia"> | null | undefined): boolean => r?.trivia === true;
export const doneCount = (r: Pick<RunState, "points">): number => r.points.filter((p) => p.done).length;
export const isLive = (r: RunState | null | undefined): boolean => !!r && !r.finished;
export const isWorldBoard = (b: Pick<RunBoard, "region">): boolean => b.region === "world";

// ---------- the routes (/v1/roam/run) ----------

type Fix = { lat: number; lng: number; accuracy: number } | null;

const near = (fix: Fix) => (fix ? { lat: fix.lat, lng: fix.lng, accuracy_m: Math.min(5000, Math.max(0, fix.accuracy)) } : {});

export async function runCurrent(client: GameClient): Promise<RunCurrent> {
  return client.request<RunCurrent>("GET", "v1/roam/run/current", { query: { device_key: client.deviceKey() } });
}

export type RunMode = "daily" | "pocket" | "trivia";

/** The body /run/start is sent. A trivia run sends no location at all: the server ignores one anyway. */
export function startBody(deviceKey: string, mode: RunMode, fix: Fix): Record<string, unknown> {
  if (mode === "trivia") return { device_key: deviceKey, mode: "pocket", trivia: true };
  return { device_key: deviceKey, mode, ...near(fix) };
}

export async function runStart(client: GameClient, mode: RunMode, fix: Fix): Promise<RunState> {
  return client.request<RunState>("POST", "v1/roam/run/start", { body: startBody(client.deviceKey(), mode, fix), signed: true });
}

export async function runOpen(client: GameClient, runId: string, idx: number, stake: boolean, fix: Fix): Promise<RunOpened> {
  const raw = await client.request<RoamAttempt & { stake?: number | null }>("POST", "v1/roam/run/open", {
    body: { device_key: client.deviceKey(), run_id: runId, idx, stake, ...near(fix) },
    signed: true,
  });
  const { stake: held, ...attempt } = raw;
  return { attempt, stake: held ?? 0 };
}

export async function runAnswer(client: GameClient, runId: string, attemptId: string, answers: RoamAnswer[]): Promise<RunAnswerResult> {
  return client.request<RunAnswerResult>("POST", "v1/roam/run/answer", {
    body: { device_key: client.deviceKey(), run_id: runId, attempt_id: attemptId, answers },
    signed: true,
  });
}

export async function runPower(client: GameClient, runId: string, power: "radar" | "surge"): Promise<RunState> {
  return client.request<RunState>("POST", "v1/roam/run/power", { body: { device_key: client.deviceKey(), run_id: runId, power }, signed: true });
}

/** Idempotent: a run already settled hands back its stored result. */
export async function runFinish(client: GameClient, runId: string): Promise<RunFinish> {
  return client.request<RunFinish>("POST", "v1/roam/run/finish", { body: { device_key: client.deviceKey(), run_id: runId }, signed: true });
}

export async function runBoard(client: GameClient, at: { lat: number; lng: number }, day?: string | null): Promise<RunBoard> {
  const query: Record<string, string> = { lat: String(at.lat), lng: String(at.lng), device_key: client.deviceKey() };
  if (day) query.day = day;
  return client.request<RunBoard>("GET", "v1/roam/run/board", { query });
}

// ---------- the trivia front door (/v1/trivia) ----------

/** Built with EXPO_PUBLIC_TRIVIA=0, the app shows no way into trivia (the server has its own switch). */
export const TRIVIA_DOOR = process.env.EXPO_PUBLIC_TRIVIA !== "0";

export type TriviaCard = {
  handle: string;
  score: number;
  points_done: number;
  points_total: number;
  correct: number;
  asked: number;
  day: string;
  place?: number | null;
  approx?: boolean | null;
};

export type TriviaShare = { share_id: string; url: string; image_url: string; text: string; card: TriviaCard; created?: boolean };

/** Today's (or that day's) global trivia board. Public; the key only marks your own row. */
export async function triviaBoard(client: GameClient, day?: string | null, deviceKey?: string | null): Promise<RunBoard> {
  const query: Record<string, string> = {};
  if (deviceKey) query.device_key = deviceKey;
  if (day) query.day = day;
  return client.request<RunBoard>("GET", "v1/trivia/board", { query });
}

/** A share link for a finished trivia run. Asked again, the same link. */
export async function triviaShare(client: GameClient, runId: string): Promise<TriviaShare> {
  return client.request<TriviaShare>("POST", "v1/trivia/share", { body: { device_key: client.deviceKey(), run_id: runId }, signed: true });
}

/**
 * What the share sheet carries. iOS takes the link as its own item (so a
 * preview card unfurls) beside the line; Android shares `message` only, so
 * the link goes on the end of it. Never both, or iOS posts the link twice.
 */
export function shareContent(s: Pick<TriviaShare, "text" | "url">, os: string): { message: string; url?: string; title: string } {
  const title = "CosQuest trivia";
  return os === "ios" ? { message: s.text, url: s.url, title } : { message: `${s.text} ${s.url}`, title };
}

/** Today's trivia runs left, from /me's features.trivia; null when the server does not say (or trivia is off there). */
export function triviaAllowance(me: { features?: Record<string, unknown> | null } | null | undefined): number | null {
  const t = (me?.features?.trivia ?? null) as { runs_left?: number | null } | null;
  return t?.runs_left ?? null;
}

export function triviaSub(left: number | null): string {
  return left === 0 ? "That's today's trivia runs done. Back tomorrow." : `No walking, no location. On today's global board.${leftToday(left)}`;
}

/**
 * Whether the server has Quest Runs on: /me carries features.run only then.
 * Production runs with `run` OFF (CQ_FEATURES_OFF=run), and builds to 18 showed
 * the Quest Run button anyway, whose start answered "Not Found" (found in the
 * build 19 production check, 9 Nov 2026).
 */
export function runOn(me: { features?: Record<string, unknown> | null } | null | undefined): boolean {
  return me?.features?.run != null;
}

/** Today's runs left, from /me's features.run (null when the server does not say). */
export function runAllowance(me: { features?: Record<string, unknown> | null } | null | undefined): { daily: number | null; pocket: number | null } {
  const run = (me?.features?.run ?? null) as { daily_runs_left?: number | null; pocket_runs_left?: number | null } | null;
  return { daily: run?.daily_runs_left ?? null, pocket: run?.pocket_runs_left ?? null };
}

// ---------- RunLook ----------

export const RUN_GOLD = "#FABD29";
export const RUN_FORBIDDEN = "#9E29DB";
/** The server's answer grace (knob grace_s): the run is asked about this long after 0:00, and a second more. */
export const SERVER_GRACE_S = 4;
/** A daily run is dealt around the fix; the server refuses one worse than this. */
export const DAILY_ACCURACY_M = 50;

/** Value to tier colour, so a 400 reads as rare from across the map. */
export function tierOfValue(value: number): "epic" | "rare" | "common" {
  return value >= 300 ? "epic" : value >= 200 ? "rare" : "common";
}

/** "+240", or "−150" for a stake lost. */
export function signed(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
}

/** "4:07": seconds rounded up. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "4 minutes 7 seconds left", or "Time's up". */
export function clockLabel(seconds: number): string {
  if (seconds <= 0) return "Time's up";
  const s = Math.ceil(seconds);
  return `${Math.floor(s / 60)} minutes ${s % 60} seconds left`;
}

/** 00:00 UTC (when the day's runs and board reset), as a time on the phone's clock. */
export function resetTime(now: number, format: (d: Date) => string): string {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return format(new Date(next));
}

// ---------- starting ----------

/** Why a daily run cannot start yet, or null (RunModel.canRunDaily). */
export function dailyBlock(fix: { accuracy: number } | null, rough = false): string | null {
  if (!fix) return "Turn on location to run the streets.";
  if (rough || fix.accuracy > DAILY_ACCURACY_M) return "Waiting for a precise location (turn on Precise Location, or step outside).";
  return null;
}

export function leftToday(n: number | null): string {
  if (n === null) return "";
  return n === 1 ? " 1 left today." : ` ${n} left today.`;
}

export function dailySub(block: string | null, left: number | null): string {
  if (left === 0) return "That's today's runs done. Back tomorrow.";
  return block ?? `Walk to points nearby. On today's Bounty Board.${leftToday(left)}`;
}

export function pocketSub(left: number | null): string {
  return left === 0 ? "That's today's Pocket Runs done. Back tomorrow." : `Indoors, no walking. XP only.${leftToday(left)}`;
}

// ---------- the tray ----------

/** Points per 100 m of walking: the sum a runner does in their head. */
export function worth(p: Pick<RunPoint, "value">, distance: number | null): number {
  return distance === null ? p.value : p.value / Math.max(1, distance / 100 + 0.5);
}

/** Open points first, hidden after, then best value per metre (RunTray.ordered). */
export function orderPoints(points: RunPoint[], distanceOf: (p: RunPoint) => number | null): RunPoint[] {
  return [...points].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.hidden !== b.hidden) return a.hidden ? 1 : -1;
    return worth(b, distanceOf(b)) - worth(a, distanceOf(a));
  });
}

/** The card's small line (RunCard.subline). */
export function cardSubline(p: RunPoint, challengeName: (kind: string) => string): string {
  if (p.done) return "Done";
  if (p.hidden) return "Use Radar to find it";
  if (p.forbidden) return "Forbidden Zone";
  return challengeName(p.kind ?? "duel");
}

/** What VoiceOver reads for a card (RunCard.accessibility). */
export function cardLabel(p: RunPoint, o: { inReach: boolean; pocket: boolean; distance: number | null; challengeName: (kind: string) => string }): string {
  const parts = [p.hidden ? "Hidden bonus" : p.name];
  if (p.done) {
    parts.push(`done, ${p.earned < 0 ? "lost" : "scored"} ${Math.abs(p.earned)} points`);
  } else {
    parts.push(`${p.value} points`, cardSubline(p, o.challengeName));
    if (!p.hidden) parts.push(o.inReach ? (o.pocket ? "ready to play" : "in reach") : `${distanceText(o.distance)} away`);
  }
  return parts.join(", ");
}

/** The run's points for the map: hidden and pocket points have no place on it; a played one shows spent. */
export function runQuestPoints(run: RunState | null | undefined): QuestPoint[] {
  if (!run || isPocket(run)) return [];
  return run.points
    .filter((p) => p.lat != null && p.lng != null && !p.hidden)
    .map((p) => ({
      id: runObjectId(p),
      name: p.name,
      lat: p.lat as number,
      lng: p.lng as number,
      source: "run",
      place_kind: "",
      tier: tierOfValue(p.value),
      realm: p.realm ?? "",
      challenge: p.kind ?? "trivia",
      distance_m: null,
      cooling_until: p.done ? "9999-12-31T00:00:00Z" : null,
    }));
}

export const runObjectId = (p: Pick<RunPoint, "idx">): string => `run:${p.idx}`;

export function runPointOf(run: RunState | null | undefined, objectId: string): RunPoint | null {
  if (!run || !objectId.startsWith("run:")) return null;
  const i = Number(objectId.slice(4));
  return run.points.find((p) => p.idx === i) ?? null;
}

// ---------- one point ----------

/** A Forbidden Zone stakes half the score. */
export function stakeOf(score: number): number {
  return Math.floor(score / 2);
}

export function stakeText(stake: number, duel: boolean): string {
  if (stake <= 0) return "Nothing to stake yet. Score somewhere else first, or play it for its 200.";
  return duel
    ? `Stake ${stake} of your points. Win the fight and win ${stake} more. Lose it and lose them.`
    : `Stake ${stake} of your points. Get it all right and win ${stake} more. Miss anything and lose them.`;
}

/** The result's big line: "+240", "Time's up", or "No points". */
export function resultHeadline(r: Pick<RunAnswerResult, "late" | "earned">): string {
  return r.late ? "Time's up" : r.earned > 0 ? `+${r.earned}` : "No points";
}

export function resultChips(r: Pick<RunAnswerResult, "correct" | "total" | "earned" | "speed_mult" | "surged">): string[] {
  const out: string[] = [];
  if (r.total > 1) out.push(`${r.correct} of ${r.total}`);
  if (r.earned > 0 && r.speed_mult > 1.01) out.push(`Speed ×${r.speed_mult.toFixed(2)}`);
  if (r.surged) out.push("Surge ×1.5");
  return out;
}

export function stakeLine(s: { stake: number; won: boolean }): string {
  return s.won ? `Stake won: +${s.stake}` : `Stake lost: −${s.stake}`;
}

/**
 * A run's verdict says right or wrong, not which choice was right (the server
 * keeps the key), so the cards' reveal is drawn from the marks: right lights
 * the pick, wrong marks only the pick (RunChallengeView.shownReveal).
 */
export function runReveal(kind: string, r: Pick<RunAnswerResult, "reveal">, picked: number | null, blitz: number[]): { correct: number[]; marks: boolean[] | null } | null {
  const marks = r.reveal.marks ?? [];
  if (kind === "sequence") return null;
  if (kind === "blitz") return { correct: blitz.map((pick, i) => (i < marks.length && marks[i] ? pick : -1)), marks };
  const right = marks[0] ?? false;
  return { correct: [right ? (picked ?? -1) : -1], marks: r.reveal.marks ?? null };
}

export function sequenceLine(right: number, n: number): string {
  return right === n ? `All ${n} in the right order.` : `${right} of ${n} in the right place.`;
}

// ---------- the end ----------

/** "#12 today in your city", "about #1,204 worldwide today". */
export function boardPlaceText(place: number, o: { approx?: boolean | null; world: boolean }): string {
  const n = place.toLocaleString("en-US");
  const shown = (o.approx ?? place >= 1000) ? `about #${n}` : `#${n}`;
  return o.world ? `${shown} worldwide today` : `${shown} today in your city`;
}

export function endRunMessage(r: Pick<RunState, "score" | "mode" | "trivia">): string {
  if (isTrivia(r)) return `You keep the ${r.score} points you have, and they go on today's board.`;
  return `You keep the ${r.score} points you have.${isPocket(r) ? "" : " It counts as one of today's runs."}`;
}
