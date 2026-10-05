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

import { AVATARS } from "@/constants/avatars";
import { FACTIONS } from "@/constants/factions";
import { FONTS } from "@/constants/fonts";
import { apiRequest } from "@/services/api";
import { FollowUser } from "@/services/follow";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { createChat, fetchChats } from "@/store/thunks/chatThunks";
import { fetchFollowing, followUserThunk } from "@/store/thunks/followThunks";

// ==========================================
// DESIGN TOKENS
// ==========================================
const COLORS = {
  ink: "#171922",
  graphite: "#5D5F6B",
  graphiteSoft: "#8A8A93",
  hairline: "rgba(23,25,34,0.12)",
  hairlineSoft: "rgba(23,25,34,0.07)",
  brand: "#C5399A",
  brandSoft: "rgba(197,57,154,0.10)",
  danger: "#B42318",
  dangerSoft: "rgba(255,80,80,0.08)",
  // Green "online" dot, same as the chat screen header.
  online: "#25D366",
};

// ==========================================
// FIGMA VALUES (frame is 402 wide)
// ==========================================
// "Your Space" card (Community and ICONS are identical):
//   art 99 x 99 at left 20 / top 205
//   grey card 302 x 78 at left 77 / top 224, radius 19, #0000000D
//   count badge 13.9 x 16 at left 361 / top 258
const ART_SIZE = 99;
const CARD_LEFT = 57; // 77 - 20 : the card starts this far right of the art
const CARD_TOP = 19; // 224 - 205
const CARD_HEIGHT = 78;
const CARD_RADIUS = 19;
const CARD_BG = "#0000000D";
const CARD_GAP = 24; // space between the two cards
const TEXT_LEFT = 130; // where the title starts (150 - 20)

const BADGE_WIDTH = 14;
const BADGE_HEIGHT = 16;
const BADGE_TOP = CARD_TOP + 34; // 258 - 224
const BADGE_RIGHT = 4; // 379 - (361 + 14)

// Count badge colours (estimated from the Figma - send me the fills if off):
const BADGE_COMMUNITY = "#C34D9C";
const BADGE_FACTION = "#8E91F2";

// "(Comic Book Faction)" etc. under each faction's wordmark.
const FACTION_TAGLINE: Record<string, string> = {
  ascendants: "Anime Faction",
  icons: "Comic Book Faction",
  controllers: "Gaming Faction",
  blockbusters: "Movie Faction",
  everborn: "Fantasy Faction",
  celestials: "Sci-Fi Faction",
};

// The Community group picture (exported from the Figma).
const COMMUNITY_ART: any = require("@/assets/images/factions/community.png");

// Direct Message circles (Figma: 53 x 54, background #C34D9C33)
const DM_CIRCLE_W = 53;
const DM_CIRCLE_H = 54;
const DM_CIRCLE_BG = "#C34D9C33";
const DM_GAP = 19;

// The "+" is a bold plus, 23 x 23, colour #9A9AA3
const PLUS_SIZE = 23;
const PLUS_COLOR = "#9A9AA3";

// Figma: the search bar and the "+" circle are see-through white
// (#FFFFFF1A = white 10%) with a soft shadow (0 2 4 #0000001A).
const GLASS_BG = "rgba(255,255,255,0.1)";

type ChatItem = {
  id: string;
  type: "community" | "faction" | "dm";
  title?: string;
  factionKey?: string;
  memberCount?: number;
  unreadCount?: number;
  lastMessage?: {
    senderName?: string;
    preview?: string;
    createdAt?: string;
  } | null;
  otherParticipant?: {
    username?: string;
    lastActiveAt?: string;
    avatarPhotoUrl?: string | null;
    avatarKey?: string | null;
    // Sent by the backend in the chat list (summarizeConversation) and
    // kept live by the presence:online / presence:offline socket events.
    isOnline?: boolean;
  };
};

