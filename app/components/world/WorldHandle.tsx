// The way into the game you can see: a small tab on the chat's right edge
// (the side the game is on), in the player's faction colour. Tap it, or
// drag it left, and the game's map comes in. It fades as the game arrives.
import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector, type GestureType } from "react-native-gesture-handler";
import Animated, { runOnJS, type SharedValue, useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { bubbleTop } from "@/features/world/bubbleZone";

export default function WorldHandle({
  progress,
  visible,
  color,
  makePan,
  onOpen,
}: {
  progress: SharedValue<number>;
  visible: boolean;
  color: string;
  makePan: () => GestureType;
  onOpen: () => void;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const gesture = useMemo(
    () =>
      Gesture.Exclusive(
        makePan(),
        Gesture.Tap().onEnd((_event, success) => {
          if (success) runOnJS(onOpen)();
        }),
      ),
    [makePan, onOpen],
  );

  const style = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, progress.get() * 3),
    transform: [{ translateX: progress.get() * 24 }],
  }));

  if (!visible) return null;

  // Same height as the game's chat bubble, so the two read as one doorway.
  const top = bubbleTop(height, insets.top);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[styles.handle, { top, backgroundColor: color }, style]}
        accessible
        accessibilityRole="button"
        accessibilityLabel="Open the game"
        accessibilityHint="Swipe left from the right edge, or tap, to step into the game world">
        <View style={styles.inner}>
          <Ionicons name="chevron-back" size={12} color="rgba(255,255,255,0.85)" />
          <Ionicons name="planet" size={18} color="#FFFFFF" />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  handle: {
    position: "absolute",
    right: 0,
    width: 30,
    height: 56,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  inner: {
    alignItems: "center",
    gap: 1,
  },
});
