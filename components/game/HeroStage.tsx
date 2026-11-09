// Where the player's hero stands: the diagonal panels, a floor glow in the
// house colour, and the figure. The figure is the same placeholder the iOS
// game uses until the 3D avatar lands: a cloaked silhouette in the house
// colour that breathes on the spot (still when Reduce Motion is on).
// costquest-ios UI/HeroStage.swift (HeroStage, HeroFigure, HeroSlot).
import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import type { ComponentProps, ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { withAlpha } from "./kit";
import { ELEVATION, RADIUS, SURFACES, useLook } from "./look";
import { edgeOf, GF, GP } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

export default function HeroStage({ tint, height = 340 }: { tint: string; height?: number }) {
  const figureH = height * 0.78;
  return (
    <View accessible accessibilityLabel="Your hero" style={{ height, alignItems: "center", justifyContent: "center" }}>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
        <Path
          d="M 0 18 L 36 18 L 50 42 L 12 96 L 0 96 Z M 100 18 L 64 18 L 50 42 L 88 96 L 100 96 Z"
          fill="rgba(255,255,255,0.16)"
        />
        <Path
          d="M 0 18 L 36 18 L 50 42 L 12 96 M 100 18 L 64 18 L 50 42 L 88 96"
          fill="none"
          stroke={withAlpha(GP.slate, 0.7)}
          strokeWidth={0.4}
        />
      </Svg>
      {/* Light from the floor in the house colour. */}
      <View style={{ position: "absolute", top: height / 2 + height * 0.36 - 45, width: 300, height: 90 }} pointerEvents="none">
        <Svg width={300} height={90}>
          <Defs>
            <RadialGradient id="floor" cx="150" cy="45" rx="150" ry="45" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={tint} stopOpacity={0.45} />
              <Stop offset="1" stopColor={tint} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx={150} cy={45} rx={150} ry={45} fill="url(#floor)" />
        </Svg>
      </View>
      <View style={{ height: figureH, marginTop: height * 0.04 }}>
        <HeroFigure tint={tint} height={figureH} />
      </View>
    </View>
  );
}

/** The stand-in for the 3D avatar: a cloaked hero in the house colour, breathing on the spot. */
export function HeroFigure({ tint, height }: { tint: string; height: number }) {
  const reduce = useReducedMotion();
  const breathe = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(breathe);
    breathe.value = 0;
    if (!reduce) breathe.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(breathe);
  }, [reduce, breathe]);
  const style = useAnimatedStyle(() => {
    const s = 0.992 + 0.02 * breathe.value;
    // Scales about the feet: the figure grows upward.
    return { transform: [{ translateY: (height / 2) * (1 - s) }, { scale: s }] };
  });
  const w = 62;
  const h = 100;
  const cx = w / 2;
  const edge = edgeOf(tint);
  return (
    <Animated.View style={style} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Svg width={height * 0.62} height={height} viewBox={`0 0 ${w} ${h}`}>
        <Defs>
          <LinearGradient id="cloak" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={edge} />
            <Stop offset="1" stopColor={tint} stopOpacity={0.85} />
          </LinearGradient>
          <LinearGradient id="body" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={GP.navy} />
            <Stop offset="1" stopColor={GP.navyEdge} />
          </LinearGradient>
          <LinearGradient id="hood" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={tint} />
            <Stop offset="1" stopColor={edge} />
          </LinearGradient>
        </Defs>
        <Ellipse cx={cx} cy={h * 0.985} rx={w * 0.4} ry={2.2} fill="rgba(31,59,77,0.18)" />
        <Path
          d={`M ${cx - w * 0.16} ${h * 0.24} Q ${cx - w * 0.36} ${h * 0.55} ${cx - w * 0.42} ${h * 0.97} Q ${cx} ${h * 0.92} ${cx + w * 0.42} ${h * 0.97} Q ${cx + w * 0.36} ${h * 0.55} ${cx + w * 0.16} ${h * 0.24} Z`}
          fill="url(#cloak)"
        />
        <Rect x={cx - w * 0.18} y={h * 0.25} width={w * 0.36} height={h * 0.5} rx={w * 0.12} ry={w * 0.12} fill="url(#body)" />
        <G>
          <Path d={`M ${cx} ${h * 0.4 - w * 0.09} L ${cx + w * 0.09} ${h * 0.4} L ${cx} ${h * 0.4 + w * 0.09} L ${cx - w * 0.09} ${h * 0.4} Z`} fill={tint} fillOpacity={0.35} />
          <Path d={`M ${cx} ${h * 0.4 - w * 0.05} L ${cx + w * 0.05} ${h * 0.4} L ${cx} ${h * 0.4 + w * 0.05} L ${cx - w * 0.05} ${h * 0.4} Z`} fill={tint} />
        </G>
        <Circle cx={cx} cy={h * 0.16} r={w * 0.15} fill="url(#hood)" />
        <Ellipse cx={cx} cy={h * 0.175} rx={w * 0.095} ry={w * 0.075} fill={GP.navyEdge} />
        <Circle cx={cx - w * 0.0325} cy={h * 0.17} r={w * 0.035} fill={tint} fillOpacity={0.4} />
        <Circle cx={cx + w * 0.0325} cy={h * 0.17} r={w * 0.035} fill={tint} fillOpacity={0.4} />
        <Rect x={cx - w * 0.0325 - w * 0.0125} y={h * 0.17 - w * 0.0225} width={w * 0.025} height={w * 0.045} rx={w * 0.0125} fill="#FFFFFF" />
        <Rect x={cx + w * 0.0325 - w * 0.0125} y={h * 0.17 - w * 0.0225} width={w * 0.025} height={w * 0.045} rx={w * 0.0125} fill="#FFFFFF" />
      </Svg>
    </Animated.View>
  );
}

