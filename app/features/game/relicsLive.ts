// The relics and Forge models wired to the game's one store (runtime.ts):
// one of each for the whole game, read through useSyncExternalStore with
// immutable snapshots. (relics.ts and forge.ts are the pure parts; this is
// the glue, so it is not unit tested.)
import { useSyncExternalStore } from "react";

import { createForgeStore, type ForgeState } from "./forge.ts";
import { createRelicsStore, type RelicsState } from "./relics.ts";
import { gameStore } from "./runtime.ts";

export const relicsStore = createRelicsStore({
  client: gameStore.client,
  me: () => gameStore.get().me,
  playerKey: () => gameStore.get().session?.playerKey ?? null,
});

export const forgeStore = createForgeStore({ client: gameStore.client });

// A sign-out or a different player: forget the last one's relics at once.
let lastKey: string | null = null;
gameStore.subscribe(() => {
  const key = gameStore.get().session?.playerKey ?? null;
  if (key === lastKey) return;
  lastKey = key;
  relicsStore.syncPlayer();
});

export function useRelics(): RelicsState {
  return useSyncExternalStore(relicsStore.subscribe, relicsStore.get, relicsStore.get);
}

export function useForge(): ForgeState {
  return useSyncExternalStore(forgeStore.subscribe, forgeStore.get, forgeStore.get);
}
