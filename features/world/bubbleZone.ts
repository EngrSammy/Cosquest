// Where the game's Chats bubble sits (components/world/GameBubble.tsx), as
// one set of numbers for everything that lines up with it or has to keep
// clear of it: the chat's edge handle and swipe coachmark (the same height,
// so the two read as one doorway), Android's gesture-exclusion strip
// (gesture.ts), and game screens. Pure: no React Native imports.

/** The bubble's centre line, as a share of the screen height. */
export const BUBBLE_Y = 0.42;
export const BUBBLE_HEIGHT = 56;
/** Its full width on the map (the tab, the chevron, the icon). */
export const BUBBLE_WIDTH = 60;
/**
 * Its width over a full-screen game screen (a quiz, a fight, a reward, the
 * Warden's first run): a sliver inside the game's side margin (18), so it no
 * longer covers answers, titles or "+470 XP" (F-38). Still a tap, a drag and
 * a long press, as on the map.
 */
export const BUBBLE_TUCKED_WIDTH = 14;
/** The unread badge sticks out above the bubble's top edge. */
export const BUBBLE_BADGE_OVERHANG = 6;

/** The bubble's (and the edge handle's) top, for a screen height and top inset. */
export function bubbleTop(height: number, topInset: number): number {
  return Math.max(topInset + 72, height * BUBBLE_Y - BUBBLE_HEIGHT / 2);
}

export type BubbleZone = { x: number; y: number; width: number; height: number };

/** The rectangle the bubble covers (badge included), to keep content out of. */
export function bubbleZone(height: number, topInset: number, tucked: boolean): BubbleZone {
  const top = bubbleTop(height, topInset);
  return {
    x: 0,
    y: top - BUBBLE_BADGE_OVERHANG,
    width: tucked ? BUBBLE_TUCKED_WIDTH : BUBBLE_WIDTH,
    height: BUBBLE_HEIGHT + BUBBLE_BADGE_OVERHANG,
  };
}