/** An equipment slot. Filled with a Relic, or locked until the avatar work gives it something to hold. */
export function HeroSlot({ label, locked, children, a11y }: { label: string; locked?: boolean; children: ReactNode; a11y?: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View accessible accessibilityLabel={a11y ?? (locked ? `${label}, locked` : label)} style={{ alignItems: "center", gap: 6 }}>
      <View style={[styles.slot, locked && styles.slotLocked]}>
        <View style={{ opacity: locked ? 0.35 : 1 }}>{children}</View>
        {locked ? (
          <View style={styles.lock}>
            <Ionicons name="lock-closed" size={11} color={SURFACES.light.textMuted} />
          </View>
        ) : null}
      </View>
      <Text style={styles.slotLabel} maxFontSizeMultiplier={1.3}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

export function SlotIcon({ name }: { name: ComponentProps<typeof Ionicons>["name"] }) {
  const look = useLook();
  return <Ionicons name={name} size={24} color={look.textMuted} />;
}

const L = SURFACES.light;
const D = SURFACES.dark;

const STYLE_PAIR = themedStyles(
  {
    slot: {
      width: 70,
      height: 70,
      borderRadius: RADIUS.card,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: L.surface,
      ...ELEVATION.low,
    },
    slotLocked: { backgroundColor: L.surfaceAlt, shadowOpacity: 0, elevation: 0, boxShadow: "none" },
    lock: { position: "absolute", top: 4, right: 4, padding: 4, borderRadius: 10, backgroundColor: L.surface },
    slotLabel: { fontFamily: GF.bold, fontSize: 12, lineHeight: 15, letterSpacing: 0.6, color: L.textMuted },
  },
  {
    slot: { backgroundColor: D.surface, borderWidth: 1, borderColor: D.hairline, shadowOpacity: 0, elevation: 0, boxShadow: "none" },
    slotLocked: { backgroundColor: D.surfaceAlt },
    lock: { backgroundColor: D.surface },
    slotLabel: { color: D.textMuted },
  },
);
