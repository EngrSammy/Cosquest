// The moment a player goes up a level (costquest-ios Roam/RewardView.swift
// LevelUpView): a rotating sunburst, a burst of confetti, "LEVEL UP!", a big
// number badge, the rank, and a "Nice!" button. Big, brief, and it gets out of
// the way. Sunburst and ConfettiBurst are UI/ResultsView.swift's. Reduce Motion
// stops the spin and the confetti (the Swift confetti is not gated; this is).
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, Path, RadialGradient, Stop } from "react-native-svg";

import { settle } from "@/features/game/spring";

import { announce, GameButton, GameTitle, MAX_FONT_SCALE } from "./kit";
import { useLook } from "./look";
import { edgeOf, GF, GP } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

const SUN = 560;
const RAYS = 14;

/** Slow-turning rays (Sunburst): 14 wedges fading outwards, one turn in 24 s. */
export function Sunburst({ color = GP.sun, spin = true }: { color?: string; spin?: boolean }) {
  const turn = useSharedValue(0);
  useEffect(() => {
    if (!spin) {
      turn.value = 0;
      return;
    }
    turn.value = withRepeat(withTiming(360, { duration: 24000, easing: Easing.linear }), -1);
  }, [spin, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  const c = SUN / 2;
  const wedges = Array.from({ length: RAYS }, (_, i) => {
    const a0 = (i / RAYS) * 2 * Math.PI;
    const a1 = a0 + Math.PI / RAYS;
    return `M ${c} ${c} L ${c + c * Math.cos(a0)} ${c + c * Math.sin(a0)} L ${c + c * Math.cos(a1)} ${c + c * Math.sin(a1)} Z`;
  });
  return (
    <Animated.View style={[{ width: SUN, height: SUN }, style]} pointerEvents="none">
      <Svg width={SUN} height={SUN}>
        <Defs>
          <RadialGradient id="ray" cx={c} cy={c} r={c} gradientUnits="userSpaceOnUse">
            <Stop offset={40 / c} stopColor={color} stopOpacity={0.55} />
            <Stop offset={1} stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {wedges.map((d, i) => (
          <Path key={i} d={d} fill="url(#ray)" />
        ))}
      </Svg>
    </Animated.View>
  );
}

type Piece = { x: number; delay: number; speed: number; sway: number; spin: number; size: number; color: number };
const PIECES = 90;
const CONFETTI_S = 5.5;

function makePieces(): Piece[] {
  return Array.from({ length: PIECES }, () => ({
    x: Math.random(),
    delay: Math.random() * 0.9,
    speed: 0.28 + Math.random() * 0.22,
    sway: 10 + Math.random() * 26,
    spin: 2 + Math.random() * 5,
    size: 6 + Math.random() * 5,
    color: Math.floor(Math.random() * 16),
  }));
}

/** One burst of falling confetti (ConfettiBurst): 90 strips, every one driven by one clock. */
export function ConfettiBurst({ colors }: { colors: string[] }) {
  const { width, height } = useWindowDimensions();
  const clock = useSharedValue(0);
  const [pieces] = useState(makePieces);
  useEffect(() => {
    clock.value = withTiming(CONFETTI_S, { duration: CONFETTI_S * 1000, easing: Easing.linear });
  }, [clock]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {pieces.map((p, i) => (
        <ConfettiPiece key={i} piece={p} clock={clock} width={width} height={height} color={colors[p.color % colors.length]} />
      ))}
    </View>
  );
}

function ConfettiPiece({ piece, clock, width, height, color }: { piece: Piece; clock: SharedValue<number>; width: number; height: number; color: string }) {
  const style = useAnimatedStyle(() => {
    const t = clock.value;
    const life = t - piece.delay;
    if (life <= 0) return { opacity: 0 };
    const y = -20 + life * piece.speed * height;
    if (y > height + 20) return { opacity: 0 };
    const x = piece.x * width + Math.sin(life * 3 + piece.x * 10) * piece.sway;
    const fade = t > 4 ? Math.max(0, 1 - (t - 4)) : 1;
    return { opacity: fade, transform: [{ translateX: x }, { translateY: y }, { rotate: `${life * piece.spin}rad` }] };
  });
  return <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: piece.size, height: piece.size / 2, borderRadius: 1.5, backgroundColor: color, opacity: 0 }, style]} />;
}

