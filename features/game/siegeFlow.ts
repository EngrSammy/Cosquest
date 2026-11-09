// The quiz Siege's staging, the pure half (costquest-ios Features/SiegeFeature.swift
// SiegeView, Roam/StrikeHaptics.swift): the timings of one exchange, the
// haptic plans that stand in for Core Haptics, the words, and the Warden's
// moments. siege.ts has the model and the server calls; components/game/
// SiegeScreen.tsx draws it.
//
// Pure: no React Native. Siblings are imported with the .ts extension.
import { WardenMoment, wardenStyle } from "./warden.ts";
import type { RoamMe } from "./wire.ts";

/** One exchange, in ms (SiegeView.land / answer / pop). */
export const STRIKE_PULSE_MS = 360;
export const HIT_LAND_MS = 320;
export const EFFECT_GAP_MS = 160;
export const BLOCKED_MS = 900;
export const STRIKE_LEAD_MS = 200;
export const STRIKE_TAIL_MS = 250;
/** The beat the player gets to read before the next question or the end. */
export const BEAT_MS = 1100;
export const POP_LIFE_MS = 1400;

export type HapticKind = "light" | "medium" | "heavy" | "soft" | "rigid" | "success" | "error";
export type Pulse = { haptic: HapticKind; sound: "pulse1" | "pulse2" | "pulse3" };

/**
 * StrikeHaptics.pulse(i): the three rising pulses (Core Haptics transients,
 * intensity 0.45 + 0.2i, sharpness 0.3 + 0.3i). Without a haptic engine iOS
 * itself falls back to Medium, Medium, Heavy; expo-haptics has no transients,
 * so the three impacts rise Light, Medium, Heavy.
 */
export function strikePulse(i: number): Pulse {
  const k = Math.max(0, Math.min(2, Math.floor(i)));
  return { haptic: (["light", "medium", "heavy"] as const)[k], sound: (["pulse1", "pulse2", "pulse3"] as const)[k] };
}

export type TimedHaptic = { atMs: number; haptic: HapticKind };

/**
 * StrikeHaptics.resolve(win:): the crystal breaking is a burst and a rumble
 * (Heavy, then Rigid 180 ms later); a miss is a dull thud twice (Soft, Soft
 * 120 ms apart).
 */
export function resolveHaptics(win: boolean): TimedHaptic[] {
  return win
    ? [
        { atMs: 0, haptic: "heavy" },
        { atMs: 180, haptic: "rigid" },
      ]
    : [
        { atMs: 0, haptic: "soft" },
        { atMs: 120, haptic: "soft" },
      ];
}

/** The Guardian's cracks by what is left of it (GuardianView.crystal). */
export function crackLevel(share: number): 0 | 1 | 2 {
  return share < 0.34 ? 2 : share < 0.67 ? 1 : 0;
}

export const SIEGE_INTRO_RULES = "Right answers hit with your Relic, faster hits harder. Wrong or late, the Guardian strikes your focus.";
export const RETREAT_TITLE = "Leave the siege?";
export const RETREAT_MESSAGE = "The clock keeps running, and a siege left unfinished is lost.";

export function introLine(holderName: string, place: string): string {
  return `${holderName} holds ${place}. Beat its Guardian and it's yours.`;
}

export function roundChip(round: number, total: number): string {
  return `Round ${round + 1}/${total}`;
}

export function guardianLabel(holderName: string, hp: number, maxHp: number): string {
  return `${holderName} Guardian, ${Math.max(0, hp)} of ${maxHp} health`;
}

export type ResultCopy = { title: string; size: number; line: string };

/** The result's headline and line (SiegeView.result). */
export function resultCopy(won: boolean, place: string, holderName: string, myFactionName: string | null | undefined): ResultCopy {
  return won
    ? { title: "TAKEN!", size: 56, line: `${place} flies ${myFactionName ?? "your"} colours now.` }
    : { title: "REPELLED", size: 50, line: `The ${holderName} Guardian held. Rest up: you can go again in 10 minutes.` };
}

/** The foot button's label. */
export function resultButton(won: boolean): string {
  return won ? "Back to the map" : "Retreat";
}

/** What the Warden is told when a siege ends (RoamStore.siegeWonMoment / siegeLostMoment). */
export function siegeMoment(
  ctx: { me: RoamMe | null; playerName: string },
  won: boolean,
  place: string,
  holderName: string,
  rounds: number | null,
): WardenMoment {
  const style = wardenStyle(ctx.me?.faction);
  if (won) {
    return new WardenMoment("siege_won", style, [
      ["name", ctx.playerName],
      ["place", place],
      ["taken_from", holderName],
      ["rounds", rounds === null ? null : String(rounds)],
      ["faction", ctx.me?.faction_name],
    ]);
  }
  return new WardenMoment("siege_lost", style, [
    ["name", ctx.playerName],
    ["place", place],
    ["holder", holderName],
  ]);
}

/** The answer's spoken form, for VoiceOver on a choice: "Answer 2 of 4: text". */
export function choiceLabel(i: number, total: number, text: string, state: "right" | "wrong" | "removed" | null): string {
  const base = `Answer ${i + 1} of ${total}: ${text}`;
  return state === "right" ? `${base}. Correct.` : state === "wrong" ? `${base}. Wrong.` : state === "removed" ? `${base}. Removed by your Relic.` : base;
}
