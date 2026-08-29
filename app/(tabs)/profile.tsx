import { Button } from "@/components/Button";
import { MOCK_USER } from "@/constants/mockUser";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Tab = "Posts" | "Reels" | "Thoughts";

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function Profile() {
  const insets = useSafeAreaInsets();
  const u = MOCK_USER;
  const [tab, setTab] = useState<Tab>("Posts");

  return (
    <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 8 }]}>
      {/* Header bar */}
      <View style={styles.header}>
        <Ionicons name="add" size={28} color="#191922" />
        <Text style={styles.headerTitle}>Profile</Text>
        <Ionicons name="menu" size={26} color="#C5399A" />
      </View>

      {/* Avatar + faction badge */}
      <View style={styles.avatarWrap}>
        <Image source={u.photo} style={styles.avatar} contentFit="cover" />
        <View style={styles.badge}>
          <Image source={u.factionBadge} style={styles.badgeImg} contentFit="cover" />
        </View>
      </View>

      {/* Name + roles */}
      <Text style={styles.name}>{u.name}</Text>
      <Text style={styles.roles}>
        @{u.username} · {u.roles.join(" · ")}
      </Text>

      {/* Follower stats */}
      <View style={styles.statsRow}>
        <Stat value={u.followers} label="Followers" />
        <Stat value={u.following} label="Following" />
        <Stat value={u.posts} label="Posts" />
      </View>

      {/* Game stats */}
      <View style={styles.gameStats}>
        <Stat value={u.quests} label="Quests" />
        <View style={styles.divider} />
        <Stat value={u.wins} label="Wins" />
        <View style={styles.divider} />
        <Stat value={u.points} label="Points" />
      </View>

      {/* About */}
      <Text style={styles.sectionLabel}>About</Text>
      <Text style={styles.bio}>{u.bio}</Text>

      {/* Actions */}
      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button label="Edit Profile" variant="light" onPress={() => {}} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Share Profile" variant="light" onPress={() => {}} />
        </View>
      </View>

      {/* Highlights */}
      <View style={styles.highlights}>
        <View style={styles.highlight}>
          <View style={styles.highlightNew}>
            <Ionicons name="add" size={26} color="#9C9CAA" />
          </View>
          <Text style={styles.highlightLabel}>New</Text>
        </View>
        <View style={styles.highlight}>
          <Image source={u.factionBadge} style={styles.highlightImg} contentFit="cover" />
          <Text style={styles.highlightLabel}>Faction</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(["Posts", "Reels", "Thoughts"] as const).map((t) => (
          <Pressable key={t} style={styles.tab} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
            {tab === t ? <View style={styles.tabUnderline} /> : null}
          </Pressable>
        ))}
      </View>

      {/* Content */}
      {tab === "Posts" ? (
        <View style={styles.grid}>
          {u.postThumbs.map((src, i) => (
            <Image key={i} source={src} style={styles.thumb} contentFit="cover" />
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>Nothing here yet.</Text>
      )}
    </ScrollView>
  );
}

const GAP = 3;

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 140 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#191922" },

  avatarWrap: { alignSelf: "center", marginTop: 8, width: 150 },
  avatar: { width: 150, height: 150, borderRadius: 75 },
  badge: {
    position: "absolute",
    bottom: -10,
    left: 52, // (150 avatar − 46 badge) / 2 = centered under the avatar
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    overflow: "hidden",
    backgroundColor: "#EEE",
  },
  badgeImg: { width: "100%", height: "100%" },

  name: { fontSize: 22, fontWeight: "800", color: "#191922", textAlign: "center", marginTop: 20 },
  roles: { fontSize: 12.5, color: "#9C9CAA", textAlign: "center", marginTop: 4 },

  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 16,
  },
  stat: { alignItems: "center" },
  statValue: { fontSize: 18, fontWeight: "800", color: "#191922" },
  statLabel: { fontSize: 12, color: "#9C9CAA", marginTop: 2 },

  gameStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(197,57,154,0.06)",
    borderWidth: 1,
    borderColor: "rgba(197,57,154,0.15)",
  },
  divider: { width: 1, height: 28, backgroundColor: "rgba(0,0,0,0.08)" },

  sectionLabel: { fontSize: 15, fontWeight: "800", color: "#191922", marginTop: 22 },
  bio: { fontSize: 13.5, color: "#4c4c56", marginTop: 6, lineHeight: 20 },

  actions: { flexDirection: "row", gap: 12, marginTop: 18 },

  highlights: { flexDirection: "row", gap: 20, marginTop: 24 },
  highlight: { alignItems: "center", gap: 6 },
  highlightNew: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1.5,
    borderColor: "#D5D5DC",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  highlightImg: { width: 62, height: 62, borderRadius: 31 },
  highlightLabel: { fontSize: 12, color: "#4c4c56" },

  tabs: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 24,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  tab: { alignItems: "center", paddingBottom: 10 },
  tabText: { fontSize: 14, fontWeight: "600", color: "#9C9CAA" },
  tabTextActive: { color: "#191922", fontWeight: "800" },
  tabUnderline: {
    position: "absolute",
    bottom: -1,
    height: 2,
    width: "140%",
    backgroundColor: "#191922",
  },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP, marginTop: GAP },
  thumb: { width: `${(100 - 2 * 1) / 3}%`, aspectRatio: 1, backgroundColor: "#EEE" },

  empty: { textAlign: "center", color: "#9C9CAA", marginTop: 40 },
});
