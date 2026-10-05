import { AVATARS } from "@/constants/avatars";
import { FONTS } from "@/constants/fonts";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  bookmarkPostThunk,
  editPost,
  fetchPosts,
  likePostThunk,
  removeBookmarkThunk,
  removePost,
  unlikePostThunk,
} from "@/store/thunks/postThunks";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { CommentsModal } from "./CommentsModal";
import { PostActions } from "./PostActions";
import { PostCaption } from "./PostCaption";
import { getMediaUrls, PostMedia } from "./PostMedia";
import { PostMenu } from "./PostMenu";
import { SharedPostEmbed } from "./SharedPostEmbed";
import { ShareSheet } from "./ShareSheet";

/* =========================================================
   HELPERS
========================================================= */

function cleanIds(values: any[]): string[] {
  return values
    .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
    .map((v) => String(v).trim());
}

function normalizeUsername(value: any): string {
  return String(value ?? "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();
}

function base64Decode(input: string): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  const str = input.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");

  let output = "";
  let bits = 0;
  let value = 0;

  for (let i = 0; i < str.length; i++) {
    const index = chars.indexOf(str.charAt(i));

    if (index < 0) {
      continue;
    }

    value = (value << 6) | index;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((value >> bits) & 0xff);
      value = value & ((1 << bits) - 1);
    }
  }

  return output;
}

/**
 * Reads the user's ID straight out of the login token (JWT).
 * This works even when Redux doesn't store the user ID.
 */
function getTokenUserIds(token: string): string[] {
  try {
    const payload = token?.split(".")[1];

    if (!payload) {
      return [];
    }

    const data = JSON.parse(base64Decode(payload));

    return cleanIds([
      data?.id,
      data?._id,
      data?.userId,
      data?.user_id,
      data?.sub,
      data?.user?.id,
      data?.user?._id,
    ]);
  } catch {
    return [];
  }
}

