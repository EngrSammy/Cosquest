// The Warden's face: a small hooded spirit in the player's faction colour,
// drawn rather than loaded. It bobs and blinks. costquest-ios
// Warden/WardenViews.swift WardenBadge (the talking pulse needs the speaker's
// level, which expo-speech does not give, so the mouth rests).
import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { withAlpha } from "./kit";
import { edgeOf, GP } from "./theme";

export default function WardenBadge({ tint = GP.skyDeep, size = 44 }: { tint?: string; size?: number }) {
  const reduce = useReducedMotion();
  const bob = useSharedValue(0);
  const blink = useSharedValue(0);

  // Bobs +-2 on easeInOut 1.6 s, forever.
  useEffect(() => {
    if (reduce) return;
    bob.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }), -1, true));
    return () => cancelAnimation(bob);
  }, [reduce, bob]);

  // Blinks every 2.5 to 5 s: shut in 80 ms, shut for 120 ms, open in 80 ms.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      timer = setTimeout(() => {
        blink.set(withSequence(withTiming(1, { duration: 80 }), withTiming(1, { duration: 120 }), withTiming(0, { duration: 80 })));
        next();
      }, 2500 + Math.random() * 2500);
    };
    next();
    return () => {
      clearTimeout(timer);
      cancelAnimation(blink);
    };
  }, [blink]);

  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: 2 - 4 * bob.get() }] }));
  const eyeStyle = useAnimatedStyle(() => ({ height: size * (0.16 - 0.14 * blink.get()) }));
  const eye = { width: size * 0.1, borderRadius: size, backgroundColor: "#FFFFFF", shadowColor: tint, shadowOpacity: 1, shadowRadius: size * 0.08, shadowOffset: { width: 0, height: 0 } };

  return (
    <Animated.View style={[{ width: size, height: size }, bobStyle]} accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <LinearGradient
        colors={[withAlpha(tint, 0.95), edgeOf(tint)]}
        style={[StyleSheet.absoluteFill, { borderRadius: size / 2, borderWidth: size * 0.05, borderColor: "rgba(255,255,255,0.7)" }]}
      />
      <View
        style={{
          position: "absolute",
          width: size * 0.62,
          height: size * 0.5,
          borderRadius: size,
          backgroundColor: GP.navyEdge,
          left: size * 0.19,
          top: size * 0.25 + size * 0.06,
        }}
      />
      <View style={{ position: "absolute", left: 0, right: 0, top: size * 0.5 + size * 0.04 - size * 0.08, height: size * 0.16, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: size * 0.14 }}>
        <Animated.View style={[eye, eyeStyle]} />
        <Animated.View style={[eye, eyeStyle]} />
      </View>
      <View
        style={{
          position: "absolute",
          width: size * 0.12,
          height: size * 0.05,
          borderRadius: size,
          backgroundColor: "rgba(255,255,255,0.25)",
          left: size / 2 - size * 0.06,
          top: size * 0.5 + size * 0.2 - size * 0.025,
        }}
      />
    </Animated.View>
  );
}
