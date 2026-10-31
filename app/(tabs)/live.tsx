// ==========================================
// LIVE TAB (placeholder)
// ==========================================
// Holds the tab's place until the Live design is ready: same background as
// the dashboard, a short note, and a way back to the quests.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  DARK_SCREEN_GRADIENT,
  themedStyles,
  useInk,
  useThemedStyles,
} from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";

export default function LiveScreen() {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={ink.dark ? [...DARK_SCREEN_GRADIENT] : ["#FFFFFF", "#F4F8FD", "#D5EAFB"]}
        locations={ink.dark ? [0, 0.6] : [0, 0.35, 1]}
        style={styles.fill}
      />

      <View style={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120 }]}>
        <Text style={styles.title}>Live</Text>

        <View style={styles.center}>
          <View style={styles.iconRing}>
            <Ionicons name="radio-outline" size={44} color="#B63D91" />
          </View>
          <Text style={styles.heading}>Live is coming soon</Text>
          <Text style={styles.body}>
            Watch quests as they happen, follow live hunts near you and cheer on your faction. We&apos;re
            putting the finishing touches on it.
          </Text>
          <Pressable style={styles.button} onPress={() => router.navigate("/home")} accessibilityRole="button">
            <Text style={styles.buttonText}>Explore quests</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    screen: { flex: 1, backgroundColor: "#FFFFFF" },
    fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
    content: { flex: 1, paddingHorizontal: 24 },
    title: { fontFamily: FONTS.semibold, fontSize: 26, lineHeight: 34, color: "#191922" },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    iconRing: {
      width: 96,
      height: 96,
      borderRadius: 48,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(230,205,226,0.75)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.9)",
    },
    heading: {
      marginTop: 20,
      textAlign: "center",
      fontFamily: FONTS.semibold,
      fontSize: 20,
      color: "#191922",
    },
    body: {
      marginTop: 8,
      maxWidth: 300,
      textAlign: "center",
      fontFamily: FONTS.regular,
      fontSize: 14,
      lineHeight: 21,
      color: "#66738A",
    },
    button: {
      marginTop: 24,
      height: 48,
      paddingHorizontal: 28,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 24,
      backgroundColor: "#B63D91",
    },
    buttonText: { fontFamily: FONTS.semibold, fontSize: 15, color: "#FFFFFF" },
  },
  {
    screen: { backgroundColor: "#171823" },
    // The pastel ring stays light; its icon stays pink.
    iconRing: { backgroundColor: "rgba(230,205,226,0.85)" },
  },
);
