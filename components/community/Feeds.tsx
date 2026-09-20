import { MOCK_POST, type Post } from "@/constants/mockPosts";
import { useUser } from "@/context/UserContext";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

// The compose bar at the top of the feed. Tapping it will open a post
// composer later; for now it's an inert entry point.
function PostField() {
  const { user: u } = useUser();
  return (
    <Pressable
      style={styles.composer}
      onPress={() => {
        // TODO: open the post composer screen.
      }}
    >
      <Image
        source={u.profileImage}
        style={styles.composerAvatar}
        contentFit="cover"
      />
      <Text style={styles.composerPlaceholder} numberOfLines={1}>
        Share Your Cosplay Or A Hot Take…
      </Text>
      <View style={styles.composerAdd}>
        <Ionicons name="add" size={20} color="#C5399A" />
      </View>
    </Pressable>
  );
}

// Icon on top, count underneath.
function StatButton({
  icon,
  count,
  color = "#FFFFFF",
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  count: number;
  color?: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={styles.statText}>{count}</Text>
    </>
  );
  return onPress ? (
    <Pressable style={styles.stat} onPress={onPress}>
      {content}
    </Pressable>
  ) : (
    <View style={styles.stat}>{content}</View>
  );
}

function PostCard({ post }: { post: Post }) {
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <View style={styles.card}>
      <View style={styles.mediaWrap}>
        <Image source={post.image} style={styles.media} contentFit="cover" />

        {/* Author chip over the image, top-left */}
        <BlurView intensity={30} tint="light" style={styles.authorChip}>
          <Image
            source={post.avatar}
            style={styles.chipAvatar}
            contentFit="cover"
          />
          <Text style={styles.chipName}>{post.handle}</Text>
        </BlurView>

        {/* Bottom gradient fade — carries the save button on the right */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.55)"]}
          style={styles.mediaTint}
        />

        {/* Glass pill (left): like / comment / share + time */}
        <BlurView intensity={25} tint="dark" style={styles.statsBar}>
          <View style={styles.statsRow}>
            <StatButton
              icon={liked ? "heart" : "heart-outline"}
              count={post.likes + (liked ? 1 : 0)}
              color={liked ? "#FF4D67" : "#FFFFFF"}
              onPress={() => setLiked((v) => !v)}
            />
            <StatButton icon="chatbubble-outline" count={post.comments} />
            <StatButton icon="paper-plane-outline" count={post.shares} />
          </View>
          <Text style={styles.time}>{post.time}</Text>
        </BlurView>

        {/* Save (right): outside the blur, over the gradient */}
        <View style={styles.saveWrap}>
          <StatButton
            icon={saved ? "bookmark" : "bookmark-outline"}
            count={post.saves + (saved ? 1 : 0)}
            onPress={() => setSaved((v) => !v)}
          />
        </View>
      </View>

      {/* Caption + hashtags sit on the app background (no card behind) */}
      <Text style={styles.caption}>
        <Text style={styles.captionHandle}>{post.handle} </Text>
        {post.caption}
      </Text>
      <Text style={styles.hashtags}>
        {post.hashtags.map((h) => `#${h}`).join(" ")}
      </Text>
    </View>
  );
}

export function Feeds() {
  return (
    <View>
      <PostField />
      {MOCK_POST.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 15,
    backgroundColor: "rgba(0, 0, 0, 0.06)",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    paddingVertical: 8,
    paddingHorizontal: 20,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  composerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(195, 77, 156, 0.2)",
  },
  composerPlaceholder: { flex: 1, fontSize: 13.5, color: "#6b6b72" },
  composerAdd: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "rgba(195, 77, 156, 0.2)",
    alignItems: "center",
    justifyContent: "center",
  },

  card: { marginTop: 18 },

  mediaWrap: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#EEE",
  },
  media: { width: "100%", height: 380 },

  authorChip: {
    position: "absolute",
    top: 12,
    left: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 6,
    paddingRight: 14,
    paddingVertical: 3,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
  },
  chipAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#DDD",
  },
  chipName: { fontSize: 13, fontWeight: "700", color: "#191922" },

  mediaTint: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "40%",
  },

  statsBar: {
    position: "absolute",
    left: -30,
    bottom: -40,
    overflow: "hidden",
    borderRadius: 40,
    paddingHorizontal: 70,
    paddingTop: 8,
    paddingBottom: 45,
    backgroundColor: "rgba(0,0,0,0.18)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.35)",
  },
  statsRow: { flexDirection: "row", alignItems: "flex-start", gap: 22 },
  stat: { alignItems: "center" },
  statText: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  time: { color: "rgba(255,255,255,0.85)", fontSize: 11, marginTop: 6 },

  saveWrap: {
    position: "absolute",
    right: 16,
    bottom: 18,
  },

  caption: {
    fontSize: 13.5,
    color: "#3a3a40",
    lineHeight: 19,
    marginTop: 12,
  },
  captionHandle: { fontWeight: "800", color: "#191922" },
  hashtags: {
    fontSize: 13,
    color: "#C5399A",
    fontWeight: "600",
    marginTop: 6,
    lineHeight: 20,
  },
});
