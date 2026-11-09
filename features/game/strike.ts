// The Strike and the rules around an answer, as pure functions (no react-native
// here, so node can test them). costquest-ios Roam/EncounterView.swift (submit),
// Roam/StrikeHaptics.swift, Roam/ShrineStage.swift (pulse/resolve) and
// Roam/ChallengeViews.swift (HintBar, ChoiceButton, DeadlineBar).

/** Pulses start this far apart (EncounterView.submit: 420 ms). */
export const PULSE_INTERVAL_MS = 420;
/** The crystal's swell on pulse i (ShrineStage.pulse: 1.12 + 0.06 i). */
export const PULSE_SCALES: readonly number[] = [1.12, 1.18, 1.24];
/** Total time the three pulses take, which the verdict waits for. */
export const STRIKE_MS = PULSE_INTERVAL_MS * PULSE_SCALES.length;

export type ImpactStyle = "Light" | "Medium" | "Heavy" | "Soft" | "Rigid";
export type NotifyType = "Success" | "Error" | "Warning";
export type HapticStep = { atMs: number; haptic: { kind: "impact"; style: ImpactStyle } | { kind: "notify"; type: NotifyType } };

/**
 * StrikeHaptics.pulse(i) on expo-haptics (no Core Haptics): the pulse sharpens as
 * it rises. Swift's own fallback is .medium, .medium, .heavy; the brief asks for
 * Light, Medium, Heavy, which is the rising feel of the transients.
 */
export function pulseHaptic(i: number): ImpactStyle {
  return i <= 0 ? "Light" : i === 1 ? "Medium" : "Heavy";
}

/**
 * StrikeHaptics.resolve(win:) as timed impacts. Win: a burst, a rumble 180 ms
 * later and the success tick as the last tap lands (0.3 s). Loss: a dull thud
 * twice 120 ms apart, then the error.
 */
export function resolveHaptics(win: boolean): HapticStep[] {
  return win
    ? [
        { atMs: 0, haptic: { kind: "impact", style: "Heavy" } },
        { atMs: 180, haptic: { kind: "impact", style: "Rigid" } },
        { atMs: 300, haptic: { kind: "notify", type: "Success" } },
      ]
    : [
        { atMs: 0, haptic: { kind: "impact", style: "Soft" } },
        { atMs: 120, haptic: { kind: "impact", style: "Soft" } },
        { atMs: 240, haptic: { kind: "notify", type: "Error" } },
      ];
}

/** Swift spring(response r, dampingFraction z) as a Reanimated withSpring config (mass 1). */
export function springOf(response: number, dampingFraction: number): { stiffness: number; damping: number; mass: number } {
  const stiffness = (2 * Math.PI / response) ** 2;
  return { stiffness, damping: 2 * dampingFraction * Math.sqrt(stiffness), mass: 1 };
}

/** The verdict's win, as EncounterView computes it. */
export function isWin(v: { correct: number; late: boolean }): boolean {
  return v.correct > 0 && !v.late;
}

/** The result line (EncounterView.resultLine). */
/**
 * The verdict's title. `timedOut`: the clock sent the answer with nothing given (the
 * server marks that as a plain miss, not late, since it arrived in time), so the
 * player reads "Time's up!" rather than being told the crystal resisted an answer
 * they never gave.
 */
export function resultTitle(v: { correct: number; total: number; late: boolean; kind: string }, timedOut = false): { text: string; size: number; win: boolean } {
  const win = isWin(v);
  const text = v.late || (timedOut && !win && v.kind !== "blitz") ? "Time's up!" : v.kind === "blitz" ? `${v.correct} of ${v.total}!` : win ? "Correct!" : "The crystal resisted";
  return { text, size: win ? 38 : 30, win };
}

/** The throw grade's chip: Flawless = sun, Brilliant = mint, otherwise sky. */
export function gradeColorKey(grade: string): "sun" | "mint" | "sky" {
  return grade === "Flawless" ? "sun" : grade === "Brilliant" ? "mint" : "sky";
}

/** RoamStyle.tierName: the tier, capitalised. */
export function tierName(tier: string): string {
  return tier ? tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase() : "";
}

/** RoamStyle.challengeName: Swift's words (Rebus, Duel; anything else is Trivia). */
export function challengeLabel(kind: string): string {
  switch (kind) {
    case "sequence":
      return "Sequence";
    case "rebus":
      return "Rebus";
    case "blitz":
      return "Blitz";
    case "duel":
      return "Duel";
    default:
      return "Trivia";
  }
}

/** The scrim under the question: lighter while the shrine is shown, darker once you play (EncounterView.scrim). */
export function scrimOpacity(phase: string): number {
  return phase === "approach" || phase === "opening" ? 0.25 : 0.7;
}

/** HintBar: a hint is usable when allowed, not busy, and a bag item or the coins cover it. */
export function hintDisabled(h: { allowed: boolean; item: number; coins: number; cost: number; busy: boolean }): boolean {
  return !h.allowed || h.busy || (h.item <= 0 && h.coins < h.cost);
}

/** The deadline bar's seconds shown (rounded up) and whether the row turns berry (under 6 s). */
export function deadlineView(leftSeconds: number): { seconds: number; hot: boolean } {
  const left = Math.max(0, leftSeconds);
  return { seconds: Math.ceil(left), hot: left < 6 };
}

export type ChoiceState = "idle" | "picked" | "right" | "wrong" | "dim" | "removed";

/** One answer button's state (TriviaCard + ChoiceButton): after the verdict the key shows, before it a 50/50 may have removed it. */
export function choiceState(i: number, picked: number | null, removed: readonly number[], correct: number | null): ChoiceState {
  if (correct !== null) return i === correct ? "right" : i === picked ? "wrong" : "dim";
  if (removed.includes(i)) return "removed";
  return picked === i ? "picked" : "idle";
}

/** ChoiceButton's look for a state: opacity (dimmed 0.45, removed 0.22), scale (the right one 1.03), and the face. */
export function choiceLook(state: ChoiceState): { opacity: number; scale: number; face: "choice" | "mint" | "berry" | "grey" } {
  switch (state) {
    case "right":
      return { opacity: 1, scale: 1.03, face: "mint" };
    case "wrong":
      return { opacity: 1, scale: 1, face: "berry" };
    case "dim":
      return { opacity: 0.45, scale: 1, face: "grey" };
    case "removed":
      return { opacity: 0.22, scale: 1, face: "choice" };
    default:
      return { opacity: 1, scale: 1, face: "choice" };
  }
}

/** Second chance label, with the bag's count of retries. */
export function secondChanceLabel(left: number): string {
  return `Second chance (${Math.max(0, left)} left)`;
}
