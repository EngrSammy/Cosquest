// The boss's pieces, shared by the raid screen, the banner and a boss fought
// as a duel: the crown (iOS draws SF Symbol crown.fill; Ionicons has none, so
// it is a small SVG here) and the big HP bar that drains as the crew lands
// hits. costquest-ios Features/RaidsFeature.swift (RaidHPBar, RaidLook).
import { useEffect } from "react";
import { Platform, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { RAID_COLOR } from "@/features/game/raids";
import { SPRING_RAID_HP } from "@/features/game/spring";

import { MAX_FONT_SCALE } from "./kit";
import { HUD_GLASS } from "./look";
import { GF } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

/** Hidden from screen readers; react-native-svg hands these props to the DOM on the web, where only aria-hidden is valid. */
const SVG_HIDDEN = Platform.OS === "web" ? { "aria-hidden": true } : { accessibilityElementsHidden: true, importantForAccessibility: "no" as const };

export function RaidCrown({ size = 20, color = "#FFFFFF" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...SVG_HIDDEN}>
      <Path d="M2.5 7.5 L7.5 12 L12 4 L16.5 12 L21.5 7.5 L19.5 18 H4.5 Z M4.5 19.5 H19.5 V21.5 H4.5 Z" fill={color} />
    </Svg>
  );
}

/** A round badge with the crown on it (the banner's and the map's boss mark). */
export function RaidBadge({ size = 34 }: { size?: number }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2 }]}>
      <RaidCrown size={size * 0.56} />
    </View>
  );
}

/** The boss's health: a big bar that drains as the crew lands hits. */
/** `onLight`: the big bar on a cream page (the boss briefing): a well-coloured track, ink numbers. */
export function RaidHPBar({ hp, maxHp, compact, onLight }: { hp: number; maxHp: number; compact?: boolean; onLight?: boolean }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const left = Math.max(0, hp);
  const share = left / Math.max(1, maxHp);
  const reduced = useReducedMotion();
  const width = useSharedValue(share);
  useEffect(() => {
    // RaidHPBar `.spring(response: 0.45, dampingFraction: 0.7)`; a plain fade-length move under Reduce Motion.
    width.set(reduced ? withTiming(share, { duration: 150 }) : withSpring(share, SPRING_RAID_HP));
  }, [share, width, reduced]);
  const fill = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, width.get())) * 100}%` }));
  const height = compact ? 6 : 30;
  return (
    <View accessible accessibilityLabel={`Boss health ${left} of ${maxHp}`} style={{ gap: 6 }}>
      <View style={[styles.track, (compact || onLight) && styles.trackCompact, { height, borderRadius: height / 2, borderWidth: compact || onLight ? 0 : 2 }]}>
        <Animated.View style={[styles.fill, { borderRadius: height / 2, minWidth: share > 0 && !compact ? 18 : 0 }, fill]}>
        </Animated.View>
      </View>
      {!compact ? <Text style={[styles.label, onLight && styles.labelOnLight]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{`HP ${left} / ${maxHp}`}</Text> : null}
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    badge: { backgroundColor: RAID_COLOR, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF" },
    // The big bar sits over a boss scene: ink glass with a white rim. The compact one sits on a paper plate.
    track: { backgroundColor: HUD_GLASS.fill, borderColor: "rgba(255,255,255,0.7)", overflow: "hidden" },
    trackCompact: { backgroundColor: "rgba(28,43,58,0.12)" },
    // One flat colour: the boss's (no gradient).
    fill: { height: "100%", overflow: "hidden", backgroundColor: RAID_COLOR },
    labelOnLight: { color: "#1C2B3A", textShadowColor: "transparent", textShadowRadius: 0 },
    label: { textShadowColor: "rgba(18,26,38,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3, fontFamily: GF.display, fontSize: 18, lineHeight: 22, color: "#FFFFFF", textAlign: "center", fontVariant: ["tabular-nums"] },
  },
  { trackCompact: { backgroundColor: "rgba(255,255,255,0.14)" } },
);
