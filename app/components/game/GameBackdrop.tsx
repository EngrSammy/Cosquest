// The game's sheet and screen backdrop ("Sunlit Real Places" 6.5): the page
// colour (warm cream by day, ink by dusk, following the map) with a faint
// radial of light at the top, in the sun's colour unless a screen passes its
// faction or rarity. Sits behind a screen's content (absolute fill, ignores
// touches). No gradients to navy, no maroon.
import { StyleSheet, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { ACCENT, useLook } from "./look";

export function GameBackdrop({ tint = ACCENT.sun.fill }: { tint?: string }) {
  const look = useLook();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: look.screen }]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="cq-backdrop-glow" cx="50" cy="0" rx="75" ry="38" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={tint} stopOpacity={look.dark ? 0.12 : 0.08} />
            <Stop offset="1" stopColor={tint} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#cq-backdrop-glow)" />
      </Svg>
    </View>
  );
}
