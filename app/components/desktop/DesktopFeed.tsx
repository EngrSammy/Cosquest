// ==========================================
// COMMUNITY · COMPUTER (three columns)
// ==========================================
//   Left (260):   your card (avatar, name, counts), the menu, your groups
//   Middle (560): stories (you + people you follow), the post box
//                 (What's on your mind? · Share Post · Image/Video · Reel ·
//                 Thought), then the posts
//   Right (320):  Messages (search, All · Groups · DMs, compact list),
//                 your faction, footer links
// Same store data, post cards and create-post window as the phone; only
// the layout is new. The app's own left rail and top bar stay.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { ScreenGradient } from "@/components/chat/ui";
import { CreatePost } from "@/components/community/feed/CreatePost";
import { PostCard } from "@/components/community/feed/PostCard";
import { Spotlight } from "@/components/community/Spotlight";
import { AVATARS } from "@/constants/avatars";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FACTIONS } from "@/constants/factions";
import { FONTS } from "@/constants/fonts";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchChats } from "@/store/thunks/chatThunks";
import { fetchFollowing } from "@/store/thunks/followThunks";
import { fetchPosts } from "@/store/thunks/postThunks";

const PINK = "#C34D9C";
const INK = "#1C1E21";
const MUTED = "#65676B";

type Tab = "Feed" | "Spotlight";
type ChatFilter = "All" | "Groups" | "DMs";

type Chat = {
  id: string;
  type: "community" | "faction" | "dm" | "group";
  title?: string;
  factionKey?: string;
  unreadCount?: number;
  updatedAt?: string;
  memberCount?: number;
  lastMessage?: { senderName?: string; preview?: string; createdAt?: string } | null;
  otherParticipant?: {
    username?: string;
    name?: string;
    avatarPhotoUrl?: string | null;
    avatarKey?: string | null;
    isOnline?: boolean;
  };
  group?: { kind?: "faction" | "open" | "private"; photoUrl?: string | null };
};

type Person = { id?: string; username?: string; name?: string; avatarPhotoUrl?: string | null; avatarKey?: string | null };

function personAvatar(person: { avatarPhotoUrl?: string | null; avatarKey?: string | null }) {
  if (person.avatarPhotoUrl) return { uri: person.avatarPhotoUrl };
  const preset = AVATARS.find((avatar) => avatar.id === person.avatarKey);
  return preset?.source || require("@/assets/images/dp-avatar.png");
}

function groupIcon(chat: Chat): keyof typeof Ionicons.glyphMap {
  if (chat.type === "community") return "globe-outline";
  if (chat.type === "faction" || chat.group?.kind === "faction") return "shield-outline";
  if (chat.group?.kind === "open") return "globe-outline";
  return "lock-closed-outline";
}

function chatName(chat: Chat) {
  if (chat.type === "dm") return chat.otherParticipant?.name || chat.otherParticipant?.username || "Someone";
  return chat.title || "Group";
}

function lastAt(chat: Chat) {
  const value = chat.lastMessage?.createdAt || chat.updatedAt;
  return value ? new Date(value).getTime() : 0;
}

function timeLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function openChat(id: string) {
  router.navigate({ pathname: "/chat/[id]", params: { id } });
}

// ---------- small building blocks ----------
function Card({ children, style }: { children: ReactNode; style?: any }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return <View style={[styles.card, style]}>{children}</View>;
}

function CardHead({ title, action }: { title: string; action?: ReactNode }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.cardHead}>
      <Text style={styles.cardTitle}>{title}</Text>
      {action}
    </View>
  );
}

