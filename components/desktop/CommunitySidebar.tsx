// ==========================================
// COMMUNITY · RIGHT SIDEBAR (computer)
// ==========================================
// Beside the feed, like the contacts column on large social sites: your
// chats (groups and direct messages) one click away while you scroll.
import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Chats } from "@/components/community/Chats";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";

const PINK = "#C34D9C";
const INK = "#1C1E21";

export default function CommunitySidebar() {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.sidebar}>
      <View style={styles.head}>
        <Text style={styles.title}>Chats</Text>
        <Pressable onPress={() => router.navigate("/chat" as any)} hitSlop={8}>
          <Text style={styles.link}>Open all</Text>
        </Pressable>
      </View>
      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
        <Chats />
      </ScrollView>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    sidebar: {
      width: 360,
      minHeight: 0,
      borderLeftWidth: 1,
      borderLeftColor: "rgba(36,40,60,0.08)",
      backgroundColor: "rgba(255,255,255,0.7)",
    },
    head: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 6,
    },
    title: { fontFamily: FONTS.semibold, fontSize: 18, color: INK },
    link: { fontFamily: FONTS.medium, fontSize: 13.5, color: PINK },
    body: { flex: 1 },
    bodyContent: { paddingHorizontal: 4, paddingBottom: 30 },
  },
  {
    sidebar: { borderLeftColor: "rgba(255,255,255,0.08)", backgroundColor: "#1D1F2C" },
    title: { color: "#F4F5FA" },
    link: { color: "#F0A6D7" },
  },
);
