// ==========================================
// CHATS HUB (Figma M01)
// ==========================================
// Search, filter chips (All chats / Groups / DMs), "Your groups" (Community,
// your faction room, then user-created groups), "Direct messages" circles,
// and "Create a group". Built from the screenshot for testing - fine-tune
// sizes/colours here.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { GroupAvatar } from "@/components/groups/GroupUi";
import { AVATARS } from "@/constants/avatars";
import { FONTS } from "@/constants/fonts";
import { apiRequest } from "@/services/api";
import { FollowUser } from "@/services/follow";
import { getSocket } from "@/services/socket";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { createChat, fetchChats } from "@/store/thunks/chatThunks";
import { fetchFollowing, followUserThunk } from "@/store/thunks/followThunks";

// ==========================================
// DESIGN TOKENS (from M01)
// ==========================================
const COLORS = {
  ink: "#24283C",
  muted: "#66738A",
  soft: "#8A93A6",
  pink: "#B63D91",
  pinkSoft: "#F7E3F0",
  chip: "#ECE8F4",
  line: "rgba(36,40,60,0.10)",
  white: "#FFFFFF",
  online: "#25D366",
  danger: "#B42318",
  dangerSoft: "rgba(255,80,80,0.08)",
  hairlineSoft: "rgba(23,25,34,0.07)",
};

type Filter = "all" | "groups" | "dms";

type ChatItem = {
  id: string;
  type: "community" | "faction" | "dm" | "group";
  title?: string;
  factionKey?: string;
  memberCount?: number;
  unreadCount?: number;
  lastMessage?: {
    senderName?: string;
    preview?: string;
    createdAt?: string;
  } | null;
  updatedAt?: string;
  otherParticipant?: {
    username?: string;
    name?: string;
    lastActiveAt?: string;
    avatarPhotoUrl?: string | null;
    avatarKey?: string | null;
    isOnline?: boolean;
  };
  // User-created groups.
  group?: {
    kind?: "faction" | "open" | "private";
    photoUrl?: string | null;
    muted?: boolean;
    myRole?: string;
  };
};

type UserSearchResponse = {
  users: FollowUser[];
  pagination?: { page: number; limit: number; total: number; hasMore: boolean };
};

// ==========================================
// HELPERS
// ==========================================

function getAvatarSource(user: { avatarPhotoUrl?: string | null; avatarKey?: string | null }) {
  if (user.avatarPhotoUrl) {
    return { uri: user.avatarPhotoUrl };
  }
  const preset = AVATARS.find((avatar) => avatar.id === user.avatarKey);
  return preset?.source || require("@/assets/images/dp-avatar.png");
}

function isPersonOnline(person: FollowUser): boolean {
  return Boolean((person as any).isOnline);
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}

function initialsOf(name?: string) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || "?").slice(0, 2);
  return letters.toUpperCase();
}

const AVATAR_TINTS = ["#E9E1F5", "#DCE8EF", "#F3DDED", "#E2F0E8", "#F5E6D8"];

