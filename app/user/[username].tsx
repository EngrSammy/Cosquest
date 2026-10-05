// ==========================================
// SOMEONE ELSE'S PROFILE  —  /user/<username>
// ==========================================
// Opened from a chat (tap their photo/name, or ⋮ → View profile).
// Photo, name, faction, bio, stats, Follow / Message, Block, and their
// posts (Posts · Reels · Thoughts). Private / blocked / missing profiles
// show a clear message - the backend answers all of those the same way.

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
      ActivityIndicator,
      Alert,
      Dimensions,
      Modal,
      Pressable,
      ScrollView,
      StyleSheet,
      Text,
      View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppBackground } from "@/components/AppBackground";
import { AVATARS } from "@/constants/avatars";
import { createDirectChat } from "@/services/chats";
import {
      blockUser,
      followUser,
      getBlockedUsernames,
      getPublicProfile,
      getUserPosts,
      unblockUser,
      unfollowUser,
      type ProfilePost,
      type PublicProfile,
} from "@/services/publicProfile";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchFollowing } from "@/store/thunks/followThunks";
import { getCloudinaryVideoPoster } from "@/utils/videoPoster";
import { safeBack } from "@/utils/safeBack";

type Tab = "Posts" | "Reels" | "Thoughts";

const GRID_GAP = 2;
const COLUMN =
  (Math.min(Dimensions.get("window").width, 640) - 40 - GRID_GAP * 2) / 3;

function capitalize(value?: string | null) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function avatarSource(profile: PublicProfile | null) {
  if (profile?.avatarPhotoUrl) {
    return { uri: profile.avatarPhotoUrl };
  }

  return (
    AVATARS.find((avatar) => avatar.id === profile?.avatarKey)?.source ||
    require("@/assets/images/dp-avatar.png")
  );
}

