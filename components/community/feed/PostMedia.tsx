import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { PostVideo } from "./PostVideo";

function getMediaUrl(post: any) {
  if (typeof post?.image === "string") {
    return post.image;
  }

  if (typeof post?.video === "string") {
    return post.video;
  }

  if (typeof post?.media === "string") {
    return post.media;
  }

  if (
    post?.media &&
    typeof post.media === "object" &&
    typeof post.media.url === "string"
  ) {
    return post.media.url;
  }

  if (Array.isArray(post?.media)) {
    const first = post.media[0];

    if (typeof first === "string") {
      return first;
    }

    if (first && typeof first.url === "string") {
      return first.url;
    }
  }

  return null;
}

/**
 * Get the user's REAL uploaded profile photo.
 *
 * Priority:
 * 1. post.avatar
 * 2. post.avatarPhotoUrl
 * 3. post.avatarUrl
 * 4. post.author.avatarPhotoUrl
 * 5. post.author.avatarUrl
 * 6. post.author.profile.avatarPhotoUrl
 * 7. post.author.profile.avatarUrl
 *
 * We intentionally DO NOT use the AVATARS constant here.
 */
function getProfilePhoto(post: any) {
  const possiblePhotos = [
    post?.avatar,
    post?.avatarPhotoUrl,
    post?.avatarUrl,

    post?.author?.avatarPhotoUrl,
    post?.author?.avatarUrl,

    post?.author?.profile?.avatarPhotoUrl,
    post?.author?.profile?.avatarUrl,

    post?.user?.avatarPhotoUrl,
    post?.user?.avatarUrl,

    post?.user?.profile?.avatarPhotoUrl,
    post?.user?.profile?.avatarUrl,
  ];

  const photo = possiblePhotos.find(
    (value) => typeof value === "string" && value.trim().length > 0,
  );

  return photo || null;
}

export function PostMedia({
  post,
  onMenuPress,
}: {
  post: any;
  onMenuPress: () => void;
}) {
  const mediaUrl = getMediaUrl(post);

  const isReel = post.type === "reel";

  const username =
    post.author?.username || post.handle || post.username || "CosQuest User";

  const profilePhoto = getProfilePhoto(post);

  return (
    <View style={styles.container}>
      {/* POST MEDIA */}
      {isReel && mediaUrl ? (
        <PostVideo uri={mediaUrl} />
      ) : mediaUrl ? (
        <Image
          source={{ uri: mediaUrl }}
          style={styles.image}
          contentFit="cover"
        />
      ) : (
        <View style={styles.placeholder}>
          <Ionicons name="image-outline" size={42} color="#B5B5BD" />
        </View>
      )}

      {/* AUTHOR */}
      <BlurView intensity={30} tint="light" style={styles.author}>
        {profilePhoto ? (
          <Image
            source={{ uri: profilePhoto }}
            style={styles.avatar}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={styles.avatarFallback}>
            <Ionicons name="person" size={14} color="#8A8A90" />
          </View>
        )}

        <Text style={styles.authorText} numberOfLines={1}>
          {username}
        </Text>
      </BlurView>

      {/* MENU */}
      <Pressable style={styles.menu} onPress={onMenuPress} hitSlop={8}>
        <Ionicons name="ellipsis-horizontal" size={20} color="#191922" />
      </Pressable>

      {/* BOTTOM GRADIENT */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.62)"]}
        style={styles.gradient}
        pointerEvents="none"
      />

      {/* REEL LABEL */}
      {isReel ? (
        <View style={styles.reel}>
          <Ionicons name="videocam" size={12} color="#FFFFFF" />

          <Text style={styles.reelText}>Reel</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: 380,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#EEEEF1",
    position: "relative",
  },

  image: {
    width: "100%",
    height: "100%",
  },

  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E9E9ED",
  },

  author: {
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
    borderColor: "rgba(255,255,255,0.65)",
    zIndex: 5,
  },

  /**
   * REAL uploaded profile photo
   */
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E2E2E6",
  },

  /**
   * Only used when the backend did not provide
   * an uploaded profile photo.
   */
  avatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E2E2E6",
  },

  authorText: {
    maxWidth: 180,
    fontSize: 13,
    fontWeight: "700",
    color: "#191922",
  },

  menu: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 35,
    height: 35,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.88)",
    zIndex: 10,
  },

  gradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "45%",
  },

  reel: {
    position: "absolute",
    left: 14,
    top: 55,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: "rgba(197,57,154,0.88)",
  },

  reelText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
