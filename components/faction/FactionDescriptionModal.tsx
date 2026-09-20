import type { Faction } from "@/constants/factions";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect } from "react";
import {
      Dimensions,
      Modal,
      Pressable,
      ScrollView,
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
} from "react-native-reanimated";

type Props = {
  visible: boolean;
  faction: Faction;
  onClose: () => void;
  onContinue: () => void;
};

type FactionDetails = {
  members: string;
  activeQuests: string;
  about: string;
  perks: string[];
  accent: string;
  background: string;
  image: ReturnType<typeof require>;
};

const FACTION_DETAILS: Record<string, FactionDetails> = {
  ascendants: {
    members: "3.2K",
    activeQuests: "18",
    about:
      "The Ascendants celebrate anime culture — from shonen legends to slice-of-life gems. Cosplay your favorite characters, compete in anime trivia quests, and connect with otaku worldwide.",
    perks: [
      "Early access to anime convention meetups",
      "Exclusive anime-themed rank badges",
      "Priority entry to cosplay showcases",
    ],
    accent: "#C5499D",
    background: "#E8F6FC",
    image: require("@/assets/images/factions/details/ascendants-detail.png"),
  },

  icons: {
    members: "2.8K",
    activeQuests: "15",
    about:
      "Icons live and breathe comics — Marvel, DC, indie, manga crossovers, you name it. Build your hero identity, join comic-con quests, and rise through the ranks with every quest.",
    perks: [
      "Comic-con squad matching program",
      "Exclusive superhero rank badges",
      "Panel discussion priority access",
    ],
    accent: "#C5499D",
    background: "#E8F6FC",
    image: require("@/assets/images/factions/details/icons-detail.png"),
  },

  controllers: {
    members: "4.1K",
    activeQuests: "22",
    about:
      "Controllers are the competitive heart of CosQuest. Whether you rep RPGs, FPS, or retro classics, this faction is your guild. Level up through gaming quests and tournament events.",
    perks: [
      "Tournament bracket priority entry",
      "Exclusive gaming rank badges & flares",
      "Local LAN meetup coordination",
    ],
    accent: "#C5499D",
    background: "#E8F6FC",
    image: require("@/assets/images/factions/details/controllers-detail.png"),
  },

  blockbusters: {
    members: "2.5K",
    activeQuests: "14",
    about:
      "Blockbusters live for the big screen — from superhero epics to indie darlings. Cosplay iconic movie characters, join film-themed quests, and debate the greatest performances of all time.",
    perks: [
      "Movie premiere watch parties",
      "Exclusive cinema-themed rank badges",
      "Red carpet cosplay contests",
    ],
    accent: "#E48600",
    background: "#FFF7D9",
    image: require("@/assets/images/factions/details/blockbusters-detail.png"),
  },

  everborn: {
    members: "1.9K",
    activeQuests: "11",
    about:
      "The Everborn dwell in realms of magic and myth. From Tolkien to tabletop, this faction celebrates epic worldbuilding, enchanted cosplay, and quests that feel straight out of a fantasy saga.",
    perks: [
      "LARP event coordination",
      "Exclusive fantasy-themed rank badges",
      "World-building workshop access",
    ],
    accent: "#08A878",
    background: "#E3F8ED",
    image: require("@/assets/images/factions/details/everborn-detail.png"),
  },

  celestials: {
    members: "2.1K",
    activeQuests: "13",
    about:
      "Celestials explore the cosmos of imagination — Star Wars, Star Trek, cyberpunk, and beyond. Build futuristic cosplays, solve sci-fi mystery quests, and connect with visionaries across the galaxy.",
    perks: [
      "Sci-fi convention squad matching",
      "Exclusive galactic rank badges",
      "Tech-cosplay build challenges",
    ],
    accent: "#16A7E0",
    background: "#E8F6FC",
    image: require("@/assets/images/factions/details/celestials-detail.png"),
  },
};

const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;

const { height: SCREEN_HEIGHT } = Dimensions.get("window");

