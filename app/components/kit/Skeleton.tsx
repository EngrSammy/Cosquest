// Loading placeholders in the shape of what is coming (instead of a lone
// spinner): chat rows, messages, feed posts, a profile, notifications.
// One slow pulse on the UI thread; still under "reduce motion".
import { useEffect } from "react";
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { motion, radius, space, useScheme } from "@/theme";

function usePulse() {
  const reduce = useReducedMotion();
  const v = useSharedValue(0.55);
  useEffect(() => {
    if (reduce) return;
    v.set(withRepeat(withTiming(1, { duration: motion.skeletonPulse, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [reduce, v]);
  return useAnimatedStyle(() => ({ opacity: v.get() }));
}

export function SkeletonBlock({ w = "100%", h = 12, r = radius.sm, style }: { w?: DimensionValue; h?: number; r?: number; style?: StyleProp<ViewStyle> }) {
  const dark = useScheme() === "dark";
  return <View style={[{ width: w, height: h, borderRadius: r, backgroundColor: dark ? "rgba(255,255,255,0.09)" : "rgba(36,40,60,0.08)" }, style]} />;
}

/** The frame every preset shares: hidden from screen readers, announced once as loading. */
function Frame({ children, label, style }: { children: React.ReactNode; label: string; style?: StyleProp<ViewStyle> }) {
  const pulse = usePulse();
  return (
    <Animated.View style={[pulse, style]} accessible accessibilityRole="progressbar" accessibilityLabel={label} testID="skeleton">
      {children}
    </Animated.View>
  );
}

/** Chat list / notifications / people: an avatar and two lines. */
export function SkeletonRows({ count = 6, label = "Loading", avatar = 48, style }: { count?: number; label?: string; avatar?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Frame label={label} style={style}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.row}>
          <SkeletonBlock w={avatar} h={avatar} r={avatar / 2} />
          <View style={styles.rowText}>
            <SkeletonBlock w={`${55 - (i % 3) * 10}%`} h={13} />
            <SkeletonBlock w={`${80 - (i % 2) * 20}%`} h={11} />
          </View>
        </View>
      ))}
    </Frame>
  );
}

/** A chat: bubbles left and right. */
export function SkeletonMessages({ count = 8, style }: { count?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Frame label="Loading messages" style={[styles.messages, style]}>
      {Array.from({ length: count }, (_, i) => {
        const mine = i % 3 === 1;
        return (
          <View key={i} style={[styles.bubbleRow, mine && styles.mine]}>
            {!mine ? <SkeletonBlock w={30} h={30} r={15} /> : null}
            <SkeletonBlock w={`${40 + ((i * 17) % 30)}%`} h={i % 4 === 0 ? 54 : 36} r={18} />
          </View>
        );
      })}
    </Frame>
  );
}

/** A feed post: author, text, a picture. */
export function SkeletonPosts({ count = 2, style }: { count?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Frame label="Loading posts" style={style}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.post}>
          <View style={styles.row}>
            <SkeletonBlock w={40} h={40} r={20} />
            <View style={styles.rowText}>
              <SkeletonBlock w="40%" h={13} />
              <SkeletonBlock w="25%" h={10} />
            </View>
          </View>
          <SkeletonBlock w="90%" h={12} />
          <SkeletonBlock w="70%" h={12} />
          <SkeletonBlock h={180} r={radius.lg} style={{ marginTop: space.sm }} />
        </View>
      ))}
    </Frame>
  );
}

/** A profile: the photo, the name, the stat row. */
export function SkeletonProfile({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <Frame label="Loading profile" style={[styles.profile, style]}>
      <SkeletonBlock w={96} h={96} r={48} />
      <SkeletonBlock w="45%" h={18} />
      <SkeletonBlock w="30%" h={12} />
      <View style={styles.stats}>
        {[0, 1, 2].map((i) => (
          <SkeletonBlock key={i} w={72} h={44} r={radius.md} />
        ))}
      </View>
      <SkeletonBlock w="85%" h={12} />
      <SkeletonBlock w="65%" h={12} />
    </Frame>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.lg },
  rowText: { flex: 1, gap: space.sm },
  messages: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.md },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  mine: { justifyContent: "flex-end" },
  post: { paddingVertical: space.md, gap: space.sm },
  profile: { alignItems: "center", gap: space.md, paddingVertical: space.xxl },
  stats: { flexDirection: "row", gap: space.md, marginVertical: space.sm },
});
