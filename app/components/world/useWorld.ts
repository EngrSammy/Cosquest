// React's view of the world store (features/world/worldState.ts).
import { useSyncExternalStore } from "react";

import { world, type WorldState } from "@/features/world/worldState";

export function useWorld(): WorldState {
  return useSyncExternalStore(world.subscribe, world.get, world.get);
}

export function useWorldSelector<T>(select: (state: WorldState) => T): T {
  return useSyncExternalStore(
    world.subscribe,
    () => select(world.get()),
    () => select(world.get()),
  );
}