export function FactionDescriptionModal({
  visible,
  faction,
  onClose,
  onContinue,
}: Props) {
  const translateY = useSharedValue(SCREEN_HEIGHT);

  const details = FACTION_DETAILS[faction.id] ?? FACTION_DETAILS.ascendants;

  useEffect(() => {
    if (visible) {
      translateY.value = SCREEN_HEIGHT;

      translateY.value = withSpring(0, {
        damping: 24,
        stiffness: 150,
      });
    }
  }, [visible, translateY]);

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      const shouldClose =
        event.translationY > DISMISS_DISTANCE ||
        event.velocityY > DISMISS_VELOCITY;

      if (shouldClose) {
        runOnJS(onClose)();
      } else {
        translateY.value = withSpring(0, {
          damping: 22,
          stiffness: 150,
        });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.backdrop}>
          {/* Area above the popup */}
          <Pressable style={styles.backdropTouch} onPress={onClose} />

          <GestureDetector gesture={pan}>
            <Animated.View
              style={[
                styles.sheet,
                {
                  backgroundColor: details.background,
                },
                animatedStyle,
              ]}>
              {/* Drag handle */}
              <View style={styles.handle} />

              {/* HEADER */}
              <View style={styles.header}>
                <Pressable
                  onPress={onClose}
                  style={styles.backButton}
                  hitSlop={10}>
                  <Ionicons name="arrow-back" size={19} color="#191922" />
                </Pressable>

                <Text style={styles.headerTitle}>Factions</Text>

                <View style={styles.headerMenu}>
                  <Ionicons
                    name="ellipsis-horizontal"
                    size={18}
                    color="#191922"
                  />
                </View>
              </View>

              {/* SCROLLABLE CONTENT */}
              <ScrollView
                showsVerticalScrollIndicator={false}
                style={styles.scrollArea}
                contentContainerStyle={styles.content}>
                {/* Faction image */}
                <Image
                  source={details.image}
                  style={styles.banner}
                  contentFit="cover"
                />

                {/* Name */}
                <Text style={styles.factionName}>
                  {faction.id.toUpperCase()}
                </Text>

                <Text style={styles.factionCaption}>{faction.caption}</Text>

                {/* Stats */}
                <View style={styles.statsRow}>
                  <View style={styles.statCard}>
                    <Ionicons
                      name="people-outline"
                      size={15}
                      color={details.accent}
                    />

                    <Text style={styles.statNumber}>{details.members}</Text>

                    <Text style={styles.statLabel}>Members</Text>
                  </View>

                  <View style={styles.statCard}>
                    <Ionicons
                      name="shield-outline"
                      size={15}
                      color={details.accent}
                    />

                    <Text style={styles.statNumber}>
                      {details.activeQuests}
                    </Text>

                    <Text style={styles.statLabel}>Active Quests</Text>
                  </View>
                </View>

                {/* ABOUT */}
                <Text style={styles.sectionTitle}>ABOUT FACTION</Text>

                <Text style={styles.about}>{details.about}</Text>

                {/* PERKS */}
                <Text style={[styles.sectionTitle, styles.perksHeading]}>
                  FACTION PERKS
                </Text>

                <View style={styles.perks}>
                  {details.perks.map((perk, index) => (
                    <View key={`${faction.id}-${index}`} style={styles.perk}>
                      <View
                        style={[
                          styles.check,
                          {
                            backgroundColor: `${details.accent}20`,
                          },
                        ]}>
                        <Ionicons
                          name="checkmark"
                          size={15}
                          color={details.accent}
                        />
                      </View>

                      <Text style={styles.perkText}>{perk}</Text>
                    </View>
                  ))}
                </View>

                {/* Extra bottom space so content isn't hidden */}
                <View style={styles.bottomSpace} />
              </ScrollView>

              {/* FIXED JOIN BUTTON */}
              <View
                style={[
                  styles.footer,
                  {
                    backgroundColor: details.background,
                  },
                ]}>
                <Pressable
                  onPress={onContinue}
                  style={({ pressed }) => [
                    styles.joinButton,
                    {
                      backgroundColor: details.accent,
                    },
                    pressed && styles.buttonPressed,
                  ]}>
                  <Text style={styles.joinButtonText}>Join Faction</Text>
                </Pressable>
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.28)",
  },

  backdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },

  /*
   * Higher popup.
   *
   * It now comes further up the screen
   * so the design is easier to see.
   */
  sheet: {
    width: "100%",
    height: "82%",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: "hidden",
  },

  handle: {
    width: 44,
    height: 5,
    borderRadius: 5,
    backgroundColor: "rgba(25,25,34,0.25)",
    alignSelf: "center",
    marginTop: 9,
    marginBottom: 3,
  },

  header: {
    height: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },

  headerTitle: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "800",
    color: "#191922",
  },

  backButton: {
    width: 31,
    height: 31,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.70)",
    alignItems: "center",
    justifyContent: "center",
  },

  headerMenu: {
    width: 31,
    height: 31,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.70)",
    alignItems: "center",
    justifyContent: "center",
  },

  scrollArea: {
    flex: 1,
  },

  content: {
    paddingHorizontal: 18,
    paddingBottom: 5,
  },

  /*
   * Larger faction image.
   */
  banner: {
    width: "100%",
    height: 145,
    borderRadius: 16,
    marginTop: 2,
  },

  factionName: {
    fontSize: 25,
    fontWeight: "900",
    color: "#191922",
    marginTop: 9,
    letterSpacing: -0.4,
  },

  factionCaption: {
    fontSize: 11,
    color: "#66666A",
    marginTop: 1,
    fontWeight: "500",
  },

  statsRow: {
    flexDirection: "row",
    gap: 9,
    marginTop: 10,
  },

  statCard: {
    flex: 1,
    height: 60,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.86)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(220,220,220,0.55)",
  },

  statNumber: {
    fontSize: 16,
    fontWeight: "900",
    color: "#191922",
    marginTop: 1,
  },

  statLabel: {
    fontSize: 8,
    color: "#85858A",
    marginTop: 1,
  },

  sectionTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: "#191922",
    marginTop: 15,
    marginBottom: 6,
  },

  about: {
    fontSize: 11,
    lineHeight: 17,
    color: "#55555A",
    fontWeight: "400",
  },

  perksHeading: {
    marginTop: 14,
  },

  perks: {
    gap: 7,
  },

  perk: {
    minHeight: 36,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.86)",
    borderWidth: 1,
    borderColor: "rgba(225,225,225,0.55)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },

  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },

  perkText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 14,
    color: "#55555A",
    fontWeight: "500",
  },

  bottomSpace: {
    height: 8,
  },

  /*
   * FIXED FOOTER
   *
   * The button stays visible while
   * the content above can scroll.
   */
  footer: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.55)",
  },

  joinButton: {
    height: 40,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },

  joinButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },

  buttonPressed: {
    opacity: 0.75,
  },
});
