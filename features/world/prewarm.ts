// When to warm the game up before anyone asks for it.
//
// Warm = the game's native view mounted off screen: its world home loads,
// the player and the points nearby are fetched, the 3D map is built. Then
// the first swipe only has to slide a page. The cost is memory (the RealityKit
// map and the game's state; Unity is NOT started by a prewarm, only by a
// fight or an event map, as in the standalone game).
//
// Measured budget (see docs/merged-app-ux.md, "Warm game"): iOS 18 runs on
// phones from 3 GB (iPhone XR, SE 2nd gen) up. On a 3 GB phone the chat
// (React Native + LiveKit) plus a warm game leaves too little headroom for a
// call, so below LOW_MEMORY_BYTES the game is NOT prewarmed: it mounts on the
// first swipe instead (a short faction-colour veil covers the load).
// Pure: tested in features/world/__tests__.

export const LOW_MEMORY_BYTES = 3.5 * 1024 * 1024 * 1024;
/** Wait this long after the app settles before warming (ms). */
export const PREWARM_IDLE_DELAY_MS = 2500;

export type PrewarmInput = {
  /** Physical memory reported by the native module; 0 or unknown = not known. */
  physicalMemory: number | null | undefined;
  gameAvailable: boolean;
  /** The OS asked the app to free memory since launch. */
  hadMemoryWarning: boolean;
  /** iOS Low Power Mode / Android battery saver, when known. */
  lowPower?: boolean;
};

export type PrewarmDecision = { prewarm: boolean; reason: string };

export function prewarmDecision(input: PrewarmInput): PrewarmDecision {
  if (!input.gameAvailable) return { prewarm: false, reason: "no-game" };
  if (input.hadMemoryWarning) return { prewarm: false, reason: "memory-warning" };
  if (input.lowPower) return { prewarm: false, reason: "low-power" };
  const memory = input.physicalMemory ?? 0;
  if (memory > 0 && memory < LOW_MEMORY_BYTES) return { prewarm: false, reason: "low-memory" };
  // Unknown memory: warm. Every iOS 18 phone above the floor is 4 GB+.
  return { prewarm: true, reason: memory > 0 ? "enough-memory" : "memory-unknown" };
}
