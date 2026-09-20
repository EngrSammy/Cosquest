import { AppBackground } from "@/components/AppBackground";
import { AVATARS } from "@/constants/avatars";
import { FACTIONS } from "@/constants/factions";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchCurrentUser } from "@/store/thunks/userThunks";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
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

const INTEREST_LABELS: Record<string, string> = {
  anime: "Anime",
  comic: "Comics",
  movie: "Movies",
  game: "Games",
  toon: "Toons",
  scifi: "Sci-Fi",
  fantasy: "Fantasy",
  horror: "Horror",
  cosplay: "Cosplay",
  sports: "Sports",
  music: "Music",
  news: "News",
};

const FACTION_PROFILE_PREVIEW = {
  members: "2.3k members",
  rank: "Lieutenant",
  xp: 7840,
  nextRankXp: 10000,
  extraMembers: 9,
};

function Stat({
  value,
  label,
  onPress,
}: {
  value: string | number;
  label: string;
  onPress?: () => void;
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
        style={({ pressed }) => [styles.stat, pressed && { opacity: 0.6 }]}
        onPress={onPress}>
        {content}
      </Pressable>
    );
  }

  return <View style={styles.stat}>{content}</View>;
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

function FactionProfileCard({
  faction,
}: {
  faction: (typeof FACTIONS)[number];
}) {
  const progress =
    FACTION_PROFILE_PREVIEW.nextRankXp > 0
      ? Math.min(
          FACTION_PROFILE_PREVIEW.xp / FACTION_PROFILE_PREVIEW.nextRankXp,
          1,
        )
      : 0;

  const memberPreviewAvatars = AVATARS.slice(0, 4);

  return (
    <View style={styles.factionCard}>
      <LinearGradient
        colors={[
          "rgba(235,247,253,0.72)",
          "rgba(245,250,253,0.52)",
          "rgba(255,255,255,0.34)",
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.factionTopRow}>
        <View style={styles.factionShield}>
          <Ionicons name="shield-outline" size={31} color="#FFFFFF" />
        </View>

        <View style={styles.factionIdentity}>
          <Image
            source={faction.label}
            style={styles.factionWordmark}
            contentFit="contain"
          />

          <Text style={styles.factionRank}>{FACTION_PROFILE_PREVIEW.rank}</Text>
        </View>

        <View style={styles.memberCountPill}>
          <Text style={styles.memberCountText}>
            {FACTION_PROFILE_PREVIEW.members}
          </Text>
        </View>
      </View>

      <View style={styles.membersRow}>
        <Text style={styles.membersLabel}>Members</Text>

        <View style={styles.memberAvatars}>
          {memberPreviewAvatars.map((avatar, index) => (
            <View
              key={avatar.id}
              style={[
                styles.memberAvatarWrap,
                {
                  marginLeft: index === 0 ? 0 : -7,
                },
              ]}>
              <Image
                source={avatar.source}
                style={styles.memberAvatar}
                contentFit="cover"
              />
            </View>
          ))}

          <View
            style={[
              styles.extraMembers,
              {
                marginLeft: -3,
              },
            ]}>
            <Text style={styles.extraMembersText}>
              +{FACTION_PROFILE_PREVIEW.extraMembers}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.xpHeader}>
        <Text style={styles.xpLabel}>User XP</Text>

        <View style={styles.xpRight}>
          <Text style={styles.xpValue}>
            {FACTION_PROFILE_PREVIEW.xp.toLocaleString()} /{" "}
            {FACTION_PROFILE_PREVIEW.nextRankXp.toLocaleString()}
          </Text>
        </View>
      </View>

      <View style={styles.xpBarWrap}>
        <View style={styles.xpTrack}>
          <LinearGradient
            colors={["#E4B8DA", "#D887C2", "#C5399A"]}
            locations={[0, 0.45, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.xpProgress,
              {
                width: `${progress * 100}%`,
              },
            ]}
          />
        </View>

        <View
          style={[
            styles.xpMarker,
            {
              left: `${progress * 100}%`,
            },
          ]}>
          <View style={styles.xpMarkerInner}>
            <Ionicons name="diamond" size={8} color="#FFFFFF" />
          </View>
        </View>
      </View>
    </View>
  );
}

