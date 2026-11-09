// The lock-screen clocks' glue (features/game/liveTimer.ts decides, the game
// module draws): the Quest Run from runModel, a boss raid from the moment its
// fight starts (raids.ts onRaidDuelStarted) until the boss leaves or falls,
// its HP and crew refreshed from the map. Started once by GameRoot; lives for
// the app's lifetime. Web and builds without the native half do nothing.
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { CostQuestGame, type NativeOnly } from "@/modules/costquest-game/src";
import { createLiveTimers, type LiveTimerNative, raidFinal, raidSpec, refreshRaid, runFinal, runSpec, type TrackedRaid, trackRaid } from "@/features/game/liveTimer";
import { onRaidDuelStarted, raidDuelInfo } from "@/features/game/raids";
import { gameStore } from "@/features/game/runtime";

import { runModel } from "./runModel";

function nativeTimers(): LiveTimerNative | null {
  if (Platform.OS === "web") return null;
  const m = CostQuestGame as unknown as NativeOnly | null;
  if (!m?.liveTimerStart || !m.liveTimerUpdate || !m.liveTimerEnd || !m.liveTimerSupported) return null;
  return {
    supported: () => m.liveTimerSupported!(),
    start: (kind, title, subtitle, link, endsAtMs, state) => m.liveTimerStart!(kind, title, subtitle, link, endsAtMs, state),
    update: (id, state, endsAtMs) => m.liveTimerUpdate!(id, state, endsAtMs),
    end: (id, final) => m.liveTimerEnd!(id, final),
  };
}

/** Android 13+: notifications are a run-time permission, asked the first time a clock starts. */
async function askAndroid(): Promise<boolean> {
  if (Platform.OS !== "android" || Number(Platform.Version) < 33) return true;
  const now = await Notifications.getPermissionsAsync();
  if (now.granted) return true;
  if (!now.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

let started = false;

/** Idempotent: GameRoot calls it on mount. */
export function startLiveTimers(): void {
  if (started) return;
  const native = nativeTimers();
  if (!native) return;
  started = true;
  const timers = createLiveTimers({ native, askPermission: askAndroid, log: (m) => console.warn(m) });
  timers.clearLeftovers();

  // ---- the run ----
  let lastRun: { id: string; live: boolean } | null = null;
  const syncRun = () => {
    const { run, localEnd } = runModel.get();
    const spec = runSpec(run, localEnd);
    if (spec) {
      lastRun = { id: spec.key, live: true };
      timers.sync("run", spec);
    } else if (lastRun?.live) {
      // Over: the result when this phone saw it finish, else (closed, signed out) just gone.
      const final = run && run.run_id === lastRun.id && run.finished ? runFinal(run) : null;
      lastRun = null;
      timers.sync("run", null, final);
    }
  };
  runModel.subscribe(syncRun);

  // ---- the raid ----
  let raid: TrackedRaid | null = null;
  let raidTimer: ReturnType<typeof setTimeout> | null = null;
  const syncRaid = () => {
    if (raidTimer) clearTimeout(raidTimer);
    raidTimer = null;
    if (!raid) return;
    const spec = raidSpec(raid, Date.now());
    if (!spec) {
      const final = raidFinal(raid);
      raid = null;
      timers.sync("raid", null, final);
      return;
    }
    timers.sync("raid", spec);
    // Wake at the boss's leaving time to show how it ended.
    raidTimer = setTimeout(syncRaid, Math.max(1_000, raid.endsAt - Date.now() + 1_000));
  };
  onRaidDuelStarted((point, start) => {
    raid = trackRaid(point, raidDuelInfo(start)) ?? raid;
    syncRaid();
  });

  // ---- the map (raid HP and crew) and the player ----
  let lastPoints = gameStore.get().points;
  let lastKey = gameStore.get().session?.playerKey ?? null;
  gameStore.subscribe(() => {
    const s = gameStore.get();
    const key = s.session?.playerKey ?? null;
    if (key !== lastKey) {
      // Signed out, or a different player: their clocks go.
      lastKey = key;
      raid = null;
      lastRun = null;
      timers.endAll();
      return;
    }
    if (s.points === lastPoints || !raid) return;
    lastPoints = s.points;
    const id = raid.pointId;
    raid = refreshRaid(raid, s.points.find((p) => p.id === id));
    syncRaid();
  });

  syncRun();
}
