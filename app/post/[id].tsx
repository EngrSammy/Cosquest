// ==========================================
// POST DETAIL SCREEN  —  /post/<id>
// ==========================================
// Opened by shared post links:
//   website:  https://<site>/post/<id>   (or http://localhost:8081/post/<id>)
//   app:      cosquest://post/<id>
// Shows one post using the same PostCard as the feed, so it looks and
// works exactly the same (like, comment, share, bookmark).

import { Ionicons } from "@expo/vector-icons";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
      ActivityIndicator,
      Pressable,
      ScrollView,
      StyleSheet,
      Text,
      View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppBackground } from "@/components/AppBackground";
import { PostCard } from "@/components/community/feed/PostCard";
import { getPost } from "@/services/posts";
import { useAppSelector } from "@/store/hooks";
import { safeBack } from "@/utils/safeBack";

// The backend's single-post answer may be { post: {...} } or the post
// itself, and may use slightly different names than the feed list
// (likeCount vs likes, _id vs id). This gives PostCard the shape it
// expects, keeping every other field as it is.
function normalizePost(raw: any) {
  const post = raw?.post ?? raw?.data ?? raw;

  if (!post || typeof post !== "object") {
    return null;
  }

  return {
    ...post,
    id: String(post.id ?? post._id ?? ""),
    likes: Number(post.likes ?? post.likeCount ?? 0),
    comments: Number(post.comments ?? post.commentCount ?? 0),
    shares: Number(post.shares ?? post.shareCount ?? 0),
    saves: Number(post.saves ?? post.saveCount ?? post.bookmarkCount ?? 0),
    liked: Boolean(post.liked),
    bookmarked: Boolean(post.bookmarked),
  };
}

function goBack() {
  if (router.canGoBack()) {
    safeBack();
  } else {
    router.replace("/(tabs)/community");
  }
}

export default function PostDetailScreen() {
  const insets = useSafeAreaInsets();

  const { id } = useLocalSearchParams<{ id: string }>();
  const postId = String(Array.isArray(id) ? id[0] : id || "");

  const token = useAppSelector((state) => state.auth.token);

  // Already in the feed? Use it — it shows instantly and stays in sync
  // when you like/bookmark it (the feed's own state updates).
  const postFromFeed = useAppSelector((state) =>
    state.post.posts.find((item: any) => String(item.id) === postId),
  );

  const [fetchedPost, setFetchedPost] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !postId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await getPost(postId, token);
      const post = normalizePost(result);

      if (!post?.id) {
        throw new Error("This post could not be found.");
      }

      setFetchedPost(post);
    } catch (loadError) {
      setError(
        loadError instanceof Error && loadError.message
          ? loadError.message
          : "This post could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [token, postId]);

  useEffect(() => {
    if (!postFromFeed) {
      load();
    }
  }, [postFromFeed, load]);

  const post = useMemo(
    () => postFromFeed || fetchedPost,
    [postFromFeed, fetchedPost],
  );

  // ---------- content ----------

  let content;

  if (!token) {
    // Opened from a shared link without being logged in.
    content = (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={40} color="#C5399A" />

        <Text style={styles.centerTitle}>Log in to see this post</Text>

        <Text style={styles.centerText}>
          Join CosQuest to see posts from the community.
        </Text>

        <Pressable
          style={styles.button}
          onPress={() => router.push("/onboarding/signin")}>
          <Text style={styles.buttonText}>Log in</Text>
        </Pressable>
      </View>
    );
  } else if (post) {
    content = <PostCard post={post} token={token} />;
  } else if (loading) {
    content = (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#C5399A" />

        <Text style={styles.centerText}>Loading post...</Text>
      </View>
    );
  } else {
    content = (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={40} color="#8A8A93" />

        <Text style={styles.centerTitle}>Post not available</Text>

        <Text style={styles.centerText}>
          {error || "It may have been deleted."}
        </Text>

        <Pressable style={styles.button} onPress={load}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <AppBackground variant="blueGradient">
      <Stack.Screen options={{ headerShown: false }} />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={goBack} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color="#191922" />
        </Pressable>

        <Text style={styles.headerTitle}>Post</Text>

        <View style={styles.back} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.inner}>{content}</View>
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },

  back: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#191922",
  },

  scroll: {
    paddingHorizontal: 20,
    paddingTop: 6,
  },

  // Keeps the post a sensible width on big computer screens.
  inner: {
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },

  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    paddingHorizontal: 24,
  },

  centerTitle: {
    marginTop: 12,
    fontSize: 17,
    fontWeight: "700",
    color: "#191922",
    textAlign: "center",
  },

  centerText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: "#6B6B72",
    textAlign: "center",
  },

  button: {
    marginTop: 18,
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 20,
    backgroundColor: "#C5399A",
  },

  buttonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
});
