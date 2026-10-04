// ==========================================
// THE ORIGINAL POST INSIDE A SHARED POST
// ==========================================
// "Jerry shared Mary Jane's post": this is Mary Jane's post, in a frame.
// Tap it to open the original. If it was deleted, says so.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AVATARS } from "@/constants/avatars";
import type { SharedPost } from "@/store/slices/postSlice";
import { getCloudinaryVideoPoster } from "@/utils/videoPoster";

function avatarFor(author?: {
  avatarPhotoUrl?: string | null;
  avatarKey?: string | null;
}) {
  if (author?.avatarPhotoUrl) {
    return { uri: author.avatarPhotoUrl };
  }

  return (
    AVATARS.find((avatar) => avatar.id === author?.avatarKey)?.source ||
    require("@/assets/images/dp-avatar.png")
  );
}

export function SharedPostEmbed({ shared }: { shared?: SharedPost | null }) {
  if (!shared || shared.unavailable) {
    return (
      <View style={[styles.frame, styles.unavailable]}>
        <Ionicons name="eye-off-outline" size={18} color="#8A8A93" />
        <Text style={styles.unavailableText}>
          This post is no longer available.
        </Text>
      </View>
    );
  }

  const author = shared.author;
  const name = author?.name || author?.username || "CosQuest user";
  const firstMedia = shared.media?.[0]?.url || shared.image || null;
  const isReel = shared.type === "reel";
  const picture = firstMedia
    ? isReel
      ? getCloudinaryVideoPoster(firstMedia, 720)
      : firstMedia
    : null;

  const ratio = (() => {
    const item = shared.media?.[0];

    if (item?.width && item?.height) {
      return Math.min(1.91, Math.max(0.8, item.width / item.height));
    }

    return isReel ? 0.8 : 1;
  })();

  const openOriginal = () =>
    router.push({ pathname: "/post/[id]", params: { id: shared.id } });

  return (
    <Pressable
      style={styles.frame}
      onPress={openOriginal}
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}'s post`}>
      {/* The original's author */}
      <View style={styles.authorRow}>
        <Image
          source={avatarFor(author)}
          style={styles.avatar}
          contentFit="cover"
        />

        <View style={styles.authorText}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>

          <Text style={styles.meta} numberOfLines={1}>
            {author?.username ? `@${author.username}` : ""}
            {shared.time ? ` · ${shared.time}` : ""}
          </Text>
        </View>
      </View>

      {/* Its photo / reel cover */}
      {picture ? (
        <View style={[styles.mediaWrap, { aspectRatio: ratio }]}>
          <Image
            source={{ uri: picture }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
          />

          {isReel ? (
            <View style={styles.play}>
              <Ionicons name="play" size={22} color="#FFFFFF" />
            </View>
          ) : null}

          {(shared.media?.length || 0) > 1 ? (
            <View style={styles.count}>
              <Ionicons name="copy-outline" size={12} color="#FFFFFF" />
              <Text style={styles.countText}>{shared.media!.length}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Its caption */}
      {shared.content?.trim() ? (
        <Text style={styles.content} numberOfLines={picture ? 3 : 6}>
          {shared.content}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: {
    marginHorizontal: 14,
    marginTop: 4,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8E8EE",
    backgroundColor: "#FAFAFC",
    overflow: "hidden",
  },

  unavailable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 16,
  },

  unavailableText: {
    fontSize: 13,
    color: "#8A8A93",
  },

  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
  },

  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1E4EE",
  },

  authorText: {
    flex: 1,
    minWidth: 0,
  },

  name: {
    fontSize: 14,
    fontWeight: "700",
    color: "#191922",
  },

  meta: {
    marginTop: 1,
    fontSize: 12,
    color: "#8A8A93",
  },

  mediaWrap: {
    width: "100%",
    backgroundColor: "#EDEDF1",
  },

  play: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 48,
    height: 48,
    marginTop: -24,
    marginLeft: -24,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
  },

  count: {
    position: "absolute",
    top: 8,
    right: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.45)",
  },

  countText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },

  content: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
    lineHeight: 19,
    color: "#3B3B42",
  },
});