type UserSearchResponse = {
  users: FollowUser[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
};

function getAvatarSource(user: FollowUser) {
  if (user.avatarPhotoUrl) {
    return {
      uri: user.avatarPhotoUrl,
    };
  }

  const preset = AVATARS.find((avatar) => avatar.id === user.avatarKey);

  if (preset?.source) {
    return preset.source;
  }

  return require("@/assets/images/dp-avatar.png");
}

// FollowUser doesn't declare `isOnline` yet - the backend will add it later.
// This reads it defensively so the UI lights up the moment it's added,
// with no further frontend change needed.
function isPersonOnline(person: FollowUser): boolean {
  return Boolean((person as any).isOnline);
}

// ==========================================
// ERROR MESSAGE HELPER
// ==========================================
// RTK thunks that use rejectWithValue(someString) throw that raw string
// directly when you call .unwrap() on a rejected result — NOT an Error
// instance. This handles both shapes so the real backend message actually
// reaches the person using the app.
function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string" &&
    (error as { message: string }).message.trim()
  ) {
    return (error as { message: string }).message;
  }

  return fallback;
}

// ==========================================
// DISCOVER USERS
// GET /api/users/discover
//
// Used when the Find People panel is opened
// with no search term - lists everyone the
// backend is willing to show (excludes self
// and blocked users), newest first.
// ==========================================

async function discoverUsers(token: string): Promise<UserSearchResponse> {
  return apiRequest<UserSearchResponse>("/api/users/discover", {
    token,
  });
}

// ==========================================
// SEARCH USERS
// GET /api/users/search?search=term
//
// Only ever called with a non-empty term -
// the backend responds 400 "search is
// required." for an empty/missing value, so
// this must not be called for the empty case.
// Use discoverUsers() for that instead.
// ==========================================

async function searchUsers(
  search: string,
  token: string,
): Promise<UserSearchResponse> {
  return apiRequest<UserSearchResponse>(
    `/api/users/search?search=${encodeURIComponent(search.trim())}`,
    {
      token,
    },
  );
}

// The Community group picture. (If it ever fails to load, a small cluster
// of avatars is drawn instead.)
function CommunityCluster() {
  if (COMMUNITY_ART) {
    return (
      <Image
        source={COMMUNITY_ART}
        style={styles.spaceArtImage}
        contentFit="contain"
      />
    );
  }

  const picks = AVATARS.slice(0, 4);

  const spots = [
    { left: 0, top: 20 },
    { left: 38, top: 0 },
    { left: 44, top: 44 },
    { left: 6, top: 52 },
  ];

  return (
    <View style={styles.cluster}>
      {picks.map((avatar, index) => (
        <Image
          key={avatar.id}
          source={avatar.source}
          style={[styles.clusterAvatar, spots[index]]}
          contentFit="cover"
        />
      ))}
    </View>
  );
}