// The author's real uploaded photo, then their chosen preset avatar, then
// the default picture.
function getAuthorAvatar(post: any) {
  const photos = [
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

  const photo = photos.find(
    (value) => typeof value === "string" && value.trim().length > 0,
  );

  if (photo) {
    return { uri: photo };
  }

  const key =
    post?.author?.avatarKey ||
    post?.author?.profile?.avatarKey ||
    post?.user?.avatarKey ||
    "";

  return (
    AVATARS.find((item) => item.id === key)?.source ||
    require("@/assets/images/dp-avatar.png")
  );
}

function capitalize(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

// The avatar ring shows the author's faction colour. Known factions get a
// fixed colour; any other faction gets a steady colour from this palette
// (the same faction always gets the same colour).
const FACTION_COLORS: Record<string, string> = {
  celestials: "#7F77DD",
};

const RING_PALETTE = ["#D85A30", "#1D9E75", "#378ADD", "#BA7517", "#D4537E"];

function factionColor(faction: string) {
  const key = faction.toLowerCase();

  if (!key) {
    return "#C5399A";
  }

  if (FACTION_COLORS[key]) {
    return FACTION_COLORS[key];
  }

  let hash = 0;

  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }

  return RING_PALETTE[hash % RING_PALETTE.length];
}

export function PostCard({ post, token }: { post: any; token: string }) {
  const dispatch = useAppDispatch();

  /* =========================================================
     AUTH USER
  ========================================================= */

  const authUser = useAppSelector((state) => state.auth.user);

  const user = useAppSelector((state) => state.user.user);

  /* =========================================================
     UI STATE
  ========================================================= */

  const [commentsVisible, setCommentsVisible] = useState(false);

  const [shareVisible, setShareVisible] = useState(false);

  const [menuVisible, setMenuVisible] = useState(false);

  const [editing, setEditing] = useState(false);

  const [editText, setEditText] = useState(post?.content || "");

  const [commentsCount, setCommentsCount] = useState(
    Number(post?.comments ?? post?.commentCount ?? 0),
  );

  const [savingEdit, setSavingEdit] = useState(false);

  // Shares shown on the post; goes up as soon as you share it (see the
  // ShareSheet's onShared below), without waiting for the feed to reload.
  const [sharesCount, setSharesCount] = useState(
    Number(post?.shares ?? post?.shareCount ?? 0),
  );

  const [deletingPost, setDeletingPost] = useState(false);

  /* =========================================================
     CURRENT USER
  ========================================================= */

  const currentUserIds = cleanIds([
    (authUser as any)?.id,
    (authUser as any)?._id,
    (authUser as any)?.userId,
    (user as any)?.id,
    (user as any)?._id,
    (user as any)?.userId,
    ...getTokenUserIds(token),
  ]);

  const currentUserId = currentUserIds[0] || "";

  const currentUsername =
    user?.profile?.username ||
    authUser?.profile?.username ||
    user?.username ||
    (authUser as any)?.username ||
    "";

  /* =========================================================
     POST AUTHOR
  ========================================================= */

  const postUsername =
    post?.author?.username ||
    post?.author?.profile?.username ||
    post?.user?.username ||
    post?.user?.profile?.username ||
    post?.handle ||
    post?.username ||
    "";

  const authorName =
    post?.author?.name ||
    post?.author?.displayName ||
    post?.author?.profile?.displayName ||
    postUsername ||
    "CosQuest User";

  const authorFaction = String(
    post?.author?.faction || post?.user?.faction || "",
  );

  const postUserIds = cleanIds([
    post?.userId,
    post?.user_id,
    post?.authorId,
    post?.ownerId,
    post?.createdBy,
    post?.user?.id,
    post?.user?._id,
    post?.user?.userId,
    post?.author?.id,
    post?.author?._id,
    post?.author?.userId,
    post?.author?.user?.id,
    post?.author?.user?._id,
    post?.author?.profile?.userId,
  ]);

  /* =========================================================
     CHECK IF CURRENT USER OWNS POST
  ========================================================= */

  const normalizedCurrentUsername = normalizeUsername(currentUsername);

  const normalizedPostUsername = normalizeUsername(postUsername);

  const ownsPostById = postUserIds.some((id) => currentUserIds.includes(id));

  const ownsPostByUsername =
    !!normalizedCurrentUsername &&
    !!normalizedPostUsername &&
    normalizedCurrentUsername === normalizedPostUsername;

  const backendSaysMine =
    post?.isMine === true ||
    post?.isOwner === true ||
    post?.mine === true ||
    post?.owner === true;

  const isMine = backendSaysMine || ownsPostById || ownsPostByUsername;

  /* =========================================================
     CURRENT USER AVATAR (for the comments box)
  ========================================================= */

  const avatarKey =
    user?.profile?.avatarKey || authUser?.profile?.avatarKey || "";

  const uploadedAvatar =
    user?.profile?.avatarPhotoUrl || authUser?.profile?.avatarPhotoUrl || "";

  const userAvatar = uploadedAvatar
    ? {
        uri: uploadedAvatar,
      }
    : AVATARS.find((item) => item.id === avatarKey)?.source ||
      require("@/assets/images/dp-avatar.png");

  /* =========================================================
     LIKE / BOOKMARK
  ========================================================= */

  const handleLike = () => {
    if (!post?.id) {
      return;
    }

    if (post.liked) {
      dispatch(unlikePostThunk({ postId: post.id, token }));
    } else {
      dispatch(likePostThunk({ postId: post.id, token }));
    }
  };

  const handleBookmark = () => {
    if (!post?.id) {
      return;
    }

    if (post.bookmarked) {
      dispatch(removeBookmarkThunk({ postId: post.id, token }));
    } else {
      dispatch(bookmarkPostThunk({ postId: post.id, token }));
    }
  };

  /* =========================================================
     EDIT
  ========================================================= */

  const startEdit = () => {
    if (!isMine) {
      return;
    }

    setMenuVisible(false);

    setEditText(post?.content || "");

    setEditing(true);
  };

  const saveEdit = async () => {
    const text = editText.trim();

    if (!text) {
      Alert.alert("Edit post", "Post content cannot be empty.");

      return;
    }

    if (!post?.id) {
      Alert.alert("Edit post", "Post ID is missing.");

      return;
    }

    if (!token) {
      Alert.alert("Edit post", "You are not signed in.");

      return;
    }

    if (!isMine) {
      Alert.alert("Edit post", "You can only edit your own post.");

      return;
    }

    if (savingEdit) {
      return;
    }

    try {
      setSavingEdit(true);

      await dispatch(
        editPost({
          postId: post.id,
          token,
          data: {
            content: text,
          },
        }),
      ).unwrap();

      setEditing(false);

      await dispatch(fetchPosts(token)).unwrap();
    } catch (error) {
      Alert.alert(
        "Edit post",
        error instanceof Error ? error.message : "Unable to update post.",
      );
    } finally {
      setSavingEdit(false);
    }
  };

  /* =========================================================
     DELETE
  ========================================================= */

  const deletePost = () => {
    if (!isMine) {
      return;
    }

    setMenuVisible(false);

    if (!post?.id) {
      Alert.alert("Delete post", "Post ID is missing.");

      return;
    }

    if (!token) {
      Alert.alert("Delete post", "You are not signed in.");

      return;
    }

    if (deletingPost) {
      return;
    }

    Alert.alert("Delete post", "Are you sure you want to delete this post?", [
      {
        text: "Cancel",
        style: "cancel",
      },

      {
        text: "Delete",
        style: "destructive",

        onPress: async () => {
          try {
            setDeletingPost(true);

            await dispatch(
              removePost({
                postId: post.id,
                token,
              }),
            ).unwrap();

            await dispatch(fetchPosts(token)).unwrap();
          } catch (error) {
            Alert.alert(
              "Delete post",
              error instanceof Error ? error.message : "Unable to delete post.",
            );
          } finally {
            setDeletingPost(false);
          }
        },
      },
    ]);
  };

  /* =========================================================
     RENDER
  ========================================================= */

  const hasMedia = getMediaUrls(post).length > 0;

  // Under the name: the post's place if it has one, otherwise the handle.
  const placeName =
    (typeof post?.location === "string"
      ? post.location
      : post?.location?.name) ||
    post?.locationName ||
    "";

  const subtitle =
    post?.type === "share"
      ? "shared a post"
      : placeName ||
        (post?.type === "reel"
          ? "Reel"
          : postUsername
            ? `@${postUsername}`
            : "");

  const actions = (overlay: boolean) => (
    <PostActions
      overlay={overlay}
      likes={Number(post?.likes || 0)}
      comments={commentsCount}
      shares={sharesCount}
      saves={Number(post?.saves || 0)}
      liked={!!post?.liked}
      bookmarked={!!post?.bookmarked}
      createdAt={post?.createdAt}
      onLike={handleLike}
      onComment={() => setCommentsVisible(true)}
      onShare={() => setShareVisible(true)}
      onBookmark={handleBookmark}
    />
  );

  // Faction · @username (or "Reel" / "shared a post") under the name.
  const pillMeta = [authorFaction ? capitalize(authorFaction) : "", subtitle]
    .filter(Boolean)
    .join(" · ");

  // The name pill: on the photo (see-through) or on a text card (white).
  const authorPill = (onPhoto: boolean) => (
    <View
      style={[styles.pill, onPhoto ? styles.pillOnPhoto : styles.pillOnCard]}>
      <View style={[styles.ring, { borderColor: factionColor(authorFaction) }]}>
        <Image
          source={getAuthorAvatar(post)}
          style={styles.avatar}
          contentFit="cover"
          transition={150}
        />
      </View>

      <View style={styles.pillText}>
        <Text style={styles.name} numberOfLines={1}>
          {authorName}
        </Text>

        {pillMeta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {pillMeta}
          </Text>
        ) : null}
      </View>
    </View>
  );

  // ⋯ only on your own posts (edit / delete).
  const menuButton = (onPhoto: boolean) =>
    isMine ? (
      <Pressable
        style={[styles.menuButton, onPhoto && styles.menuButtonOnPhoto]}
        onPress={() => setMenuVisible(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Post options">
        <Ionicons
          name="ellipsis-horizontal"
          size={20}
          color={onPhoto ? "#FFFFFF" : "#65656D"}
        />
      </Pressable>
    ) : null;

  return (
    // Figma: no white box - the PHOTO is the card, the name pill sits on
    // it, and the caption sits underneath on the page background.
    <View style={styles.post}>
      {hasMedia ? (
        <>
          <PostMedia post={post}>
            <View style={styles.overlayTop} pointerEvents="box-none">
              {authorPill(true)}
              {menuButton(true)}
            </View>

            {/* Like · Comment · Share + Save on the photo */}
            {actions(true)}
          </PostMedia>

          {/* CAPTION + pink hashtags, under the photo */}
          {post?.content?.trim() ? (
            <View style={styles.captionBelow}>
              <PostCaption username={postUsername} content={post?.content} />
            </View>
          ) : null}
        </>
      ) : (
        // Text-only and shared posts: a soft card in the same size/place.
        <View style={styles.textCard}>
          <View style={styles.textCardTop}>
            {authorPill(false)}
            {menuButton(false)}
          </View>

          {post?.content?.trim() ? (
            <View style={styles.textCardCaption}>
              <PostCaption username={postUsername} content={post?.content} />
            </View>
          ) : null}

          {/* SHARED POST: the original, in a frame */}
          {post?.type === "share" ? (
            <SharedPostEmbed shared={post?.sharedPost} />
          ) : null}

          {actions(false)}
        </View>
      )}

      {/* THREE-DOT MENU */}
      <PostMenu
        visible={menuVisible}
        isMine={isMine}
        onClose={() => setMenuVisible(false)}
        onEdit={startEdit}
        onDelete={deletePost}
      />

      {/* EDIT POST MODAL */}
      <Modal
        visible={editing}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!savingEdit) {
            setEditing(false);
          }
        }}>
        <KeyboardAvoidingView
          style={styles.editRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable
            style={styles.editOverlay}
            onPress={() => {
              if (!savingEdit) {
                setEditing(false);
              }
            }}
          />

          <View style={styles.editSheet}>
            <View style={styles.editHandle} />

            <View style={styles.editHeader}>
              <Text style={styles.editTitle}>Edit post</Text>

              <Pressable
                onPress={() => {
                  if (!savingEdit) {
                    setEditing(false);
                  }
                }}
                style={styles.editClose}>
                <Text style={styles.editCloseText}>×</Text>
              </Pressable>
            </View>

            <TextInput
              value={editText}
              onChangeText={setEditText}
              multiline
              textAlignVertical="top"
              editable={!savingEdit}
              style={styles.editInput}
              placeholder="Write something..."
              placeholderTextColor="#9C9CAA"
            />

            <Pressable
              style={[
                styles.saveButton,
                savingEdit && styles.saveButtonDisabled,
              ]}
              onPress={saveEdit}
              disabled={savingEdit}>
              <Text style={styles.saveButtonText}>
                {savingEdit ? "Saving..." : "Save Changes"}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* COMMENTS */}
      <CommentsModal
        visible={commentsVisible}
        onClose={() => setCommentsVisible(false)}
        postId={post.id}
        postUsername={postUsername}
        token={token}
        currentUserId={String(currentUserId || "")}
        currentUsername={String(currentUsername || "")}
        userAvatar={userAvatar}
        initialCount={commentsCount}
        onCountChange={setCommentsCount}
      />

      {/* SHARE */}
      <ShareSheet
        visible={shareVisible}
        post={post}
        token={token}
        onClose={() => setShareVisible(false)}
        onShared={(newTotal) =>
          setSharesCount((current) =>
            typeof newTotal === "number" ? newTotal : current + 1,
          )
        }
      />
    </View>
  );
}

