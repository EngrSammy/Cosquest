// "Your day": the card's words and the text a player shares. The pure half of
// costquest-ios Warden/RecapSheet.swift (RecapCard). The numbers are the
// server's (me.today); the story is the Warden's line (warden.ts recapMoment).
// Pure: no React Native imports (tested in __tests__/recap.test.ts).
import type { RoamMe } from "./wire.ts";

export type Today = NonNullable<RoamMe["today"]>;

/** The card is told only once there is something to tell. */
export function hasDayToTell(me: RoamMe | null | undefined): boolean {
  return (me?.today?.points_played ?? 0) > 0;
}

export function cardSubtitle(level: number, rank: string, faction?: string | null): string {
  return `Level ${level} ${rank}${faction ? ` · ${faction}` : ""}`;
}

export function tiles(t: Today): { value: string; label: string }[] {
  return [
    { value: String(t.points_played), label: "points" },
    { value: String(t.correct), label: "right" },
    { value: String(t.xp), label: "XP" },
  ];
}

export const EMPTY_LINE = "Nothing to tell yet. Play a Quest Point and I'll have a story for you.";
export const WAITING_LINE = "The Warden is writing your day…";

/** What the system share sheet carries: the numbers, the best stop, and the Warden's story. */
export function shareText(opts: { name: string; level: number; rank: string; faction?: string | null; today: Today; story?: string | null }): string {
  const t = opts.today;
  const lines = [
    `My CostQuest day: ${t.points_played} ${t.points_played === 1 ? "point" : "points"}, ${t.correct} right, ${t.xp} XP.`,
    `${opts.name}, ${cardSubtitle(opts.level, opts.rank, opts.faction)}`,
  ];
  if (t.best_place) lines.push(`Best stop: ${t.best_place}`);
  if (opts.story && opts.story.trim()) lines.push("", opts.story.trim());
  return lines.join("\n");
}