function Stat({ value, label }: { value?: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{(value ?? 0).toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function UserProfileScreen() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const params = useLocalSearchParams<{ username: string }>();
  const username = String(
    Array.isArray(params.username) ? params.username[0] : params.username || "",
  ).replace(/^@/, "");

  const token = useAppSelector((state) => state.auth.token);
  const authUser = useAppSelector((state) => state.auth.user);
  const me = useAppSelector((state) => state.user.user);
  const following = useAppSelector((state) => state.follow.following);

  const myUsername =
    authUser?.profile?.username || me?.profile?.username || me?.username || "";

  const isMe =
    !!myUsername && myUsername.toLowerCase() === username.toLowerCase();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [busy, setBusy] = useState<"follow" | "message" | "block" | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [tab, setTab] = useState<Tab>("Posts");

  // Whether I follow them: from the "people I follow" list.
  const [followingOverride, setFollowingOverride] = useState<boolean | null>(
    null,
  );

  const iFollow =
    followingOverride ??
    following.some(
      (person) => person.username?.toLowerCase() === username.toLowerCase(),
    );

  // Bump to load the profile again (e.g. after Unblock).
  const [reloadKey, setReloadKey] = useState(0);

  // Load the profile + posts. Every state update happens after an `await`
  // (React Compiler rule: no setState straight inside an effect).
  useEffect(() => {
    if (!username) {
      return;
    }

    let cancelled = false;

    (async () => {
      // Did I block them? (Then the backend hides their profile from me.)
      const blockedNames = await (token && !isMe
        ? getBlockedUsernames(token).catch(() => new Set<string>())
        : Promise.resolve(new Set<string>()));

      if (cancelled) {
        return;
      }

      const blocked = blockedNames.has(username.toLowerCase());

      setBlockedByMe(blocked);

      if (blocked) {
        setProfile(null);
        setPosts([]);
        setUnavailable(false);
        setLoading(false);
        return;
      }

      try {
        const [loadedProfile, loadedPosts] = await Promise.all([
          getPublicProfile(username, token),
          getUserPosts(username, token).catch(() => []),
        ]);

        if (cancelled) {
          return;
        }

        setProfile(loadedProfile);
        setPosts(loadedPosts);
        setUnavailable(false);
      } catch {
        if (!cancelled) {
          setProfile(null);
          setUnavailable(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [username, token, isMe, reloadKey]);

  // Keep my "following" list up to date for the Follow button.
  useEffect(() => {
    if (token && myUsername) {
      dispatch(fetchFollowing({ username: myUsername, token }));
    }
  }, [dispatch, token, myUsername]);

  const goBack = () => {
    if (router.canGoBack()) {
      safeBack();
    } else {
      router.replace("/home");
    }
  };

  // ---------- actions ----------

  const toggleFollow = async () => {
    if (!token || busy) {
      return;
    }

    const wasFollowing = iFollow;

    try {
      setBusy("follow");
      setFollowingOverride(!wasFollowing);

      if (wasFollowing) {
        await unfollowUser(username, token);
      } else {
        await followUser(username, token);
      }

      setProfile((current) =>
        current
          ? {
              ...current,
              stats: {
                ...current.stats,
                followers: Math.max(
                  0,
                  (current.stats?.followers ?? 0) + (wasFollowing ? -1 : 1),
                ),
              },
            }
          : current,
      );

      if (myUsername) {
        dispatch(fetchFollowing({ username: myUsername, token }));
      }
    } catch (error) {
      setFollowingOverride(wasFollowing);
      Alert.alert(
        "Follow",
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      setBusy(null);
    }
  };

  const openMessage = async () => {
    if (!token || busy) {
      return;
    }

    try {
      setBusy("message");
      const chat = await createDirectChat(username, token);

      if (!chat?.id) {
        throw new Error("Could not open the chat.");
      }

      router.push({ pathname: "/chat/[id]", params: { id: chat.id } });
    } catch (error) {
      Alert.alert(
        "Message",
        error instanceof Error ? error.message : "Could not open the chat.",
      );
    } finally {
      setBusy(null);
    }
  };

  const block = () => {
    setMenuVisible(false);

    Alert.alert(
      `Block @${username}?`,
      "They won't be able to message you, call you or see your profile. They won't be told you blocked them.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            if (!token) {
              return;
            }

            try {
              setBusy("block");
              await blockUser(username, token);
              setBlockedByMe(true);
              setProfile(null);
              setPosts([]);
            } catch (error) {
              Alert.alert(
                "Block",
                error instanceof Error ? error.message : "Could not block.",
              );
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  const unblock = async () => {
    setMenuVisible(false);

    if (!token) {
      return;
    }

    try {
      setBusy("block");
      await unblockUser(username, token);
      setBlockedByMe(false);
      setLoading(true);
      setReloadKey((key) => key + 1);
    } catch (error) {
      Alert.alert(
        "Unblock",
        error instanceof Error ? error.message : "Could not unblock.",
      );
    } finally {
      setBusy(null);
    }
  };

  // ---------- posts ----------

  const imagePosts = useMemo(
    () => posts.filter((post) => post.type === "image" && post.media?.[0]?.url),
    [posts],
  );
  const reelPosts = useMemo(
    () => posts.filter((post) => post.type === "reel" && post.media?.[0]?.url),
    [posts],
  );
  const thoughtPosts = useMemo(
    () =>
      posts.filter((post) => post.type === "thought" && post.content?.trim()),
    [posts],
  );

  const openPost = (postId: string) =>
    router.push({ pathname: "/post/[id]", params: { id: postId } });

  // ---------- render ----------

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={goBack} hitSlop={10} style={styles.headerButton}>
        <Ionicons name="chevron-back" size={26} color="#191922" />
      </Pressable>

      <Text style={styles.headerTitle} numberOfLines={1}>
        @{username}
      </Text>

      {!isMe ? (
        <Pressable
          onPress={() => setMenuVisible(true)}
          hitSlop={10}
          style={styles.headerButton}
          accessibilityLabel="More options">
          <Ionicons name="ellipsis-vertical" size={20} color="#191922" />
        </Pressable>
      ) : (
        <View style={styles.headerButton} />
      )}
    </View>
  );

  let content;

  if (loading) {
    content = (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#C5399A" />
      </View>
    );
  } else if (blockedByMe) {
    content = (
      <View style={styles.center}>
        <Ionicons name="ban-outline" size={42} color="#8A8A93" />
        <Text style={styles.centerTitle}>You blocked @{username}</Text>
        <Text style={styles.centerText}>
          Unblock them to see their profile and message each other again.
        </Text>
        <Pressable
          style={styles.primaryButton}
          onPress={unblock}
          disabled={!!busy}>
          <Text style={styles.primaryButtonText}>Unblock</Text>
        </Pressable>
      </View>
    );
  } else if (unavailable || !profile) {
    content = (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={42} color="#8A8A93" />
        <Text style={styles.centerTitle}>Profile not available</Text>
        <Text style={styles.centerText}>
          This profile is private, or it no longer exists.
        </Text>
      </View>
    );
  } else {
    content = (
      <>
        {/* IDENTITY */}
        <View style={styles.identity}>
          <View style={styles.avatarRing}>
            <Image
              source={avatarSource(profile)}
              style={styles.avatar}
              contentFit="cover"
              transition={150}
            />
          </View>

          <Text style={styles.name}>{profile.name || profile.username}</Text>

          <View style={styles.subRow}>
            <Text style={styles.username}>@{profile.username}</Text>

            {profile.faction ? (
              <View style={styles.factionChip}>
                <Text style={styles.factionText}>
                  {capitalize(profile.faction)}
                </Text>
              </View>
            ) : null}
          </View>

          {profile.bio?.trim() ? (
            <Text style={styles.bio}>{profile.bio}</Text>
          ) : null}
        </View>

        {/* STATS */}
        <View style={styles.statsRow}>
          <Stat value={profile.stats?.followers} label="Followers" />
          <Stat value={profile.stats?.following} label="Following" />
          <Stat value={profile.stats?.posts} label="Posts" />
        </View>

        <View style={styles.gameStats}>
          <Stat value={profile.stats?.quests} label="Quests" />
          <Stat value={profile.stats?.wins} label="Wins" />
          <Stat value={profile.stats?.points} label="Points" />
        </View>

        {/* ACTIONS */}
        {!isMe ? (
          <View style={styles.actions}>
            <Pressable
              style={[
                styles.actionButton,
                iFollow ? styles.actionGhost : styles.actionPrimary,
              ]}
              onPress={toggleFollow}
              disabled={!!busy}>
              {busy === "follow" ? (
                <ActivityIndicator
                  size="small"
                  color={iFollow ? "#C5399A" : "#FFFFFF"}
                />
              ) : (
                <Text
                  style={
                    iFollow ? styles.actionGhostText : styles.actionPrimaryText
                  }>
                  {iFollow ? "Following" : "Follow"}
                </Text>
              )}
            </Pressable>

            <Pressable
              style={[styles.actionButton, styles.actionGhost]}
              onPress={openMessage}
              disabled={!!busy}>
              {busy === "message" ? (
                <ActivityIndicator size="small" color="#C5399A" />
              ) : (
                <Text style={styles.actionGhostText}>Message</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {/* TABS */}
        <View style={styles.tabs}>
          {(["Posts", "Reels", "Thoughts"] as Tab[]).map((key) => {
            const active = tab === key;

            return (
              <Pressable
                key={key}
                style={styles.tab}
                onPress={() => setTab(key)}>
                <Ionicons
                  name={
                    key === "Posts"
                      ? "grid-outline"
                      : key === "Reels"
                        ? "play-circle-outline"
                        : "chatbubble-ellipses-outline"
                  }
                  size={18}
                  color={active ? "#C5399A" : "#9C9CAA"}
                />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {key}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* POSTS */}
        {tab === "Posts" ? (
          imagePosts.length ? (
            <View style={styles.grid}>
              {imagePosts.map((post) => (
                <Pressable
                  key={post.id}
                  style={styles.thumbWrap}
                  onPress={() => openPost(post.id)}>
                  <Image
                    source={{ uri: post.media![0].url }}
                    style={styles.thumb}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                  {(post.media?.length || 0) > 1 ? (
                    <Ionicons
                      name="copy-outline"
                      size={16}
                      color="#FFFFFF"
                      style={styles.thumbIcon}
                    />
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>No posts yet.</Text>
          )
        ) : null}

        {tab === "Reels" ? (
          reelPosts.length ? (
            <View style={styles.grid}>
              {reelPosts.map((post) => {
                const poster = getCloudinaryVideoPoster(
                  post.media![0].url,
                  360,
                );

                return (
                  <Pressable
                    key={post.id}
                    style={[styles.thumbWrap, styles.reelThumb]}
                    onPress={() => openPost(post.id)}>
                    {poster ? (
                      <Image
                        source={{ uri: poster }}
                        style={styles.thumb}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    ) : null}
                    <Ionicons
                      name="play"
                      size={22}
                      color="#FFFFFF"
                      style={styles.playIcon}
                    />
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={styles.empty}>No reels yet.</Text>
          )
        ) : null}

        {tab === "Thoughts" ? (
          thoughtPosts.length ? (
            <View style={styles.thoughts}>
              {thoughtPosts.map((post) => (
                <Pressable
                  key={post.id}
                  style={styles.thought}
                  onPress={() => openPost(post.id)}>
                  <Text style={styles.thoughtText}>{post.content}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>No thoughts yet.</Text>
          )
        ) : null}
      </>
    );
  }

  return (
    <AppBackground variant="blueGradient">
      <Stack.Screen options={{ headerShown: false }} />

      {header}

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 60 },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.column}>{content}</View>
      </ScrollView>

      {/* ⋮ MENU */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}>
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setMenuVisible(false)}>
          <View style={styles.menu}>
            {blockedByMe ? (
              <Pressable style={styles.menuItem} onPress={unblock}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={20}
                  color="#191922"
                />
                <Text style={styles.menuText}>Unblock @{username}</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.menuItem} onPress={block}>
                <Ionicons name="ban-outline" size={20} color="#D9364F" />
                <Text style={[styles.menuText, styles.menuDanger]}>
                  Block @{username}
                </Text>
              </Pressable>
            )}

            <Pressable
              style={[styles.menuItem, styles.menuCancel]}
              onPress={() => setMenuVisible(false)}>
              <Text style={styles.menuCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 8,
  },

  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "800",
    color: "#191922",
  },

  scroll: {
    paddingHorizontal: 20,
  },

  column: {
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },

  center: {
    alignItems: "center",
    paddingVertical: 80,
    paddingHorizontal: 24,
  },

  centerTitle: {
    marginTop: 12,
    fontSize: 17,
    fontWeight: "800",
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

  primaryButton: {
    marginTop: 18,
    paddingHorizontal: 26,
    paddingVertical: 11,
    borderRadius: 20,
    backgroundColor: "#C5399A",
  },

  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },

  identity: {
    alignItems: "center",
    marginTop: 10,
  },

  avatarRing: {
    padding: 3,
    borderRadius: 64,
    borderWidth: 2,
    borderColor: "#C5399A",
  },

  avatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: "#F1E4EE",
  },

  name: {
    marginTop: 12,
    fontSize: 22,
    fontWeight: "800",
    color: "#191922",
    textAlign: "center",
  },

  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 3,
  },

  username: {
    fontSize: 13,
    color: "#86868B",
  },

  factionChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: "#EEEDFE",
  },

  factionText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#3C3489",
  },

  bio: {
    marginTop: 10,
    fontSize: 13.5,
    lineHeight: 20,
    color: "#4C4C56",
    textAlign: "center",
  },

  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 20,
  },

  gameStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(193,76,154,0.12)",
  },

  stat: {
    alignItems: "center",
    minWidth: 70,
  },

  statValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#191922",
  },

  statLabel: {
    marginTop: 2,
    fontSize: 12.5,
    color: "#79797E",
  },

  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },

  actionButton: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },

  actionPrimary: {
    backgroundColor: "#C5399A",
  },

  actionPrimaryText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },

  actionGhost: {
    backgroundColor: "rgba(255,255,255,0.7)",
    borderWidth: 1,
    borderColor: "rgba(197,57,154,0.35)",
  },

  actionGhostText: {
    color: "#C5399A",
    fontWeight: "700",
    fontSize: 14,
  },

  tabs: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 22,
    marginBottom: 10,
    paddingVertical: 10,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.45)",
  },

  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#9C9CAA",
  },

  tabTextActive: {
    color: "#C5399A",
    fontWeight: "800",
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GRID_GAP,
  },

  thumbWrap: {
    width: COLUMN,
    height: COLUMN,
    backgroundColor: "#E9E9ED",
    overflow: "hidden",
  },

  reelThumb: {
    height: COLUMN * 1.4,
    backgroundColor: "#2C2C2A",
  },

  thumb: {
    width: "100%",
    height: "100%",
  },

  thumbIcon: {
    position: "absolute",
    top: 6,
    right: 6,
  },

  playIcon: {
    position: "absolute",
    top: "45%",
    alignSelf: "center",
  },

  thoughts: {
    gap: 10,
  },

  thought: {
    padding: 15,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.55)",
  },

  thoughtText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#4C4C56",
  },

  empty: {
    textAlign: "center",
    marginTop: 30,
    fontSize: 13,
    color: "#9C9CAA",
  },

  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-end",
  },

  menu: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingVertical: 8,
    paddingBottom: 26,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },

  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 22,
    paddingVertical: 16,
  },

  menuText: {
    fontSize: 15.5,
    fontWeight: "600",
    color: "#191922",
  },

  menuDanger: {
    color: "#D9364F",
  },

  menuCancel: {
    justifyContent: "center",
    borderTopWidth: 1,
    borderTopColor: "#EEEEF2",
  },

  menuCancelText: {
    fontSize: 15.5,
    fontWeight: "600",
    color: "#777780",
  },
});
