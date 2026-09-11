import { Button } from "@/components/Button";
import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

type Props = {
  visible: boolean;
  agreed: boolean;
  onToggleAgree: () => void;
  onAgree: () => void;
  onClose: () => void;
};

// Drag this far down (or flick faster than this) to dismiss.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;

export function FactionModal({
  visible,
  agreed,
  onToggleAgree,
  onAgree,
  onClose,
}: Props) {
  // How far the sheet is dragged down, in px. Lives on the UI thread.
  const translateY = useSharedValue(0);

  // Resets the drag offset every time the sheet re-opens.
  useEffect(() => {
    if (visible) translateY.value = 0;
  }, [visible, translateY]);

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      // Only allow dragging DOWN (clamp upward drags to 0).
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      const dismissed =
        e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY;
      if (dismissed) {
        runOnJS(onClose)();
      } else {
        // Snap back to fully open.
        translateY.value = withSpring(0, { damping: 20 });
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* gesture-handler needs its OWN root inside the Modal's separate tree */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <GestureDetector gesture={pan}>
            <Animated.View style={cardStyle}>
              {/* swallow taps so a tap inside the card doesn't close it */}
              <Pressable style={styles.modalCard} onPress={() => {}}>
                {/* drag handle */}
                <View style={styles.handle} />

                <Text style={styles.title}>Before You Pick Your Faction</Text>
                <Text style={styles.sub}>
                  Your faction is your people - a badge you carry into every
                  CosQuest. Here's what it actually means to join one.
                </Text>

                <View
                  style={[
                    styles.box,
                    { backgroundColor: "rgba(247, 223, 236, 1)" },
                  ]}
                >
                  <View style={styles.boxText}>
                    <Text style={styles.boxTitle}>Built around fandoms</Text>
                    <Text
                      style={[
                        styles.boxBody,
                        { color: "rgba(107, 73, 90, 1)" },
                      ]}
                    >
                      Each faction is rooted in a fandom - anime, comics,
                      gaming, movies, fantasy, sci-fi. Pick whichever feels like
                      home.
                    </Text>
                    <View
                      style={[
                        styles.cardTag,
                        { backgroundColor: "rgba(236, 193, 214, 1)" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.cardTagText,
                          { color: "rgba(168, 65, 118, 1)" },
                        ]}
                      >
                        Good to know
                      </Text>
                    </View>
                  </View>
                  <View style={styles.circle}>
                    <Ionicons
                      name="close-circle-outline"
                      size={24}
                      color="rgba(168, 65, 118, 1)"
                    />
                  </View>
                </View>

                <View
                  style={[
                    styles.box,
                    { backgroundColor: "rgba(228, 221, 247, 1)" },
                  ]}
                >
                  <View style={styles.boxText}>
                    <Text style={styles.boxTitle}>You rank up over time</Text>
                    <Text
                      style={[
                        styles.boxBody,
                        { color: "rgba(86, 77, 110, 1)" },
                      ]}
                    >
                      Ten ranks stand between Initiate and Eternal. Quests,
                      events and contributions all move you up the ladder.
                    </Text>
                    <View
                      style={[
                        styles.cardTag,
                        { backgroundColor: "rgba(203, 191, 232, 1)" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.cardTagText,
                          { color: "rgba(67, 51, 107, 1)" },
                        ]}
                      >
                        Progression
                      </Text>
                    </View>
                  </View>
                  <View style={styles.circle}>
                    <Ionicons
                      name="trending-up-sharp"
                      size={24}
                      color="rgba(104, 65, 168, 1)"
                    />
                  </View>
                </View>

                <View
                  style={[
                    styles.box,
                    { backgroundColor: "rgba(223, 237, 250, 1)" },
                  ]}
                >
                  <View style={styles.boxText}>
                    <Text style={styles.boxTitle}>Switching has a cost</Text>
                    <Text
                      style={[
                        styles.boxBody,
                        { color: "rgba(77, 92, 112, 1)" },
                      ]}
                    >
                      You can change factions later, but only during faction
                      windows - and you'll lose rank and points when you do.
                    </Text>
                    <View
                      style={[
                        styles.cardTag,
                        { backgroundColor: "rgba(198, 219, 245, 1)" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.cardTagText,
                          { color: "rgba(40, 66, 96, 1)" },
                        ]}
                      >
                        Heads up
                      </Text>
                    </View>
                  </View>
                  <View style={styles.circle}>
                    <Ionicons
                      name="sync"
                      size={24}
                      color="rgba(65, 114, 168, 1)"
                    />
                  </View>
                </View>

                <Pressable style={styles.agreeRow} onPress={onToggleAgree}>
                  <Ionicons
                    name={agreed ? "checkbox" : "square-outline"}
                    size={22}
                    color={agreed ? "#C5399A" : "#5b5b5e"}
                  />
                  <Text style={styles.agreeText}>
                    Got it — I understand my faction shapes my rank, and
                    switching later has a cost.
                  </Text>
                </Pressable>

                <View style={styles.btn}>
                  <Button
                    label="I agree"
                    variant="brand"
                    disabled={!agreed}
                    onPress={onAgree}
                  />
                </View>
              </Pressable>
            </Animated.View>
          </GestureDetector>
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalCard: {
    width: "100%",
    backgroundColor: "rgba(184, 232, 255, 0.94)",
    paddingTop: 18,
    paddingBottom: 40,
    paddingHorizontal: 18,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(25,25,34,0.25)",
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#191922",
    marginBottom: 10,
  },
  sub: {
    fontSize: 15,
    color: "rgba(107, 73, 90, 1)",
    lineHeight: 24,
  },
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
    paddingVertical: 20,
    paddingHorizontal: 30,
    borderRadius: 20,
    overflow: "hidden",
    width: "100%",
  },
  boxText: { flex: 1, paddingTop: 5, left: -5 },
  boxTitle: {
    fontSize: 19,
    fontWeight: "700",
    marginBottom: 5,
  },
  boxBody: {
    fontSize: 15,
    lineHeight: 22,
  },
  circle: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "#fff",
    width: 40,
    height: 40,
  },
  cardTag: {
    alignSelf: "flex-start",
    borderTopRightRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 12,
    bottom: -20,
    left: -26,
  },
  cardTagText: {
    fontWeight: "700",
    fontSize: 12,
  },
  agreeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 30,
  },
  agreeText: { flex: 1, fontSize: 13, color: "#191922" },
  btn: { marginTop: 24, width: "80%", alignSelf: "center" },
});
