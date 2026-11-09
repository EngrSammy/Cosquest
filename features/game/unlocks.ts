// What the game shows a player, and when (costquest-ios Roam/RoamGuide.swift
// RoamUnlock): features open as a player levels, each introduced once.
// Fifteen features at once is a home screen nobody can read.
// Pure (tested in features/game/__tests__/unlocks.test.ts).
import { isProductionServer, resolveGameServer } from "./config.ts";
import type { QuestPoint, RoamMe } from "./wire.ts";

export type Unlock = "codex" | "relics" | "war" | "battle" | "walking" | "friends" | "raids";

export const UNLOCKS: Record<Unlock, { level: number; title: string; line: string }> = {
  codex: { level: 2, title: "The Codex is open", line: "Every point you play leaves a card behind. Collect them all, finish the sets." },
  relics: {
    level: 2,
    title: "Relics are waking",
    line: "Right answers can drop Relics: faction weapons that power your sieges. Your first one is waiting.",
  },
  walking: { level: 2, title: "Every kilometre counts", line: "Walk and earn XP and items: 5, 25 and 50 km a week." },
  war: { level: 3, title: "Your faction needs you", line: "Take points for your side, defend them, and win your city this week." },
  battle: { level: 3, title: "Battle anyone, anywhere", line: "Start a Room where you stand and fight whoever's around. Grab a weapon and go." },
  friends: { level: 4, title: "Friends unlocked", line: "Meet up to add a friend. No chat, and nobody sees where you are." },
  raids: { level: 5, title: "Bosses walk the city", line: "Every hour a boss appears near you for half an hour. Bring a crew and bring it down." },
};

/** RoamUnlock.allCases order: the order they are introduced in. */
export const UNLOCK_ORDER: Unlock[] = ["codex", "relics", "war", "battle", "walking", "friends", "raids"];

export function playerLevel(me: RoamMe | null | undefined): number {
  return me?.standing?.level ?? 1;
}

/**
 * Test builds only: every feature open whatever the level, to check screens
 * on an emulator with a new player (like iOS's RoamDev launch arguments).
 * The gates are the client's (the server does not gate these features by
 * level), and the switch is refused against the production server.
 */
export function unlockAllFor(flag: string | undefined | null, server: string): boolean {
  return flag === "1" && !isProductionServer(server);
}

const UNLOCK_ALL = unlockAllFor(process.env.EXPO_PUBLIC_GAME_UNLOCK_ALL, resolveGameServer(process.env.EXPO_PUBLIC_GAME_SERVER));

export function unlocked(me: RoamMe | null | undefined, u: Unlock): boolean {
  return UNLOCK_ALL || playerLevel(me) >= UNLOCKS[u].level;
}

/** The next unlock to introduce at this level, if any. */
export function pendingUnlock(me: RoamMe | null | undefined, introduced: ReadonlySet<string>): Unlock | null {
  return UNLOCK_ORDER.find((u) => unlocked(me, u) && !introduced.has(u)) ?? null;
}

/** Points a player at this level can see: bosses wait for level 5. */
export function visiblePoints(points: QuestPoint[], me: RoamMe | null | undefined): QuestPoint[] {
  return unlocked(me, "raids") ? points : points.filter((p) => p.source !== "raid");
}
