// The frame the game's sheets share: a bottom sheet with the game's backdrop
// (GameBackdrop.tsx) and a grabber, slid up over the map. Wrap it in
// <SheetHost> (Sheet.tsx) for the scrim and the drag down that close it on iOS,
// and put <SheetHeader> (SheetHeader.tsx) at its top.
import type { ReactNode } from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";

import { GameBackdrop } from "./GameBackdrop";
import { useSheetMotion } from "./sheetMotion";
import { RADIUS, useLook } from "./look";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

/**
 * `full` covers the whole screen (the Profile, which has its own top bar);
 * otherwise it stops `top` below the screen's top, like the Journal always has.
 */
export function SheetFrame({ children, top, full, tint }: { children: ReactNode; top: number; full?: boolean; tint?: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const motion = useSheetMotion();
  const look = useLook();
  return (
    <Animated.View entering={motion.entering} style={[styles.sheet, { top, backgroundColor: look.screen }, full && styles.full]}>
      <GameBackdrop tint={tint} />
      {full ? null : <View style={styles.grabber} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden />}
      {children}
    </Animated.View>
  );
}

const STYLE_PAIR = themedStyles({
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, overflow: "hidden", elevation: 18 },
  full: { borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  grabber: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, marginTop: 8, backgroundColor: "rgba(28,43,58,0.22)" },
});
