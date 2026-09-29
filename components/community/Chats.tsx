import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AVATARS } from "@/constants/avatars";
import { apiRequest } from "@/services/api";
import { FollowUser } from "@/services/follow";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { createChat, fetchChats } from "@/store/thunks/chatThunks";
import { fetchFollowing, followUserThunk } from "@/store/thunks/followThunks";

// ==========================================
// DESIGN TOKENS
// ==========================================
// One accent (brand pink) reserved for attention-states and the single
// primary action per screen — everything else runs on ink/graphite/
// hairline neutrals so the screen reads as one considered surface rather
// than "pink decorating everything." Radii are pulled back from "pill"
// toward "rounded rectangle" throughout — the softer, less bubbly
// language reads more like a considered product than a consumer feed.
const COLORS = {
  ink: "#171922",
  graphite: "#5D5F6B",
  graphiteSoft: "#8A8A93",
  hairline: "rgba(23,25,34,0.12)",
  hairlineSoft: "rgba(23,25,34,0.07)",
  surface: "rgba(255,255,255,0.70)",
  surfaceSoft: "rgba(255,255,255,0.42)",
  brand: "#C5399A",
  brandSoft: "rgba(197,57,154,0.10)",
  brandBorder: "rgba(197,57,154,0.35)",
  navy: "#171922",
  danger: "#B42318",
  dangerSoft: "rgba(255,80,80,0.08)",
  // Green "online" dot, same as the chat screen header.
  online: "#25D366",
};

// Real per-faction accent colors — same ones already established in the
// faction description modal (onboarding). A faction chat's icon uses its
// own faction's actual color instead of a flat, generic tone, so the
// list ties directly into CosQuest's own identity system rather than
// decorating it with an unrelated color. Community chats (not tied to a
// specific faction) fall back to the ink/navy tone.
const FACTION_ACCENTS: Record<string, string> = {
  ascendants: "#C5499D",
  icons: "#C5499D",
  controllers: "#C5499D",
  blockbusters: "#E48600",
  everborn: "#08A878",
  celestials: "#16A7E0",
};

function getGroupIconColor(chat: {
  type?: "community" | "faction" | "dm";
  factionKey?: string;
}): string {
  if (chat.type === "faction" && chat.factionKey) {
    return FACTION_ACCENTS[chat.factionKey] || COLORS.navy;
  }

  return COLORS.navy;
}

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

