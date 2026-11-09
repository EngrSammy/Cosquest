// Swift `spring(response:dampingFraction:)` as a Reanimated withSpring config
// (stiffness = (2π/response)², damping = 2·ζ·√stiffness, mass 1). Pure, so the
// numbers are tested.
//
// The game's motion is tight and settled (components/game/sheetMotion.ts):
// nothing overshoots. So every spring the screens use is `settle(response)`:
// the Swift spring's response (how quickly it gets there), critically damped
// and clamped, so it lands without a bounce. The Swift damping fractions
// (0.5 to 0.8) each overshot a little, and those small bounces added up to the
// springy feel. Mass is always given: Reanimated 4's default mass is 4, which
// turns a config written for mass 1 into a wobble.
export type SpringConfig = { stiffness: number; damping: number; mass: number };
export type SettleConfig = SpringConfig & { overshootClamping: true };

export function springOf(response: number, dampingFraction: number): SpringConfig {
  const stiffness = (2 * Math.PI / response) ** 2;
  return { stiffness, damping: 2 * dampingFraction * Math.sqrt(stiffness), mass: 1 };
}

/** A spring that arrives in about `response` seconds and stops dead: critically damped, never past the target. */
export function settle(response: number): SettleConfig {
  return { ...springOf(response, 1), overshootClamping: true };
}

/** RaidHPBar (Swift response 0.45). */
export const SPRING_RAID_HP = settle(0.45);
/** RelicDropCard flip (Swift response 0.6). */
export const SPRING_DROP_FLIP = settle(0.6);
/** Relic detail overlay (Swift response 0.35). */
export const SPRING_RELIC_DETAIL = settle(0.35);
/** Shard bar (Swift response 0.4). */
export const SPRING_SHARD_BAR = settle(0.4);
/** Rooms hosting panel (Swift response 0.4). */
export const SPRING_ROOM_HOST = settle(0.4);
/** Rooms private toggle (Swift response 0.3). */
export const SPRING_ROOM_TOGGLE = settle(0.3);
/** A button pressed down and let go (fast, so it tracks the finger). */
export const SPRING_PRESS = settle(0.22);