export function Chats() {
  const dispatch = useAppDispatch();

  const token = useAppSelector((state) => state.auth.token);

  const authUser = useAppSelector((state) => state.auth.user);

  const user = useAppSelector((state) => state.user.user);

  const conversations = useAppSelector(
    (state) => state.chat.conversations,
  ) as ChatItem[];

  const loading = useAppSelector((state) => state.chat.loading);

  const error = useAppSelector((state) => state.chat.error);

  const following = useAppSelector((state) => state.follow.following);

  const [peopleVisible, setPeopleVisible] = useState(false);

  // the "Search direct messages" box
  const [dmSearch, setDmSearch] = useState("");

  const [search, setSearch] = useState("");

  const [people, setPeople] = useState<FollowUser[]>([]);

  const [peopleLoading, setPeopleLoading] = useState(false);

  const [peopleError, setPeopleError] = useState<string | null>(null);

  const [processingUsername, setProcessingUsername] = useState<string | null>(
    null,
  );

  // Username of the person we're currently creating/opening a DM with -
  // used to show a small spinner on just that one avatar/button.
  const [startingChatWith, setStartingChatWith] = useState<string | null>(null);

  const currentUsername =
    user?.profile?.username ||
    user?.username ||
    authUser?.profile?.username ||
    "";

  const followingUsernames = useMemo(() => {
    return new Set(following.map((person) => person.username.toLowerCase()));
  }, [following]);

  useEffect(() => {
    if (!token) {
      return;
    }

    dispatch(fetchChats(token));
  }, [token, dispatch]);

  // Keep the "people you follow" list fresh so the Direct Message row has
  // something to show as soon as this screen mounts, not just right after
  // tapping Follow.
  useEffect(() => {
    if (!token || !currentUsername) {
      return;
    }

    dispatch(
      fetchFollowing({
        username: currentUsername,
        token,
      }),
    );
  }, [token, currentUsername, dispatch]);

  const groupChats = conversations.filter(
    (chat) => chat.type === "community" || chat.type === "faction",
  );

  // Real DM threads, most recent activity first.
  const dmConversations = useMemo(() => {
    return conversations
      .filter((chat) => chat.type === "dm")
      .slice()
      .sort((a, b) => {
        const aTime = a.lastMessage?.createdAt
          ? new Date(a.lastMessage.createdAt).getTime()
          : 0;

        const bTime = b.lastMessage?.createdAt
          ? new Date(b.lastMessage.createdAt).getTime()
          : 0;

        return bTime - aTime;
      });
  }, [conversations]);

  // So a DM circle can show the real avatar even though the conversation
  // payload's otherParticipant may not include one — cross-referenced by
  // username against the people you follow, who do carry avatar data.
  const followingByUsername = useMemo(() => {
    const map = new Map<string, FollowUser>();

    following.forEach((person) => {
      map.set(person.username.toLowerCase(), person);
    });

    return map;
  }, [following]);

  const messagedUsernames = useMemo(() => {
    const set = new Set<string>();

    dmConversations.forEach((chat) => {
      const username = chat.otherParticipant?.username?.toLowerCase();

      if (username) {
        set.add(username);
      }
    });

    return set;
  }, [dmConversations]);

  // People you follow but haven't actually started a conversation with -
  // they get a circle too, after the real conversations.
  const notYetMessaged = following.filter(
    (person) => !messagedUsernames.has(person.username.toLowerCase()),
  );

  /*
   * Open an existing DM with this person if one is already loaded, otherwise
   * create one via POST /api/chats/dm (through the createChat thunk), then
   * navigate into it. Shared by the "Message" icon in Find People and by
   * tapping a circle in the Direct Message row.
   */
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
        (chat) =>
          chat.type === "dm" &&
          chat.otherParticipant?.username?.toLowerCase() ===
            person.username.toLowerCase(),
      );

      let chatId = existing?.id;

      if (!chatId) {
        const created = await dispatch(
          createChat({
            token,
            data: {
              username: person.username,
            },
          }),
        ).unwrap();

        chatId = created?.id;
      }

      if (!chatId) {
        throw new Error(
          "Unable to start this conversation. The server didn't return a conversation id.",
        );
      }

      if (peopleVisible) {
        closePeople();
      }

      openChat(chatId);
    } catch (error) {
      console.error("OPEN OR CREATE CHAT ERROR:", error);

      Alert.alert(
        "Message",
        getErrorMessage(error, "Unable to start conversation."),
      );
    } finally {
      setStartingChatWith(null);
    }
  }

  const openChat = (chatId: string) => {
    router.push({
      pathname: "/chat/[id]",
      params: {
        id: chatId,
      },
    });
  };

  // Figma: "Community — General".
  const getGroupName = (chat: ChatItem) => {
    if (chat.type === "community") {
      const name = chat.title || "Community";

      return /general/i.test(name) ? name : `${name} — General`;
    }

    return chat.title || chat.factionKey || "Faction";
  };

  const getLastMessage = (chat: ChatItem) => {
    if (!chat.lastMessage) {
      return "No messages yet";
    }

    const sender = chat.lastMessage.senderName;

    const preview = chat.lastMessage.preview || "Message";

    if (!sender) {
      return preview;
    }

    return `${sender}: ${preview}`;
  };

  async function handleFollow(person: FollowUser) {
    if (!token) {
      Alert.alert("Session Expired", "Please sign in again.");

      return;
    }

    setProcessingUsername(person.username);

    try {
      await dispatch(
        followUserThunk({
          username: person.username,
          token,
        }),
      ).unwrap();

      if (currentUsername) {
        await dispatch(
          fetchFollowing({
            username: currentUsername,
            token,
          }),
        ).unwrap();
      }
    } catch (error) {
      Alert.alert(
        "Unable to Follow",
        getErrorMessage(error, "Could not follow this user."),
      );
    } finally {
      setProcessingUsername(null);
    }
  }

  function handleMessage(person: FollowUser) {
    const isFollowing = followingUsernames.has(person.username.toLowerCase());

    if (!isFollowing) {
      Alert.alert(
        "Follow First",
        `Follow @${person.username} before starting a chat.`,
      );

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

  /*
   * Load real registered users when
   * the Find People panel is opened.
   *
   * With no search term, this calls
   * GET /api/users/discover (lists everyone).
   *
   * Once the person types something, it
   * switches to GET /api/users/search?search=...
   * The search endpoint 400s on an empty term,
   * so it must never be called with one.
   */
  useEffect(() => {
    if (!peopleVisible || !token) {
      return;
    }

    const trimmed = search.trim();

    const timer = setTimeout(
      async () => {
        setPeopleLoading(true);
        setPeopleError(null);

        try {
          const response = trimmed
            ? await searchUsers(trimmed, token)
            : await discoverUsers(token);

          const users = response?.users || [];

          const filteredUsers = users.filter(
            (person) =>
              person.username.toLowerCase() !== currentUsername.toLowerCase(),
          );

          setPeople(filteredUsers);
        } catch (error) {
          setPeople([]);

          setPeopleError(getErrorMessage(error, "Unable to load users."));
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

  const hasDmCircles = dmConversations.length > 0 || notYetMessaged.length > 0;

  // "Search direct messages" filters the circles by name / username.
  const dmQuery = dmSearch.trim().toLowerCase();

  const matchesDm = (name?: string, username?: string) =>
    !dmQuery ||
    `${name || ""} ${username || ""}`.toLowerCase().includes(dmQuery);

  const visibleDmConversations = dmConversations.filter((chat) => {
    const username = chat.otherParticipant?.username || "";
    const followed = followingByUsername.get(username.toLowerCase());

    return matchesDm(followed?.name, username);
  });

  const visibleNotYetMessaged = notYetMessaged.filter((person) =>
    matchesDm(person.name, person.username),
  );

  return (
    <View style={styles.wrap}>
      {/* =========================
          YOUR SPACE
      ========================== */}

      <Text style={styles.section}>Your Space</Text>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={COLORS.brand} />

          <Text style={styles.loadingText}>Loading chats...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>

          <Pressable
            style={styles.retry}
            onPress={() => dispatch(fetchChats(token))}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : groupChats.length === 0 ? (
        <View style={styles.spaceEmpty}>
          <Ionicons
            name="chatbubbles-outline"
            size={24}
            color={COLORS.graphiteSoft}
          />

          <Text style={styles.emptyText}>No group chats yet</Text>
        </View>
      ) : (
        <View style={styles.spaceList}>
          {groupChats.map((chat) => {
            const faction =
              chat.type === "faction"
                ? FACTIONS.find((item) => item.id === chat.factionKey)
                : undefined;

            const tagline = faction
              ? FACTION_TAGLINE[chat.factionKey || ""]
              : "";

            const unread = chat.unreadCount || 0;

            return (
              <Pressable
                key={chat.id}
                style={styles.spaceItem}
                onPress={() => openChat(chat.id)}>
                {/* the grey card, starts under the art */}
                <View style={styles.spaceBg} />

                {/* the art: faction picture, or the Community picture */}
                <View style={styles.spaceArt} pointerEvents="none">
                  {faction?.image ? (
                    <Image
                      source={faction.image}
                      style={styles.spaceArtImage}
                      contentFit="contain"
                    />
                  ) : (
                    <CommunityCluster />
                  )}
                </View>

                {/* title / (faction type) / last message */}
                <View style={styles.spaceText} pointerEvents="none">
                  {faction?.label ? (
                    <Image
                      source={faction.label}
                      style={styles.spaceWordmark}
                      contentFit="contain"
                      contentPosition="left"
                    />
                  ) : (
                    <Text style={styles.spaceName} numberOfLines={1}>
                      {getGroupName(chat)}
                    </Text>
                  )}

                  {tagline ? (
                    <Text style={styles.spaceName} numberOfLines={1}>
                      ({tagline})
                    </Text>
                  ) : null}

                  <Text style={styles.spaceMeta} numberOfLines={1}>
                    {getLastMessage(chat)}
                  </Text>
                </View>

                {/* count circle + members */}
                {unread > 0 ? (
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: faction
                          ? BADGE_FACTION
                          : BADGE_COMMUNITY,
                      },
                    ]}>
                    <Text style={styles.badgeText}>
                      {unread > 99 ? "99+" : unread}
                    </Text>
                  </View>
                ) : null}

                <Text style={styles.members}>
                  {chat.memberCount || 0} Members
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* =========================
          DIRECT MESSAGE
          A row of round avatars (name under each) and a "+" button at the
          end that opens Find People - like the Figma.
      ========================== */}

      <View style={styles.dmSearch}>
        <Ionicons name="search" size={18} color={COLORS.graphiteSoft} />

        <TextInput
          value={dmSearch}
          onChangeText={setDmSearch}
          style={styles.dmSearchInput}
          placeholder="Search direct messages"
          placeholderTextColor={COLORS.graphiteSoft}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <Text style={[styles.section, styles.dmSection]}>Direct Message</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dmRow}>
        {visibleDmConversations.map((chat) => {
          const otherUsername = chat.otherParticipant?.username || "";

          const followedPerson = followingByUsername.get(
            otherUsername.toLowerCase(),
          );

          const avatarSource = followedPerson
            ? getAvatarSource(followedPerson)
            : chat.otherParticipant?.avatarPhotoUrl
              ? { uri: chat.otherParticipant.avatarPhotoUrl }
              : require("@/assets/images/dp-avatar.png");

          const displayName =
            followedPerson?.name || otherUsername || "Someone";

          return (
            <Pressable
              key={chat.id}
              style={styles.dmItem}
              onPress={() => openChat(chat.id)}>
              <View style={styles.dmCircle}>
                <Image
                  source={avatarSource}
                  style={styles.dmCircleImage}
                  contentFit="cover"
                />

                {chat.otherParticipant?.isOnline ? (
                  <View style={styles.onlineDot} />
                ) : null}

                {chat.unreadCount && chat.unreadCount > 0 ? (
                  <View style={styles.dmUnread}>
                    <Text style={styles.unreadText}>{chat.unreadCount}</Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.dmName} numberOfLines={1}>
                {displayName}
              </Text>
            </Pressable>
          );
        })}

        {visibleNotYetMessaged.map((person) => {
          const busy = startingChatWith === person.username;

          return (
            <Pressable
              key={person.id || person.username}
              style={styles.dmItem}
              disabled={busy}
              onPress={() => openOrCreateChat(person)}>
              <View style={styles.dmCircle}>
                <Image
                  source={getAvatarSource(person)}
                  style={styles.dmCircleImage}
                  contentFit="cover"
                />

                {isPersonOnline(person) ? (
                  <View style={styles.onlineDot} />
                ) : null}

                {busy ? (
                  <View style={styles.dmBusy}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  </View>
                ) : null}
              </View>

              <Text style={styles.dmName} numberOfLines={1}>
                {person.name || person.username}
              </Text>
            </Pressable>
          );
        })}

        {/* "+" : Find People */}
        <Pressable
          style={styles.dmItem}
          onPress={openPeople}
          accessibilityRole="button"
          accessibilityLabel="Find people">
          <View style={styles.plusCircle}>
            <View style={styles.plusH} />
            <View style={styles.plusV} />
          </View>
        </Pressable>

        {!hasDmCircles ? (
          <Text style={styles.dmHint}>Tap + to find people to chat with.</Text>
        ) : null}
      </ScrollView>

      {/* =========================
          FIND PEOPLE MODAL
      ========================== */}

      <Modal
        visible={peopleVisible}
        transparent
        animationType="slide"
        onRequestClose={closePeople}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            {/* MODAL HEADER */}

            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Find People</Text>

                <Text style={styles.modalSubtitle}>
                  Follow people and start connecting
                </Text>
              </View>

              <Pressable
                onPress={closePeople}
                hitSlop={10}
                style={styles.closeButton}>
                <Ionicons name="close" size={21} color={COLORS.ink} />
              </Pressable>
            </View>

            {/* SEARCH */}

            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color={COLORS.graphiteSoft} />

              <TextInput
                value={search}
                onChangeText={setSearch}
                style={styles.searchInput}
                placeholder="Search by username..."
                placeholderTextColor={COLORS.graphiteSoft}
                autoCapitalize="none"
                autoCorrect={false}
              />

              {search.length > 0 ? (
                <Pressable onPress={() => setSearch("")}>
                  <Ionicons
                    name="close-circle"
                    size={17}
                    color={COLORS.graphiteSoft}
                  />
                </Pressable>
              ) : null}
            </View>

            {/* RESULT TITLE */}

            <View style={styles.peopleTitleRow}>
              <Text style={styles.peopleTitle}>
                {search.trim() ? "Search Results" : "People on CosQuest"}
              </Text>

              {people.length > 0 ? (
                <Text style={styles.peopleCount}>{people.length}</Text>
              ) : null}
            </View>

            {/* LOADING */}

            {peopleLoading ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="small" color={COLORS.brand} />

                <Text style={styles.loadingText}>Finding people...</Text>
              </View>
            ) : null}

            {/* ERROR */}

            {!peopleLoading && peopleError ? (
              <View style={styles.modalError}>
                <Ionicons
                  name="alert-circle-outline"
                  size={32}
                  color={COLORS.danger}
                />

                <Text style={styles.modalErrorTitle}>Couldn't load people</Text>

                <Text style={styles.modalErrorText}>{peopleError}</Text>

                <Pressable
                  style={styles.retryPeople}
                  onPress={() => {
                    setSearch((value) => value.trim());
                  }}>
                  <Text style={styles.retryPeopleText}>Try Again</Text>
                </Pressable>
              </View>
            ) : null}

            {/* USERS */}

            {!peopleLoading && !peopleError && people.length > 0 ? (
              <ScrollView
                style={styles.peopleList}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled">
                {people.map((person) => {
                  const isFollowing = followingUsernames.has(
                    person.username.toLowerCase(),
                  );

                  const busy =
                    processingUsername === person.username ||
                    startingChatWith === person.username;

                  return (
                    <View key={person.id} style={styles.personCard}>
                      <View style={styles.personAvatarWrap}>
                        <Image
                          source={getAvatarSource(person)}
                          style={styles.personAvatar}
                          contentFit="cover"
                        />

                        {isPersonOnline(person) ? (
                          <View style={styles.personOnlineRing} />
                        ) : null}
                      </View>

                      <View style={styles.personInfo}>
                        <Text style={styles.personName} numberOfLines={1}>
                          {person.name || person.username}
                        </Text>

                        <Text style={styles.personUsername} numberOfLines={1}>
                          @{person.username}
                        </Text>

                        {person.faction ? (
                          <Text style={styles.personFaction} numberOfLines={1}>
                            {person.faction}
                          </Text>
                        ) : null}
                      </View>

                      <View style={styles.personActions}>
                        <Pressable
                          disabled={busy}
                          style={[
                            styles.followButton,
                            isFollowing
                              ? styles.followingButton
                              : styles.followButtonPrimary,
                            busy && styles.disabledButton,
                          ]}
                          onPress={() => handleFollow(person)}>
                          {processingUsername === person.username ? (
                            <ActivityIndicator
                              size="small"
                              color={isFollowing ? COLORS.ink : "#FFFFFF"}
                            />
                          ) : (
                            <Text
                              style={
                                isFollowing
                                  ? styles.followingButtonText
                                  : styles.followButtonText
                              }>
                              {isFollowing ? "Following" : "Follow"}
                            </Text>
                          )}
                        </Pressable>

                        {isFollowing ? (
                          <Pressable
                            disabled={busy}
                            style={[
                              styles.messageButton,
                              busy && styles.disabledButton,
                            ]}
                            onPress={() => handleMessage(person)}>
                            {startingChatWith === person.username ? (
                              <ActivityIndicator
                                size="small"
                                color={COLORS.ink}
                              />
                            ) : (
                              <Ionicons
                                name="chatbubble-outline"
                                size={16}
                                color={COLORS.ink}
                              />
                            )}
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            ) : null}

            {/* NO RESULTS */}

            {!peopleLoading &&
            !peopleError &&
            people.length === 0 &&
            search.trim() ? (
              <View style={styles.noPeople}>
                <Ionicons
                  name="search-outline"
                  size={36}
                  color={COLORS.graphiteSoft}
                />

                <Text style={styles.noPeopleTitle}>No users found</Text>

                <Text style={styles.noPeopleText}>Try another username.</Text>
              </View>
            ) : null}

            {/* EMPTY BACKEND RESULT */}

            {!peopleLoading &&
            !peopleError &&
            people.length === 0 &&
            !search.trim() ? (
              <View style={styles.noPeople}>
                <Ionicons
                  name="people-outline"
                  size={36}
                  color={COLORS.graphiteSoft}
                />

                <Text style={styles.noPeopleTitle}>No people to show</Text>

                <Text style={styles.noPeopleText}>
                  Search for a username to find someone.
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
  },

  // Plain headings, no divider lines (Figma).
  section: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: "#55555F",
    paddingLeft: 8,
    marginTop: 4,
    marginBottom: 10,
  },

  dmSection: {
    marginTop: 18,
  },

  loading: {
    minHeight: 80,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },

  loadingText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.graphiteSoft,
  },

  errorBox: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: COLORS.dangerSoft,
  },

  errorText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.danger,
    textAlign: "center",
  },

  retry: {
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: COLORS.brand,
  },

  retryText: {
    fontFamily: FONTS.bold,
    color: "#FFFFFF",
    fontSize: 12,
  },

  emptyText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.graphiteSoft,
  },

  /* YOUR SPACE - one card per chat (Figma specs above) */

  spaceList: {
    gap: CARD_GAP,
  },

  spaceEmpty: {
    minHeight: 84,
    borderRadius: CARD_RADIUS,
    backgroundColor: CARD_BG,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  spaceItem: {
    height: ART_SIZE,
    position: "relative",
  },

  spaceBg: {
    position: "absolute",
    left: CARD_LEFT,
    right: 0,
    top: CARD_TOP,
    height: CARD_HEIGHT,
    borderRadius: CARD_RADIUS,
    backgroundColor: CARD_BG,
  },

  spaceArt: {
    position: "absolute",
    left: 0,
    top: 0,
    width: ART_SIZE,
    height: ART_SIZE,
  },

  spaceArtImage: {
    width: ART_SIZE,
    height: ART_SIZE,
  },

  cluster: {
    width: ART_SIZE,
    height: ART_SIZE,
  },

  clusterAvatar: {
    position: "absolute",
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    backgroundColor: "#F1E4EE",
  },

  spaceText: {
    position: "absolute",
    left: TEXT_LEFT,
    right: 44,
    top: CARD_TOP,
    height: CARD_HEIGHT,
    justifyContent: "center",
    gap: 2,
  },

  spaceWordmark: {
    width: 64,
    height: 18,
  },

  spaceName: {
    fontFamily: FONTS.bold,
    fontSize: 11,
    color: COLORS.ink,
  },

  spaceMeta: {
    fontFamily: FONTS.regular,
    fontSize: 10,
    color: COLORS.graphiteSoft,
  },

  badge: {
    position: "absolute",
    right: BADGE_RIGHT,
    top: BADGE_TOP,
    minWidth: BADGE_WIDTH,
    height: BADGE_HEIGHT,
    borderRadius: BADGE_HEIGHT / 2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },

  badgeText: {
    fontFamily: FONTS.bold,
    fontSize: 9,
    color: "#FFFFFF",
  },

  members: {
    position: "absolute",
    right: 10,
    bottom: 8,
    fontFamily: FONTS.medium,
    fontSize: 7,
    color: COLORS.graphiteSoft,
  },

  unreadText: {
    fontFamily: FONTS.bold,
    fontSize: 10,
    color: "#FFFFFF",
  },

  /* SEARCH DIRECT MESSAGES
     Figma: 355 x 44, radius 22, padding 12 / 14, gap 10,
     background #FFFFFF1A (white 10%), shadow 0 2 4 #0000001A */

  dmSearch: {
    height: 44,
    marginTop: 24,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: GLASS_BG,

    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  dmSearchInput: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.ink,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  /* DIRECT MESSAGE - round avatars, 53 x 54, 72 apart */

  dmRow: {
    alignItems: "flex-start",
    gap: DM_GAP,
    paddingLeft: 10,
    paddingRight: 10,
    paddingBottom: 6,
  },

  dmItem: {
    width: DM_CIRCLE_W,
    alignItems: "center",
  },

  dmCircle: {
    width: DM_CIRCLE_W,
    height: DM_CIRCLE_H,
    borderRadius: DM_CIRCLE_H / 2,
    backgroundColor: DM_CIRCLE_BG,
    position: "relative",

    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },

  dmCircleImage: {
    width: DM_CIRCLE_W,
    height: DM_CIRCLE_H,
    borderRadius: DM_CIRCLE_H / 2,
  },

  dmName: {
    marginTop: 6,
    maxWidth: 64,
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: "#777780",
    textAlign: "center",
  },

  // Green "online" dot, bottom-right of the circle.
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
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.brand,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },

  dmBusy: {
    ...StyleSheet.absoluteFill,
    borderRadius: DM_CIRCLE_H / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },

  // Figma: 53 x 54 at left 323 - the same see-through look as the search
  // bar (white 10%, shadow 0 2 4 #0000001A).
  plusCircle: {
    width: DM_CIRCLE_W,
    height: DM_CIRCLE_H,
    borderRadius: DM_CIRCLE_H / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GLASS_BG,

    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  // bold plus drawn with two bars: 23 x 23, #9A9AA3
  plusH: {
    position: "absolute",
    left: (DM_CIRCLE_W - PLUS_SIZE) / 2,
    top: (DM_CIRCLE_H - 6) / 2,
    width: PLUS_SIZE,
    height: 6,
    borderRadius: 2,
    backgroundColor: PLUS_COLOR,
  },

  plusV: {
    position: "absolute",
    left: (DM_CIRCLE_W - 6) / 2,
    top: (DM_CIRCLE_H - PLUS_SIZE) / 2,
    width: 6,
    height: PLUS_SIZE,
    borderRadius: 2,
    backgroundColor: PLUS_COLOR,
  },

  dmHint: {
    alignSelf: "center",
    maxWidth: 150,
    fontFamily: FONTS.regular,
    fontSize: 11.5,
    lineHeight: 16,
    color: COLORS.graphiteSoft,
  },

  /* =========================
     MODAL
  ========================== */

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15,16,22,0.45)",
    justifyContent: "flex-end",
  },

  modal: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    minHeight: "72%",
    maxHeight: "90%",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 30,
  },

  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },

  modalTitle: {
    fontFamily: FONTS.bold,
    fontSize: 19,
    color: COLORS.ink,
  },

  modalSubtitle: {
    marginTop: 3,
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.graphiteSoft,
  },

  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.hairlineSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "#FFFFFF",
    borderRadius: 11,
    borderWidth: 1,
    borderColor: COLORS.hairline,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },

  searchInput: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.ink,
    padding: 0,
  },

  peopleTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
    marginBottom: 8,
  },

  peopleTitle: {
    fontFamily: FONTS.bold,
    fontSize: 13,
    color: COLORS.graphite,
  },

  peopleCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: COLORS.hairlineSoft,
    color: COLORS.graphite,
    fontFamily: FONTS.bold,
    fontSize: 11,
    textAlign: "center",
    paddingTop: 4,
  },

  modalLoading: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 35,
    gap: 9,
  },

  modalError: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 35,
    paddingHorizontal: 25,
  },

  modalErrorTitle: {
    marginTop: 9,
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: COLORS.ink,
  },

  modalErrorText: {
    marginTop: 5,
    fontFamily: FONTS.regular,
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.graphiteSoft,
    textAlign: "center",
  },

  retryPeople: {
    marginTop: 12,
    backgroundColor: COLORS.brand,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9,
  },

  retryPeopleText: {
    fontFamily: FONTS.bold,
    color: "#FFFFFF",
    fontSize: 12,
  },

  peopleList: {
    flex: 1,
  },

  personCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.hairlineSoft,
  },

  personAvatarWrap: {
    width: 46,
    height: 46,
    position: "relative",
  },

  personAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.hairlineSoft,
  },

  personOnlineRing: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: COLORS.online,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  personInfo: {
    flex: 1,
    marginLeft: 11,
    marginRight: 8,
  },

  personName: {
    fontFamily: FONTS.semibold,
    fontSize: 14,
    color: COLORS.ink,
  },

  personUsername: {
    marginTop: 2,
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.graphiteSoft,
  },

  personFaction: {
    marginTop: 2,
    fontFamily: FONTS.semibold,
    fontSize: 10,
    color: COLORS.brand,
  },

  personActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  followButton: {
    minWidth: 84,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },

  // Follow is the one real per-row primary action, so it earns the solid
  // fill; everything after that state (Following) steps back to outline.
  followButtonPrimary: {
    backgroundColor: COLORS.brand,
  },

  followingButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: COLORS.hairline,
  },

  followButtonText: {
    fontFamily: FONTS.bold,
    fontSize: 12.5,
    color: "#FFFFFF",
  },

  followingButtonText: {
    fontFamily: FONTS.semibold,
    fontSize: 12.5,
    color: COLORS.graphite,
  },

  messageButton: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: COLORS.hairline,
    alignItems: "center",
    justifyContent: "center",
  },

  disabledButton: {
    opacity: 0.55,
  },

  noPeople: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 45,
    paddingHorizontal: 25,
  },

  noPeopleTitle: {
    marginTop: 10,
    fontFamily: FONTS.bold,
    fontSize: 15,
    color: COLORS.ink,
  },

  noPeopleText: {
    marginTop: 5,
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: COLORS.graphiteSoft,
    textAlign: "center",
  },
});