function MenuItem({
  icon,
  label,
  active,
  badge,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  badge?: number;
  onPress: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: any) => [styles.menuItem, active ? styles.menuItemOn : hovered && styles.hover]}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <Ionicons name={icon} size={19} color={active ? "#FFFFFF" : ink.text(MUTED)} />
      <Text style={[styles.menuText, active && styles.menuTextOn]}>{label}</Text>
      {badge ? (
        <View style={[styles.badge, active && styles.badgeOn]}>
          <Text style={[styles.badgeText, active && styles.badgeTextOn]}>{badge > 99 ? "99+" : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function ChatRow({ chat }: { chat: Chat }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const name = chatName(chat);
  const unread = chat.unreadCount || 0;
  const photo = chat.type === "dm" ? personAvatar(chat.otherParticipant || {}) : chat.group?.photoUrl ? { uri: chat.group.photoUrl } : null;
  return (
    <Pressable
      onPress={() => openChat(chat.id)}
      style={({ hovered }: any) => [styles.chatRow, hovered && styles.hover]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}>
      <View>
        {photo ? (
          <Image source={photo as any} style={styles.chatAvatar} contentFit="cover" />
        ) : (
          <View style={[styles.chatAvatar, styles.chatIcon]}>
            <Ionicons name={groupIcon(chat)} size={16} color={ink.text(PINK)} />
          </View>
        )}
        {chat.type === "dm" && chat.otherParticipant?.isOnline ? <View style={styles.online} /> : null}
      </View>
      <Text style={[styles.chatName, unread > 0 && styles.chatNameUnread]} numberOfLines={1}>
        {name}
      </Text>
      {unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
        </View>
      ) : (
        <Text style={styles.chatTime}>{timeLabel(chat.lastMessage?.createdAt || chat.updatedAt)}</Text>
      )}
    </Pressable>
  );
}

export default function DesktopFeed() {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const dispatch = useAppDispatch();

  const token = useAppSelector((state) => state.auth.token);
  const authUser = useAppSelector((state) => state.auth.user) as any;
  const user = useAppSelector((state) => state.user.user) as any;
  const posts = useAppSelector((state) => state.post.posts);
  const loading = useAppSelector((state) => state.post.loading);
  const error = useAppSelector((state) => state.post.error);
  const conversations = useAppSelector((state) => state.chat.conversations) as Chat[];
  const following = useAppSelector((state) => state.follow.following) as Person[];
  const followersTotal = useAppSelector((state) => state.follow.followersTotal);
  const followingTotal = useAppSelector((state) => state.follow.followingTotal);

  const [tab, setTab] = useState<Tab>("Feed");
  const [chatFilter, setChatFilter] = useState<ChatFilter>("All");
  const [query, setQuery] = useState("");
  // The post box's "open" action, so "Your story" can open it too.
  const openComposer = useRef<(() => void) | null>(null);

  const profile = user?.profile || authUser?.profile || {};
  const username = profile.username || user?.username || authUser?.username || "";
  const fullName =
    `${profile.firstName || user?.firstName || ""} ${profile.lastName || user?.lastName || ""}`.trim() ||
    user?.name ||
    username;
  const firstName = fullName.split(" ")[0];
  const myAvatar = personAvatar({
    avatarPhotoUrl: profile.avatarPhotoUrl || user?.photo || null,
    avatarKey: profile.avatarKey || user?.avatar || null,
  });
  const factionKey = user?.faction || authUser?.faction || "";
  const faction = FACTIONS.find((item) => item.id === factionKey);

  useEffect(() => {
    if (token) dispatch(fetchPosts(token));
  }, [dispatch, token]);
  useEffect(() => {
    if (token) dispatch(fetchChats(token));
  }, [dispatch, token]);
  useEffect(() => {
    if (token && username) dispatch(fetchFollowing({ username, token }));
  }, [dispatch, token, username]);

  const myPostCount = useMemo(
    () => posts.filter((post: any) => String(post.username || post.handle || "").toLowerCase() === String(username).toLowerCase()).length,
    [posts, username],
  );

  const sortedChats = useMemo(() => [...(conversations || [])].sort((a, b) => lastAt(b) - lastAt(a)), [conversations]);
  const groups = sortedChats.filter((chat) => chat.type !== "dm");
  const unreadTotal = sortedChats.reduce((sum, chat) => sum + (chat.unreadCount || 0), 0);
  const messageList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortedChats
      .filter((chat) => (chatFilter === "Groups" ? chat.type !== "dm" : chatFilter === "DMs" ? chat.type === "dm" : true))
      .filter((chat) => !q || chatName(chat).toLowerCase().includes(q));
  }, [sortedChats, chatFilter, query]);
  const factionChat = sortedChats.find((chat) => chat.type === "faction");

  return (
    <View style={styles.page}>
      <ScreenGradient />
      <View style={styles.layout}>
        {/* ================= LEFT ================= */}
        <ScrollView style={styles.left} contentContainerStyle={styles.sideContent} showsVerticalScrollIndicator={false}>
          <Card>
            <Pressable style={styles.meRow} onPress={() => router.navigate("/profile")}>
              <Image source={myAvatar as any} style={styles.meAvatar} contentFit="cover" />
              <View style={styles.flex}>
                <Text style={styles.meName} numberOfLines={1}>
                  {fullName}
                </Text>
                <Text style={styles.meHandle} numberOfLines={1}>
                  @{username}
                </Text>
              </View>
            </Pressable>
            <View style={styles.meStats}>
              {[
                { value: followersTotal || 0, label: "Followers", onPress: () => router.push("/followers") },
                { value: followingTotal || 0, label: "Following", onPress: () => router.push("/following") },
                { value: myPostCount, label: "Posts", onPress: () => router.navigate("/profile") },
              ].map((item) => (
                <Pressable key={item.label} style={styles.meStat} onPress={item.onPress}>
                  <Text style={styles.meStatValue}>{item.value}</Text>
                  <Text style={styles.meStatLabel}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </Card>

          <Card style={styles.menuCard}>
            <MenuItem icon="home-outline" label="Feed" active={tab === "Feed"} onPress={() => setTab("Feed")} />
            <MenuItem icon="sparkles-outline" label="Spotlight" active={tab === "Spotlight"} onPress={() => setTab("Spotlight")} />
            <MenuItem icon="chatbubbles-outline" label="Chats" badge={unreadTotal} onPress={() => router.navigate("/chat" as any)} />
            <MenuItem icon="radio-outline" label="Live" onPress={() => router.navigate("/live")} />
            <MenuItem icon="compass-outline" label="Cosquest map" onPress={() => router.navigate("/home")} />
            <MenuItem icon="person-outline" label="Profile" onPress={() => router.navigate("/profile")} />
          </Card>

          <Card>
            <CardHead title="Your groups" />
            {groups.slice(0, 5).map((chat) => (
              <Pressable
                key={chat.id}
                onPress={() => openChat(chat.id)}
                style={({ hovered }: any) => [styles.groupRow, hovered && styles.hover]}>
                <View style={styles.groupIcon}>
                  <Ionicons name={groupIcon(chat)} size={15} color={ink.text(PINK)} />
                </View>
                <Text style={styles.groupName} numberOfLines={1}>
                  {chatName(chat)}
                </Text>
              </Pressable>
            ))}
            {!groups.length ? <Text style={styles.muted}>No groups yet.</Text> : null}
            <Pressable onPress={() => router.navigate("/chat" as any)} style={styles.viewAll}>
              <Text style={styles.link}>View all</Text>
            </Pressable>
          </Card>
        </ScrollView>

        {/* ================= MIDDLE ================= */}
        <ScrollView style={styles.center} contentContainerStyle={styles.centerContent} showsVerticalScrollIndicator={false}>
          {/* Stories */}
          <Card style={styles.storiesCard}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stories}>
              <Pressable style={styles.story} onPress={() => openComposer.current?.()}>
                <View style={styles.storyRingMine}>
                  <Image source={myAvatar as any} style={styles.storyAvatar} contentFit="cover" />
                  <View style={styles.storyPlus}>
                    <Ionicons name="add" size={14} color="#FFFFFF" />
                  </View>
                </View>
                <Text style={styles.storyName} numberOfLines={1}>
                  Your story
                </Text>
              </Pressable>
              {following.slice(0, 12).map((person) => (
                <Pressable
                  key={person.id || person.username}
                  style={styles.story}
                  onPress={() =>
                    person.username && router.push({ pathname: "/user/[username]", params: { username: person.username } })
                  }>
                  <View style={styles.storyRing}>
                    <Image source={personAvatar(person) as any} style={styles.storyAvatar} contentFit="cover" />
                  </View>
                  <Text style={styles.storyName} numberOfLines={1}>
                    {person.name || person.username}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Card>

          {tab === "Feed" ? (
            <>
              {/* Post box */}
              <CreatePost
                renderTrigger={({ open, photo, video, avatar }) => {
                  openComposer.current = open;
                  return (
                    <Card style={styles.composer}>
                      <View style={styles.composerTop}>
                        <Image source={avatar} style={styles.composerAvatar} contentFit="cover" />
                        <Pressable
                          onPress={open}
                          style={({ hovered }: any) => [styles.composerInput, hovered && styles.composerInputHover]}
                          accessibilityRole="button"
                          accessibilityLabel="Create a post">
                          <Text style={styles.composerPlaceholder} numberOfLines={1}>
                            What's on your mind{firstName ? `, ${firstName}` : ""}?
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={open}
                          style={({ hovered }: any) => [styles.shareButton, hovered && styles.shareButtonHover]}>
                          <Text style={styles.shareText}>Share Post</Text>
                        </Pressable>
                      </View>
                      <View style={styles.composerActions}>
                        {[
                          { label: "Image/Video", icon: "image-outline" as const, color: "#3A86FF", onPress: photo },
                          { label: "Reel", icon: "videocam-outline" as const, color: "#F3425F", onPress: video },
                          { label: "Thought", icon: "chatbubble-ellipses-outline" as const, color: PINK, onPress: open },
                          { label: "Hashtag", icon: "pricetag-outline" as const, color: "#2BB673", onPress: open },
                        ].map((action) => (
                          <Pressable
                            key={action.label}
                            onPress={action.onPress}
                            style={({ hovered }: any) => [styles.composerAction, hovered && styles.hover]}>
                            <Ionicons name={action.icon} size={17} color={action.color} />
                            <Text style={styles.composerActionText}>{action.label}</Text>
                          </Pressable>
                        ))}
                        <View style={styles.flex} />
                        <View style={styles.publicChip}>
                          <Ionicons name="earth-outline" size={14} color={ink.text(MUTED)} />
                          <Text style={styles.publicText}>Public</Text>
                        </View>
                      </View>
                    </Card>
                  );
                }}
              />

              {loading && posts.length === 0 ? (
                <Card style={styles.state}>
                  <ActivityIndicator color={ink.text(PINK)} />
                  <Text style={styles.muted}>Loading the feed…</Text>
                </Card>
              ) : error && posts.length === 0 ? (
                <Card style={styles.state}>
                  <Text style={styles.muted}>{error}</Text>
                  <Pressable onPress={() => token && dispatch(fetchPosts(token))}>
                    <Text style={styles.link}>Try again</Text>
                  </Pressable>
                </Card>
              ) : posts.length === 0 ? (
                <Card style={styles.state}>
                  <Ionicons name="images-outline" size={28} color={ink.text(MUTED)} />
                  <Text style={styles.muted}>No posts yet. Share the first one.</Text>
                </Card>
              ) : (
                posts.map((post: any) => (
                  <View key={post.id} style={styles.post}>
                    <PostCard post={post} token={token || ""} />
                  </View>
                ))
              )}
            </>
          ) : (
            <Spotlight />
          )}
        </ScrollView>

        {/* ================= RIGHT ================= */}
        <ScrollView style={styles.right} contentContainerStyle={styles.sideContent} showsVerticalScrollIndicator={false}>
          <Card>
            <CardHead
              title="Messages"
              action={
                <Pressable onPress={() => router.navigate("/chat" as any)} hitSlop={8} accessibilityLabel="Open chats">
                  <Ionicons name="create-outline" size={19} color={ink.text(MUTED)} />
                </Pressable>
              }
            />
            <View style={styles.search}>
              <Ionicons name="search" size={15} color={ink.text(MUTED)} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search"
                placeholderTextColor={ink.text("#8A8D91")}
                style={styles.searchInput}
              />
            </View>
            <View style={styles.chatTabs}>
              {(["All", "Groups", "DMs"] as ChatFilter[]).map((key) => {
                const active = chatFilter === key;
                return (
                  <Pressable key={key} onPress={() => setChatFilter(key)} style={styles.chatTab}>
                    <Text style={[styles.chatTabText, active && styles.chatTabTextOn]}>{key}</Text>
                    {active ? <View style={styles.chatTabLine} /> : null}
                  </Pressable>
                );
              })}
            </View>
            {messageList.slice(0, 9).map((chat) => (
              <ChatRow key={chat.id} chat={chat} />
            ))}
            {!messageList.length ? <Text style={styles.muted}>{query ? "No chats match." : "No chats yet."}</Text> : null}
            <Pressable onPress={() => router.navigate("/chat" as any)} style={styles.viewAll}>
              <Text style={styles.link}>View all</Text>
            </Pressable>
          </Card>

          {faction ? (
            <Card>
              <CardHead title="Your faction" />
              <View style={styles.factionRow}>
                <Image source={faction.image} style={styles.factionImage} contentFit="contain" />
                <View style={styles.flex}>
                  <Image source={faction.label} style={styles.factionLabel} contentFit="contain" contentPosition="left" />
                  {faction.caption ? <Text style={styles.muted}>{faction.caption}</Text> : null}
                </View>
              </View>
              {factionChat ? (
                <Pressable
                  onPress={() => openChat(factionChat.id)}
                  style={({ hovered }: any) => [styles.factionButton, hovered && styles.shareButtonHover]}>
                  <Ionicons name="chatbubbles-outline" size={16} color={ink.text(PINK)} />
                  <Text style={styles.shareText}>Open faction room</Text>
                </Pressable>
              ) : null}
            </Card>
          ) : null}

          <Text style={styles.footer}>Privacy · Terms · Help · CosQuest © {new Date().getFullYear()}</Text>
        </ScrollView>
      </View>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    flex: { flex: 1, minWidth: 0 },
    page: { flex: 1 },
    layout: { flex: 1, flexDirection: "row", justifyContent: "center", gap: 20, paddingHorizontal: 20, minHeight: 0 },
    hover: { backgroundColor: "rgba(0,0,0,0.045)" },
    link: { fontFamily: FONTS.medium, fontSize: 13, color: PINK },
    muted: { fontFamily: FONTS.regular, fontSize: 13, color: MUTED },

    left: { width: 260, flexGrow: 0 },
    center: { width: 560, flexGrow: 0, flexShrink: 1 },
    right: { width: 320, flexGrow: 0 },
    sideContent: { paddingTop: 16, paddingBottom: 32, gap: 14 },
    centerContent: { paddingTop: 16, paddingBottom: 48, gap: 14 },

    card: {
      padding: 14,
      borderRadius: 14,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "rgba(36,40,60,0.06)",
      shadowColor: "#1C1E21",
      shadowOpacity: 0.04,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    cardTitle: { fontFamily: FONTS.semibold, fontSize: 15, color: INK },
    viewAll: { marginTop: 8, paddingVertical: 4 },

    // Left: me
    meRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    meAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#E9E1F5" },
    meName: { fontFamily: FONTS.semibold, fontSize: 14.5, color: INK },
    meHandle: { fontFamily: FONTS.regular, fontSize: 12.5, color: MUTED },
    meStats: { flexDirection: "row", marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#EEF0F3" },
    meStat: { flex: 1, alignItems: "center" },
    meStatValue: { fontFamily: FONTS.semibold, fontSize: 15, color: INK },
    meStatLabel: { marginTop: 1, fontFamily: FONTS.regular, fontSize: 11.5, color: MUTED },

    // Left: menu
    menuCard: { padding: 8, gap: 2 },
    menuItem: { flexDirection: "row", alignItems: "center", gap: 12, height: 40, paddingHorizontal: 12, borderRadius: 10 },
    menuItemOn: { backgroundColor: PINK },
    menuText: { flex: 1, fontFamily: FONTS.medium, fontSize: 14, color: INK },
    menuTextOn: { color: "#FFFFFF" },

    // Left: groups
    groupRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7, paddingHorizontal: 6, borderRadius: 8 },
    groupIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#F7E3F0" },
    groupName: { flex: 1, fontFamily: FONTS.medium, fontSize: 13.5, color: INK },

    // Middle: stories
    storiesCard: { paddingHorizontal: 6, paddingVertical: 12 },
    stories: { gap: 12, paddingHorizontal: 8 },
    story: { width: 68, alignItems: "center" },
    storyRing: { width: 64, height: 64, borderRadius: 32, padding: 2.5, borderWidth: 2.5, borderColor: PINK },
    storyRingMine: { width: 64, height: 64, borderRadius: 32, padding: 2.5, borderWidth: 2.5, borderColor: "#D7DBE2" },
    storyAvatar: { width: "100%", height: "100%", borderRadius: 30, backgroundColor: "#E9E1F5" },
    storyPlus: {
      position: "absolute",
      right: -2,
      bottom: -2,
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: "#FFFFFF",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: PINK,
    },
    storyName: { marginTop: 6, maxWidth: 68, fontFamily: FONTS.regular, fontSize: 11.5, color: INK },

    // Middle: post box
    composer: { paddingBottom: 8 },
    composerTop: { flexDirection: "row", alignItems: "center", gap: 10 },
    composerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#E9E1F5" },
    composerInput: { flex: 1, height: 42, borderRadius: 21, justifyContent: "center", paddingHorizontal: 16, backgroundColor: "#F2F4F7" },
    composerInputHover: { backgroundColor: "#E9ECF0" },
    composerPlaceholder: { fontFamily: FONTS.regular, fontSize: 14, color: MUTED },
    shareButton: { height: 38, paddingHorizontal: 16, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#F7E3F0" },
    shareButtonHover: { backgroundColor: "#F0D2E6" },
    shareText: { fontFamily: FONTS.semibold, fontSize: 13.5, color: PINK },
    composerActions: { flexDirection: "row", alignItems: "center", marginTop: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#EEF0F3" },
    composerAction: { flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 10, borderRadius: 8 },
    composerActionText: { fontFamily: FONTS.medium, fontSize: 13, color: MUTED },
    publicChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8 },
    publicText: { fontFamily: FONTS.medium, fontSize: 12.5, color: MUTED },

    post: { width: "100%" },
    state: { alignItems: "center", gap: 10, padding: 28 },

    // Right: messages
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      height: 36,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: "#F2F4F7",
    },
    searchInput: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 13.5,
      color: INK,
      ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
    },
    chatTabs: { flexDirection: "row", gap: 16, marginTop: 10, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: "#EEF0F3" },
    chatTab: { paddingVertical: 8 },
    chatTabText: { fontFamily: FONTS.medium, fontSize: 13, color: MUTED },
    chatTabTextOn: { color: INK, fontFamily: FONTS.semibold },
    chatTabLine: { position: "absolute", left: 0, right: 0, bottom: -1, height: 2, borderRadius: 1, backgroundColor: PINK },
    chatRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7, paddingHorizontal: 4, borderRadius: 8 },
    chatAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#E9E1F5" },
    chatIcon: { alignItems: "center", justifyContent: "center", backgroundColor: "#F7E3F0" },
    online: {
      position: "absolute",
      right: -1,
      bottom: -1,
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 2,
      borderColor: "#FFFFFF",
      backgroundColor: "#31A24C",
    },
    chatName: { flex: 1, fontFamily: FONTS.medium, fontSize: 13.5, color: INK },
    chatNameUnread: { fontFamily: FONTS.semibold },
    chatTime: { fontFamily: FONTS.regular, fontSize: 11.5, color: MUTED },
    badge: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: PINK },
    badgeOn: { backgroundColor: "#FFFFFF" },
    badgeText: { fontFamily: FONTS.semibold, fontSize: 10.5, color: "#FFFFFF" },
    badgeTextOn: { color: PINK },

    // Right: faction
    factionRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    factionImage: { width: 52, height: 52 },
    factionLabel: { width: 140, height: 26 },
    factionButton: {
      marginTop: 12,
      height: 36,
      borderRadius: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: "#F7E3F0",
    },

    footer: { paddingHorizontal: 4, fontFamily: FONTS.regular, fontSize: 11.5, color: MUTED },
  },
  {
    hover: { backgroundColor: "rgba(255,255,255,0.07)" },
    link: { color: "#F0A6D7" },
    muted: { color: "#B0B3B8" },
    card: { backgroundColor: "#242526", borderColor: "rgba(255,255,255,0.06)" },
    cardTitle: { color: "#E4E6EB" },
    meAvatar: { backgroundColor: "#3A3B3C" },
    meName: { color: "#E4E6EB" },
    meHandle: { color: "#B0B3B8" },
    meStats: { borderTopColor: "#3A3B3C" },
    meStatValue: { color: "#E4E6EB" },
    meStatLabel: { color: "#B0B3B8" },
    menuText: { color: "#E4E6EB" },
    groupIcon: { backgroundColor: "#40283B" },
    groupName: { color: "#E4E6EB" },
    storyRingMine: { borderColor: "#4E4F50" },
    storyAvatar: { backgroundColor: "#3A3B3C" },
    storyPlus: { borderColor: "#242526" },
    storyName: { color: "#E4E6EB" },
    composerAvatar: { backgroundColor: "#3A3B3C" },
    composerInput: { backgroundColor: "#3A3B3C" },
    composerInputHover: { backgroundColor: "#4E4F50" },
    composerPlaceholder: { color: "#B0B3B8" },
    shareButton: { backgroundColor: "#40283B" },
    shareButtonHover: { backgroundColor: "#55344F" },
    shareText: { color: "#F0A6D7" },
    composerActions: { borderTopColor: "#3A3B3C" },
    composerActionText: { color: "#B0B3B8" },
    publicText: { color: "#B0B3B8" },
    search: { backgroundColor: "#3A3B3C" },
    searchInput: { color: "#E4E6EB" },
    chatTabs: { borderBottomColor: "#3A3B3C" },
    chatTabText: { color: "#B0B3B8" },
    chatTabTextOn: { color: "#E4E6EB" },
    chatAvatar: { backgroundColor: "#3A3B3C" },
    chatIcon: { backgroundColor: "#40283B" },
    online: { borderColor: "#242526" },
    chatName: { color: "#E4E6EB" },
    chatTime: { color: "#B0B3B8" },
    factionButton: { backgroundColor: "#40283B" },
    footer: { color: "#B0B3B8" },
  },
);
