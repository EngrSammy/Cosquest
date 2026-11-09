// The phone side of walking rewards: the step counter through the game
// module (modules/costquest-game StepCounter.kt), the Physical activity
// permission, and the ledger saved with the app's small settings. steps.ts is
// the pure part; this file is the glue (like runtime.ts), so it is not unit
// tested. iOS (the shared game): CMPedometer through the same module
// (ios/Embed/GameHelpers.swift queryPedometer), as Features/StepsFeature.swift
// reads it for the native game.
import { PermissionsAndroid, Platform } from "react-native";

import { nativeHelpers } from "@/modules/costquest-game/src";
import { getPref, setPref } from "@/utils/prefsStorage";

import { gameStore } from "./runtime.ts";
import {
  EMPTY_STEPS_VIEW,
  LEDGER_KEY,
  isValidReading,
  pedometerMeters,
  noteSteps as noteStepsWith,
  type SensorAnswer,
  type StepsDeps,
  type StepsView,
  updateSteps,
  utcMonday,
} from "./steps.ts";

/** ACTIVITY_RECOGNITION is a run-time permission from Android 10 (API 29); before that the counter is open. */
async function permitted(ask: boolean): Promise<"granted" | "denied"> {
  if (Platform.OS !== "android" || Number(Platform.Version) < 29) return "granted";
  const permission = PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION;
  if (await PermissionsAndroid.check(permission)) return "granted";
  if (!ask) return "denied";
  const result = await PermissionsAndroid.request(permission, {
    title: "Count your walks",
    message: "CosQuest counts your steps to pay the weekly walking rewards. The count stays on your phone; only the week's distance is sent.",
    buttonPositive: "OK",
  });
  return result === PermissionsAndroid.RESULTS.GRANTED ? "granted" : "denied";
}

/** iOS: the week's distance from CMPedometer's history (Motion & Fitness permission). */
async function sensePedometer(ask: boolean): Promise<SensorAnswer> {
  const n = nativeHelpers;
  if (!n?.queryPedometer || n.pedometerAvailable === false) return { kind: "unavailable" };
  try {
    const got = await n.queryPedometer({ fromMs: utcMonday(Date.now()), ask });
    switch (got.status) {
      case "ok": {
        // Steps without distance (some phones): metres from the steps.
        const meters = pedometerMeters(got.meters, got.steps);
        return meters === null ? { kind: "error" } : { kind: "distance", meters };
      }
      case "unavailable":
        return { kind: "unavailable" };
      case "denied":
        return { kind: "denied" };
      case "notDetermined":
        // Never asked (and this read did not ask): not a refusal, so no note and no Settings button.
        return { kind: "undetermined" };
      default:
        return { kind: "error" };
    }
  } catch {
    return { kind: "error" };
  }
}

async function sense(ask: boolean): Promise<SensorAnswer> {
  const n = nativeHelpers;
  if (Platform.OS === "ios") return sensePedometer(ask);
  if (Platform.OS !== "android" || !n?.readStepCounter || n.stepCounterAvailable === false) return { kind: "unavailable" };
  try {
    if ((await permitted(ask)) !== "granted") return { kind: "denied" };
    const got = await n.readStepCounter();
    if (!got.available) return { kind: "unavailable" };
    const reading = { steps: got.steps ?? NaN, elapsedRealtimeMs: got.elapsedRealtimeMs, wallClockMs: got.wallClockMs };
    return isValidReading(reading) ? { kind: "reading", reading } : { kind: "error" };
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    return code === "ERR_STEPS_PERMISSION" ? { kind: "denied" } : { kind: "error" };
  }
}

// One ledger write at a time: the card and a resume reading can overlap.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => {});
  return next;
}

function deps(): StepsDeps {
  return {
    client: gameStore.client,
    sense,
    load: () => getPref(LEDGER_KEY),
    save: async (text) => {
      await setPref(LEDGER_KEY, text);
    },
    now: () => Date.now(),
    platform: Platform.OS === "ios" ? "ios" : "android",
  };
}

/** The card's update (StepsModel.update). `ask`: may show the permission prompt. */
export function updateStepsOnPhone(previous: StepsView = EMPTY_STEPS_VIEW, ask = false): Promise<StepsView> {
  return serial(() => updateSteps(deps(), previous, ask));
}

/** A quiet reading (no prompt, no network) when the game comes to the front. Android only (iOS keeps its own history). */
export function noteStepsOnPhone(): Promise<void> {
  if (Platform.OS !== "android") return Promise.resolve();
  return serial(() => noteStepsWith(deps()));
}