export function LevelUp({ level, rank, rankUp, onDone }: { level: number; rank: string; rankUp: boolean; onDone: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const look = useLook();
  const reduce = useReducedMotion();
  const shown = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    shown.value = reduce ? 1 : withSpring(1, settle(0.55));
    announce(rankUp ? `Level up! Level ${level}. New rank: ${rank}.` : `Level up! Level ${level}. ${rank}.`);
  }, [reduce, shown, level, rank, rankUp]);

  const burstStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, shown.value)) }));
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.2 + 0.8 * shown.value }] }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, Math.max(0, shown.value)) }));

  return (
    <View style={styles.root} accessibilityViewIsModal>
      {/* look-fight (art direction 7): its own full screen, the burst in sun colours on the light screen colour.
          Opaque enough that the reward panel underneath does not read through the ceremony. */}
      <LinearGradient colors={look.dark ? ["#1E2433", look.screen] : ["#FFF6E2", look.screen]} style={[StyleSheet.absoluteFill, { opacity: 0.98 }]} />
      <Animated.View style={[styles.sun, burstStyle]} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Sunburst spin={!reduce} />
      </Animated.View>
      {reduce ? null : <ConfettiBurst colors={[GP.sun, GP.mint, GP.berry, GP.sky, "#FFFFFF"]} />}
      <Animated.View style={[styles.column, contentStyle]}>
        <GameTitle text="LEVEL UP!" size={50} color={GP.sun} edge="#1C2B3A" />
        <Animated.View
          style={[styles.badge, badgeStyle]}
          accessible
          accessibilityLabel={`Level ${level}`}>
          <View style={[styles.circle, { top: 8, backgroundColor: edgeOf(GP.sun) }]} />
          <LinearGradient colors={[GP.sun, GP.sunDeep]} style={[styles.circle, { top: 0 }]} />
          <View style={[styles.circle, { top: 0, borderWidth: 6, borderColor: "#FFFFFF" }]} />
          <Text style={styles.level} maxFontSizeMultiplier={MAX_FONT_SCALE} adjustsFontSizeToFit numberOfLines={1}>
            {level}
          </Text>
        </Animated.View>
        {rankUp ? (
          <>
            <Text style={styles.newRank}>New rank</Text>
            <GameTitle text={rank} size={36} color={GP.sun} edge="#1C2B3A" />
          </>
        ) : (
          <Text style={styles.rank}>{rank}</Text>
        )}
        <GameButton title="Nice!" color={GP.sun} onPress={onDone} style={{ marginTop: 14, alignSelf: "center", minWidth: 180 }} />
      </Animated.View>
    </View>
  );
}

const STYLE_PAIR = themedStyles({
  root: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  sun: { position: "absolute", width: SUN, height: SUN, alignItems: "center", justifyContent: "center" },
  column: { alignItems: "center", gap: 10, paddingHorizontal: 24 },
  badge: { width: 170, height: 178, alignItems: "center", justifyContent: "center", paddingBottom: 8 },
  circle: { position: "absolute", left: 0, width: 170, height: 170, borderRadius: 85 },
  level: {
    fontFamily: GF.display,
    fontSize: 86,
    color: "#FFFFFF",
    textShadowColor: GP.sunDeep,
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 0.1,
    paddingHorizontal: 22,
  },
  newRank: { fontFamily: GF.body, fontSize: 16, color: "#5A6878" },
  rank: { fontFamily: GF.display, fontSize: 24, color: "#1C2B3A" },
});
