import { Image } from "expo-image";
import type { ImageSourcePropType, ImageStyle, StyleProp } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { SHEET_SNAP_BACK } from "@/components/game/sheetMotion";

// How far (px) the avatar can stray from its original position.
const MAX_DISTANCE = 26;

export function DraggableAvatar({
  source,
  style,
}: {
  source: ImageSourcePropType;
  style?: StyleProp<ImageStyle>;
}) {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      // Clamp the finger offset to a circle of radius MAX_DISTANCE.
      const { translationX: x, translationY: y } = e;
      const dist = Math.sqrt(x * x + y * y);
      if (dist <= MAX_DISTANCE) {
        tx.value = x;
        ty.value = y;
      } else {
        const k = MAX_DISTANCE / dist; // scale back onto the circle edge
        tx.value = x * k;
        ty.value = y * k;
      }
    })
    .onEnd(() => {
      // Back home, settling without a wobble.
      tx.value = withSpring(0, SHEET_SNAP_BACK);
      ty.value = withSpring(0, SHEET_SNAP_BACK);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      {/* Detector attaches to this View (a real element on web); the image
          sits inside. Attaching directly to an animated expo-image fails on web. */}
      <Animated.View style={animatedStyle}>
        <Image source={source} style={style} contentFit="cover" />
      </Animated.View>
    </GestureDetector>
  );
}
