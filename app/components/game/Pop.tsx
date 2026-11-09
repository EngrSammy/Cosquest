// A child that springs in from a smaller scale and fades up (SwiftUI's
// `.transition(.scale(scale: s).combined(with: .opacity))` with a spring),
// settling with no bounce (features/game/spring.ts settle). Under Reduce
// Motion it just appears.
import type { ReactNode } from "react";
import { useEffect } from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";

import { settle } from "@/features/game/spring";

export function Pop({
  children,
  from = 0.5,
  response = 0.45,
  delayMs = 0,
  style,
}: {
  children: ReactNode;
  from?: number;
  response?: number;
  delayMs?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduce = useReducedMotion();
  const scale = useSharedValue(reduce ? 1 : from);
  const opacity = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) {
      scale.value = 1;
      opacity.value = 1;
      return;
    }
    scale.value = withDelay(delayMs, withSpring(1, settle(response)));
    opacity.value = withDelay(delayMs, withTiming(1, { duration: 160 }));
  }, [reduce, delayMs, response, scale, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
