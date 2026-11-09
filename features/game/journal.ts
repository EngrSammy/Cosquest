// The journal's words and orderings: dailies, the faction war, the Codex.
// The pure half of costquest-ios Roam/RoamSheets.swift (DailyRow, WarSheet,
// WarBar) and Features/CodexFeature.swift (CodexSheet, CodexDetail), so the
// copy and the sort orders are the same on both platforms and can be tested.
// Pure: no React Native imports (tested in __tests__/journal.test.ts).
import type { CodexCard, CodexPayload, FactionWar, RoamDaily, RoamMe } from "./wire.ts";
import { parseServerDate } from "./wire.ts";

export const capitalised = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** The five houses in the order the Codex lists them (CodexSheet.groups). */
export const REALM_ORDER = ["anime", "marvel", "dc", "movies", "gaming"];

// ---------- dailies ----------

type Streak = RoamMe["streak"];

export function streakTitle(s: Streak): string {
  return s.days === 0 ? "Start a streak" : s.days === 1 ? "1 day streak" : `${s.days} day streak`;
}

export function streakLine(s: Streak): string {
  if (s.played_today) return "Played today. Come back tomorrow to keep it going.";
  return s.days === 0 ? "Play any point today to start one." : "Play any point today to keep it going.";
}

/** The "best" number beside the streak, only when it beats the current one. */
export function showBestStreak(s: Streak): boolean {
  return s.best > s.days;
}

/** DailyRow's last line. */
export function dailyProgressText(d: RoamDaily): string {
  return d.done ? "Done" : `${d.progress} of ${d.target}`;
}

export function dailyFraction(d: RoamDaily): number {
  return d.progress / Math.max(1, d.target);
}

/** The row read as one element (Swift DailyRow's content, combined). */
export function dailyLabel(d: RoamDaily): string {
  return `${d.title}, ${dailyProgressText(d)}, plus ${d.reward.xp} XP`;
}

/**
 * "New quests every day at 1:00 AM": the quests reset at midnight UTC, shown
 * in the player's own clock (DailiesSheet.resetTime). Tomorrow's UTC midnight
 * is always ahead of now, so it is never "midnight that already passed".
 */
export function resetTime(now: Date = new Date(), locale?: string, timeZone?: string): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  try {
    return next.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZone });
  } catch {
    return `${String(next.getHours()).padStart(2, "0")}:${String(next.getMinutes()).padStart(2, "0")}`;
  }
}

// ---------- the war ----------

/** "world" is the whole planet's pool: the player thinks of it as their own area. */
export function regionName(region: string): string {
  return region === "world" ? "Your area" : capitalised(region);
}

/** "Ends in 3 days" / "Ends in 1 day" / "Ends in 5h" (WarSheet.endsIn). */
export function endsIn(endsAt: string, now: number = Date.now()): string {
  const end = parseServerDate(endsAt);
  if (end === null) return "";
  const left = end - now;
  const days = Math.trunc(left / 86_400_000);
  if (days >= 1) return `Ends in ${days} ${days === 1 ? "day" : "days"}`;
  const hours = Math.max(1, Math.trunc(left / 3_600_000));
  return `Ends in ${hours}h`;
}

/** WarBar: each house against the top one, never thinner than a nub of 10. */
export function warBarWidth(points: number, top: number, trackWidth: number): number {
  return top > 0 ? Math.max(10, (trackWidth * points) / top) : 10;
}

export function warFooter(war: Pick<FactionWar, "total" | "players">): string {
  return war.total === 0
    ? "No points yet this week. Every point you play counts for your side."
    : `${war.players} ${war.players === 1 ? "player" : "players"} this week. Every point you play counts for your side.`;
}

/** The top of the standings, which the bars are measured against. */
export function topPoints(war: Pick<FactionWar, "standings">): number {
  return war.standings[0]?.points ?? 0;
}

// ---------- the Codex ----------

export function setFraction(s: { progress: number; target: number }): number {
  return Math.min(1, Math.max(0, s.progress / Math.max(1, s.target)));
}

/** The nearest unfinished sets first: they are what the next walk is for. */
export function orderSets<T extends { progress: number; target: number; done: boolean }>(sets: T[]): T[] {
  return [...sets].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return setFraction(b) - setFraction(a);
  });
}

export function setLabel(s: { title: string; progress: number; target: number; done: boolean }): string {
  return `${s.title}, ${s.progress} of ${s.target}${s.done ? ", complete" : ""}`;
}

export type RealmGroup = { realm: string; cards: CodexCard[] };

/** Cards by realm in the houses' order, then any other realm by name; newest first inside (the server's order). */
export function groupByRealm(cards: CodexCard[]): RealmGroup[] {
  const by = new Map<string, CodexCard[]>();
  for (const c of cards) by.set(c.realm, [...(by.get(c.realm) ?? []), c]);
  const rank = (r: string) => {
    const i = REALM_ORDER.indexOf(r);
    return i < 0 ? REALM_ORDER.length : i;
  };
  return [...by.keys()]
    .sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0))
    .map((realm) => ({ realm, cards: by.get(realm) ?? [] }));
}

export function tierName(tier: string): string {
  return capitalised(tier);
}

export function countChips(counts: CodexPayload["counts"]): string[] {
  const out = [`${counts.total} card${counts.total === 1 ? "" : "s"}`];
  if (counts.foils > 0) out.push(`${counts.foils} foil${counts.foils === 1 ? "" : "s"}`);
  return out;
}

/** A tile's spoken label (CodexSheet.realmSection). */
export function tileLabel(card: CodexCard): string {
  return `${card.foil ? "Foil card, " : ""}${card.point_name}, ${tierName(card.tier)}`;
}

export function playedText(times: number): string {
  return times === 1 ? "Once" : `${times} times`;
}

export function realmTitle(group: RealmGroup): string {
  return group.cards[0]?.realm_name || capitalised(group.realm);
}

/** CodexDetail's rows, in order; "First won" only when the date reads. */
export function detailRows(card: CodexCard, locale?: string): [string, string][] {
  const rows: [string, string][] = [
    ["Fandom", card.realm_name || capitalised(card.realm)],
    ["City", card.region_name || capitalised(card.region)],
    ["Played", playedText(card.times)],
  ];
  const first = parseServerDate(card.first_at);
  if (first !== null) {
    try {
      rows.push(["First won", new Date(first).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })]);
    } catch {
      rows.push(["First won", new Date(first).toISOString().slice(0, 10)]);
    }
  }
  return rows;
}

/** The foil's rainbow edge, in order (FoilBorder.colours); hexes of the GamePalette. */
export const FOIL_STOPS = ["#F2992E", "#FFFFFF", "#D93840", "#9961F7", "#7DC2E3", "#FFFFFF", "#3DBF8A", "#F2992E"];
/** One turn of the foil takes this long. */
export const FOIL_TURN_MS = 3000;
