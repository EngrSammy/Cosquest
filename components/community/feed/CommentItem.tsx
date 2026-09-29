import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AVATARS } from "@/constants/avatars";
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

  return (
    <View style={styles.section}>
      <View style={styles.row}>
        {/* PROFILE PHOTO */}
        <Image
          source={getAvatar(comment?.author || comment)}
          style={styles.avatar}
          contentFit="cover"
        />

        <View style={styles.body}>
          {/* USERNAME */}
          <View style={styles.nameRow}>
            <Text style={styles.username}>{username}</Text>

            {isPostAuthor ? (
              <Text style={styles.authorBadge}>♥ by author</Text>
            ) : null}
          </View>

          {/* TIME */}
          <Text style={styles.time}>{getTime(comment?.createdAt)}</Text>

          {/* VOICE COMMENT */}
          {hasVoice ? <CommentAudio media={comment.media} /> : null}

          {/* COMMENT TEXT — a voice comment may still carry a short
              typed caption alongside the audio, so this isn't mutually
              exclusive with the player above. */}
          {comment?.body ? (
            <Text style={styles.text}>{comment.body}</Text>
          ) : null}

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

            {/* VIEW REPLIES */}
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
          </View>
        </View>

        {/* DELETE COMMENT */}
        {isMine ? (
          <Pressable onPress={onDelete} hitSlop={8}>
            <Ionicons name="trash-outline" size={17} color="#9999A1" />
          </Pressable>
        ) : null}
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
    paddingVertical: 9,
  },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },

  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontSize: 13,
    fontWeight: "700",
    color: "#191922",
  },

  authorBadge: {
    fontSize: 10,
    fontWeight: "700",
    color: "#C5399A",
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
    marginTop: 7,
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

  viewReplies: {
    fontSize: 12,
    fontWeight: "600",
    color: "#7C7C85",
  },

  replies: {
    marginTop: 10,
    marginLeft: 50,
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: "#E5E5E9",
  },
});
