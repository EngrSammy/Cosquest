// The shrine's crystal, in 2D (costquest-ios Roam/ShrineStage.swift: the 3D
// crystal that swells with each pulse of the Strike and then breaks). It
// bobs while you play; each pulse swells it 1.12 / 1.18 / 1.24 (0.12 s
// ease-out) and settles back; the break is a burst of shards in the tier's
// colour for a win and a few grey ones and a dull shrink for a miss.
import { type Ref, useEffect, useImperativeHandle } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Polygon } from "react-native-svg";

import { settle } from "@/features/game/spring";
import { PULSE_SCALES } from "@/features/game/strike";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

export type CrystalHandle = {
  /** One beat of the Strike (0...2): swell, then settle. */
  pulse: (i: number) => void;
  /** The break: a burst for a win, a fizzle for a miss. */
  resolve: (win: boolean) => void;
  /** Whole again, for a second chance. */
  reset: () => void;
};

const bobbing = () =>
  withRepeat(withSequence(withTiming(-6, { duration: 1400, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.quad) })), -1);

const SHARDS = 12;
const MISS_SHARDS = 4;

export function ShrineCrystal({ tint, size = 112, ref }: { tint: string; size?: number; ref?: Ref<CrystalHandle> }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const reduce = useReducedMotion();
  const scale = useSharedValue(reduce ? 1 : 0.01);
  const bob = useSharedValue(0);
  const glow = useSharedValue(0.25);
  const burst = useSharedValue(0);
  const shards = useSharedValue(SHARDS);
  const grey = useSharedValue(0);

  // The shrine rises into place (placed: spring 0.5/0.7), then bobs.
  useEffect(() => {
    if (reduce) {
      scale.value = 1;
      return;
    }
    scale.value = withSpring(1, settle(0.5));
    bob.value = bobbing();
  }, [reduce, scale, bob]);

  useImperativeHandle(ref, () => ({
    pulse(i) {
      const k = PULSE_SCALES[Math.min(PULSE_SCALES.length - 1, Math.max(0, i))];
      cancelAnimation(scale);
      scale.value = withSequence(
        withTiming(k, { duration: reduce ? 0 : 120, easing: Easing.out(Easing.quad) }),
        withDelay(reduce ? 0 : 20, withTiming(1, { duration: reduce ? 0 : 180, easing: Easing.in(Easing.quad) })),
      );
      glow.value = withSequence(withTiming(0.9, { duration: 120 }), withTiming(0.25, { duration: 260 }));
    },
    resolve(win) {
      cancelAnimation(scale);
      cancelAnimation(bob);
      bob.value = withTiming(0, { duration: 200 });
      grey.value = win ? 0 : 1;
      shards.value = win ? SHARDS : MISS_SHARDS;
      burst.value = 0;
      burst.value = withTiming(1, { duration: reduce ? 1 : win ? 800 : 500, easing: Easing.out(Easing.cubic) });
      scale.value = withTiming(win ? 0.01 : 0.7, { duration: reduce ? 1 : 450, easing: Easing.in(Easing.quad) });
      // The glow is part of the crystal (ShrineScene: a sphere inside it): it
      // flashes with the break and goes with it, rather than staying as a disc.
      glow.value = win ? withSequence(withTiming(1, { duration: reduce ? 1 : 150 }), withTiming(0, { duration: reduce ? 1 : 450 })) : withTiming(0, { duration: 300 });
    },
    reset() {
      grey.value = 0;
      burst.value = 0;
      shards.value = SHARDS;
      glow.value = 0.25;
      scale.value = withTiming(1, { duration: reduce ? 1 : 300, easing: Easing.out(Easing.quad) });
      if (!reduce) bob.value = bobbing();
    },
  }));

  const body = useAnimatedStyle(() => ({ transform: [{ translateY: bob.value }, { scale: scale.value }] }));
  const halo = useAnimatedStyle(() => ({ opacity: glow.value * (1 - grey.value * 0.8), transform: [{ scale: 0.9 + glow.value * 0.4 }] }));
  const greyOverlay = useAnimatedStyle(() => ({ opacity: grey.value * 0.55 }));

  return (
    <View style={[styles.wrap, { width: size * 1.5, height: size * 1.25 }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden pointerEvents="none">
      <Animated.View style={[styles.halo, { width: size * 1.3, height: size * 1.3, borderRadius: size, backgroundColor: tint }, halo]} />
      <Animated.View style={body}>
        <Svg width={size * 0.84} height={size} viewBox="0 0 100 120">
          <Polygon points="50,4 88,40 50,116 12,40" fill={tint} stroke="rgba(255,255,255,0.75)" strokeWidth={3} strokeLinejoin="round" />
          <Polygon points="50,4 12,40 50,50" fill="rgba(255,255,255,0.38)" />
          <Polygon points="50,4 88,40 50,50" fill="rgba(255,255,255,0.16)" />
          <Polygon points="12,40 50,50 50,116" fill="rgba(0,0,0,0.08)" />
          <Polygon points="88,40 50,50 50,116" fill="rgba(0,0,0,0.2)" />
        </Svg>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#8A8A8A", borderRadius: size / 3 }, greyOverlay]} />
      </Animated.View>
      {Array.from({ length: SHARDS }, (_, i) => (
        <Shard key={i} index={i} burst={burst} shards={shards} grey={grey} tint={tint} reach={size * 0.9} />
      ))}
    </View>
  );
}

function Shard({ index, burst, shards, grey, tint, reach }: { index: number; burst: SharedValue<number>; shards: SharedValue<number>; grey: SharedValue<number>; tint: string; reach: number }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const angle = (index / SHARDS) * Math.PI * 2 + (index % 2 ? 0.2 : 0);
  const distance = reach * (0.55 + (index % 3) * 0.22);
  const animated = useAnimatedStyle(() => {
    const p = burst.value;
    const live = index < shards.value && p > 0 ? 1 : 0;
    const d = distance * p * (grey.value ? 0.5 : 1);
    return {
      opacity: live * (1 - p),
      transform: [{ translateX: Math.cos(angle) * d }, { translateY: Math.sin(angle) * d + p * p * 24 }, { rotate: `${p * 280 * (index % 2 ? 1 : -1)}deg` }, { scale: 1 - p * 0.5 }],
      backgroundColor: grey.value ? "#B3B3B3" : tint,
    };
  });
  return <Animated.View style={[styles.shard, animated]} />;
}

const STYLE_PAIR = themedStyles({
  wrap: { alignItems: "center", justifyContent: "center", alignSelf: "center" },
  halo: { position: "absolute" },
  shard: { position: "absolute", width: 10, height: 14, borderRadius: 3, borderWidth: 1, borderColor: "rgba(255,255,255,0.7)" },
});
