import { AppBackground } from "@/components/AppBackground";
import { AVATARS } from "@/constants/avatars";
import { FACTIONS } from "@/constants/factions";
import { FONTS } from "@/constants/fonts";
import type { FactionMemberPreview } from "@/services/faction";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import type { Post } from "@/store/slices/postSlice";
import { fetchFactionMembers } from "@/store/thunks/factionThunks";
import { fetchFollowers, fetchFollowing } from "@/store/thunks/followThunks";
import { fetchPosts } from "@/store/thunks/postThunks";
import { fetchCurrentUser } from "@/store/thunks/userThunks";

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";

import { useEffect, useMemo, useState } from "react";

import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

type Tab = "Posts" | "Reels" | "Thoughts";

// Figma colours
const PINK = "#C34D9C";
const PURPLE = "#7E2167";

// How many faction member avatars to show before the "+N" pill.
const FACTION_MEMBER_PREVIEW_LIMIT = 4;

// There's no rank / faction-XP field on the backend yet, so these stay
// placeholder values until a real endpoint exists.
const FACTION_RANK_PREVIEW = {
  rank: "Lieutenant",
  xp: 7840,
  nextRankXp: 10000,
};

// 12400 -> "12.4k", 1200000 -> "1.2m"
function compactNumber(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}m`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(value >= 10_000 ? 1 : 1).replace(/\.0$/, "")}k`;
  }

  return String(value);
}

// "cosplay-creator" -> "Cosplay creator"
function humanize(value?: string | null) {
  if (!value) {
    return "";
  }

  const text = String(value).replace(/[-_]+/g, " ").trim();

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Stat({
  value,
  label,
  onPress,
  align = "center",
}: {
  value: string | number;
  label: string;
  onPress?: () => void;
  align?: "flex-start" | "center" | "flex-end";
}) {
  const content = (
    <>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.stat,
          { alignItems: align },
          pressed && { opacity: 0.6 },
        ]}
        onPress={onPress}>
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.stat, { alignItems: align }]}>{content}</View>;
}

function GameStat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.gameStat}>
      <Text style={styles.gameStatValue}>{value}</Text>
      <Text style={styles.gameStatLabel}>{label}</Text>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}
      onPress={onPress}>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

// A real uploaded photo wins, then the preset avatar, then the default.
function getMemberAvatarSource(member: FactionMemberPreview) {
  if (member.avatarPhotoUrl) {
    return { uri: member.avatarPhotoUrl };
  }

  const preset = AVATARS.find((avatar) => avatar.id === member.avatarKey);

  return preset?.source || require("@/assets/images/dp-avatar.png");
}

