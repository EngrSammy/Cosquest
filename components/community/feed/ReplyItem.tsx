import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AVATARS } from "@/constants/avatars";
import { CommentAudio } from "./CommentAudio";

function getAvatar(author: any) {
  // Real uploaded profile photo
  if (
    typeof author?.avatarPhotoUrl === "string" &&
    author.avatarPhotoUrl.trim()
  ) {
    return {
      uri: author.avatarPhotoUrl,
    };
  }

  if (
    typeof author?.profile?.avatarPhotoUrl === "string" &&
    author.profile.avatarPhotoUrl.trim()
  ) {
    return {
      uri: author.profile.avatarPhotoUrl,
    };
  }

  // Other possible real uploaded photo fields
  if (typeof author?.avatarUrl === "string" && author.avatarUrl.trim()) {
    return {
      uri: author.avatarUrl,
    };
  }

  if (
    typeof author?.profile?.avatarUrl === "string" &&
    author.profile.avatarUrl.trim()
  ) {
    return {
      uri: author.profile.avatarUrl,
    };
  }

  // Fallback
  const key = author?.avatarKey || author?.profile?.avatarKey || "";

  return (
    AVATARS.find((item) => item.id === key)?.source ||
    require("@/assets/images/dp-avatar.png")
  );
}

function getTime(createdAt?: string) {
  if (!createdAt) {
    return "";
  }

  const createdTime = new Date(createdAt).getTime();

  if (Number.isNaN(createdTime)) {
    return "";
  }

  const minutes = Math.floor(Math.max(0, Date.now() - createdTime) / 60000);

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  return new Date(createdTime).toLocaleDateString();
}

export function ReplyItem({
  reply,
  currentUserId,
  currentUsername,
  onDelete,
  onReply,
  onLike,
  liked,
  likeCount,
}: {
  reply: any;
  currentUserId: string;
  currentUsername: string;
  onDelete: () => void;
  onReply: () => void;
  onLike: () => void;
  liked: boolean;
  likeCount: number;
}) {
  const username = reply?.author?.username || reply?.username || "User";

  const mine =
    reply?.author?.id === currentUserId ||
    username.replace(/^@/, "").toLowerCase() ===
      currentUsername.replace(/^@/, "").toLowerCase();

  const hasVoice = Boolean(reply?.media?.url);

  return (
    <View style={styles.row}>
      {/* PROFILE PHOTO */}
      <Image
        source={getAvatar(reply?.author || reply)}
        style={styles.avatar}
        contentFit="cover"
      />

      <View style={styles.body}>
        {/* USERNAME */}
        <Text style={styles.username}>{username}</Text>

        {/* TIME */}
        <Text style={styles.time}>{getTime(reply?.createdAt)}</Text>

        {/* VOICE REPLY */}
        {hasVoice ? <CommentAudio media={reply.media} /> : null}

        {/* REPLY TEXT */}
        {reply?.body ? <Text style={styles.text}>{reply.body}</Text> : null}

        {/* ACTIONS */}
        <View style={styles.actions}>
          {/* REPLY */}
          <Pressable onPress={onReply} hitSlop={6}>
            <Text style={styles.replyText}>Reply</Text>
          </Pressable>

          {/* LIKE */}
          <Pressable style={styles.likeAction} onPress={onLike} hitSlop={6}>
            <Ionicons
              name={liked ? "heart" : "heart-outline"}
              size={16}
              color={liked ? "#C5399A" : "#8B8B93"}
            />

            <Text style={[styles.likeCount, liked && styles.likedCount]}>
              {likeCount}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* DELETE */}
      {mine ? (
        <Pressable onPress={onDelete} hitSlop={8}>
          <Ionicons name="trash-outline" size={17} color="#9999A1" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    paddingVertical: 8,
  },

  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E9E9ED",
  },

  body: {
    flex: 1,
    minWidth: 0,
  },

  username: {
    fontSize: 13,
    fontWeight: "700",
    color: "#191922",
  },

  time: {
    marginTop: 2,
    fontSize: 11,
    color: "#9999A1",
  },

  text: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 19,
    color: "#424249",
  },

  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginTop: 6,
  },

  replyText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#C5399A",
  },

  likeAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  likeCount: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8B8B93",
  },

  likedCount: {
    color: "#C5399A",
  },
});