function avatarTint(name?: string) {
  let hash = 0;
  for (const char of String(name || "")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

// 9:32 today, "Yesterday", or "Oct 8".
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

function lastActivity(chat: ChatItem) {
  const value = chat.lastMessage?.createdAt || chat.updatedAt;
  return value ? new Date(value).getTime() : 0;
}

async function discoverUsers(token: string): Promise<UserSearchResponse> {
  return apiRequest<UserSearchResponse>("/api/users/discover", { token });
}

async function searchUsers(search: string, token: string): Promise<UserSearchResponse> {
  return apiRequest<UserSearchResponse>(`/api/users/search?search=${encodeURIComponent(search.trim())}`, { token });
}

// Icon + type label for each kind of group row.
function groupLook(chat: ChatItem): { icon: keyof typeof Ionicons.glyphMap; label: string } {
  if (chat.type === "community") return { icon: "globe-outline", label: "Community · everyone" };
  if (chat.type === "faction") return { icon: "shield-outline", label: "Your faction room" };
  switch (chat.group?.kind) {
    case "faction":
      return { icon: "shield-outline", label: "Local faction" };
    case "open":
      return { icon: "globe-outline", label: "Open space" };
    default:
      return { icon: "lock-closed-outline", label: "Private group" };
  }
}

// ==========================================
// GROUP ROW
// ==========================================

function GroupRow({ chat, first, onPress }: { chat: ChatItem; first: boolean; onPress: () => void }) {
  const look = groupLook(chat);
  const unread = chat.unreadCount || 0;
  const muted = !!chat.group?.muted;
  const title =
    chat.type === "community"
      ? chat.title || "Community"
      : chat.type === "faction"
        ? chat.title || "Faction"
        : chat.title || "Group";

  const last = chat.lastMessage
    ? chat.lastMessage.senderName
      ? `${chat.lastMessage.senderName}: ${chat.lastMessage.preview || "Message"}`
      : chat.lastMessage.preview || "Message"
    : "No messages yet";

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.groupRow, first && styles.groupRowCard, pressed && styles.pressed]}>
      {chat.type === "group" && chat.group?.photoUrl ? (
        <GroupAvatar name={title} photoUrl={chat.group.photoUrl} size={48} />
      ) : (
        <View style={styles.groupIcon}>
          <Ionicons name={look.icon} size={22} color={COLORS.pink} />
        </View>
      )}

      <View style={styles.groupText}>
        <View style={styles.groupNameRow}>
          <Text style={styles.groupName} numberOfLines={1}>
            {title}
          </Text>
          {muted ? <Ionicons name="notifications-off-outline" size={13} color={COLORS.soft} /> : null}
        </View>
        <Text style={styles.groupLast} numberOfLines={1}>
          {last}
        </Text>
        <Text style={styles.groupType} numberOfLines={1}>
          {look.label}
          {chat.memberCount ? ` · ${chat.memberCount} members` : ""}
        </Text>
      </View>

      <View style={styles.groupSide}>
        <Text style={styles.groupTime}>{timeLabel(chat.lastMessage?.createdAt)}</Text>
        {unread > 0 ? (
          <View style={[styles.unreadBadge, muted && styles.unreadMuted]}>
            <Text style={styles.unreadText}>{unread > 99 ? "99+" : unread}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

// ==========================================
// SCREEN
// ==========================================

export function Chats() {
  const dispatch = useAppDispatch();

  const token = useAppSelector((state) => state.auth.token);
  const authUser = useAppSelector((state) => state.auth.user);
  const user = useAppSelector((state) => state.user.user);
  const conversations = useAppSelector((state) => state.chat.conversations) as ChatItem[];
  const loading = useAppSelector((state) => state.chat.loading);
  const error = useAppSelector((state) => state.chat.error);
  const following = useAppSelector((state) => state.follow.following);

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  // Find People
  const [peopleVisible, setPeopleVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [people, setPeople] = useState<FollowUser[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [processingUsername, setProcessingUsername] = useState<string | null>(null);
  const [startingChatWith, setStartingChatWith] = useState<string | null>(null);

  const currentUsername =
    (user as any)?.profile?.username || (user as any)?.username || (authUser as any)?.profile?.username || "";

  const followingUsernames = useMemo(
    () => new Set(following.map((person) => person.username.toLowerCase())),
    [following],
  );

  useEffect(() => {
    if (!token) return;
    dispatch(fetchChats(token));
  }, [token, dispatch]);

  // Groups: removed / banned, or a group changed -> refresh the list.
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !token) return;

    const refresh = () => {
      dispatch(fetchChats(token));
    };

    socket.on("group:removed", refresh);
    socket.on("group:updated", refresh);

    return () => {
      socket.off("group:removed", refresh);
      socket.off("group:updated", refresh);
    };
  }, [token, dispatch]);

  useEffect(() => {
    if (!token || !currentUsername) return;
    dispatch(fetchFollowing({ username: currentUsername, token }));
  }, [token, currentUsername, dispatch]);

  const q = query.trim().toLowerCase();
  const matches = (...texts: (string | undefined)[]) => !q || texts.join(" ").toLowerCase().includes(q);

  // YOUR GROUPS: Community, your faction room, then groups by latest activity.
  const groupRows = useMemo(() => {
    const community = conversations.filter((chat) => chat.type === "community");
    const faction = conversations.filter((chat) => chat.type === "faction");
    const groups = conversations
      .filter((chat) => chat.type === "group")
      .slice()
      .sort((a, b) => lastActivity(b) - lastActivity(a));
    return [...community, ...faction, ...groups];
  }, [conversations]);

  const visibleGroups = groupRows.filter((chat) =>
    matches(chat.title, chat.lastMessage?.preview, chat.lastMessage?.senderName),
  );

  // DIRECT MESSAGES: real conversations first (latest first), then people you
  // follow but haven't messaged yet.
  const dmConversations = useMemo(
    () =>
      conversations
        .filter((chat) => chat.type === "dm")
        .slice()
        .sort((a, b) => lastActivity(b) - lastActivity(a)),
    [conversations],
  );

  const followingByUsername = useMemo(() => {
    const map = new Map<string, FollowUser>();
    following.forEach((person) => map.set(person.username.toLowerCase(), person));
    return map;
  }, [following]);

  const messaged = useMemo(() => {
    const set = new Set<string>();
    dmConversations.forEach((chat) => {
      const username = chat.otherParticipant?.username?.toLowerCase();
      if (username) set.add(username);
    });
    return set;
  }, [dmConversations]);

  const notYetMessaged = following.filter((person) => !messaged.has(person.username.toLowerCase()));

  const visibleDms = dmConversations.filter((chat) => {
    const username = chat.otherParticipant?.username || "";
    const followed = followingByUsername.get(username.toLowerCase());
    return matches(chat.otherParticipant?.name, followed?.name, username, chat.lastMessage?.preview);
  });
  const visibleNotYet = notYetMessaged.filter((person) => matches(person.name, person.username));

  const openChat = (chatId: string) => {
    router.push({ pathname: "/chat/[id]", params: { id: chatId } });
  };

  async function openOrCreateChat(person: FollowUser) {
    if (!token) {
      Alert.alert("Session Expired", "Please sign in again.");
      return;
    }
    if (!person.username) {
      Alert.alert("Message", "This user can't be messaged right now.");
      return;
    }

    setStartingChatWith(person.username);
    try {
      const existing = conversations.find(
        (chat) => chat.type === "dm" && chat.otherParticipant?.username?.toLowerCase() === person.username.toLowerCase(),
      );
      let chatId = existing?.id;
      if (!chatId) {
        const created = await dispatch(createChat({ token, data: { username: person.username } })).unwrap();
        chatId = created?.id;
      }
      if (!chatId) throw new Error("Unable to start this conversation.");
      if (peopleVisible) closePeople();
      openChat(chatId);
    } catch (createError) {
      Alert.alert("Message", getErrorMessage(createError, "Unable to start conversation."));
    } finally {
      setStartingChatWith(null);
    }
  }

  async function handleFollow(person: FollowUser) {
    if (!token) return;
    setProcessingUsername(person.username);
    try {
      await dispatch(followUserThunk({ username: person.username, token })).unwrap();
      if (currentUsername) {
        await dispatch(fetchFollowing({ username: currentUsername, token })).unwrap();
      }
    } catch (followError) {
      Alert.alert("Unable to Follow", getErrorMessage(followError, "Could not follow this user."));
    } finally {
      setProcessingUsername(null);
    }
  }

  function handleMessage(person: FollowUser) {
    if (!followingUsernames.has(person.username.toLowerCase())) {
      Alert.alert("Follow First", `Follow @${person.username} before starting a chat.`);
      return;
    }
    openOrCreateChat(person);
  }

  function openPeople() {
    setSearch("");
    setPeople([]);
    setPeopleError(null);
    setPeopleVisible(true);
  }

  function closePeople() {
    setPeopleVisible(false);
    setSearch("");
    setPeople([]);
    setPeopleError(null);
  }

  // Find People: discover (no search) or search by name.
  useEffect(() => {
    if (!peopleVisible || !token) return;
    const trimmed = search.trim();

    const timer = setTimeout(
      async () => {
        setPeopleLoading(true);
        setPeopleError(null);
        try {
          const response = trimmed ? await searchUsers(trimmed, token) : await discoverUsers(token);
          setPeople(
            (response?.users || []).filter(
              (person) => person.username.toLowerCase() !== currentUsername.toLowerCase(),
            ),
          );
        } catch (loadError) {
          setPeople([]);
          setPeopleError(getErrorMessage(loadError, "Unable to load users."));
        } finally {
          setPeopleLoading(false);
        }
      },
      trimmed ? 350 : 0,
    );

    return () => clearTimeout(timer);
  }, [peopleVisible, search, token, currentUsername]);

  if (!token) {
    return null;
  }

  const showGroups = filter !== "dms";
  const showDms = filter !== "groups";

  return (
    <View style={styles.wrap}>
      {/* SEARCH */}
      <View style={styles.search}>
        <Ionicons name="search-outline" size={18} color={COLORS.soft} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
          placeholder="Search groups, people and messages"
          placeholderTextColor={COLORS.soft}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={17} color={COLORS.soft} />
          </Pressable>
        ) : null}
      </View>

      {/* CHIPS */}
      <View style={styles.chips}>
        {(
          [
            ["all", "All chats"],
            ["groups", "Groups"],
            ["dms", "DMs"],
          ] as [Filter, string][]
        ).map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => setFilter(value)}
            style={[styles.chip, filter === value && styles.chipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === value }}>
            <Text style={[styles.chipText, filter === value && styles.chipTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {/* YOUR GROUPS */}
      {showGroups ? (
        <>
          <View style={styles.sectionRow}>
            <Text style={styles.section}>YOUR GROUPS</Text>
            <Pressable onPress={() => router.push("/group/discover")} hitSlop={8}>
              <Text style={styles.sectionLink}>Discover</Text>
            </Pressable>
          </View>

          {loading && !conversations.length ? (
            <View style={styles.center}>
              <ActivityIndicator size="small" color={COLORS.pink} />
              <Text style={styles.centerText}>Loading chats...</Text>
            </View>
          ) : error && !conversations.length ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable style={styles.retry} onPress={() => dispatch(fetchChats(token))}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : visibleGroups.length === 0 ? (
            <Text style={styles.empty}>{q ? "No groups match your search." : "No groups yet."}</Text>
          ) : (
            <View style={styles.groupList}>
              {visibleGroups.map((chat, index) => (
                <GroupRow key={chat.id} chat={chat} first={index === 0} onPress={() => openChat(chat.id)} />
              ))}
            </View>
          )}
        </>
      ) : null}

      {/* DIRECT MESSAGES */}
      {showDms ? (
        <>
          <Text style={[styles.section, styles.dmSection]}>DIRECT MESSAGES</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dmRow}>
            {visibleDms.map((chat) => {
              const username = chat.otherParticipant?.username || "";
              const followed = followingByUsername.get(username.toLowerCase());
              const name = followed?.name || chat.otherParticipant?.name || username || "Someone";
              const photo = chat.otherParticipant?.avatarPhotoUrl || followed?.avatarPhotoUrl || null;
              const unread = chat.unreadCount || 0;

              return (
                <Pressable key={chat.id} style={styles.dmItem} onPress={() => openChat(chat.id)}>
                  <View style={[styles.dmCircle, { backgroundColor: avatarTint(name) }]}>
                    {photo ? (
                      <Image source={{ uri: photo }} style={styles.dmPhoto} contentFit="cover" />
                    ) : (
                      <Text style={styles.dmInitials}>{initialsOf(name)}</Text>
                    )}
                    {chat.otherParticipant?.isOnline ? <View style={styles.onlineDot} /> : null}
                    {unread > 0 ? (
                      <View style={styles.dmUnread}>
                        <Text style={styles.unreadText}>{unread > 99 ? "99+" : unread}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.dmName} numberOfLines={1}>
                    {name.split(" ")[0]}
                  </Text>
                </Pressable>
              );
            })}

            {visibleNotYet.map((person) => {
              const busy = startingChatWith === person.username;
              const name = person.name || person.username;

              return (
                <Pressable key={person.id || person.username} style={styles.dmItem} disabled={busy} onPress={() => openOrCreateChat(person)}>
                  <View style={[styles.dmCircle, { backgroundColor: avatarTint(name) }]}>
                    {person.avatarPhotoUrl ? (
                      <Image source={getAvatarSource(person)} style={styles.dmPhoto} contentFit="cover" />
                    ) : (
                      <Text style={styles.dmInitials}>{initialsOf(name)}</Text>
                    )}
                    {isPersonOnline(person) ? <View style={styles.onlineDot} /> : null}
                    {busy ? (
                      <View style={styles.dmBusy}>
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.dmName} numberOfLines={1}>
                    {name.split(" ")[0]}
                  </Text>
                </Pressable>
              );
            })}

            {/* + Find People */}
            <Pressable style={styles.dmItem} onPress={openPeople} accessibilityLabel="Find people">
              <View style={[styles.dmCircle, styles.plusCircle]}>
                <Ionicons name="add" size={26} color={COLORS.pink} />
              </View>
              <Text style={styles.dmName}>Find</Text>
            </Pressable>
          </ScrollView>
        </>
      ) : null}

      {/* CREATE A GROUP */}
      <Pressable
        style={({ pressed }) => [styles.createButton, pressed && styles.pressed]}
        onPress={() => router.push("/group/new")}
        accessibilityRole="button">
        <Ionicons name="add" size={20} color="#FFFFFF" />
        <Text style={styles.createText}>Create a group</Text>
      </Pressable>

      {/* FIND PEOPLE */}
      <Modal visible={peopleVisible} transparent animationType="slide" onRequestClose={closePeople}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Find People</Text>
                <Text style={styles.modalSubtitle}>Follow people and start connecting</Text>
              </View>
              <Pressable onPress={closePeople} hitSlop={10} style={styles.closeButton}>
                <Ionicons name="close" size={21} color={COLORS.ink} />
              </Pressable>
            </View>

            <View style={styles.modalSearch}>
              <Ionicons name="search" size={18} color={COLORS.soft} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                style={styles.modalSearchInput}
                placeholder="Search by username..."
                placeholderTextColor={COLORS.soft}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {search.length > 0 ? (
                <Pressable onPress={() => setSearch("")}>
                  <Ionicons name="close-circle" size={17} color={COLORS.soft} />
                </Pressable>
              ) : null}
            </View>

            <Text style={styles.peopleTitle}>{search.trim() ? "Search Results" : "People on CosQuest"}</Text>

            {peopleLoading ? (
              <View style={styles.center}>
                <ActivityIndicator size="small" color={COLORS.pink} />
                <Text style={styles.centerText}>Finding people...</Text>
              </View>
            ) : null}

            {!peopleLoading && peopleError ? (
              <View style={styles.center}>
                <Text style={styles.errorText}>{peopleError}</Text>
                <Pressable style={styles.retry} onPress={() => setSearch((value) => value.trim())}>
                  <Text style={styles.retryText}>Try Again</Text>
                </Pressable>
              </View>
            ) : null}

            {!peopleLoading && !peopleError ? (
              <ScrollView style={styles.peopleList} keyboardShouldPersistTaps="handled">
                {people.length === 0 ? (
                  <Text style={styles.empty}>{search.trim() ? "No users found." : "No people to show."}</Text>
                ) : null}

                {people.map((person) => {
                  const isFollowing = followingUsernames.has(person.username.toLowerCase());
                  const busy = processingUsername === person.username || startingChatWith === person.username;

                  return (
                    <View key={person.id} style={styles.personRow}>
                      <Image source={getAvatarSource(person)} style={styles.personAvatar} contentFit="cover" />
                      <View style={styles.personInfo}>
                        <Text style={styles.personName} numberOfLines={1}>
                          {person.name || person.username}
                        </Text>
                        <Text style={styles.personUsername} numberOfLines={1}>
                          @{person.username}
                        </Text>
                      </View>

                      <Pressable
                        disabled={busy}
                        style={[styles.followButton, isFollowing ? styles.followingButton : styles.followButtonOn, busy && styles.off]}
                        onPress={() => handleFollow(person)}>
                        {processingUsername === person.username ? (
                          <ActivityIndicator size="small" color={isFollowing ? COLORS.ink : "#FFFFFF"} />
                        ) : (
                          <Text style={isFollowing ? styles.followingText : styles.followText}>
                            {isFollowing ? "Following" : "Follow"}
                          </Text>
                        )}
                      </Pressable>

                      {isFollowing ? (
                        <Pressable disabled={busy} style={[styles.messageButton, busy && styles.off]} onPress={() => handleMessage(person)}>
                          {startingChatWith === person.username ? (
                            <ActivityIndicator size="small" color={COLORS.ink} />
                          ) : (
                            <Ionicons name="chatbubble-outline" size={16} color={COLORS.ink} />
                          )}
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, paddingBottom: 12 },

  pressed: { opacity: 0.75 },

  off: { opacity: 0.55 },

  // SEARCH
  search: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: "rgba(102,115,138,0.25)",
  },

  searchInput: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    fontFamily: FONTS.regular,
    fontSize: 14.5,
    color: COLORS.ink,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  // CHIPS
  chips: { flexDirection: "row", gap: 8, marginTop: 14 },

  chip: { paddingHorizontal: 12, height: 26, borderRadius: 13, justifyContent: "center", backgroundColor: COLORS.chip },

  chipOn: { backgroundColor: COLORS.pinkSoft },

  chipText: { fontFamily: FONTS.medium, fontSize: 11.5, color: COLORS.muted },

  chipTextOn: { color: COLORS.pink, fontFamily: FONTS.semibold },

  // SECTIONS
  sectionRow: { marginTop: 20, marginBottom: 8, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  section: { fontFamily: FONTS.semibold, fontSize: 12, letterSpacing: 0.4, color: COLORS.muted },

  sectionLink: { fontFamily: FONTS.medium, fontSize: 12.5, color: COLORS.pink },

  dmSection: { marginTop: 22, marginBottom: 10 },

  center: { alignItems: "center", justifyContent: "center", paddingVertical: 24, gap: 8 },

  centerText: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.soft },

  empty: { paddingVertical: 16, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, color: COLORS.soft },

  errorBox: { alignItems: "center", paddingVertical: 20, paddingHorizontal: 14, borderRadius: 14, backgroundColor: COLORS.dangerSoft },

  errorText: { fontFamily: FONTS.regular, fontSize: 12, color: COLORS.danger, textAlign: "center" },

  retry: { marginTop: 10, paddingHorizontal: 16, paddingVertical: 7, borderRadius: 10, backgroundColor: COLORS.pink },

  retryText: { fontFamily: FONTS.bold, color: "#FFFFFF", fontSize: 12 },

  // GROUP ROWS
  groupList: { gap: 4 },

  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 18,
  },

  // Figma M01: the top row sits on a white card.
  groupRowCard: {
    backgroundColor: COLORS.white,
    shadowColor: COLORS.ink,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },

  groupIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.pinkSoft,
  },

  groupText: { flex: 1, minWidth: 0 },

  groupNameRow: { flexDirection: "row", alignItems: "center", gap: 5 },

  groupName: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 20, color: COLORS.ink },

  groupLast: { marginTop: 3, fontFamily: FONTS.regular, fontSize: 13, lineHeight: 18, color: COLORS.muted },

  groupType: { marginTop: 3, fontFamily: FONTS.regular, fontSize: 11, lineHeight: 15, color: COLORS.soft },

  groupSide: { alignItems: "flex-end", gap: 8, alignSelf: "flex-start", paddingTop: 2 },

  groupTime: { fontFamily: FONTS.regular, fontSize: 11, color: COLORS.soft },

  unreadBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.pink,
  },

  unreadMuted: { backgroundColor: "#A9A9B2" },

  unreadText: { fontFamily: FONTS.bold, fontSize: 11, color: "#FFFFFF" },

  // DIRECT MESSAGES
  dmRow: { gap: 18, paddingRight: 10, paddingBottom: 4 },

  dmItem: { width: 58, alignItems: "center" },

  dmCircle: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },

  dmPhoto: { width: 56, height: 56, borderRadius: 28 },

  dmInitials: { fontFamily: FONTS.bold, fontSize: 14, color: "#7D356D" },

  dmName: { marginTop: 6, maxWidth: 64, fontFamily: FONTS.regular, fontSize: 12.5, color: COLORS.ink, textAlign: "center" },

  onlineDot: {
    position: "absolute",
    right: 1,
    bottom: 1,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: COLORS.online,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  dmUnread: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.pink,
  },

  dmBusy: {
    ...StyleSheet.absoluteFill,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },

  plusCircle: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: "rgba(182,61,145,0.3)" },

  // CREATE A GROUP
  createButton: {
    marginTop: 24,
    height: 50,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: COLORS.pink,
  },

  createText: { fontFamily: FONTS.semibold, fontSize: 15.5, color: "#FFFFFF" },

  // FIND PEOPLE MODAL
  modalOverlay: { flex: 1, backgroundColor: "rgba(15,16,22,0.45)", justifyContent: "flex-end" },

  modal: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    minHeight: "72%",
    maxHeight: "90%",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 30,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },

  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },

  modalTitle: { fontFamily: FONTS.bold, fontSize: 19, color: COLORS.ink },

  modalSubtitle: { marginTop: 3, fontFamily: FONTS.regular, fontSize: 12, color: COLORS.soft },

  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.hairlineSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  modalSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.line,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },

  modalSearchInput: {
    flex: 1,
    padding: 0,
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.ink,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  peopleTitle: { marginTop: 18, marginBottom: 8, fontFamily: FONTS.bold, fontSize: 13, color: COLORS.muted },

  peopleList: { flex: 1 },

  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.hairlineSoft,
  },

  personAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.hairlineSoft },

  personInfo: { flex: 1, minWidth: 0 },

  personName: { fontFamily: FONTS.semibold, fontSize: 14, color: COLORS.ink },

  personUsername: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, color: COLORS.soft },

  followButton: { minWidth: 84, height: 32, paddingHorizontal: 10, borderRadius: 9, alignItems: "center", justifyContent: "center" },

  followButtonOn: { backgroundColor: COLORS.pink },

  followingButton: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: COLORS.line },

  followText: { fontFamily: FONTS.bold, fontSize: 12.5, color: "#FFFFFF" },

  followingText: { fontFamily: FONTS.semibold, fontSize: 12.5, color: COLORS.muted },

  messageButton: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.line,
    alignItems: "center",
    justifyContent: "center",
  },
});
