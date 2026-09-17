import {
  type AppNotification,
  MOCK_NOTIFICATIONS,
} from "@/constants/mockNotifications";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function NotificationRow({
  item,
  following,
  onToggleFollow,
}: {
  item: AppNotification;
  following: boolean;
  onToggleFollow: (id: string) => void;
}) {
  return (
    <View style={styles.row}>
      <Image source={item.avatar} style={styles.avatar} contentFit="cover" />

      <View style={styles.rowText}>
        <Text style={styles.body}>
          <Text style={styles.handle}>{item.handle}</Text> {item.body}
        </Text>
        <Text style={styles.time}>{item.time}</Text>
      </View>

      {/* Trailing element depends on the kind */}
      {item.kind === "follow" ? (
        <Pressable
          style={[styles.followBtn, following && styles.followingBtn]}
          onPress={() => onToggleFollow(item.id)}
        >
          <Text style={following ? styles.followingText : styles.followText}>
            {following ? "Following" : "Follow"}
          </Text>
        </Pressable>
      ) : item.thumb ? (
        <Image source={item.thumb} style={styles.thumb} contentFit="cover" />
      ) : null}
    </View>
  );
}

export default function Notifications() {
  const insets = useSafeAreaInsets();

  // Which follow-back buttons are toggled on (by notification id).
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const toggleFollow = (id: string) =>
    setFollowed((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color="#191922" />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={MOCK_NOTIFICATIONS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationRow
            item={item}
            following={!!followed[item.id]}
            onToggleFollow={toggleFollow}
          />
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, gap: 10 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: "#191922",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#EEE",
    borderWidth: 2,
    borderColor: "rgba(197,57,154,0.5)", // subtle ring
  },
  rowText: { flex: 1 },
  body: { fontSize: 13.5, color: "#3a3a40", lineHeight: 19 },
  handle: { fontWeight: "700", color: "#191922" },
  time: { fontSize: 12, color: "#9C9CAA", marginTop: 3 },

  followBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: "#C5399A",
  },
  followingBtn: { backgroundColor: "#191922" },
  followText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  followingText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },

  thumb: { width: 46, height: 46, borderRadius: 8, backgroundColor: "#EEE" },
});
