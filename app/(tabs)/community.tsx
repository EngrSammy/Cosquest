import { AppBackground } from "@/components/AppBackground";
import { Chats } from "@/components/community/Chats";
import { Feeds } from "@/components/community/Feeds";
import { Spotlight } from "@/components/community/Spotlight";
import { useUser } from "@/context/UserContext";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Tab = "Feeds" | "Chats" | "Spotlight";
const TABS: Tab[] = ["Feeds", "Chats", "Spotlight"];

export default function Community() {
  const insets = useSafeAreaInsets();
  const { user: u } = useUser();
  const [tab, setTab] = useState<Tab>("Spotlight");

  return (
    <AppBackground variant="blueGradient">
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 8 }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.push("/profile")} hitSlop={10}>
          <View style={styles.avatarWrap}>
            <Image
              source={u.profileImage}
              style={styles.profileImg}
              contentFit="cover"
            />
          </View>
        </Pressable>
        <Text style={styles.headerTitle}>Community</Text>
        <Pressable onPress={() => router.push("/notifications")} hitSlop={10}>
          <Ionicons name="notifications" size={24} color="#C5399A" />
        </Pressable>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map((key) => {
          const active = tab === key;
          return (
            <Pressable
              key={key}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setTab(key)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {key}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Active tab content */}
      {tab === "Spotlight" ? (
        <Spotlight />
      ) : tab === "Feeds" ? (
        <Feeds />
      ) : (
        <Chats />
      )}
    </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 140 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#191922" },
  avatarWrap: {
    width: 50,
    height: 50,
    borderRadius: 30,
    overflow: "hidden",
    backgroundColor: "rgba(195, 77, 156, 0.2)",
  },
  profileImg: { width: "100%", height: "100%" },

  tabs: {
    flexDirection: "row",
    alignSelf: "center",
    gap: 50,
    marginBottom: 18,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.62)",
  },
  tabActive: { backgroundColor: "#C5399A" },
  tabText: { fontSize: 14, fontWeight: "500", color: "#191922" },
  tabTextActive: { color: "#FFFFFF" },
});
