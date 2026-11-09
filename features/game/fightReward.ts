// The fight's reward sheet (look-fight, 1 Nov 2026; art direction 7 "Win screen" / "Loss
// screen" and 6.3 motion tokens): when each beat lands, pure, so the numbers are tested.
//
// After a fight Godot holds VICTORY (or DEFEATED) over the frame for 1.2 s; then this sheet
// slides up (sheetMotion's open curve). Its beats:
//   rows      the pay lines, one every 90 ms
//   count     the XP counting up over `rewardCount` (600 ms, ease-out)
//   level     the level bar filling to the top, then the LEVEL UP screen (its own moment)
//   drop      the Relic drop card flipping in, after the count
// The loss screen is calm: no count theatre, the buttons within 2 s of the fall.

import type { RoamDaily } from "./wire";

/** The sheet waits this long after it is shown (the slide-in is 280 ms). */
export const SHEET_DELAY_MS = 160;
/** One pay line every 90 ms (art direction 7). */
export const ROW_EVERY_MS = 90;
/** rewardCount (art direction 6.3): 600 ms, ease-out. */
export const REWARD_COUNT_MS = 600;
/** The bar filling to the top before the LEVEL UP screen. */
export const LEVEL_FILL_MS = 450;
export const LEVEL_HOLD_MS = 250;
/** How many frames the count is drawn in (enough to look continuous, few enough for the JS thread). */
export const COUNT_STEPS = 24;

export type FightRewardTimeline = {
  rowAt: number[];
  countStart: number;
  countDone: number;
  /** [ms, value] steps of the XP count. */
  count: { atMs: number; value: number }[];
  level: { fillAt: number; popAt: number } | null;
  dropAt: number;
};

/** The ease-out of rewardCount: cubic, fast first, landing softly on the total. */
export function easeOutCubic(k: number): number {
  const c = Math.min(1, Math.max(0, k));
  return 1 - (1 - c) ** 3;
}

/** The XP shown `ms` into the count. Whole numbers, never past the total, the total at the end. */
export function countAt(total: number, ms: number, length = REWARD_COUNT_MS): number {
  const t = Math.max(0, Math.floor(total));
  if (ms >= length) return t;
  return Math.min(t, Math.floor(t * easeOutCubic(ms / length)));
}

export function fightRewardTimeline(rows: number, xp: number, leveledUp: boolean): FightRewardTimeline {
  const n = Math.max(0, Math.floor(rows));
  const rowAt = Array.from({ length: n }, (_, i) => SHEET_DELAY_MS + ROW_EVERY_MS * i);
  const countStart = SHEET_DELAY_MS + ROW_EVERY_MS * n + (n > 0 ? 60 : 0);
  const total = Math.max(0, Math.floor(xp));
  const count = total > 0 ? Array.from({ length: COUNT_STEPS }, (_, i) => {
    const ms = (REWARD_COUNT_MS * (i + 1)) / COUNT_STEPS;
    return { atMs: Math.round(countStart + ms), value: countAt(total, ms) };
  }) : [];
  const countDone = countStart + (total > 0 ? REWARD_COUNT_MS : 0);
  const level = leveledUp ? { fillAt: countDone, popAt: countDone + LEVEL_FILL_MS + LEVEL_HOLD_MS } : null;
  return { rowAt, countStart, countDone, count, level, dropAt: countDone + 120 };
}

/** The fight's own highlights from Godot's whole result (fight.gd result()): chips over the sheet. */
export function fightHighlights(record: Record<string, unknown> | null | undefined, timeS?: number): { id: string; label: string; value: string }[] {
  if (!record) return [];
  const n = (k: string): number => {
    const v = record[k];
    return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
  };
  const out: { id: string; label: string; value: string }[] = [];
  out.push({ id: "dealt", label: "Damage", value: String(n("damage_dealt")) });
  if (n("crits") > 0) out.push({ id: "crits", label: n("crits") === 1 ? "Crit" : "Crits", value: String(n("crits")) });
  if (n("combo_max") > 1) out.push({ id: "combo", label: "Best combo", value: `×${n("combo_max")}` });
  if (n("parries") > 0) out.push({ id: "parries", label: n("parries") === 1 ? "Parry" : "Parries", value: String(n("parries")) });
  const t = typeof timeS === "number" ? timeS : typeof record.time_s === "number" ? (record.time_s as number) : null;
  if (t !== null && Number.isFinite(t) && t > 0) {
    const s = Math.round(t);
    out.push({ id: "time", label: "Time", value: s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s} s` });
  }
  return out.slice(0, 4);
}

/** The daily quest to show progress on: the nearest to done that is not done yet, or null. */
export function dailyToShow<D extends Pick<RoamDaily, "id" | "title" | "progress" | "target" | "done">>(dailies: readonly D[] | null | undefined): D | null {
  if (!dailies?.length) return null;
  const open = dailies.filter((d) => !d.done && d.target > 0);
  if (!open.length) return null;
  return [...open].sort((a, b) => b.progress / b.target - a.progress / a.target)[0];
}

/** One calm line under DEFEATED (art direction 7): what to try next time. Picked by the fight's seed. */
export const LOSS_TIPS: readonly string[] = [
  "Raise your guard just before the red ring lands: a perfect parry staggers the Guardian.",
  "Step out of the red ring while it fills, then punish the recovery.",
  "SPLIT hits hardest while the Guardian is staggered.",
  "Dodge through a swipe: you cannot be hit mid-dodge.",
  "RALLY heals you and your ally and makes your hits stronger.",
];

export function lossTip(seed: number): string {
  const i = Math.abs(Math.floor(seed)) % LOSS_TIPS.length;
  return LOSS_TIPS[Number.isFinite(i) ? i : 0];
}
