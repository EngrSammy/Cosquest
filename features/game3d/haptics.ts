// Hit haptics in the 3D fight, the app's half (phone-hardware design 2.1, 1 Nov 2026).
//
// Godot's fight.gd sends {"event":"haptic","k":kind,"s":0..1,"rm"?:1,"fight_id"} next to its
// camera shakes (game3d/haptics.gd already throttles per kind). This module is pure, so node
// tests run it: which messages are touches (routeBridgeMessage), what each kind plays
// (hapticPlan), and a second throttle (HapticThrottle) so a burst of hits can never become one
// continuous buzz whatever Godot sends. hapticsPlayer.ts plays the plan with expo-haptics:
//
//   iOS      UIImpactFeedbackGenerator / UINotificationFeedbackGenerator /
//            UISelectionFeedbackGenerator (Core Haptics underneath). iOS mutes them itself
//            when Settings > Sounds & Haptics > System Haptics is off, in Low Power Mode, and
//            while the camera records.
//   Android  expo-haptics plays these as VibrationEffect waveforms with amplitudes (light 30,
//            medium/rigid 50, heavy 70 of 255). The system's "Vibration & haptics" master
//            switch (Android 13+) and Do Not Disturb silence them.
//
// The in-game choice (Profile > Haptics, prefs.ts hapticsOn(), on by default) is checked at
// both ends: the fight config's `haptics` (Godot sends nothing when it is off) and again
// before each touch plays, so turning it off mid-fight takes effect at once.

export type HapticKind = "hit" | "hit_heavy" | "slam" | "block" | "parry" | "hurt" | "cast" | "ko";

export const HAPTIC_KINDS: readonly HapticKind[] = ["hit", "hit_heavy", "slam", "block", "parry", "hurt", "cast", "ko"];

/** One touch: expo-haptics' three calls, by name (no import here, so node can test this). */
export type HapticCall =
  | { type: "impact"; style: "light" | "medium" | "heavy" | "rigid" | "soft" }
  | { type: "notify"; kind: "success" | "warning" | "error" }
  | { type: "selection" };

/** A pattern: calls at offsets (ms) from the first. */
export type HapticStep = { at: number; call: HapticCall };

const impact = (style: "light" | "medium" | "heavy" | "rigid" | "soft", at = 0): HapticStep => ({ at, call: { type: "impact", style } });

/**
 * What each kind plays. `strength` (0..1, from the shake it sits beside) picks between two
 * weights where it matters; `reduceMotion` turns the KO's rumble into one firm tap.
 */
export function hapticPlan(kind: HapticKind, strength = 1, reduceMotion = false): HapticStep[] {
  switch (kind) {
    case "hit":
      return [impact("light")];
    case "hit_heavy":
      return [impact(strength >= 0.6 ? "heavy" : "medium")];
    case "slam":
      return [impact(strength >= 0.7 ? "heavy" : "medium")];
    case "block":
      return [impact("rigid")];
    case "parry":
      // A sharp double tap (on Android, a two-pulse waveform).
      return [{ at: 0, call: { type: "notify", kind: "success" } }];
    case "hurt":
      return [impact("medium")];
    case "cast":
      return [{ at: 0, call: { type: "selection" } }];
    case "ko":
      // A long rumble, then silence (the throttle keeps everything else out for KO_QUIET_MS).
      if (reduceMotion) return [impact("heavy")];
      return [impact("heavy"), impact("heavy", 90), impact("medium", 200), impact("soft", 340)];
  }
}

/** Higher wins inside the gap; a KO passes over anything. */
export const HAPTIC_PRIORITY: Record<HapticKind, number> = {
  hit: 1,
  cast: 2,
  block: 2,
  hurt: 3,
  hit_heavy: 3,
  slam: 3,
  parry: 4,
  ko: 5,
};
/** Any two touches at least this far apart, unless the newer one matters more. */
export const HAPTIC_MIN_GAP_MS = 70;
/** At most this many touches in any one second (a KO is never refused for it). */
export const HAPTIC_MAX_PER_S = 8;
/** After a KO, nothing else (another KO included) for this long. */
export const HAPTIC_KO_QUIET_MS = 700;

/** The app's own throttle. `now` is injectable for tests. */
export class HapticThrottle {
  private recent: number[] = [];
  private lastAt = -Infinity;
  private lastPriority = 0;
  private quietUntil = -Infinity;
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  allow(kind: HapticKind): boolean {
    const t = this.now();
    const pri = HAPTIC_PRIORITY[kind];
    if (pri === undefined) return false;
    if (t < this.quietUntil) return false;
    if (kind === "ko") {
      this.mark(t, pri);
      this.quietUntil = t + HAPTIC_KO_QUIET_MS;
      return true;
    }
    if (t - this.lastAt < HAPTIC_MIN_GAP_MS && pri <= this.lastPriority) return false;
    this.recent = this.recent.filter((r) => t - r < 1000);
    if (this.recent.length >= HAPTIC_MAX_PER_S) return false;
    this.mark(t, pri);
    return true;
  }

  private mark(t: number, pri: number) {
    this.recent.push(t);
    this.lastAt = t;
    this.lastPriority = pri;
  }
}

export type HapticMessage = { kind: HapticKind; strength: number; reduceMotion: boolean };

/**
 * What one message from Godot's callback is, for the fight that is open now (`generation`):
 * a state push, a touch, the result, or nothing (another fight's, unreadable, or an event this
 * build does not know, which must never be taken for the result).
 */
export type BridgeRoute =
  | { to: "state"; state: string }
  | { to: "haptic"; haptic: HapticMessage }
  | { to: "result"; json: string }
  | { to: "drop" };

export function routeBridgeMessage(json: string, generation: number): BridgeRoute {
  let m: { event?: unknown; state?: unknown; fight_id?: unknown; k?: unknown; s?: unknown; rm?: unknown } | null;
  try {
    m = JSON.parse(json);
  } catch {
    m = null;
  }
  if (!m || typeof m !== "object" || m.fight_id !== generation) return { to: "drop" };
  if (m.event === "state") return { to: "state", state: String(m.state ?? "") };
  if (m.event === "haptic") {
    const kind = String(m.k ?? "") as HapticKind;
    if (!HAPTIC_KINDS.includes(kind)) return { to: "drop" };
    const s = typeof m.s === "number" && Number.isFinite(m.s) ? Math.min(1, Math.max(0, m.s)) : 1;
    return { to: "haptic", haptic: { kind, strength: s, reduceMotion: m.rm === 1 || m.rm === true } };
  }
  if (m.event !== undefined) return { to: "drop" };
  return { to: "result", json };
}
