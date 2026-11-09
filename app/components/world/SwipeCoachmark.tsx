// First run: one coachmark that teaches the swipe, shown once.
// It points at the handle on the right edge and animates a finger pulling
// left. Gone for good after "Got it" or the first trip into the game.
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { FONTS } from "@/constants/fonts";
import { getPref, setPref } from "@/utils/prefsStorage";

import { bubbleTop } from "@/features/world/bubbleZone";
import { useWorld } from "./useWorld";

export const COACHMARK_PREF = "world.swipeTaught";
/** Set once taught in this run, so a remount does not wait on storage. */
let taughtThisRun = false;
/** Let the chat settle (and the person look at it) before teaching (ms). */
const SHOW_AFTER_MS = 1800;

export default function SwipeCoachmark({ color }: { color: string }) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { page } = useWorld();
  const [show, setShow] = useState(false);
  const finger = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const taught = await getPref(COACHMARK_PREF);
      if (!cancelled && !taught && !taughtThisRun) setShow(true);
    }, SHOW_AFTER_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // The first trip into the game counts as learning it.
  useEffect(() => {
    if (page === "game" && !taughtThisRun) {
      taughtThisRun = true;
      setPref(COACHMARK_PREF, "1");
    }
  }, [page]);

  useEffect(() => {
    if (!show || reduceMotion) return;
    finger.set(withRepeat(
      withSequence(
        withTiming(0, { duration: 0 }),
        withDelay(400, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.cubic) })),
        withDelay(500, withTiming(1, { duration: 0 })),
      ),
      -1,
    ));
  }, [show, reduceMotion, finger]);

  const fingerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -110 * finger.get() }],
    opacity: finger.get() < 0.92 ? 1 : 0,
  }));

  if (!show || page !== "chat" || taughtThisRun) return null;

  const dismiss = () => {
    taughtThisRun = true;
    setPref(COACHMARK_PREF, "1");
    setShow(false);
  };

  const top = bubbleTop(height, insets.top);

  return (
    <Animated.View
      entering={FadeIn.duration(260)}
      exiting={FadeOut.duration(160)}
      style={[styles.wrap, { top: top - 6 }]}
      pointerEvents="box-none">
      <View style={styles.card}>
        <Text style={styles.title}>A whole world, one swipe away</Text>
        <Text style={styles.text}>
          Swipe left from this edge to step into the game. Swipe back from the game&apos;s left edge, or tap
          your chat bubble, to return.
        </Text>
        <Pressable onPress={dismiss} style={[styles.button, { backgroundColor: color }]} accessibilityRole="button">
          <Text style={styles.buttonText}>Got it</Text>
        </Pressable>
        <View style={styles.arrow} />
      </View>
      <Animated.View style={[styles.finger, fingerStyle]} pointerEvents="none">
        <Ionicons name="hand-left" size={26} color="#FFFFFF" />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 40,
    left: 24,
    alignItems: "flex-end",
  },
  card: {
    maxWidth: 300,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "rgba(28, 12, 34, 0.94)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    gap: 8,
  },
  title: {
    color: "#FFFFFF",
    fontFamily: FONTS.bold,
    fontSize: 16,
  },
  text: {
    color: "rgba(255,255,255,0.85)",
    fontFamily: FONTS.regular,
    fontSize: 13,
    lineHeight: 19,
  },
  button: {
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  buttonText: {
    color: "#FFFFFF",
    fontFamily: FONTS.semibold,
    fontSize: 13,
  },
  arrow: {
    position: "absolute",
    right: -7,
    top: 26,
    width: 14,
    height: 14,
    transform: [{ rotate: "45deg" }],
    backgroundColor: "rgba(28, 12, 34, 0.94)",
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  // Under the card, so the moving hand never crosses the words (it sat over the title).
  finger: {
    position: "absolute",
    right: -30,
    bottom: -36,
  },
});
