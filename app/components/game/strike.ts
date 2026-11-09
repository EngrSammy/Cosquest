// The Strike, run: three rising pulses (crystal swell, sound, haptic) 420 ms
// apart that go on while the server marks the answer, then the break
// (costquest-ios Roam/EncounterView.swift submit(), StrikeHaptics.swift). The
// plan itself (timings, scales, haptic steps) is features/game/strike.ts.
import * as Haptics from "expo-haptics";

import { PULSE_INTERVAL_MS, PULSE_SCALES, pulseHaptic, resolveHaptics, STRIKE_MS, type ImpactStyle, type NotifyType } from "@/features/game/strike";

import { PULSES, playSound } from "./sound";

const IMPACT: Record<ImpactStyle, Haptics.ImpactFeedbackStyle> = {
  Light: Haptics.ImpactFeedbackStyle.Light,
  Medium: Haptics.ImpactFeedbackStyle.Medium,
  Heavy: Haptics.ImpactFeedbackStyle.Heavy,
  Soft: Haptics.ImpactFeedbackStyle.Soft,
  Rigid: Haptics.ImpactFeedbackStyle.Rigid,
};
const NOTIFY: Record<NotifyType, Haptics.NotificationFeedbackType> = {
  Success: Haptics.NotificationFeedbackType.Success,
  Error: Haptics.NotificationFeedbackType.Error,
  Warning: Haptics.NotificationFeedbackType.Warning,
};

export { PULSE_SCALES };

export type StrikeStage = { pulse: (i: number) => void };

/**
 * Start the three pulses now. `done` settles once the third has had its 420 ms
 * (the verdict waits for it, so the wait is the suspense); `cancel` stops the
 * rest and settles at once (the answer could not be sent).
 */
export function startStrike(stage: StrikeStage): { done: Promise<void>; cancel: () => void } {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let finish: () => void = () => {};
  let cancelled = false;
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const beat = (i: number) => {
    if (cancelled) return;
    stage.pulse(i);
    playSound(PULSES[i]);
    Haptics.impactAsync(IMPACT[pulseHaptic(i)]).catch(() => {});
  };
  beat(0);
  for (let i = 1; i < PULSE_SCALES.length; i++) timers.push(setTimeout(() => beat(i), PULSE_INTERVAL_MS * i));
  timers.push(setTimeout(finish, STRIKE_MS));
  return {
    done,
    cancel() {
      cancelled = true;
      timers.forEach(clearTimeout);
      finish();
    },
  };
}

/** The break, felt and heard: a win rings, a miss thuds (StrikeHaptics.resolve). */
export function playResolve(win: boolean) {
  playSound(win ? "reward" : "hit");
  for (const step of resolveHaptics(win)) {
    const fire = () => {
      const h = step.haptic;
      (h.kind === "impact" ? Haptics.impactAsync(IMPACT[h.style]) : Haptics.notificationAsync(NOTIFY[h.type])).catch(() => {});
    };
    if (step.atMs <= 0) fire();
    else setTimeout(fire, step.atMs);
  }
}
