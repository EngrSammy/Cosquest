import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Pressable, StyleSheet, Text, View } from "react-native";

function getRelativeTime(createdAt?: string) {
  if (!createdAt) {
    return "";
  }

  const timestamp = new Date(createdAt).getTime();

  if (Number.isNaN(timestamp)) {
    return "";
  }

  const seconds = Math.floor(Math.max(0, Date.now() - timestamp) / 1000);

  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);

  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;

  const weeks = Math.floor(days / 7);

  return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
}

function formatCount(value: number) {
  return value.toLocaleString();
}

function Stat({
  icon,
  count,
  color,
  onPress,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  count: number;
  color: string;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      style={styles.stat}
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.count, { color }]}>{formatCount(count)}</Text>
    </Pressable>
  );
}

// Like · Comment · Share in a glass panel anchored to the BOTTOM-LEFT corner
// of the photo/video (only its top-right corner rounded), with the time
// under the counts. Save stands alone at the bottom right — no background.
//
// `overlay` = drawn on top of media (default). For text-only posts there's
// no media, so the same buttons are shown as a plain row instead.
export function PostActions({
  likes,
  comments,
  shares,
  liked,
  bookmarked,
  createdAt,
  onLike,
  onComment,
  onShare,
  onBookmark,
  overlay = true,
}: {
  likes: number;
  comments: number;
  shares: number;
  saves?: number;
  liked: boolean;
  bookmarked: boolean;
  createdAt?: string;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onBookmark: () => void;
  overlay?: boolean;
}) {
  const baseColor = overlay ? "#FFFFFF" : "#3B3B42";
  const likeColor = liked ? "#FF4D67" : baseColor;
  const saveColor = bookmarked ? "#C5399A" : baseColor;
  const time = getRelativeTime(createdAt);

  const stats = (
    <>
      <View style={styles.statsRow}>
        <Stat
          icon={liked ? "heart" : "heart-outline"}
          count={likes}
          color={likeColor}
          onPress={onLike}
          label={liked ? "Unlike" : "Like"}
        />

        <Stat
          icon="chatbubble-outline"
          count={comments}
          color={baseColor}
          onPress={onComment}
          label="Comments"
        />

        <Stat
          icon="paper-plane-outline"
          count={shares}
          color={baseColor}
          onPress={onShare}
          label="Share"
        />
      </View>

      {time ? (
        <Text style={[styles.time, !overlay && styles.timeInline]}>{time}</Text>
      ) : null}
    </>
  );

  const saveButton = (
    <Pressable
      onPress={onBookmark}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={bookmarked ? "Remove from saved" : "Save"}>
      <Ionicons
        name={bookmarked ? "bookmark" : "bookmark-outline"}
        size={25}
        color={saveColor}
        style={overlay ? styles.iconShadow : undefined}
      />
    </Pressable>
  );

  if (!overlay) {
    return (
      <View style={styles.inlineRow}>
        <View>{stats}</View>
        {saveButton}
      </View>
    );
  }

  return (
    <>
      <BlurView intensity={25} tint="dark" style={styles.panel}>
        {stats}
      </BlurView>

      <View style={styles.save}>{saveButton}</View>
    </>
  );
}

const styles = StyleSheet.create({
  // Glass panel: touches the left and bottom edges, top-right corner round.
  panel: {
    position: "absolute",
    left: 0,
    bottom: 0,
    paddingLeft: 16,
    paddingRight: 20,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopRightRadius: 18,
    overflow: "hidden",
    backgroundColor: "rgba(20,20,26,0.45)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.35)",
    zIndex: 6,
  },

  statsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 22,
  },

  stat: {
    alignItems: "center",
    minWidth: 30,
  },

  count: {
    marginTop: 2,
    fontSize: 11.5,
    fontWeight: "600",
  },

  time: {
    marginTop: 5,
    fontSize: 11,
    color: "rgba(255,255,255,0.9)",
  },

  timeInline: {
    color: "#8A8A93",
  },

  // Save on its own at the bottom right — just the icon.
  save: {
    position: "absolute",
    right: 14,
    bottom: 18,
    zIndex: 6,
  },

  iconShadow: {
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // Text-only posts: the same buttons as a plain row.
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingHorizontal: 4,
  },
});
