// The floating tab bar (app/(tabs)/_layout.tsx) and the room the tab screens
// leave under their content for it. Figma: the bar floats 24 above the bottom
// edge; on phones with a home indicator or a gesture / button bar it floats
// that far above the inset instead, so it never sits on the system bar.
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const TAB_BAR_HEIGHT = 68;
export const TAB_BAR_GAP = 24;

/** The bar's distance from the bottom of the screen for a bottom inset. */
export function tabBarBottom(insetBottom: number): number {
  return Math.max(TAB_BAR_GAP, insetBottom + 8);
}

/** Room for the bar under a tab screen's content (it used to be a fixed 140). */
export function tabBarSpace(insetBottom: number): number {
  return tabBarBottom(insetBottom) + TAB_BAR_HEIGHT + 48;
}

export function useTabBarSpace(): number {
  return tabBarSpace(useSafeAreaInsets().bottom);
}