const POST_IMAGES = [
  require("@/assets/images/interests/anime.png"),
  require("@/assets/images/interests/games.png"),
  require("@/assets/images/interests/movies.png"),
  require("@/assets/images/interests/fantasy.png"),
  require("@/assets/images/interests/horror.png"),
  require("@/assets/images/interests/cosplay.png"),
];

export default function Profile() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const [tab, setTab] = useState<Tab>("Posts");

  const authUser = useAppSelector((state) => state.auth.user);

  const user = useAppSelector((state) => state.user.user);

  const loading = useAppSelector((state) => state.user.loading);

  const error = useAppSelector((state) => state.user.error);

  const email = authUser?.email || user?.email || "";

  useEffect(() => {
    if (email) {
      dispatch(fetchCurrentUser(email));
    }
  }, [dispatch, email]);

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

  const factionKey = user?.faction || authUser?.faction || "";

  const selectedFaction = FACTIONS.find((item) => item.id === factionKey);

  const interests =
    user?.interests && user.interests.length > 0
      ? user.interests
      : authUser?.interests || [];

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

  const followers = 0;
  const following = 0;
  const posts = 0;

  const quests = 0;
  const wins = 0;
  const points = 0;

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
        <View style={styles.header}>
          <Ionicons name="person-outline" size={24} color="#191922" />

          <Text style={styles.headerTitle}>Profile</Text>

          <Pressable onPress={() => router.push("/settings")} hitSlop={10}>
            <Ionicons name="menu" size={26} color="#C5399A" />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color="#C5399A" />

            <Text style={styles.loadingText}>Loading profile...</Text>
          </View>
        ) : null}

        {error && !loading ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>

            {email ? (
              <Pressable onPress={() => dispatch(fetchCurrentUser(email))}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={styles.avatarWrap}>
          <View style={styles.bannerContainer}>
            {cloudinaryPhoto ? (
              <Image
                source={{
                  uri: cloudinaryPhoto,
                }}
                style={styles.banner}
                contentFit="cover"
              />
            ) : (
              <View style={styles.emptyBanner}>
                <Ionicons
                  name="person-outline"
                  size={52}
                  color="rgba(255,255,255,0.55)"
                />
              </View>
            )}

            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.74)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.tint}
            />
          </View>

          <View style={styles.profile}>
            <Image
              source={selectedAvatar}
              style={styles.profileImg}
              contentFit="cover"
            />
          </View>
        </View>

        <Text style={styles.name}>{displayName}</Text>

        <Text style={styles.username}>@{username}</Text>

        <View style={styles.statsRow}>
          <Stat
            value={followers}
            label="Followers"
            onPress={() => router.push("/followers")}
          />

          <Stat
            value={following}
            label="Following"
            onPress={() => router.push("/following")}
          />

          <Stat value={posts} label="Posts" />
        </View>

        <View style={styles.gameStatsWrap}>
          <View style={styles.gameStats}>
            <Stat value={quests} label="Quests" />
          </View>

          <View style={styles.gameStats}>
            <Stat value={wins} label="Wins" />
          </View>

          <View style={styles.gameStats}>
            <Stat value={points} label="Points" />
          </View>
        </View>

        {interests.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Interests</Text>

            <View style={styles.interests}>
              {interests.map((interest) => (
                <View key={interest} style={styles.interestChip}>
                  <Text style={styles.interestText}>
                    {INTEREST_LABELS[interest] || interest}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {about.trim() ? (
          <>
            <Text style={styles.sectionLabel}>About</Text>

            <Text style={styles.about}>{about}</Text>
          </>
        ) : null}

        {selectedFaction ? (
          <View style={styles.factionSection}>
            <Text style={styles.sectionLabel}>Faction</Text>

            <FactionProfileCard faction={selectedFaction} />
          </View>
        ) : null}

        <View style={styles.highlights}>
          <View style={styles.highlight}>
            <View style={styles.highlightNew}>
              <Ionicons name="add" size={28} color="#9899A4" />
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

        {tab === "Posts" ? (
          <View style={styles.grid}>
            {POST_IMAGES.map((src, index) => (
              <Image
                key={index}
                source={src}
                style={styles.thumb}
                contentFit="cover"
              />
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>Nothing here yet.</Text>
        )}
      </ScrollView>
    </AppBackground>
  );
}

const GAP = 1;
const H_PAD = 20;

const COL = (Dimensions.get("window").width - GAP * 2) / 3;

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 140,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#191922",
  },

  loading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 8,
  },

  loadingText: {
    fontSize: 12,
    color: "#79797e",
  },

  errorBox: {
    alignItems: "center",
    marginBottom: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(255,80,80,0.08)",
  },

  errorText: {
    fontSize: 12,
    color: "#B42318",
    textAlign: "center",
  },

  retryText: {
    marginTop: 5,
    fontSize: 13,
    fontWeight: "700",
    color: "#C5399A",
  },

  avatarWrap: {
    alignSelf: "center",
    marginTop: 20,
    marginBottom: 10,
    width: 150,
  },

  bannerContainer: {
    overflow: "hidden",
    width: 300,
    height: 300,
    borderRadius: 150,
    left: -80,
    backgroundColor: "rgba(178,204,239,0.72)",
  },

  banner: {
    width: 300,
    height: 300,
    borderRadius: 150,
  },

  emptyBanner: {
    width: 300,
    height: 300,
    borderRadius: 150,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(178,204,239,0.72)",
  },

  tint: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "50%",
    width: 300,
  },

  profile: {
    position: "absolute",
    bottom: -20,
    left: 45,
    width: 65,
    height: 65,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    overflow: "hidden",
    backgroundColor: "#C5399A",

    shadowColor: "#191922",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 6,
    },

    elevation: 4,
  },

  profileImg: {
    width: "100%",
    height: "100%",
  },

  name: {
    fontSize: 22,
    fontWeight: "800",
    color: "#191922",
    textAlign: "center",
    marginTop: 20,
  },

  username: {
    fontSize: 12.5,
    color: "#86868b",
    textAlign: "center",
    marginTop: 2,
  },

  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 20,
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
    fontSize: 13,
    color: "#79797e",
    marginTop: 2,
  },

  gameStatsWrap: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginTop: 20,
  },

  gameStats: {
    paddingVertical: 5,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: "rgba(193,76,154,0.23)",

    shadowColor: "#7E6E7A",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 4,
    },

    elevation: 4,
  },

  sectionLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: "#191922",
    marginTop: 20,
  },

  interests: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },

  interestChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "rgba(193,76,154,0.12)",
  },

  interestText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#C5399A",
  },

  about: {
    fontSize: 13.5,
    color: "#4c4c56",
    marginTop: 6,
    lineHeight: 20,
  },

  factionSection: {
    marginTop: 4,
  },

  factionCard: {
    position: "relative",
    marginTop: 10,
    width: "100%",
    minHeight: 190,
    borderRadius: 22,

    borderWidth: 1.2,
    borderColor: "rgba(239,198,222,0.95)",

    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 17,

    overflow: "hidden",

    shadowColor: "#7E9CB0",
    shadowOpacity: 0.2,
    shadowRadius: 11,
    shadowOffset: {
      width: 0,
      height: 6,
    },

    elevation: 5,
  },

  factionTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  factionShield: {
    width: 63,
    height: 63,
    borderRadius: 17,

    backgroundColor: "rgba(197,57,154,0.68)",

    alignItems: "center",
    justifyContent: "center",

    shadowColor: "#C5399A",
    shadowOpacity: 0.18,
    shadowRadius: 7,
    shadowOffset: {
      width: 0,
      height: 3,
    },

    elevation: 3,
  },

  factionIdentity: {
    flex: 1,
    marginLeft: 14,
    justifyContent: "center",
  },

  factionWordmark: {
    width: 110,
    height: 28,
  },

  factionRank: {
    fontSize: 16,
    fontWeight: "500",
    marginTop: 0,
    color: "#C5399A",
  },

  memberCountPill: {
    backgroundColor: "rgba(230,224,247,0.78)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginLeft: 8,
  },

  memberCountText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#C5399A",
  },

  membersRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 17,
  },

  membersLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#6F7480",
  },

  memberAvatars: {
    flexDirection: "row",
    alignItems: "center",
  },

  memberAvatarWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    backgroundColor: "#D8D8E0",
    overflow: "hidden",
  },

  memberAvatar: {
    width: "100%",
    height: "100%",
  },

  extraMembers: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(230,224,247,0.86)",
    alignItems: "center",
    justifyContent: "center",
  },

  extraMembersText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#C5399A",
  },

  xpHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 13,
  },

  xpLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#6F7480",
  },

  xpRight: {
    flexDirection: "row",
    alignItems: "center",
  },

  xpValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#C5399A",
  },

  xpBarWrap: {
    position: "relative",
    width: "100%",
    marginTop: 9,
    paddingTop: 0,
  },

  xpTrack: {
    width: "100%",
    height: 12,
    borderRadius: 8,
    backgroundColor: "#D8E5EC",
    overflow: "hidden",
  },

  xpProgress: {
    height: "100%",
    borderRadius: 8,
  },

  xpMarker: {
    position: "absolute",
    top: -6,
    marginLeft: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(197,57,154,0.18)",
    alignItems: "center",
    justifyContent: "center",

    shadowColor: "#C5399A",
    shadowOpacity: 0.16,
    shadowRadius: 4,
    shadowOffset: {
      width: 0,
      height: 2,
    },

    elevation: 2,
  },

  xpMarkerInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#C5399A",
    alignItems: "center",
    justifyContent: "center",
  },

  highlights: {
    flexDirection: "row",
    gap: 22,
    marginTop: 24,
  },

  highlight: {
    alignItems: "center",
    gap: 6,
  },

  highlightNew: {
    width: 62,
    height: 62,
    borderRadius: 31,

    borderWidth: 1.2,
    borderColor: "#D9D9DE",
    borderStyle: "dashed",

    backgroundColor: "rgba(248,248,249,0.92)",

    alignItems: "center",
    justifyContent: "center",

    shadowColor: "#8F8F98",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 4,
    },

    elevation: 3,
  },

  highlightRing: {
    padding: 3,
    borderRadius: 37,

    borderWidth: 1.5,
    borderColor: "#C5399A",

    backgroundColor: "rgba(248,248,249,0.72)",

    shadowColor: "#C5399A",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 4,
    },

    elevation: 4,
  },

  highlightImg: {
    width: 62,
    height: 62,
    borderRadius: 31,
  },

  highlightLabel: {
    fontSize: 12.5,
    color: "#7F8290",
    fontWeight: "400",
  },

  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },

  action: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    borderRadius: 25,

    backgroundColor: "rgba(205,135,191,0.34)",

    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.65)",

    shadowColor: "#7E6E7A",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 5,
    },

    elevation: 4,
  },

  actionLabel: {
    fontSize: 13,
    fontWeight: "400",
    color: "#777985",
  },

  tabs: {
    flexDirection: "row",
    justifyContent: "space-around",

    marginTop: 16,

    backgroundColor: "rgba(255,255,255,0.18)",

    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.65)",

    borderRadius: 30,
    paddingVertical: 10,

    shadowColor: "#8194A4",
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 5,
    },

    elevation: 4,
  },

  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
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
    gap: GAP,
    marginTop: 8,
    marginHorizontal: -H_PAD,
  },

  thumb: {
    width: COL,
    height: COL,
    backgroundColor: "#EEE",
  },

  empty: {
    textAlign: "center",
    color: "#9C9CAA",
    marginTop: 40,
  },
});
