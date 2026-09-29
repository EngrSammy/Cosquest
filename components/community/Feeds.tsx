import { CreatePost } from "@/components/community/feed/CreatePost";
import { FeedEmptyState } from "@/components/community/feed/FeedEmptyState";
import { PostCard } from "@/components/community/feed/PostCard";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchPosts } from "@/store/thunks/postThunks";

export function Feeds() {
  const dispatch = useAppDispatch();

  const posts = useAppSelector((state) => state.post.posts);

  const loading = useAppSelector((state) => state.post.loading);

  const error = useAppSelector((state) => state.post.error);

  const token = useAppSelector((state) => state.auth.token);

  const [clock, setClock] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(Date.now());
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  void clock;

  const loadPosts = useCallback(() => {
    if (!token) {
      return;
    }

    dispatch(fetchPosts(token));
  }, [dispatch, token]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  if (!token) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.stateText}>
          Please sign in to view the community feed.
        </Text>
      </View>
    );
  }

  if (loading && posts.length === 0) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color="#C5399A" />

        <Text style={styles.stateText}>Loading community feed...</Text>
      </View>
    );
  }

  if (error && posts.length === 0) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.stateText}>{error}</Text>

        <Pressable style={styles.retryButton} onPress={loadPosts}>
          <Text style={styles.retryText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <CreatePost />

      {loading && posts.length > 0 ? (
        <View style={styles.refreshing}>
          <ActivityIndicator size="small" color="#C5399A" />
        </View>
      ) : null}

      {posts.length === 0 ? (
        <FeedEmptyState />
      ) : (
        <View>
          {posts.map((post) => (
            <PostCard key={post.id} post={post} token={token} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 50,
    paddingHorizontal: 20,
  },

  stateText: {
    marginTop: 12,
    fontSize: 14,
    color: "#6B6B72",
    textAlign: "center",
  },

  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#C5399A",
  },

  retryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },

  refreshing: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 5,
  },
});
