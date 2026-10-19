// ==========================================
// PROFILE · COMPUTER
// ==========================================
// A desktop profile laid out the way large social sites do it:
//   Cover banner, large avatar overlapping it, name + counts beside it,
//   compact buttons on the right (New post · Edit profile · Share),
//   an underlined tab bar (Posts · Reels · Thoughts), then
//   Intro / Stats / Faction cards on the left and the content on the right.
// Only the layout is new: every value and action comes from
// app/(tabs)/profile.tsx, so phones keep their own design.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { ActivityIndicator, ImageSourcePropType, Pressable, ScrollView, Text, View } from "react-native";

import { ScreenGradient } from "@/components/chat/ui";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";

const PINK = "#C34D9C";
const INK = "#1C1E21";
const MUTED = "#65676B";

type Tab = "Posts" | "Reels" | "Thoughts";
type GridPost = { id: string; image?: string | null };

function Button({
  label,
  icon,
  primary,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  primary?: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }: any) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonPlain,
        (pressed || hovered) && (primary ? styles.buttonPrimaryHover : styles.buttonPlainHover),
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <Ionicons name={icon} size={16} color={primary ? "#FFFFFF" : ink.text(INK)} />
      <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.card}>
      {title ? (
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>{title}</Text>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

function IntroRow({ icon, children }: { icon: keyof typeof Ionicons.glyphMap; children: ReactNode }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  return (
    <View style={styles.introRow}>
      <Ionicons name={icon} size={18} color={ink.text("#8A8D91")} />
      <Text style={styles.introText}>{children}</Text>
    </View>
  );
}

function Empty({ icon, title, text }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={30} color={ink.text("#8A8D91")} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

// Cover: CosQuest pink to the page's light blue (brand colours, no purple),
// with the map showing through, like the onboarding panel.
const COVER = ["#E23CAE", "#E658BA", "#78D4F4"] as const;
const COVER_STOPS = [0, 0.45, 1] as const;

export default function DesktopProfile({
  displayName,
  username,
  category,
  about,
  photoUri,
  avatar,
  followers,
  following,
  postCount,
  quests,
  wins,
  points,
  rankName,
  factionName,
  factionLogo,
  factionCard,
  tab,
  onTab,
  imagePosts,
  reels,
  thoughts,
  loading,
  error,
  onRetry,
  onNewPost,
  onEdit,
  onShare,
  onFollowers,
  onFollowing,
  onOpenPost,
}: {
  displayName: string;
  username: string;
  category?: string;
  about?: string;
  photoUri?: string | null;
  avatar: ImageSourcePropType;
  followers: number;
  following: number;
  postCount: number;
  quests: number;
  wins: number;
  points: number;
  rankName?: string | null;
  factionName?: string | null;
  factionLogo?: ImageSourcePropType | null;
  factionCard?: ReactNode;
  tab: Tab;
  onTab: (tab: Tab) => void;
  imagePosts: GridPost[];
  reels: ReactNode[];
  thoughts: ReactNode[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onNewPost: () => void;
  onEdit: () => void;
  onShare: () => void;
  onFollowers: () => void;
  onFollowing: () => void;
  onOpenPost: (id: string) => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const tabs: { key: Tab; count: number }[] = [
    { key: "Posts", count: imagePosts.length },
    { key: "Reels", count: reels.length },
    { key: "Thoughts", count: thoughts.length },
  ];

  return (
    <View style={styles.page}>
      <ScreenGradient />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ---------- HEADER (white band) ---------- */}
        <View style={styles.band}>
          <View style={styles.inner}>
            {/* Cover */}
            <LinearGradient
              colors={COVER}
              locations={COVER_STOPS}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.cover}>
              <Image source={require("@/assets/images/map-texture.png")} style={styles.coverMap} contentFit="cover" />
              {factionLogo ? (
                <Image source={factionLogo} style={styles.coverMark} contentFit="contain" />
              ) : null}
            </LinearGradient>

            {/* Avatar + name + buttons */}
            <View style={styles.identity}>
              <View style={styles.avatarRing}>
                <Image
                  source={photoUri ? { uri: photoUri } : avatar}
                  style={styles.avatar}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
                {/* Your character avatar, in a pink circle on the photo */}
                {photoUri ? (
                  <View style={styles.avatarBadge}>
                    <Image source={avatar} style={styles.avatarBadgeImage} contentFit="contain" />
                  </View>
                ) : null}
              </View>

              <View style={styles.nameBlock}>
                <Text style={styles.name} numberOfLines={1}>
                  {displayName}
                </Text>
                <View style={styles.countsRow}>
                  <Pressable onPress={onFollowers} hitSlop={4}>
                    <Text style={styles.count}>
                      <Text style={styles.countStrong}>{followers}</Text> followers
                    </Text>
                  </Pressable>
                  <Text style={styles.dot}>·</Text>
                  <Pressable onPress={onFollowing} hitSlop={4}>
                    <Text style={styles.count}>
                      <Text style={styles.countStrong}>{following}</Text> following
                    </Text>
                  </Pressable>
                  <Text style={styles.dot}>·</Text>
                  <Text style={styles.count}>
                    <Text style={styles.countStrong}>{postCount}</Text> posts
                  </Text>
                </View>
                <Text style={styles.handle} numberOfLines={1}>
                  @{username}
                  {category ? ` · ${category}` : ""}
                  {factionName ? ` · ${factionName}` : ""}
                  {rankName ? ` · ${rankName}` : ""}
                </Text>
                {about ? (
                  <Text style={styles.about} numberOfLines={3}>
                    {about}
                  </Text>
                ) : null}
                <View style={styles.quest}>
                  {[
                    { icon: "flag-outline" as const, value: quests, label: "Quests" },
                    { icon: "trophy-outline" as const, value: wins, label: "Wins" },
                    { icon: "star-outline" as const, value: points, label: "Points" },
                  ].map((item) => (
                    <View key={item.label} style={styles.questChip}>
                      <Ionicons name={item.icon} size={14} color={ink.text(PINK)} />
                      <Text style={styles.questValue}>{item.value}</Text>
                      <Text style={styles.questLabel}>{item.label}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.buttons}>
                <Button label="New post" icon="add" primary onPress={onNewPost} />
                <Button label="Edit profile" icon="create-outline" onPress={onEdit} />
                <Button label="Share" icon="share-social-outline" onPress={onShare} />
              </View>
            </View>

            {/* Tabs */}
            <View style={styles.tabs}>
              {tabs.map(({ key, count }) => {
                const active = tab === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => onTab(key)}
                    style={({ hovered }: any) => [styles.tab, hovered && !active && styles.tabHover]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}>
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>
                      {key}
                      {count ? <Text style={styles.tabCount}> {count}</Text> : null}
                    </Text>
                    {active ? <View style={styles.tabLine} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* ---------- BODY ---------- */}
        <View style={[styles.inner, styles.body]}>
          {/* Left (wide): the open tab */}
          <View style={styles.main}>
            {loading ? (
              <Card>
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={ink.text(PINK)} />
                  <Text style={styles.emptyText}>Loading profile…</Text>
                </View>
              </Card>
            ) : null}
            {error && !loading ? (
              <Card>
                <View style={styles.loadingRow}>
                  <Text style={styles.errorText}>{error}</Text>
                  {onRetry ? (
                    <Pressable onPress={onRetry}>
                      <Text style={styles.link}>Retry</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Card>
            ) : null}

            <Card title={tab}>
              {tab === "Posts" ? (
                imagePosts.length ? (
                  <View style={styles.grid}>
                    {imagePosts.map((post) => (
                      <Pressable
                        key={post.id}
                        style={({ hovered }: any) => [styles.tile, hovered && styles.tileHover]}
                        onPress={() => onOpenPost(post.id)}
                        accessibilityRole="button"
                        accessibilityLabel="Open post">
                        <Image source={{ uri: post.image! }} style={styles.tileImage} contentFit="cover" />
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Empty icon="images-outline" title="No posts yet" text="Photos you post will appear here." />
                )
              ) : null}

              {tab === "Reels" ? (
                reels.length ? (
                  <View style={styles.list}>{reels}</View>
                ) : (
                  <Empty icon="videocam-outline" title="No reels yet" text="Videos you post will appear here." />
                )
              ) : null}

              {tab === "Thoughts" ? (
                thoughts.length ? (
                  <View style={styles.list}>{thoughts}</View>
                ) : (
                  <Empty
                    icon="chatbubble-ellipses-outline"
                    title="No thoughts yet"
                    text="Text posts you share will appear here."
                  />
                )
              ) : null}
            </Card>
          </View>
          {/* Right: your faction */}
          {factionCard ? (
            <View style={styles.side}>
              <Card title="Faction">{factionCard}</Card>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    page: { flex: 1 },
    scroll: { paddingBottom: 48 },
    inner: { width: "100%", maxWidth: 1100, alignSelf: "center", paddingHorizontal: 24 },

    // Header band
    band: {
      backgroundColor: "#FFFFFF",
      shadowColor: "#000000",
      shadowOpacity: 0.06,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
    },
    cover: {
      height: 300,
      borderBottomLeftRadius: 12,
      borderBottomRightRadius: 12,
      overflow: "hidden",
      alignItems: "flex-end",
      justifyContent: "flex-end",
    },
    coverMap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.28 },
    coverMark: { width: 220, height: 120, marginRight: 28, marginBottom: 22, opacity: 0.35 },

    identity: {
      flexDirection: "row",
      // Top-aligned, so the photo always overlaps the cover the same way,
      // however long the About text is.
      alignItems: "flex-start",
      gap: 20,
      paddingHorizontal: 16,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: "#E4E6EB",
    },
    avatarRing: {
      width: 176,
      height: 176,
      borderRadius: 88,
      marginTop: -84,
      padding: 4,
      backgroundColor: "#FFFFFF",
    },
    avatar: { width: "100%", height: "100%", borderRadius: 84, backgroundColor: "#E9E1F5" },
    avatarBadge: {
      position: "absolute",
      right: -2,
      bottom: 4,
      width: 62,
      height: 62,
      borderRadius: 31,
      borderWidth: 3,
      borderColor: "#FFFFFF",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      backgroundColor: "#E7A6D6",
    },
    avatarBadgeImage: { width: 50, height: 50 },
    nameBlock: { flex: 1, minWidth: 0, paddingTop: 16, paddingBottom: 6 },
    name: { fontFamily: FONTS.bold, fontSize: 30, color: INK },
    countsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
    count: { fontFamily: FONTS.medium, fontSize: 14.5, color: MUTED },
    countStrong: { fontFamily: FONTS.semibold, color: INK },
    dot: { fontSize: 14, color: MUTED },
    handle: { marginTop: 3, fontFamily: FONTS.regular, fontSize: 14, color: MUTED },
    quest: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
    questChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      backgroundColor: "rgba(195,77,156,0.10)",
    },
    questValue: { fontFamily: FONTS.semibold, fontSize: 13, color: INK },
    questLabel: { fontFamily: FONTS.regular, fontSize: 12.5, color: MUTED },
    about: { marginTop: 8, maxWidth: 560, fontFamily: FONTS.regular, fontSize: 14.5, lineHeight: 21, color: INK },

    buttons: { flexDirection: "row", gap: 8, paddingTop: 22 },
    button: {
      height: 36,
      paddingHorizontal: 12,
      borderRadius: 6,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    buttonPrimary: { backgroundColor: PINK },
    buttonPrimaryHover: { backgroundColor: "#AE3F8B" },
    buttonPlain: { backgroundColor: "#E4E6EB" },
    buttonPlainHover: { backgroundColor: "#D8DADF" },
    buttonText: { fontFamily: FONTS.semibold, fontSize: 14, color: INK },
    buttonTextPrimary: { color: "#FFFFFF" },

    tabs: { flexDirection: "row", paddingHorizontal: 8 },
    tab: { height: 52, paddingHorizontal: 16, justifyContent: "center", borderRadius: 6, marginVertical: 4 },
    tabHover: { backgroundColor: "#F2F2F2" },
    tabText: { fontFamily: FONTS.semibold, fontSize: 15, color: MUTED },
    tabTextActive: { color: PINK },
    tabCount: { fontFamily: FONTS.regular, fontSize: 13 },
    tabLine: { position: "absolute", left: 0, right: 0, bottom: -4, height: 3, borderRadius: 2, backgroundColor: PINK },

    // Body
    body: { flexDirection: "row", alignItems: "flex-start", gap: 16, marginTop: 16 },
    side: { width: 360, gap: 16 },
    main: { flex: 1, minWidth: 0, gap: 16 },

    card: {
      padding: 16,
      borderRadius: 10,
      backgroundColor: "#FFFFFF",
      shadowColor: "#000000",
      shadowOpacity: 0.08,
      shadowRadius: 3,
      shadowOffset: { width: 0, height: 1 },
    },
    cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    cardTitle: { fontFamily: FONTS.bold, fontSize: 19, color: INK },

    bio: { fontFamily: FONTS.regular, fontSize: 14.5, lineHeight: 21, color: INK, textAlign: "center", marginBottom: 12 },
    introRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 },
    introText: { flex: 1, fontFamily: FONTS.regular, fontSize: 14.5, color: INK },
    introStrong: { fontFamily: FONTS.semibold },
    wideButton: {
      marginTop: 10,
      height: 36,
      borderRadius: 6,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#E4E6EB",
    },

    stats: { flexDirection: "row" },
    stat: { flex: 1, alignItems: "center", paddingVertical: 4 },
    statValue: { fontFamily: FONTS.bold, fontSize: 22, color: INK },
    statLabel: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 13, color: MUTED },

    grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -2 },
    tile: { width: "33.333%", aspectRatio: 1, padding: 2 },
    tileHover: { opacity: 0.88 },
    tileImage: { width: "100%", height: "100%", borderRadius: 8, backgroundColor: "#E4E6EB" },
    list: { gap: 12 },

    empty: { alignItems: "center", paddingVertical: 40, gap: 6 },
    emptyTitle: { fontFamily: FONTS.semibold, fontSize: 16, color: INK },
    emptyText: { fontFamily: FONTS.regular, fontSize: 13.5, color: MUTED },
    loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    errorText: { flex: 1, fontFamily: FONTS.regular, fontSize: 13.5, color: "#E24D4D" },
    link: { fontFamily: FONTS.semibold, fontSize: 13.5, color: PINK },
  },
  {
    band: { backgroundColor: "#242526" },
    about: { color: "#E4E6EB" },
    avatarBadge: { borderColor: "#242526" },
    questChip: { backgroundColor: "rgba(240,166,215,0.14)" },
    questValue: { color: "#E4E6EB" },
    questLabel: { color: "#B0B3B8" },
    identity: { borderBottomColor: "rgba(255,255,255,0.10)" },
    avatarRing: { backgroundColor: "#242526" },
    avatar: { backgroundColor: "#3A3B3C" },
    name: { color: "#E4E6EB" },
    count: { color: "#B0B3B8" },
    countStrong: { color: "#E4E6EB" },
    dot: { color: "#B0B3B8" },
    handle: { color: "#B0B3B8" },
    buttonPlain: { backgroundColor: "#3A3B3C" },
    buttonPlainHover: { backgroundColor: "#4E4F50" },
    buttonText: { color: "#E4E6EB" },
    tabHover: { backgroundColor: "#3A3B3C" },
    tabText: { color: "#B0B3B8" },
    tabTextActive: { color: "#F0A6D7" },
    tabLine: { backgroundColor: "#F0A6D7" },
    card: { backgroundColor: "#242526" },
    cardTitle: { color: "#E4E6EB" },
    bio: { color: "#E4E6EB" },
    introText: { color: "#E4E6EB" },
    wideButton: { backgroundColor: "#3A3B3C" },
    statValue: { color: "#E4E6EB" },
    statLabel: { color: "#B0B3B8" },
    tileImage: { backgroundColor: "#3A3B3C" },
    emptyTitle: { color: "#E4E6EB" },
    emptyText: { color: "#B0B3B8" },
    link: { color: "#F0A6D7" },
  },
);
