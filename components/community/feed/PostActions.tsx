import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

function Stat({
  icon,
  count,
  color = "#FFFFFF",
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  count: number;
  color?: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.stat} onPress={onPress} hitSlop={8}>
      <Ionicons name={icon} size={20} color={color} />

      <Text style={styles.count}>{count}</Text>
    </Pressable>
  );
}

export function PostActions({
  likes,
  comments,
  shares,
  saves,
  liked,
  bookmarked,
  createdAt,
  onLike,
  onComment,
  onShare,
  onBookmark,
}: {
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  liked: boolean;
  bookmarked: boolean;
  createdAt?: string;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onBookmark: () => void;
}) {
  return (
    <>
      {/* ONLY LIKE + COMMENT + SHARE */}
      <View style={styles.actionBox}>
        <View style={styles.row}>
          <Stat
            icon={liked ? "heart" : "heart-outline"}
            count={likes}
            color={liked ? "#FF4D67" : "#FFFFFF"}
            onPress={onLike}
          />

          <Stat
            icon="chatbubble-outline"
            count={comments}
            onPress={onComment}
          />

          <Stat icon="paper-plane-outline" count={shares} onPress={onShare} />
        </View>

        <Text style={styles.time}>{getRelativeTime(createdAt)}</Text>
      </View>

      {/* BOOKMARK OUTSIDE */}
      <Pressable style={styles.bookmark} onPress={onBookmark} hitSlop={8}>
        <Ionicons
          name={bookmarked ? "bookmark" : "bookmark-outline"}
          size={22}
          color="#FFFFFF"
        />

        <Text style={styles.saveCount}>{saves}</Text>
      </Pressable>
    </>
  );
}

function getRelativeTime(createdAt?: string) {
  if (!createdAt) {
    return "";
  }

  const timestamp = new Date(createdAt).getTime();

  if (Number.isNaN(timestamp)) {
    return "";
  }

  const diff = Math.max(0, Date.now() - timestamp);

  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) {
    return "just now";
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  return `${Math.floor(days / 7)} weeks ago`;
}

const styles = StyleSheet.create({
  /*
   * Fit the content instead of stretching
   * across the whole media.
   */
  actionBox: {
    position: "absolute",
    left: 9,
    bottom: 9,
    alignSelf: "flex-start",
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: "rgba(195,77,156,0.20)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    zIndex: 6,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 22,
  },

  stat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  count: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  time: {
    marginTop: 4,
    fontSize: 11,
    color: "rgba(255,255,255,0.86)",
  },

  bookmark: {
    position: "absolute",
    right: 17,
    bottom: 13,
    alignItems: "center",
    zIndex: 12,
  },

  saveCount: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
