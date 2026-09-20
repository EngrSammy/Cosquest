import { Button } from "@/components/Button";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
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
  withTiming,
} from "react-native-reanimated";

// ==========================================
// TYPES
// ==========================================

type Props = {
  visible: boolean;
  agreed: boolean;
  onToggleAgree: () => void;
  onAgree: () => void;
  onClose: () => void;
};

// ==========================================
// CONSTANTS
// ==========================================

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

// ==========================================
// COMPONENT
// ==========================================

export function FactionModal({
  visible,
  agreed,
  onToggleAgree,
  onAgree,
  onClose,
}: Props) {
  // ==========================================
  // ANIMATION STATE
  // ==========================================

  const translateY = useSharedValue(SCREEN_HEIGHT);

  // ==========================================
  // ERROR STATE
  // ==========================================

  const [error, setError] = useState("");

  // ==========================================
  // OPEN / RESET ANIMATION
  // ==========================================

  useEffect(() => {
    if (visible) {
      // Start below the screen.
      translateY.value = SCREEN_HEIGHT;

      // Animate upward.
      translateY.value = withSpring(0, {
        damping: 24,
        stiffness: 150,
      });

      setError("");
    } else {
      // Keep it below the screen while hidden.
      translateY.value = SCREEN_HEIGHT;
    }
  }, [visible, translateY]);

  // ==========================================
  // CLEAR ERROR WHEN CHECKED
  // ==========================================

  useEffect(() => {
    if (agreed) {
      setError("");
    }
  }, [agreed]);

  // ==========================================
  // CLOSE WITH DOWN ANIMATION
  // ==========================================

  function closeWithAnimation(callback: () => void) {
    translateY.value = withTiming(
      SCREEN_HEIGHT,
      {
        duration: 280,
      },
      (finished) => {
        if (finished) {
          runOnJS(callback)();
        }
      },
    );
  }

  // ==========================================
  // GESTURE
  // ==========================================

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      const shouldClose =
        event.translationY > DISMISS_DISTANCE ||
        event.velocityY > DISMISS_VELOCITY;

      if (shouldClose) {
        translateY.value = withTiming(
          SCREEN_HEIGHT,
          {
            duration: 280,
          },
          (finished) => {
            if (finished) {
              runOnJS(onClose)();
            }
          },
        );
      } else {
        translateY.value = withSpring(0, {
          damping: 20,
          stiffness: 150,
        });
      }
    });

  // ==========================================
  // ANIMATED STYLE
  // ==========================================

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: translateY.value,
      },
    ],
  }));

  // ==========================================
  // CONTINUE
  // ==========================================

  function handleContinue() {
    // ----------------------------------------
    // CHECKBOX NOT CHECKED
    // ----------------------------------------

    if (!agreed) {
      setError("Please check the box before you can continue.");

      return;
    }

    // ----------------------------------------
    // AGREED
    // ----------------------------------------

    setError("");

    console.log("FACTION CONSENT CHECKED:", agreed);

    // Animate the popup DOWN first.
    closeWithAnimation(onAgree);
  }

  // ==========================================
  // CLOSE
  // ==========================================

  function handleClose() {
    closeWithAnimation(onClose);
  }

  // ==========================================
  // UI
  // ==========================================

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}>
      <GestureHandlerRootView
        style={{
          flex: 1,
        }}>
        <Pressable style={styles.backdrop} onPress={handleClose}>
          <GestureDetector gesture={pan}>
            <Animated.View style={cardStyle}>
              <Pressable style={styles.modalCard} onPress={() => {}}>
                {/* ==================================
                    HANDLE
                ================================== */}

                <View style={styles.handle} />

                {/* ==================================
                    TITLE
                ================================== */}

                <Text style={styles.title}>Before You Pick Your Faction</Text>

                <Text style={styles.sub}>
                  Your faction is your people - a badge you carry into every
                  CosQuest. Here&apos;s what it actually means to join one.
                </Text>

                {/* ==================================
                    INFORMATION BOX 1
                ================================== */}

                <View
                  style={[
                    styles.box,
                    {
                      backgroundColor: "rgba(247, 223, 236, 1)",
                    },
                  ]}>
                  <View style={styles.boxText}>
                    <Text style={styles.boxTitle}>Built around fandoms</Text>

                    <Text
                      style={[
                        styles.boxBody,
                        {
                          color: "rgba(107, 73, 90, 1)",
                        },
                      ]}>
                      Each faction is rooted in a fandom - anime, comics,
                      gaming, movies, fantasy, sci-fi. Pick whichever feels like
                      home.
                    </Text>

                    <View
                      style={[
                        styles.cardTag,
                        {
                          backgroundColor: "rgba(236, 193, 214, 1)",
                        },
                      ]}>
                      <Text
                        style={[
                          styles.cardTagText,
                          {
                            color: "rgba(168, 65, 118, 1)",
                          },
                        ]}>
                        Good to know
                      </Text>
                    </View>
                  </View>

                  <View style={styles.circle}>
                    <Ionicons
                      name="close-circle-outline"
                      size={28}
                      color="rgba(168, 65, 118, 1)"
                    />
                  </View>
                </View>

                {/* ==================================
                    INFORMATION BOX 2
                ================================== */}

                <View
                  style={[
                    styles.box,
                    {
                      backgroundColor: "rgba(228, 221, 247, 1)",
                    },
                  ]}>
                  <View style={styles.boxText}>
                    <Text style={styles.boxTitle}>You rank up over time</Text>

                    <Text
                      style={[
                        styles.boxBody,
                        {
                          color: "rgba(86, 77, 110, 1)",
                        },
                      ]}>
                      Ten ranks stand between Initiate and Eternal. Quests,
                      events and contributions all move you up the ladder.
                    </Text>

                    <View
                      style={[
                        styles.cardTag,
                        {
                          backgroundColor: "rgba(203, 191, 232, 1)",
                        },
                      ]}>
                      <Text
                        style={[
                          styles.cardTagText,
                          {
                            color: "rgba(67, 51, 107, 1)",
                          },
                        ]}>
                        Progression
                      </Text>
                    </View>
                  </View>

                  <View style={styles.circle}>
                    <Ionicons
                      name="trending-up-sharp"
                      size={28}
                      color="rgba(104, 65, 168, 1)"
                    />
                  </View>
                </View>

                {/* ==================================
                    INFORMATION BOX 3
                ================================== */}

                <View
                  style={[
                    styles.box,
                    {
                      backgroundColor: "rgba(223, 237, 250, 1)",
                    },
                  ]}>
                  <View style={styles.boxText}>
                    <Text style={styles.boxTitle}>Switching has a cost</Text>

                    <Text
                      style={[
                        styles.boxBody,
                        {
                          color: "rgba(77, 92, 112, 1)",
                        },
                      ]}>
                      You can change factions later, but only during faction
                      windows - and you&apos;ll lose rank and points when you
                      do.
                    </Text>

                    <View
                      style={[
                        styles.cardTag,
                        {
                          backgroundColor: "rgba(198, 219, 245, 1)",
                        },
                      ]}>
                      <Text
                        style={[
                          styles.cardTagText,
                          {
                            color: "rgba(40, 66, 96, 1)",
                          },
                        ]}>
                        Heads up
                      </Text>
                    </View>
                  </View>

                  <View style={styles.circle}>
                    <Ionicons
                      name="sync"
                      size={28}
                      color="rgba(65, 114, 168, 1)"
                    />
                  </View>
                </View>

                {/* ==================================
                    CHECKBOX / STATE
                ================================== */}

                <Pressable
                  style={styles.agreeRow}
                  onPress={() => {
                    setError("");

                    onToggleAgree();
                  }}>
                  <Ionicons
                    name={agreed ? "checkbox" : "square-outline"}
                    size={22}
                    color={agreed ? "#C5399A" : "#5b5b5e"}
                  />

                  <View style={styles.agreeContent}>
                    <Text style={styles.agreeText}>
                      Got it — I understand my faction shapes my rank, and
                      switching later has a cost.
                    </Text>

                    {agreed ? (
                      <Text style={styles.agreedLabel}>
                        ✓ Agreement confirmed
                      </Text>
                    ) : null}
                  </View>
                </Pressable>

                {/* ==================================
                    ERROR
                ================================== */}

                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                {/* ==================================
                    CONTINUE BUTTON
                ================================== */}

                <View style={styles.btn}>
                  <Button
                    label="Continue"
                    variant="brand"
                    onPress={handleContinue}
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