// Figma: 371 x 136, radius 18, padding 12, border 1px #C34D9C33,
// background linear-gradient(90deg, rgba(255,255,255,0.16), rgba(255,240,250,0.2)).
function FactionProfileCard({
  faction,
  memberCount,
  memberCountLoading,
  previewMembers,
}: {
  faction: (typeof FACTIONS)[number];
  memberCount: number | undefined;
  memberCountLoading: boolean;
  previewMembers: FactionMemberPreview[];
}) {
  const progress =
    FACTION_RANK_PREVIEW.nextRankXp > 0
      ? Math.min(FACTION_RANK_PREVIEW.xp / FACTION_RANK_PREVIEW.nextRankXp, 1)
      : 0;

  const extraMembers = Math.max(0, (memberCount ?? 0) - previewMembers.length);

  const memberCountLabel = memberCountLoading
    ? "…"
    : `${compactNumber(memberCount ?? 0)} members`;

  return (
    <View style={styles.factionCard}>
      <LinearGradient
        colors={["rgba(255,255,255,0.16)", "rgba(255,240,250,0.2)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.factionTopRow}>
        {/* Shield on the pink -> purple gradient */}
        <LinearGradient
          colors={[PINK, PURPLE]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.factionShield}>
          <Ionicons name="shield-outline" size={20} color="#FFFFFF" />
        </LinearGradient>

        <View style={styles.factionIdentity}>
          <Image
            source={faction.label}
            style={styles.factionWordmark}
            contentFit="contain"
            contentPosition="left"
          />

          <Text style={styles.factionRank}>{FACTION_RANK_PREVIEW.rank}</Text>
        </View>

        <View style={styles.memberCountPill}>
          <Text style={styles.memberCountText}>{memberCountLabel}</Text>
        </View>
      </View>

      <View style={styles.membersRow}>
        <Text style={styles.factionSmallLabel}>Members</Text>

        <View style={styles.memberAvatars}>
          {previewMembers.map((member, index) => (
            <View
              key={member.id}
              style={[
                styles.memberAvatarWrap,
                { marginLeft: index === 0 ? 0 : 4 },
              ]}>
              <Image
                source={getMemberAvatarSource(member)}
                style={styles.memberAvatar}
                contentFit="cover"
              />
            </View>
          ))}

          {extraMembers > 0 ? (
            <Text style={styles.extraMembersText}>+{extraMembers}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.xpHeader}>
        <Text style={styles.factionSmallLabel}>User XP</Text>

        <Text style={styles.xpValue}>
          {FACTION_RANK_PREVIEW.xp.toLocaleString()} /{" "}
          {FACTION_RANK_PREVIEW.nextRankXp.toLocaleString()}
        </Text>
      </View>

      <View style={styles.xpTrack}>
        <LinearGradient
          colors={[PINK, PURPLE]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.xpProgress, { width: `${progress * 100}%` }]}
        />
      </View>
    </View>
  );
}

function ReelItem({ post }: { post: Post }) {
  const videoUrl = post.image;

  const player = useVideoPlayer(videoUrl || "", (player) => {
    player.loop = true;
  });

  if (!videoUrl) {
    return (
      <View style={styles.reelUnavailable}>
        <Ionicons name="videocam-outline" size={32} color="#9C9CAA" />
        <Text style={styles.reelUnavailableText}>Video unavailable</Text>
      </View>
    );
  }

  return (
    <View style={styles.reelItem}>
      <VideoView
        player={player}
        style={styles.reelVideo}
        contentFit="cover"
        nativeControls
      />

      {post.content?.trim() ? (
        <View style={styles.reelCaption}>
          <Text style={styles.reelCaptionText} numberOfLines={3}>
            {post.content}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function ThoughtItem({ post }: { post: Post }) {
  return (
    <View style={styles.thoughtCard}>
      <Text style={styles.thoughtText}>
        {post.content?.trim() || "No thought content."}
      </Text>

      {post.createdAt ? (
        <Text style={styles.thoughtTime}>{post.time || ""}</Text>
      ) : null}
    </View>
  );
}

export default function Profile() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const [tab, setTab] = useState<Tab>("Posts");

  const authUser = useAppSelector((state) => state.auth.user);

  const user = useAppSelector((state) => state.user.user);

  const userLoading = useAppSelector((state) => state.user.loading);

  const userError = useAppSelector((state) => state.user.error);

  const token = useAppSelector((state) => state.auth.token);

  const posts = useAppSelector((state) => state.post.posts);

  const postsLoading = useAppSelector((state) => state.post.loading);

  const postsError = useAppSelector((state) => state.post.error);

  const followersTotal = useAppSelector((state) => state.follow.followersTotal);

  const followingTotal = useAppSelector((state) => state.follow.followingTotal);

  const email = authUser?.email || user?.email || "";

  useEffect(() => {
    if (email) {
      dispatch(fetchCurrentUser(email));
    }
  }, [dispatch, email]);

  useEffect(() => {
    if (!token) {
      return;
    }

    dispatch(fetchPosts(token));
  }, [dispatch, token]);

  const firstName =
    user?.profile?.firstName ||
    user?.firstName ||
    authUser?.profile?.firstName ||
    "";

  const lastName =
    user?.profile?.lastName ||
    user?.lastName ||
    authUser?.profile?.lastName ||
    "";

  const displayName = useMemo(() => {
    const fullName = `${firstName} ${lastName}`.trim();

    return fullName || "Your Name";
  }, [firstName, lastName]);

  const username =
    user?.profile?.username ||
    user?.username ||
    authUser?.profile?.username ||
    "username";

  useEffect(() => {
    if (!username || username === "username" || !token) {
      return;
    }

    dispatch(fetchFollowers({ username, token }));
    dispatch(fetchFollowing({ username, token }));
  }, [dispatch, username, token]);

  const factionKey = user?.faction || authUser?.faction || "";

  const selectedFaction = FACTIONS.find((item) => item.id === factionKey);

  const factionMembersState = useAppSelector((state) =>
    factionKey ? state.faction.membersByFaction[factionKey] : undefined,
  );

  const factionMembersLoading = useAppSelector((state) =>
    factionKey ? !!state.faction.membersLoading[factionKey] : false,
  );

  useEffect(() => {
    if (!factionKey) {
      return;
    }

    dispatch(
      fetchFactionMembers({
        key: factionKey,
        limit: FACTION_MEMBER_PREVIEW_LIMIT,
      }),
    );
  }, [dispatch, factionKey]);

  // "@username • Category" under the name (Figma). The category shows only
  // if you chose one and allowed it on your profile (Edit Profile).
  const category =
    (user as any)?.profile?.showCategoryOnProfile === false
      ? ""
      : humanize(
          (user as any)?.profile?.category ||
            (authUser as any)?.profile?.category,
        );

  // Figma: "@alexrivera • Cosplay creator • Building in public" -
  // here: @username • your category • your faction's tagline (e.g.
  // "Sci-Fi Fans"). Set a category in Edit Profile for the middle part.
  const factionTagline =
    FACTIONS.find((item) => item.id === (user?.faction || authUser?.faction))
      ?.caption || "";

  void factionTagline;

  // Figma: "@username • Cosplay creator • Building in public". Your own
  // category (Edit Profile) replaces "Cosplay creator" once you set one.
  const subtitle = [
    `@${username}`,
    category || "Cosplay creator",
    "Building in public",
  ].join(" • ");

  const currentUserId = useMemo(() => {
    const possibleIds = [
      (user as any)?.id,
      (user as any)?._id,
      (authUser as any)?.id,
      (authUser as any)?._id,
      (user as any)?.userId,
      (authUser as any)?.userId,
    ];

    const found = possibleIds.find(
      (value) =>
        value !== undefined && value !== null && String(value).trim() !== "",
    );

    return found !== undefined ? String(found) : null;
  }, [user, authUser]);

  // Posts belonging to you (by id, or by username as a fallback).
  const myPosts = useMemo(() => {
    if (!posts.length) {
      return [];
    }

    return posts.filter((post) => {
      if (currentUserId && post.userId) {
        return String(post.userId) === currentUserId;
      }

      const postUsername = post.username || post.handle || "";

      const normalizedPostUsername = String(postUsername)
        .replace(/^@/, "")
        .toLowerCase();

      const normalizedCurrentUsername = String(username)
        .replace(/^@/, "")
        .toLowerCase();

      return (
        normalizedPostUsername !== "" &&
        normalizedCurrentUsername !== "" &&
        normalizedPostUsername === normalizedCurrentUsername
      );
    });
  }, [posts, currentUserId, username]);

  const imagePosts = useMemo(
    () =>
      myPosts.filter((post) => post.type === "image" && Boolean(post.image)),
    [myPosts],
  );

  const reelPosts = useMemo(
    () => myPosts.filter((post) => post.type === "reel" && Boolean(post.image)),
    [myPosts],
  );

  const thoughtPosts = useMemo(
    () =>
      myPosts.filter(
        (post) => post.type === "thought" && Boolean(post.content?.trim()),
      ),
    [myPosts],
  );

  const postCount = myPosts.length;

  const quests = 0;
  const wins = 0;
  const points = 0;

  async function handleShareProfile() {
    try {
      await Share.share({
        title: `${displayName} on CosQuest`,
        message: `Check out @${username} on CosQuest!`,
      });
    } catch (error) {
      console.log("SHARE PROFILE ERROR:", error);
    }
  }

  const cloudinaryPhoto =
    user?.profile?.avatarPhotoUrl ||
    authUser?.profile?.avatarPhotoUrl ||
    user?.photo ||
    null;

  const avatarKey =
    user?.profile?.avatarKey ||
    authUser?.profile?.avatarKey ||
    user?.avatar ||
    "";

  const avatarFromList = AVATARS.find((avatar) => avatar.id === avatarKey);

  const selectedAvatar =
    avatarFromList?.source || require("@/assets/images/dp-avatar.png");

  const about =
    user?.profile?.bio || (user as any)?.bio || authUser?.profile?.bio || "";

  const profileLoading = userLoading || postsLoading;

  const profileError = userError || postsError;

  return (
    <AppBackground variant="blueGradient">
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 8,
          },
        ]}
        showsVerticalScrollIndicator={false}>
        {/* HEADER (Figma: "+" left, pink menu right, no title) */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.push("/community")}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Create a post">
            <Ionicons name="add" size={28} color="#191922" />
          </Pressable>

          <Pressable
            onPress={() => router.push("/settings")}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Settings">
            <Ionicons name="menu" size={26} color={PINK} />
          </Pressable>
        </View>

        {profileLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color={PINK} />

            <Text style={styles.loadingText}>Loading profile...</Text>
          </View>
        ) : null}

        {profileError && !profileLoading ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{profileError}</Text>

            <Pressable
              onPress={() => {
                if (email) {
                  dispatch(fetchCurrentUser(email));
                }

                if (token) {
                  dispatch(fetchPosts(token));
                }
              }}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {/* PHOTO (Figma): a square photo, with a big pink CIRCLE fading in
            at the bottom, and the avatar sitting in that circle. */}
        <View style={styles.heroWrap}>
          <View style={styles.hero}>
            {cloudinaryPhoto ? (
              <Image
                source={{ uri: cloudinaryPhoto }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            ) : (
              <View style={styles.heroEmpty}>
                <Ionicons
                  name="person-outline"
                  size={56}
                  color="rgba(255,255,255,0.7)"
                />
              </View>
            )}

            <View style={styles.heroCircle} pointerEvents="none">
              {/* Figma: linear-gradient(180deg, rgba(0,0,0,0) 47.87%, #C34D9C 100%) */}
              <LinearGradient
                colors={["rgba(0,0,0,0)", PINK]}
                locations={[0.4787, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </View>
          </View>

          {/* Avatar (Figma: 89 x 89): a strong pink circle with a deep
              shadow, so it looks like it's coming out of the photo. It sits
              outside the photo's clipping, so the shadow isn't cut off. */}
          <View style={styles.avatarShadow} pointerEvents="none">
            <LinearGradient
              colors={["#E28BC8", PINK]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.avatarRing}>
              <Image
                source={selectedAvatar}
                style={styles.avatarImg}
                contentFit="cover"
              />
            </LinearGradient>
          </View>
        </View>

        {/* NAME + "@username • Category" */}
        <Text style={styles.name}>{displayName}</Text>

        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>

        {/* Followers (left) · Following (middle) · Posts (right) */}
        <View style={styles.statsRow}>
          <Stat
            value={compactNumber(followersTotal || 0)}
            label="Followers"
            align="flex-start"
            onPress={() => router.push("/followers")}
          />

          <Stat
            value={compactNumber(followingTotal || 0)}
            label="Following"
            onPress={() => router.push("/following")}
          />

          <Stat
            value={compactNumber(postCount)}
            label="Posts"
            align="flex-end"
          />
        </View>

        {/* Slim pink pills */}
        <View style={styles.gameStatsRow}>
          <GameStat value={quests} label="Quest" />
          <GameStat value={wins} label="Wins" />
          <GameStat value={points} label="Points" />
        </View>

        {/* ABOUT */}
        {about.trim() ? (
          <>
            <Text style={styles.sectionLabel}>About</Text>

            <Text style={styles.about}>{about}</Text>
          </>
        ) : null}

        {/* FACTION */}
        {selectedFaction ? (
          <View style={styles.factionSection}>
            <Text style={styles.sectionLabel}>Faction</Text>

            <FactionProfileCard
              faction={selectedFaction}
              memberCount={factionMembersState?.pagination.total}
              memberCountLoading={factionMembersLoading && !factionMembersState}
              previewMembers={factionMembersState?.users || []}
            />
          </View>
        ) : null}

        {/* NEW / FACTION highlights */}
        <View style={styles.highlights}>
          <View style={styles.highlight}>
            <View style={styles.highlightNew}>
              <Ionicons name="add" size={24} color="#9899A4" />
            </View>

            <Text style={styles.highlightLabel}>New</Text>
          </View>

          {selectedFaction ? (
            <View style={styles.highlight}>
              <View style={styles.highlightRing}>
                <Image
                  source={selectedFaction.image}
                  style={styles.highlightImg}
                  contentFit="contain"
                />
              </View>

              <Text style={styles.highlightLabel}>Faction</Text>
            </View>
          ) : null}
        </View>

        {/* Slim Edit / Share pills */}
        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <ActionButton
              label="Edit Profile"
              onPress={() => router.push("/edit-profile")}
            />
          </View>

          <View style={{ flex: 1 }}>
            <ActionButton label="Share Profile" onPress={handleShareProfile} />
          </View>
        </View>

        {/* TABS (the open one is dark and bold) */}
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
                        : "person-outline"
                  }
                  size={18}
                  color={active ? "#191922" : "#9C9CAA"}
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
          imagePosts.length > 0 ? (
            <View style={styles.grid}>
              {imagePosts.map((post) => (
                <Pressable
                  key={post.id}
                  style={styles.postThumbWrap}
                  onPress={() => {
                    router.push({
                      pathname: "/post/[id]",
                      params: {
                        id: post.id,
                      },
                    });
                  }}>
                  <Image
                    source={{
                      uri: post.image!,
                    }}
                    style={styles.thumb}
                    contentFit="cover"
                  />
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.emptyContent}>
              <Ionicons name="images-outline" size={36} color="#9C9CAA" />

              <Text style={styles.emptyTitle}>No posts yet</Text>

              <Text style={styles.empty}>
                Your uploaded image posts will appear here.
              </Text>
            </View>
          )
        ) : null}

        {/* REELS */}
        {tab === "Reels" ? (
          reelPosts.length > 0 ? (
            <View style={styles.reelsList}>
              {reelPosts.map((post) => (
                <ReelItem key={post.id} post={post} />
              ))}
            </View>
          ) : (
            <View style={styles.emptyContent}>
              <Ionicons name="videocam-outline" size={36} color="#9C9CAA" />

              <Text style={styles.emptyTitle}>No reels yet</Text>

              <Text style={styles.empty}>
                Your uploaded videos will appear here.
              </Text>
            </View>
          )
        ) : null}

        {/* THOUGHTS */}
        {tab === "Thoughts" ? (
          thoughtPosts.length > 0 ? (
            <View style={styles.thoughtsList}>
              {thoughtPosts.map((post) => (
                <ThoughtItem key={post.id} post={post} />
              ))}
            </View>
          ) : (
            <View style={styles.emptyContent}>
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={36}
                color="#9C9CAA"
              />

              <Text style={styles.emptyTitle}>No thoughts yet</Text>

              <Text style={styles.empty}>
                Your text-only thoughts will appear here.
              </Text>
            </View>
          )
        ) : null}
      </ScrollView>
    </AppBackground>
  );
}

const GAP = 1;
const H_PAD = 16;

const SCREEN_W = Math.min(Dimensions.get("window").width, 640);

// Figma photo: a 316 x 316 square on a 402 wide screen.
const HERO_SIZE = Math.min(316, SCREEN_W - 2 * 30);
// The pink circle is a little wider than the photo, and sits at its bottom.
const HERO_CIRCLE = Math.round(HERO_SIZE * 1.06);
// Figma avatar: 89.21 x 89.21 on the 316 photo.
const AVATAR_SIZE = Math.round(HERO_SIZE * (89.21 / 316));

// The "milky", pressed-in glass look (same as the chat bubbles): see-through
// white with a bright white rim and a soft shadow.
const MILKY = {
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.85)",
  shadowColor: "#000000",
  shadowOpacity: 0.1,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: H_PAD,
    paddingBottom: 140,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 6,
    marginBottom: 12,
  },

  loading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 8,
  },

  loadingText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: "#79797E",
  },

  errorBox: {
    alignItems: "center",
    marginBottom: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,80,80,0.08)",
  },

  errorText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: "#B42318",
    textAlign: "center",
  },

  retryText: {
    marginTop: 5,
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: PINK,
  },

  // Straight top edge, round bottom.
  hero: {
    width: HERO_SIZE,
    height: HERO_SIZE,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: "rgba(178,204,239,0.72)",
  },

  heroEmpty: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },

  avatarRing: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    overflow: "hidden",
  },

  // Holds the photo + the avatar (not clipped, so the avatar's shadow shows).
  heroWrap: {
    alignSelf: "center",
    width: HERO_SIZE,
    height: HERO_SIZE,
  },

  // Deep shadow under the avatar circle: it "pops out" of the photo.
  avatarShadow: {
    position: "absolute",
    left: (HERO_SIZE - AVATAR_SIZE) / 2,
    bottom: 6,
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: PINK,

    shadowColor: "#4A0F3B",
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },

  // The big pink circle at the bottom of the photo.
  heroCircle: {
    position: "absolute",
    width: HERO_CIRCLE,
    height: HERO_CIRCLE,
    borderRadius: HERO_CIRCLE / 2,
    left: (HERO_SIZE - HERO_CIRCLE) / 2,
    bottom: -4,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "flex-end",
  },

  // Pink behind the avatar (Figma).
  avatarFill: {
    flex: 1,
    borderRadius: 29,
    overflow: "hidden",
    backgroundColor: "#E7A3D2",
  },

  avatarImg: {
    width: "100%",
    height: "100%",
  },

  name: {
    marginTop: 14,
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: "#191922",
    textAlign: "center",
  },

  subtitle: {
    marginTop: 2,
    fontFamily: FONTS.regular,
    fontSize: 10.5,
    color: "#8A8A93",
    textAlign: "center",
  },

  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
    paddingHorizontal: 8,
  },

  stat: {
    minWidth: 70,
  },

  statValue: {
    fontFamily: FONTS.semibold,
    fontSize: 15,
    color: "#191922",
  },

  statLabel: {
    fontFamily: FONTS.regular,
    fontSize: 10,
    color: "#79797E",
  },

  // Slim pink pills.
  gameStatsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },

  gameStat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(195,77,156,0.2)",
    ...MILKY,
  },

  gameStatValue: {
    fontFamily: FONTS.semibold,
    fontSize: 13,
    lineHeight: 17,
    color: "#191922",
  },

  gameStatLabel: {
    fontFamily: FONTS.regular,
    fontSize: 8,
    lineHeight: 11,
    color: "#8A7F88",
  },

  sectionLabel: {
    marginTop: 18,
    fontFamily: FONTS.semibold,
    fontSize: 11,
    color: "#191922",
  },

  about: {
    marginTop: 2,
    fontFamily: FONTS.regular,
    fontSize: 11,
    lineHeight: 16,
    color: "#4C4C56",
  },

  factionSection: {
    marginTop: 12,
  },

  factionCard: {
    marginTop: 8,
    width: "100%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#C34D9C33",
    padding: 12,
    gap: 10,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.35)",

    shadowColor: "#7E9CB0",
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },

  factionTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  factionShield: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  factionIdentity: {
    flex: 1,
    marginLeft: 10,
  },

  factionWordmark: {
    width: 64,
    height: 16,
  },

  factionRank: {
    marginTop: 1,
    fontFamily: FONTS.medium,
    fontSize: 10,
    color: PINK,
  },

  memberCountPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: "rgba(195,77,156,0.12)",
  },

  memberCountText: {
    fontFamily: FONTS.medium,
    fontSize: 9.5,
    color: PINK,
  },

  membersRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  factionSmallLabel: {
    fontFamily: FONTS.regular,
    fontSize: 9.5,
    color: "#6F7480",
  },

  memberAvatars: {
    flexDirection: "row",
    alignItems: "center",
  },

  memberAvatarWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    overflow: "hidden",
    backgroundColor: "#D8D8E0",
  },

  memberAvatar: {
    width: "100%",
    height: "100%",
  },

  extraMembersText: {
    marginLeft: 6,
    fontFamily: FONTS.medium,
    fontSize: 9,
    color: PINK,
  },

  xpHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  xpValue: {
    fontFamily: FONTS.medium,
    fontSize: 9.5,
    color: PINK,
  },

  // Thin bar.
  xpTrack: {
    width: "100%",
    height: 5,
    marginTop: -4,
    borderRadius: 3,
    backgroundColor: "rgba(195,77,156,0.15)",
    overflow: "hidden",
  },

  xpProgress: {
    height: "100%",
    borderRadius: 3,
  },

  highlights: {
    flexDirection: "row",
    gap: 18,
    marginTop: 16,
  },

  highlight: {
    alignItems: "center",
    gap: 4,
  },

  highlightNew: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
    ...MILKY,
  },

  // Dark circle with a soft glowing ring.
  highlightRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    padding: 3,
    borderWidth: 2,
    borderColor: "rgba(195,77,156,0.55)",
    backgroundColor: "#1E1B22",
    alignItems: "center",
    justifyContent: "center",

    shadowColor: PINK,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },

  highlightImg: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },

  highlightLabel: {
    fontFamily: FONTS.regular,
    fontSize: 10,
    color: "#7F8290",
  },

  // Slim pink pills.
  actions: {
    flexDirection: "row",
    gap: 14,
    marginTop: 16,
  },

  action: {
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "rgba(195,77,156,0.22)",
    ...MILKY,
  },

  actionLabel: {
    fontFamily: FONTS.regular,
    fontSize: 10.5,
    color: "#7A6F7D",
  },

  tabs: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.35)",
    ...MILKY,
  },

  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  tabText: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: "#9C9CAA",
  },

  tabTextActive: {
    fontFamily: FONTS.semibold,
    color: "#191922",
  },

  // Edge to edge, 3 columns.
  grid: {
    // Edge to edge, 3 per row. Each photo is a third of THIS width (not the
    // browser window's), so it's always 3 across - phone, website or desktop.
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 10,
    marginHorizontal: -H_PAD,
  },

  postThumbWrap: {
    width: "33.3333%",
    aspectRatio: 1,
    // Thin gaps between photos.
    padding: GAP / 2,
  },

  thumb: {
    width: "100%",
    height: "100%",
    backgroundColor: "#EEE",
  },

  emptyContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
    marginTop: 36,
  },

  emptyTitle: {
    marginTop: 10,
    fontFamily: FONTS.semibold,
    fontSize: 14,
    color: "#5F606B",
  },

  empty: {
    textAlign: "center",
    color: "#9C9CAA",
    marginTop: 4,
    fontFamily: FONTS.regular,
    fontSize: 11.5,
    lineHeight: 17,
  },

  reelsList: {
    marginTop: 10,
    gap: 12,
  },

  reelItem: {
    width: "100%",
    minHeight: 360,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#111118",
  },

  reelVideo: {
    width: "100%",
    height: 420,
  },

  reelCaption: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
  },

  reelCaptionText: {
    color: "#FFFFFF",
    fontFamily: FONTS.regular,
    fontSize: 12,
    lineHeight: 17,
  },

  reelUnavailable: {
    width: "100%",
    height: 220,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.45)",
  },

  reelUnavailableText: {
    marginTop: 8,
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: "#9C9CAA",
  },

  thoughtsList: {
    marginTop: 10,
    gap: 10,
  },

  thoughtCard: {
    width: "100%",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.48)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
  },

  thoughtText: {
    fontFamily: FONTS.regular,
    fontSize: 13.5,
    lineHeight: 20,
    color: "#4C4C56",
  },

  thoughtTime: {
    marginTop: 8,
    fontFamily: FONTS.regular,
    fontSize: 10.5,
    color: "#9C9CAA",
  },
});
