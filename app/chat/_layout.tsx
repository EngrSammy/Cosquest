// ==========================================
// CHAT WORKSPACE (Figma D1 · Desktop messenger hub)
// ==========================================
// Every chat screen (/chat/[id], /chat/search/[id]) goes through here.
//   Computer: "Chats" list on the left (search, filters, groups, DMs,
//             "+ Create a group"), the open chat beside it. Picking another
//             chat swaps it in place.
//   Phone:    the chat screens exactly as before (full screen, one at a time).
import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Chats } from "@/components/community/Chats";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { useIsDesktop } from "@/hooks/useDesktop";

const PINK = "#C34D9C";
const INK = "#24283C";

export default function ChatLayout() {
  const desktop = useIsDesktop();
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();

  const screens = <Stack screenOptions={{ headerShown: false, animation: desktop ? "none" : "default" }} />;

  if (!desktop) {
    return screens;
  }

  return (
    <View style={styles.workspace}>
      {/* CHATS LIST */}
      <View style={styles.list}>
        <View style={styles.listHead}>
          <Text style={styles.listTitle}>Chats</Text>
          <Pressable onPress={() => router.push("/group/new")} hitSlop={8} accessibilityLabel="Create a group">
            <Ionicons name="create-outline" size={22} color={ink.text(PINK)} />
          </Pressable>
        </View>
        <ScrollView
          style={styles.listBody}
          contentContainerStyle={styles.listScroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <Chats />
        </ScrollView>
      </View>

      {/* THE OPEN CHAT */}
      <View style={styles.chat}>{screens}</View>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    workspace: { flex: 1, flexDirection: "row", minHeight: 0 },
    list: {
      width: 340,
      backgroundColor: "#E8F4FC",
      borderRightWidth: 1,
      borderRightColor: "rgba(36,40,60,0.06)",
    },
    listHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 6,
    },
    listTitle: { fontFamily: FONTS.semibold, fontSize: 24, color: INK },
    listBody: { flex: 1, minHeight: 0 },
    listScroll: { paddingHorizontal: 4, paddingBottom: 30 },
    chat: { flex: 1, minWidth: 0 },
  },
  {
    list: { backgroundColor: "#1D1F2C", borderRightColor: "rgba(255,255,255,0.06)" },
    listTitle: { color: "#F4F5FA" },
  },
);
