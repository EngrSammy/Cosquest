// Plays the 3D fight's touches (haptics.ts decides what and when) with expo-haptics, behind the
// player's in-game choice (prefs.ts hapticsOn()). Kept apart from haptics.ts so that one stays
// free of native imports and node tests can run it.
import * as Haptics from "expo-haptics";

import { hapticsOn } from "@/components/game/prefs";

import { HapticThrottle, hapticPlan, type HapticCall, type HapticMessage } from "./haptics";

const IMPACT: Record<string, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
  rigid: Haptics.ImpactFeedbackStyle.Rigid,
  soft: Haptics.ImpactFeedbackStyle.Soft,
};
const NOTIFY: Record<string, Haptics.NotificationFeedbackType> = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
};

function play(call: HapticCall) {
  if (!hapticsOn()) return;
  const p =
    call.type === "impact"
      ? Haptics.impactAsync(IMPACT[call.style])
      : call.type === "notify"
        ? Haptics.notificationAsync(NOTIFY[call.kind])
        : Haptics.selectionAsync();
  p.catch(() => {});
}

let throttle = new HapticThrottle();

/** A new fight starts with a fresh throttle (a KO's quiet must not carry into the next fight). */
export function resetFightHaptics() {
  throttle = new HapticThrottle();
}

/** One touch from Godot: throttled, then played (later steps of a pattern on timers). */
export function playFightHaptic(h: HapticMessage) {
  if (!hapticsOn() || !throttle.allow(h.kind)) return;
  for (const step of hapticPlan(h.kind, h.strength, h.reduceMotion)) {
    if (step.at <= 0) play(step.call);
    else setTimeout(() => play(step.call), step.at);
  }
}
