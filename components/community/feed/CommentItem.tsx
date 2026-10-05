import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AVATARS } from "@/constants/avatars";
import { FONTS } from "@/constants/fonts";
import { CommentAudio } from "./CommentAudio";
import { ReplyItem } from "./ReplyItem";

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

  const key = author?.avatarKey || author?.profile?.avatarKey || "";

  return (
    AVATARS.find((item) => item.id === key)?.source ||
    require("@/assets/images/dp-avatar.png")
  );
}

// Figma: short times next to the name - "now", "5m", "3h", "2d", "3w".
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
    return "now";
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days}d`;
  }

  const weeks = Math.floor(days / 7);

  if (weeks < 52) {
    return `${weeks}w`;
  }

  return `${Math.floor(weeks / 52)}y`;
}

export function CommentItem({
  comment,
  replies,
  repliesOpen,
  isPostAuthor,
  isMine,
  onReply,
  onToggleReplies,
  onDelete,
  onDeleteReply,
  onReplyToReply,
  currentUserId,
  currentUsername,
  onLike,
  liked,
  likeCount,
  replyLikes,
  onLikeReply,
}: {
  comment: any;
  replies: any[];
  repliesOpen: boolean;
  isPostAuthor: boolean;
  isMine: boolean;

  onReply: () => void;
  onToggleReplies: () => void;
  onDelete: () => void;
  onDeleteReply: (reply: any) => void;
  onReplyToReply: (reply: any) => void;

  currentUserId: string;
  currentUsername: string;

  // Main comment like
  onLike: () => void;
  liked: boolean;
  likeCount: number;

  // Reply likes
  replyLikes: Record<
    string,
    {
      liked: boolean;
      count: number;
    }
  >;

  onLikeReply: (reply: any) => void;
}) {
  const username = comment?.author?.username || comment?.username || "User";

  const hasVoice = Boolean(comment?.media?.url);

  const time = getTime(comment?.createdAt);

  return (
    <View style={styles.section}>
      <View style={styles.row}>
        {/* PROFILE PHOTO (pink ring, Figma) */}
        <View style={styles.avatarRing}>
          <Image
            source={getAvatar(comment?.author || comment)}
            style={styles.avatar}
            contentFit="cover"
          />
        </View>

        <View style={styles.body}>
          {/* USERNAME · time · by author */}
          <View style={styles.nameRow}>
            <Text style={styles.username}>{username}</Text>

            {time ? <Text style={styles.time}>{time}</Text> : null}

            {isPostAuthor ? (
              <View style={styles.authorBadge}>
                <Ionicons name="heart-outline" size={11} color="#C5399A" />
                <Text style={styles.authorBadgeText}>by author</Text>
              </View>
            ) : null}
          </View>

          {/* VOICE COMMENT */}
          {hasVoice ? <CommentAudio media={comment.media} /> : null}

          {/* COMMENT TEXT — a voice comment may still carry a short
              typed caption alongside the audio. */}
          {comment?.body ? (
            <Text style={styles.text}>{comment.body}</Text>
          ) : null}

          {/* ACTIONS: Reply (pink) + view replies */}
          <View style={styles.actions}>
            <Pressable onPress={onReply} hitSlop={6}>
              <Text style={styles.replyText}>Reply</Text>
            </Pressable>

            {Number(comment?.replyCount || 0) > 0 ? (
              <Pressable onPress={onToggleReplies} hitSlop={6}>
                <Text style={styles.viewReplies}>
                  {repliesOpen
                    ? "Hide replies"
                    : `View ${comment.replyCount} ${
                        Number(comment.replyCount) === 1 ? "reply" : "replies"
                      }`}
                </Text>
              </Pressable>
            ) : null}

            {/* Delete your own comment */}
            {isMine ? (
              <Pressable onPress={onDelete} hitSlop={8}>
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* LIKE on the right, with the number under it (Figma) */}
        <Pressable
          style={styles.likeColumn}
          onPress={onLike}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={liked ? "Unlike comment" : "Like comment"}>
          <Ionicons
            name={liked ? "heart" : "heart-outline"}
            size={18}
            color={liked ? "#C5399A" : "#9C9CAA"}
          />

          {likeCount > 0 ? (
            <Text style={[styles.likeCount, liked && styles.likedCount]}>
              {likeCount}
            </Text>
          ) : null}
        </Pressable>
      </View>

      {/* REPLIES */}
      {repliesOpen && replies.length > 0 ? (
        <View style={styles.replies}>
          {replies.map((reply) => {
            const replyLikeState = replyLikes[reply.id] || {
              liked: !!reply?.liked,
              count: Number(reply?.likeCount ?? reply?.likes ?? 0),
            };

            return (
              <ReplyItem
                key={reply.id}
                reply={reply}
                currentUserId={currentUserId}
                currentUsername={currentUsername}
                onDelete={() => onDeleteReply(reply)}
                onReply={() => onReplyToReply(reply)}
                onLike={() => onLikeReply(reply)}
                liked={replyLikeState.liked}
                likeCount={replyLikeState.count}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingVertical: 10,
  },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },

  avatarRing: {
    padding: 2,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: "rgba(197,57,154,0.45)",
  },

  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#E9E9ED",
  },

  body: {
    flex: 1,
    minWidth: 0,
  },

  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
  },

  username: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    color: "#191922",
  },

  time: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: "#9999A1",
  },

  authorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },

  authorBadgeText: {
    fontFamily: FONTS.medium,
    fontSize: 10.5,
    color: "#C5399A",
  },

  text: {
    marginTop: 3,
    fontFamily: FONTS.regular,
    fontSize: 13,
    lineHeight: 19,
    color: "#3B3B42",
  },

  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginTop: 6,
  },

  replyText: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: "#C5399A",
  },

  viewReplies: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: "#7C7C85",
  },

  deleteText: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: "#9999A1",
  },

  // Like heart + number, on the right.
  likeColumn: {
    width: 30,
    alignItems: "center",
    paddingTop: 2,
  },

  likeCount: {
    marginTop: 2,
    fontFamily: FONTS.medium,
    fontSize: 11,
    color: "#9C9CAA",
  },

  likedCount: {
    color: "#C5399A",
  },

  replies: {
    marginTop: 10,
    marginLeft: 54,
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: "#E5E5E9",
  },
});