// Short relative label for a DM's last message — "2m", "5h", "Yesterday",
// or a short date once it's more than a week old. Deliberately terse:
// this sits in a list row, not a detail view.
function formatShortRelativeTime(value?: string): string {
  if (!value) {
    return "";
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return "";
  }

  const diffMs = Date.now() - timestamp;

  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) {
    return "now";
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.floor(hours / 24);

  if (days === 1) {
    return "Yesterday";
  }

  if (days < 7) {
    return `${days}d`;
  }

  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

// ==========================================
// ERROR MESSAGE HELPER
// ==========================================
// RTK thunks that use rejectWithValue(someString) throw that raw string
// directly when you call .unwrap() on a rejected result — NOT an Error
// instance. Every catch block in this file that did
// `error instanceof Error ? error.message : "generic fallback"` was
// therefore always hitting the fallback branch for thunk failures,
// silently discarding whatever real message the backend sent (e.g. "This
// user is not accepting direct messages.") and showing a useless generic
// string instead. This handles both shapes so the real backend message
// actually reaches the person using the app.
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

  // Global typing state (see useSocketConnection.ts) — lets a
  // conversation you haven't opened yet still show "typing..." in the
  // list, the same way WhatsApp's chat list does.
  const typingByConversation = useAppSelector(
    (state) => state.chat.typingByConversation,
  );

  const [peopleVisible, setPeopleVisible] = useState(false);

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

  // Real DM threads — this is what "Direct Message" should actually show
  // first: conversations that exist, most recent activity on top. Not
  // everyone you follow with identical rows regardless of whether you've
  // ever messaged them.
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

  // So a DM row can show the real avatar even though the conversation
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

  // People you follow but haven't actually started a conversation with —
  // a lighter, secondary "start chatting" list underneath real threads.
  const notYetMessaged = following.filter(
    (person) => !messagedUsernames.has(person.username.toLowerCase()),
  );

  /*
   * Open an existing DM with this person if one is already loaded, otherwise
   * create one via POST /api/chats/dm (through the createChat thunk), then
   * navigate into it. Shared by the "Message" icon in Find People and by
   * tapping an avatar in the Direct Message row.
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
        // This specific fallback used to be the ONLY message anyone ever
        // saw here, because the catch below couldn't tell a real backend
        // rejection from this local "id came back empty" case. If you
        // still hit this exact message after the getErrorMessage fix
        // below, it means createChat actually resolved successfully but
        // the response had no usable id — see the note further down.
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

  const getGroupIcon = (type: ChatItem["type"]) => {
    if (type === "faction") {
      return "shield-outline" as const;
    }

    return "globe-outline" as const;
  };

  const getGroupName = (chat: ChatItem) => {
    if (chat.type === "community") {
      return chat.title || "Community";
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

  return (
    <View style={styles.wrap}>
      {/* =========================
          YOUR SPACE
      ========================== */}

      <View style={styles.sectionHeader}>
        <Text style={styles.section}>Your Space</Text>
      </View>

      <View style={styles.sectionRule} />

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
        <View style={styles.emptyCard}>
          <Ionicons
            name="chatbubbles-outline"
            size={26}
            color={COLORS.graphiteSoft}
          />

          <Text style={styles.emptyText}>No group chats yet</Text>
        </View>
      ) : (
        <View style={styles.rosterCard}>
          {groupChats.map((chat, index) => (
            <Pressable
              key={chat.id}
              style={[styles.rosterRow, index > 0 && styles.rosterDivider]}
              onPress={() => openChat(chat.id)}>
              <View
                style={[
                  styles.groupIcon,
                  { backgroundColor: getGroupIconColor(chat) },
                ]}>
                <Ionicons
                  name={getGroupIcon(chat.type)}
                  size={19}
                  color="#FFFFFF"
                />
              </View>

              <View style={styles.rosterText}>
                <Text style={styles.rosterName} numberOfLines={1}>
                  {getGroupName(chat)}
                </Text>

                <Text style={styles.rosterMeta} numberOfLines={1}>
                  {getLastMessage(chat)}
                </Text>
              </View>

              <View style={styles.rosterRight}>
                <Text style={styles.memberCountText}>
                  {chat.memberCount || 0} members
                </Text>

                {chat.unreadCount && chat.unreadCount > 0 ? (
                  <View style={styles.unread}>
                    <Text style={styles.unreadText}>{chat.unreadCount}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {/* =========================
          DIRECT MESSAGE
          Real conversation threads first — sorted by recency, with an
          actual last-message preview and timestamp — the same pattern a
          considered messaging product (Slack, iMessage) uses. People you
          follow but haven't messaged yet sit in a lighter, secondary list
          underneath rather than being mixed in as identical rows.
      ========================== */}

      <View style={styles.dmSectionHeader}>
        <Text style={styles.section}>Direct Message</Text>

        <Pressable style={styles.findPeopleGhost} onPress={openPeople}>
          <Ionicons name="person-add-outline" size={14} color={COLORS.brand} />

          <Text style={styles.findPeopleGhostText}>Find People</Text>
        </Pressable>
      </View>

      <View style={styles.sectionRule} />

      {dmConversations.length === 0 && following.length === 0 ? (
        <View style={styles.emptyDmCard}>
          <View style={styles.peopleIconCircle}>
            <Ionicons name="people-outline" size={28} color={COLORS.brand} />
          </View>

          <Text style={styles.emptyDmTitle}>Find your people</Text>

          <Text style={styles.emptyDmDescription}>
            Discover CosQuest users, follow them and start chatting.
          </Text>

          <Pressable style={styles.findPeopleLarge} onPress={openPeople}>
            <Text style={styles.findPeopleLargeText}>Find People</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {dmConversations.length > 0 ? (
            <View style={styles.rosterCard}>
              {dmConversations.map((chat, index) => {
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

                const isTyping = !!typingByConversation[chat.id];

                const previewText = isTyping
                  ? "typing..."
                  : chat.lastMessage
                    ? `${
                        chat.lastMessage.senderName
                          ? `${chat.lastMessage.senderName}: `
                          : ""
                      }${chat.lastMessage.preview || "Message"}`
                    : "No messages yet";

                return (
                  <Pressable
                    key={chat.id}
                    style={[
                      styles.rosterRow,
                      index > 0 && styles.rosterDivider,
                    ]}
                    onPress={() => openChat(chat.id)}>
                    <View style={styles.dmAvatarWrap}>
                      <Image
                        source={avatarSource}
                        style={styles.dmAvatarImage}
                        contentFit="cover"
                      />

                      {chat.otherParticipant?.isOnline ? (
                        <View style={styles.onlineRing} />
                      ) : null}
                    </View>

                    <View style={styles.rosterText}>
                      <Text style={styles.rosterName} numberOfLines={1}>
                        {displayName}
                      </Text>

                      <Text
                        style={[
                          styles.rosterMeta,
                          isTyping && styles.rosterMetaTyping,
                        ]}
                        numberOfLines={1}>
                        {previewText}
                      </Text>
                    </View>

                    <View style={styles.rosterRight}>
                      {chat.lastMessage?.createdAt ? (
                        <Text style={styles.dmTimeText}>
                          {formatShortRelativeTime(chat.lastMessage.createdAt)}
                        </Text>
                      ) : null}

                      {chat.unreadCount && chat.unreadCount > 0 ? (
                        <View style={styles.unread}>
                          <Text style={styles.unreadText}>
                            {chat.unreadCount}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {notYetMessaged.length > 0 ? (
            <>
              <Text style={styles.subSection}>
                {dmConversations.length > 0
                  ? "People you follow"
                  : "Message someone you follow"}
              </Text>

              <View style={styles.rosterCardQuiet}>
                {notYetMessaged.map((person, index) => {
                  const busy = startingChatWith === person.username;

                  return (
                    <Pressable
                      key={person.id || person.username}
                      style={[
                        styles.rosterRow,
                        index > 0 && styles.rosterDivider,
                      ]}
                      disabled={busy}
                      onPress={() => openOrCreateChat(person)}>
                      <View style={styles.dmAvatarWrapSmall}>
                        <Image
                          source={getAvatarSource(person)}
                          style={styles.dmAvatarImageSmall}
                          contentFit="cover"
                        />

                        {isPersonOnline(person) ? (
                          <View style={styles.onlineRingSmall} />
                        ) : null}
                      </View>

                      <View style={styles.rosterText}>
                        <Text style={styles.rosterNameQuiet} numberOfLines={1}>
                          {person.name || person.username}
                        </Text>
                      </View>

                      {busy ? (
                        <ActivityIndicator size="small" color={COLORS.brand} />
                      ) : (
                        <Ionicons
                          name="chatbubble-outline"
                          size={16}
                          color={COLORS.graphiteSoft}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}
        </>
      )}

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

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  dmSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },

  section: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.ink,
    marginTop: 14,
    marginBottom: 6,
  },

  // A real structural device, not decoration — separates each section
  // from its content with a deliberate line rather than empty space.
  sectionRule: {
    height: 1,
    backgroundColor: COLORS.hairline,
    marginBottom: 10,
  },

  loading: {
    minHeight: 80,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },

  loadingText: {
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
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },

  emptyCard: {
    minHeight: 84,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.hairlineSoft,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },

  emptyText: {
    fontSize: 12,
    color: COLORS.graphiteSoft,
  },

  // ROSTER — the one shared list pattern used for both group chats and
  // direct messages, instead of two different visual metaphors.
  rosterCard: {
    backgroundColor: COLORS.surfaceSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.hairlineSoft,
    paddingHorizontal: 14,
  },

  rosterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
  },

  rosterDivider: {
    borderTopWidth: 1,
    borderTopColor: COLORS.hairlineSoft,
  },

  rosterText: {
    flex: 1,
  },

  rosterName: {
    fontSize: 14.5,
    fontWeight: "600",
    color: COLORS.ink,
  },

  rosterMeta: {
    fontSize: 12,
    color: COLORS.graphiteSoft,
    marginTop: 2,
  },

  rosterMetaTyping: {
    color: COLORS.brand,
    fontWeight: "600",
  },

  rosterRight: {
    alignItems: "flex-end",
    gap: 4,
  },

  groupIcon: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: COLORS.navy,
    alignItems: "center",
    justifyContent: "center",
  },

  memberCountText: {
    fontSize: 10.5,
    color: COLORS.graphiteSoft,
    fontWeight: "500",
  },

  unread: {
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: COLORS.brand,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },

  unreadText: {
    fontSize: 10,
    color: "#FFFFFF",
    fontWeight: "700",
  },

  findPeopleGhost: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: COLORS.brandBorder,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
  },

  findPeopleGhostText: {
    color: COLORS.brand,
    fontSize: 11.5,
    fontWeight: "600",
  },

  emptyDmCard: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 26,
    paddingHorizontal: 25,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.hairlineSoft,
  },

  peopleIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: COLORS.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyDmTitle: {
    marginTop: 13,
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.ink,
  },

  emptyDmDescription: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.graphiteSoft,
    textAlign: "center",
    maxWidth: 260,
  },

  // The one deliberately bold moment on this screen — a genuine first-use
  // empty-state CTA, so it earns the solid fill the rest of the screen
  // avoids.
  findPeopleLarge: {
    marginTop: 16,
    backgroundColor: COLORS.brand,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 11,
  },

  findPeopleLargeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },

  dmAvatarWrap: {
    width: 44,
    height: 44,
    position: "relative",
  },

  dmAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.brandSoft,
  },

  // Green "online" dot on the bottom-right of the avatar, WhatsApp-style.
  // (Kept the old style names so the JSX above didn't need to change.)
  onlineRing: {
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

  dmTimeText: {
    fontSize: 11,
    color: COLORS.graphiteSoft,
  },

  // Secondary heading for the "people you follow but haven't messaged"
  // list — deliberately quieter than the main section labels so it reads
  // as a lesser, discovery-oriented list rather than competing with real
  // conversations above it.
  subSection: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.graphiteSoft,
    marginTop: 16,
    marginBottom: 8,
  },

  rosterCardQuiet: {
    backgroundColor: "transparent",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.hairlineSoft,
    paddingHorizontal: 14,
  },

  dmAvatarWrapSmall: {
    width: 34,
    height: 34,
    position: "relative",
  },

  dmAvatarImageSmall: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.brandSoft,
  },

  onlineRingSmall: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: COLORS.online,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  rosterNameQuiet: {
    fontSize: 13.5,
    fontWeight: "500",
    color: COLORS.graphite,
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
    fontSize: 19,
    fontWeight: "700",
    color: COLORS.ink,
  },

  modalSubtitle: {
    marginTop: 3,
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
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.graphite,
  },

  peopleCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: COLORS.hairlineSoft,
    color: COLORS.graphite,
    fontSize: 11,
    fontWeight: "700",
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
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.ink,
  },

  modalErrorText: {
    marginTop: 5,
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
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
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
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.ink,
  },

  personUsername: {
    marginTop: 2,
    fontSize: 12,
    color: COLORS.graphiteSoft,
  },

  personFaction: {
    marginTop: 2,
    fontSize: 10,
    color: COLORS.brand,
    fontWeight: "600",
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
    fontSize: 12.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },

  followingButtonText: {
    fontSize: 12.5,
    fontWeight: "600",
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
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.ink,
  },

  noPeopleText: {
    marginTop: 5,
    fontSize: 12,
    color: COLORS.graphiteSoft,
    textAlign: "center",
  },
});
