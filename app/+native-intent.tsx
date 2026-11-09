// Incoming links (task 059): cosquest:// and the website's https links,
// rewritten to the app's own screens before expo-router matches them
// (features/world/links.ts). Unknown paths go through unchanged.
import { MAP_BENCH_ON, requestMapBench } from "@/features/game/mapBench";
import { codeFromSquadLink } from "@/features/game/squad";
import { routeForUrl } from "@/features/world/links";
import { world } from "@/features/world/worldState";

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    // cosquest://mapbench, only in builds made with EXPO_PUBLIC_MAP_BENCH=1: the map's smoothness bench.
    if (MAP_BENCH_ON && /^(cosquest:\/\/|\/)?mapbench\/?$/i.test(path)) {
      requestMapBench();
      world.openGame(null);
      return "/play";
    }
    // cosquest://squad/<code>: a friend's squad code, scanned with the camera. The game's squad
    // sheet joins it (squadRuntime is loaded lazily: it needs the game store).
    const squadCode = codeFromSquadLink(path);
    if (squadCode) {
      void import("@/features/game/squadRuntime").then((m) => m.squadModel.open(squadCode)).catch(() => {});
      world.openGame(null);
      return "/play";
    }
    return routeForUrl(path) ?? path;
  } catch {
    return path;
  }
}
