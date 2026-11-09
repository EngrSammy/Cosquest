// ==========================================
// CHAT WORKSPACE · NOTHING OPEN YET (Figma D1)
// ==========================================
// Computer: the chat list sits on the left (app/chat/_layout.tsx); until a
// chat is picked, this panel fills the right side. Phones never come here
// (they open chats from Community), so they're sent back to it.
import { Ionicons } from "@expo/vector-icons";
import { Redirect, router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { useIsDesktop } from "@/hooks/useDesktop";

const PINK = "#C34D9C";
const INK = "#24283C";
const MUTED = "#66738A";

export default function PickAChat() {
  const desktop = useIsDesktop();
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();

  if (!desktop) {
    return <Redirect href="/community" />;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.icon}>
        <Ionicons name="chatbubbles-outline" size={34} color={ink.text(PINK)} />
      </View>
      <Text style={styles.title}>Pick a chat</Text>
      <Text style={styles.text}>
        Choose a group or a direct message on the left. Sparks for that chat show up beside it.
      </Text>
      <Pressable style={styles.button} onPress={() => router.push("/group/new")}>
        <Text style={styles.buttonText}>+ Create a group</Text>
      </Pressable>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    screen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, backgroundColor: "#D5F1FF" },
    icon: {
      width: 76,
      height: 76,
      borderRadius: 38,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#F7E3F0",
    },
    title: { marginTop: 16, fontFamily: FONTS.semibold, fontSize: 22, color: INK },
    text: { marginTop: 8, maxWidth: 360, textAlign: "center", fontFamily: FONTS.regular, fontSize: 14, lineHeight: 21, color: MUTED },
    button: {
      marginTop: 20,
      height: 46,
      paddingHorizontal: 26,
      borderRadius: 23,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: PINK,
    },
    buttonText: { fontFamily: FONTS.semibold, fontSize: 15, color: "#FFFFFF" },
  },
  {
    screen: { backgroundColor: "#171823" },
    icon: { backgroundColor: "#40283B" },
    title: { color: "#F4F5FA" },
    text: { color: "#B5BBCB" },
  },
);
