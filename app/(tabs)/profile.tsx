import { useUser } from "@/context/UserContext";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import {
  Dimensions,
  type ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Tab = "Posts" | "Reels" | "Thoughts";

function Stat({
  value,
  label,
  onPress,
}: {
  value: string | number;
  label: string;
  onPress?: () => void;
}) {
  const inner = (
    <>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </>
  );
  // A tappable stat becomes a Pressable; a plain one stays a View.
  return onPress ? (
    <Pressable
      style={({ pressed }) => [styles.stat, pressed && { opacity: 0.6 }]}
      onPress={onPress}
    >
      {inner}
    </Pressable>
  ) : (
    <View style={styles.stat}>{inner}</View>
  );
}

function ActionButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}
      onPress={onPress}
    >
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const TABS: { key: Tab; icon: ImageSourcePropType }[] = [
  { key: "Posts", icon: require("@/assets/images/icons/posts.png") },
  { key: "Reels", icon: require("@/assets/images/icons/reels.png") },
  { key: "Thoughts", icon: require("@/assets/images/icons/thoughts.png") },
];

export default function Profile() {
  const insets = useSafeAreaInsets();
  const { user: u } = useUser();
  const [tab, setTab] = useState<Tab>("Posts");

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 8 }]}
    >
      {/* Header bar */}
      <View style={styles.header}>
        <Ionicons name="add" size={28} color="#191922" />
        <Text style={styles.headerTitle}>Profile</Text>
        <Pressable onPress={() => router.push("/settings")} hitSlop={10}>
          <Ionicons name="menu" size={26} color="#C5399A" />
        </Pressable>
      </View>

      {/* ProfileBanner + profileImage */}
      <View style={styles.avatarWrap}>
        <Image
          source={u.profileBanner}
          style={styles.banner}
          contentFit="cover"
        />
        <View style={styles.profile}>
          <Image
            source={u.profileImage}
            style={styles.profileImg}
            contentFit="cover"
          />
        </View>
      </View>

      {/* userName + bio */}
      <Text style={styles.name}>{u.name}</Text>
      <Text style={styles.username}>@{u.username}</Text>
      <Text style={styles.bio}>{u.bio.join(" · ")}</Text>

      {/* Follower stats */}
      <View style={styles.statsRow}>
        <Stat
          value={u.followers}
          label="Followers"
          onPress={() => router.push("/followers")}
        />
        <Stat
          value={u.following}
          label="Following"
          onPress={() => router.push("/following")}
        />
        <Stat value={u.posts} label="Posts" />
      </View>

      {/* Game stats */}
      <View style={styles.gameStatsWrap}>
        <View style={styles.gameStats}>
          <Stat value={u.quests} label="Quests" />
        </View>
        <View style={styles.gameStats}>
          <Stat value={u.wins} label="Wins" />
        </View>
        <View style={styles.gameStats}>
          <Stat value={u.points} label="Points" />
        </View>
      </View>

      {/* About */}
      <Text style={styles.sectionLabel}>About</Text>
      <Text style={styles.about}>{u.about}</Text>

      {/* Actions */}
      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <ActionButton
            label="Edit Profile"
            onPress={() => router.push("/edit-profile")}
          />
        </View>
        <View style={{ flex: 1 }}>
          <ActionButton label="Share Profile" onPress={() => {}} />
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
          <View style={styles.highlightRing}>
            <Image
              source={u.profileBanner}
              style={styles.highlightImg}
              contentFit="cover"
            />
          </View>
          <Text style={styles.highlightLabel}>Faction</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map(({ key, icon }) => {
          const active = tab === key;
          return (
            <Pressable key={key} style={styles.tab} onPress={() => setTab(key)}>
              <Image
                source={icon}
                style={styles.tabIcon}
                contentFit="contain"
                tintColor={active ? "#C5399A" : "#9C9CAA"}
              />
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {key}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Content */}
      {tab === "Posts" ? (
        <View style={styles.grid}>
          {u.postThumbs.map((src, i) => (
            <Image
              key={i}
              source={src}
              style={styles.thumb}
              contentFit="cover"
            />
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>Nothing here yet.</Text>
      )}
    </ScrollView>
  );
}

const GAP = 1;
const H_PAD = 20; // matches styles.scroll paddingHorizontal
// Full-bleed 3-column grid: use the whole screen width (the grid cancels the
// 20px page padding with negative margins), minus the two inter-column gaps.
// Exact pixels — a "%"-string width + aspectRatio collapses to 0 on native.
const COL = (Dimensions.get("window").width - GAP * 2) / 3;

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 140 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#191922" },

  avatarWrap: {
    alignSelf: "center",
    marginTop: 20,
    marginBottom: 10,
    width: 150,
  },
  banner: {
    width: 300,
    height: 300,
    borderRadius: 150,
    left: -80,
  },
  profile: {
    position: "absolute",
    bottom: -20,
    left: 45,
    width: 65,
    height: 65,
    borderRadius: 50,
    borderWidth: 1,
    borderColor: "#FFFFFF",
    overflow: "hidden",
    backgroundColor: "#C5399A",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  profileImg: { width: "100%", height: "100%" },

  name: {
    fontSize: 22,
    fontWeight: "800",
    color: "#191922",
    textAlign: "center",
    marginTop: 20,
  },
  bio: {
    fontSize: 12.5,
    color: "#707074",
    textAlign: "center",
    marginTop: 10,
  },
  username: {
    fontSize: 12.5,
    color: "#86868b",
    textAlign: "center",
    marginTop: 2,
  },

  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 20,
  },
  stat: { alignItems: "center" },
  statValue: { fontSize: 18, fontWeight: "800", color: "#191922" },
  statLabel: { fontSize: 13, color: "#79797e", marginTop: 2 },

  gameStatsWrap: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginTop: 20,
  },
  gameStats: {
    paddingVertical: 5,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: "rgba(193, 76, 154, 0.23)",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },

  sectionLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: "#191922",
    marginTop: 20,
  },
  about: { fontSize: 13.5, color: "#4c4c56", marginTop: 6, lineHeight: 20 },

  actions: { flexDirection: "row", gap: 12, marginTop: 20 },
  action: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 25,
    backgroundColor: "rgba(193, 76, 154, 0.23)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.6)",
    shadowColor: "#191922",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  actionLabel: { fontSize: 13, fontWeight: "400", color: "#4c4c56" },

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
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  highlightRing: {
    padding: 3,
    borderRadius: 37,
    borderWidth: 2,
    borderColor: "rgba(160, 165, 177, 1)",
  },
  highlightImg: { width: 62, height: 62, borderRadius: 31 },
  highlightLabel: { fontSize: 12, color: "#4c4c56" },

  tabs: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 25,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.6)",
    borderRadius: 30,
    paddingVertical: 10,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
  },
  tabIcon: { width: 16, height: 16 },
  tabText: { fontSize: 14, fontWeight: "600", color: "#9C9CAA" },
  tabTextActive: { color: "#C5399A", fontWeight: "800" },

  // Full-bleed grid: negative margins cancel the screen's 20px padding so the
  // thumbnails run edge-to-edge and each column is wider.
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
    marginTop: 8,
    marginHorizontal: -H_PAD,
  },
  thumb: {
    width: COL,
    height: COL,
    backgroundColor: "#EEE",
  },

  empty: { textAlign: "center", color: "#9C9CAA", marginTop: 40 },
});