// ==========================================
// STYLES
// ==========================================

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
    paddingHorizontal: 20,
    borderTopLeftRadius: 50,
    borderTopRightRadius: 50,
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
    fontSize: 24,
    fontWeight: "800",
    color: "#191922",
    marginBottom: 10,
  },

  sub: {
    fontSize: 13,
    color: "rgba(107, 73, 90, 1)",
    lineHeight: 20,
    fontWeight: "400",
  },

  box: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 20,
    overflow: "hidden",
    width: "100%",
  },

  boxText: {
    flex: 1,
    paddingTop: 5,
    left: -10,
  },

  boxTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 5,
  },

  boxBody: {
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 19,
  },

  circle: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 30,
    backgroundColor: "#fff",
    width: 45,
    height: 45,
    left: 5,
  },

  cardTag: {
    alignSelf: "flex-start",
    borderTopRightRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 5,
    bottom: -10,
    left: -20,
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

  agreeContent: {
    flex: 1,
  },

  agreeText: {
    fontSize: 13,
    color: "#191922",
  },

  agreedLabel: {
    marginTop: 5,
    fontSize: 11,
    fontWeight: "700",
    color: "#C5399A",
  },

  errorText: {
    color: "#B42318",
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 12,
  },

  btn: {
    marginTop: 24,
    width: "90%",
    alignSelf: "center",
  },
});