/* =========================================================
   STYLES
========================================================= */

const styles = StyleSheet.create({
  // One post: the photo card (or text card) + the caption under it.
  post: {
    marginBottom: 26,
  },

  // Name pill (left) and ⋯ (right) on top of the photo.
  overlayTop: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    zIndex: 8,
  },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "80%",
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 14,
    borderRadius: 24,
  },

  // On a photo: see-through white, like the Figma.
  pillOnPhoto: {
    backgroundColor: "rgba(255,255,255,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.75)",
  },

  // On a text card: solid white with a thin rim.
  pillOnCard: {
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EDEDF1",
  },

  // Faction-coloured ring around the avatar.
  ring: {
    padding: 1.5,
    borderRadius: 20,
    borderWidth: 1.5,
  },

  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F1E4EE",
  },

  pillText: {
    flexShrink: 1,
    minWidth: 0,
  },

  name: {
    fontFamily: FONTS.semibold,
    fontSize: 13.5,
    lineHeight: 18,
    color: "#191922",
  },

  meta: {
    fontFamily: FONTS.regular,
    fontSize: 10.5,
    lineHeight: 14,
    color: "#4B4B53",
  },

  menuButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },

  menuButtonOnPhoto: {
    backgroundColor: "rgba(0,0,0,0.35)",
  },

  // Caption under the photo, lined up with the card's edges.
  captionBelow: {
    marginTop: 14,
    paddingHorizontal: 24,
  },

  // Text-only / shared posts.
  textCard: {
    marginHorizontal: 24,
    padding: 14,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",

    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },

  textCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },

  textCardCaption: {
    marginTop: 12,
  },

  /* EDIT MODAL */

  editRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },

  editOverlay: {
    // Was absoluteFillObject, which no longer exists in this React Native
    // version (the dark background was silently missing).
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.28)",
  },

  editSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 28 : 20,
  },

  editHandle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 4,
    backgroundColor: "#C7C7CC",
    marginBottom: 18,
  },

  editHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },

  editTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#191922",
  },

  editClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F0F3",
  },

  editCloseText: {
    fontSize: 26,
    color: "#191922",
    lineHeight: 28,
  },

  editInput: {
    minHeight: 140,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E3E3E7",
    backgroundColor: "#FAFAFB",
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontSize: 15,
    color: "#191922",
    marginBottom: 15,
  },

  saveButton: {
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#C5399A",
  },

  saveButtonDisabled: {
    opacity: 0.6,
  },

  saveButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
