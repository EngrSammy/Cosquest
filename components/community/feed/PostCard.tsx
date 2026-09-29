import { AVATARS } from "@/constants/avatars";
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
import { PostMedia } from "./PostMedia";
import { PostMenu } from "./PostMenu";
import { ShareSheet } from "./ShareSheet";

/* =========================================================
   HELPERS
========================================================= */

/**
 * Turn a list of possible values into a clean list of
 * non-empty strings.
 */
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

  const [deletingPost, setDeletingPost] = useState(false);

  /* =========================================================
     CURRENT USER
     
     We collect EVERY possible id for the logged-in user, 
     because auth and profile responses often use different
     field names (id, _id, userId).
  ========================================================= */

  const currentUserIds = cleanIds([
    authUser?.id,
    authUser?._id,
    authUser?.userId,
    user?.id,
    user?._id,
    user?.userId,
    ...getTokenUserIds(token),
  ]);

  const currentUserId = currentUserIds[0] || "";

  const currentUsername =
    user?.profile?.username ||
    authUser?.profile?.username ||
    user?.username ||
    authUser?.username ||
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

  /*
   * Different backend responses can expose the author's ID
   * in different places. We collect all of them and match
   * against ANY of the current user's IDs.
   */
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
     NORMALIZE USERNAMES
  ========================================================= */

  const normalizedCurrentUsername = normalizeUsername(currentUsername);

  const normalizedPostUsername = normalizeUsername(postUsername);

  /* =========================================================
     CHECK IF CURRENT USER OWNS POST
  ========================================================= */

  const ownsPostById = postUserIds.some((id) => currentUserIds.includes(id));

  const ownsPostByUsername =
    !!normalizedCurrentUsername &&
    !!normalizedPostUsername &&
    normalizedCurrentUsername === normalizedPostUsername;

  /*
   * Some backends tell the app directly whether the post
   * belongs to the logged-in user.
   */
  const backendSaysMine =
    post?.isMine === true ||
    post?.isOwner === true ||
    post?.mine === true ||
    post?.owner === true;

  const isMine = backendSaysMine || ownsPostById || ownsPostByUsername;

  /* =========================================================
     CURRENT USER AVATAR
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
     LIKE POST
  ========================================================= */

  const handleLike = () => {
    if (!post?.id) {
      return;
    }

    if (post.liked) {
      dispatch(
        unlikePostThunk({
          postId: post.id,
          token,
        }),
      );
    } else {
      dispatch(
        likePostThunk({
          postId: post.id,
          token,
        }),
      );
    }
  };

  /* =========================================================
     BOOKMARK

     Bookmark remains inside PostActions.
     It is NOT part of the three-dot menu.
  ========================================================= */

  const handleBookmark = () => {
    if (!post?.id) {
      return;
    }

    if (post.bookmarked) {
      dispatch(
        removeBookmarkThunk({
          postId: post.id,
          token,
        }),
      );
    } else {
      dispatch(
        bookmarkPostThunk({
          postId: post.id,
          token,
        }),
      );
    }
  };

  /* =========================================================
     OPEN EDIT
  ========================================================= */

  const startEdit = () => {
    /*
     * Only the owner should be able to edit.
     */
    if (!isMine) {
      return;
    }

    setMenuVisible(false);

    setEditText(post?.content || "");

    setEditing(true);
  };

  /* =========================================================
     SAVE EDIT
  ========================================================= */

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

      /*
       * Close edit modal after successful update.
       */
      setEditing(false);

      /*
       * Refresh posts so the updated content
       * comes directly from the backend.
       */
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
     DELETE POST
  ========================================================= */

  const deletePost = () => {
    /*
     * Only the owner should be able to delete.
     */
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

            /*
             * Refresh the feed after successful
             * deletion.
             */
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
     OPEN THREE-DOT MENU
  ========================================================= */

  const openPostMenu = () => {
    setMenuVisible(true);
  };

  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <View style={styles.card}>
      <View style={styles.mediaContainer}>
        {/* =================================================
            POST MEDIA
        ================================================= */}

        {/*
          The three-dot button only appears on the user's own posts.
          When onMenuPress is undefined, PostMedia hides the button.
        */}
        <PostMedia
          post={post}
          onMenuPress={isMine ? openPostMenu : undefined}
        />

        {/* =================================================
            POST ACTIONS
        ================================================= */}

        <PostActions
          likes={Number(post?.likes || 0)}
          comments={commentsCount}
          shares={Number(post?.shares || 0)}
          saves={Number(post?.saves || 0)}
          liked={!!post?.liked}
          bookmarked={!!post?.bookmarked}
          createdAt={post?.createdAt}
          onLike={handleLike}
          onComment={() => setCommentsVisible(true)}
          onShare={() => setShareVisible(true)}
          onBookmark={handleBookmark}
        />
      </View>

      {/* ===================================================
          CAPTION
      =================================================== */}

      <PostCaption username={postUsername} content={post?.content} />

      {/* ===================================================
          THREE-DOT MENU

          OWN POST:
          - Edit post
          - Delete post
          - Cancel

          OTHER USER'S POST:
          - Cancel
      =================================================== */}

      <PostMenu
        visible={menuVisible}
        isMine={isMine}
        onClose={() => setMenuVisible(false)}
        onEdit={startEdit}
        onDelete={deletePost}
      />

      {/* ===================================================
          EDIT POST MODAL
      =================================================== */}

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

      {/* ===================================================
          COMMENTS
      =================================================== */}

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

      {/* ===================================================
          SHARE
      =================================================== */}

      <ShareSheet
        visible={shareVisible}
        post={post}
        token={token}
        onClose={() => setShareVisible(false)}
      />
    </View>
  );
}

/* =========================================================
   STYLES
========================================================= */

const styles = StyleSheet.create({
  card: {
    marginBottom: 24,
  },

  mediaContainer: {
    position: "relative",
  },

  /* =======================================================
     EDIT MODAL
  ======================================================= */

  editRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },

  editOverlay: {
    ...StyleSheet.absoluteFillObject,
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
