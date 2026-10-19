import { AVATARS } from "@/constants/avatars";
import type { AppNotificationItem } from "@/services/notifications";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  followUserThunk,
  unfollowUserThunk,
} from "@/store/thunks/followThunks";
import {
  fetchNotifications,
  markNotificationsRead,
} from "@/store/thunks/notificationThunks";

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { safeBack } from "@/utils/safeBack";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import DesktopNotifications from "@/components/desktop/DesktopNotifications";
import { ScreenGradient } from "@/components/chat/ui";
import { FONTS } from "@/constants/fonts";
import { useIsDesktop } from "@/hooks/useDesktop";

function getAvatarSource(actor: AppNotificationItem["actor"]) {
  if (actor?.avatarPhotoUrl) {
    return { uri: actor.avatarPhotoUrl };
  }

  const preset = AVATARS.find((avatar) => avatar.id === actor?.avatarKey);

  return preset?.source || require("@/assets/images/dp-avatar.png");
}

// Same style as CommentItem's getTime — a relative "X min/hours/days ago"
// label, falling back to a plain date once it's more than a week old.
function getTimeAgo(createdAt?: string) {
  if (!createdAt) {
    return "";
  }

  const createdTime = new Date(createdAt).getTime();

  if (Number.isNaN(createdTime)) {
    return "";
  }

  const minutes = Math.floor(Math.max(0, Date.now() - createdTime) / 60000);

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  return new Date(createdTime).toLocaleDateString();
}

function NotificationRow({
  item,
  following,
  followBusy,
  onToggleFollow,
  onOpen,
}: {
  // Mention notifications: opens the chat.
  onOpen?: () => void;
  item: AppNotificationItem;
  following: boolean;
  followBusy: boolean;
  onToggleFollow: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const isFollowNotification = item.type === "follow" && !!item.actor;

  return (
    <Pressable
      onPress={onOpen}
      disabled={!onOpen}
      style={[styles.row, !item.read && styles.rowUnread]}>
      <Image
        source={getAvatarSource(item.actor)}
        style={styles.avatar}
        contentFit="cover"
      />

      <View style={styles.rowText}>
        <Text style={styles.body}>
          {item.actor?.username && item.type !== "mention" ? (
            <Text style={styles.handle}>@{item.actor.username} </Text>
          ) : null}
          {item.message || ""}
        </Text>

        <Text style={styles.time}>{getTimeAgo(item.createdAt)}</Text>
      </View>

      {isFollowNotification ? (
        <Pressable
          style={[
            styles.followBtn,
            following && styles.followingBtn,
            followBusy && styles.followBtnDisabled,
          ]}
          disabled={followBusy}
          onPress={onToggleFollow}>
          {followBusy ? (
            <ActivityIndicator size="small" color={ink.text("#FFFFFF")} />
          ) : (
            <Text style={following ? styles.followingText : styles.followText}>
              {following ? "Following" : "Follow"}
            </Text>
          )}
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export default function Notifications() {
  const styles = useThemedStyles(STYLE_PAIR);
  // Computers: a centred column.
  const desktop = useIsDesktop();
  const ink = useInk();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const token = useAppSelector((state) => state.auth.token);

  const notifications = useAppSelector(
    (state) => state.notification.notifications,
  );

  const loading = useAppSelector((state) => state.notification.loading);

  const error = useAppSelector((state) => state.notification.error);

  const following = useAppSelector((state) => state.follow.following);

  const followingUsernames = useMemo(
    () => new Set(following.map((person) => person.username.toLowerCase())),
    [following],
  );

  const [busyUsernames, setBusyUsernames] = useState<Record<string, boolean>>(
    {},
  );

  useEffect(() => {
    if (!token) {
      return;
    }

    dispatch(fetchNotifications(token));

    // Opening this screen is what "reads" the list — mirrors the
    // existing markNotificationsRead thunk that was already built but
    // never actually called anywhere.
    dispatch(markNotificationsRead(token));
  }, [dispatch, token]);

  async function handleToggleFollow(username?: string) {
    if (!token || !username) {
      return;
    }

    const isFollowing = followingUsernames.has(username.toLowerCase());

    setBusyUsernames((current) => ({ ...current, [username]: true }));

    try {
      if (isFollowing) {
        await dispatch(unfollowUserThunk({ username, token })).unwrap();
      } else {
        await dispatch(followUserThunk({ username, token })).unwrap();
      }
    } catch {
      // Errors are already surfaced via state.follow.error elsewhere;
      // this screen just needs to stop showing a spinner either way.
    } finally {
      setBusyUsernames((current) => {
        const updated = { ...current };

        delete updated[username];

        return updated;
      });
    }
  }

  if (desktop) {
    return (
      <DesktopNotifications
        notifications={notifications}
        loading={loading}
        error={error}
        onRetry={() => token && dispatch(fetchNotifications(token))}
        isFollowing={(username) => !!username && followingUsernames.has(username.toLowerCase())}
        isBusy={(username) => !!username && !!busyUsernames[username]}
        onToggleFollow={(username) => handleToggleFollow(username)}
      />
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: desktop ? 20 : insets.top + 8 }]}>
      <ScreenGradient />
      <View style={[styles.column, desktop && styles.columnDesktop]}>
      <View style={styles.header}>
        <Pressable onPress={() => safeBack()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={ink.text("#191922")} />
        </Pressable>

        <Text style={styles.headerTitle}>Notifications</Text>

        <View style={{ width: 24 }} />
      </View>

      {loading && notifications.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color={ink.text("#C5399A")} />

          <Text style={styles.centerText}>Loading notifications...</Text>
        </View>
      ) : null}

      {error && notifications.length === 0 && !loading ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>

          <Pressable
            onPress={() => token && dispatch(fetchNotifications(token))}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && !error && notifications.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="notifications-outline" size={38} color={ink.text("#9C9CAA")} />

          <Text style={styles.emptyTitle}>No notifications yet</Text>
        </View>
      ) : null}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationRow
            item={item}
            following={
              !!item.actor?.username &&
              followingUsernames.has(item.actor.username.toLowerCase())
            }
            followBusy={
              !!item.actor?.username && !!busyUsernames[item.actor.username]
            }
            onToggleFollow={() => handleToggleFollow(item.actor?.username)}
            onOpen={
              item.conversationId
                ? () =>
                    router.push({
                      pathname: "/chat/[id]",
                      params: { id: item.conversationId! },
                    })
                : undefined
            }
          />
        )}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, gap: 10 }}
        showsVerticalScrollIndicator={false}
      />
      </View>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    screen: { flex: 1 },
    column: { flex: 1, width: "100%", paddingHorizontal: 16 },
    // Computers: a readable column in the middle.
    columnDesktop: { maxWidth: 720, alignSelf: "center", paddingHorizontal: 24 },

    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
    headerTitle: { flex: 1, textAlign: "center", fontFamily: FONTS.semibold, fontSize: 18, color: "#191922" },

    center: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 8 },
    centerText: { fontFamily: FONTS.regular, fontSize: 12, color: "#79797E" },
    errorText: { fontFamily: FONTS.regular, fontSize: 13, color: "#B42318", textAlign: "center" },
    retryText: { marginTop: 4, fontFamily: FONTS.semibold, fontSize: 13, color: "#C5399A" },
    emptyTitle: { marginTop: 8, fontFamily: FONTS.medium, fontSize: 14, color: "#5F606B" },

    // Solid cards, so the text reads in light and dark mode.
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: "#FFFFFF",
      borderRadius: 16,
      borderWidth: 1,
      borderColor: "rgba(36,40,60,0.08)",
      paddingHorizontal: 14,
      paddingVertical: 12,
      shadowColor: "#000000",
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    rowUnread: { borderColor: "rgba(197,57,154,0.45)", backgroundColor: "#FDF3FA" },

    avatar: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: "#EEE",
      borderWidth: 2,
      borderColor: "rgba(197,57,154,0.5)",
    },
    rowText: { flex: 1, minWidth: 0 },
    body: { fontFamily: FONTS.regular, fontSize: 13.5, color: "#3A3A40", lineHeight: 20 },
    handle: { fontFamily: FONTS.semibold, color: "#191922" },
    time: { fontFamily: FONTS.regular, fontSize: 12, color: "#8A8A96", marginTop: 3 },

    followBtn: {
      minWidth: 92,
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 18,
      backgroundColor: "#C5399A",
    },
    followingBtn: { backgroundColor: "#F1E4EE" },
    followBtnDisabled: { opacity: 0.6 },
    followText: { fontFamily: FONTS.semibold, fontSize: 13, color: "#FFFFFF" },
    followingText: { fontFamily: FONTS.semibold, fontSize: 13, color: "#C5399A" },
  },
  // Dark mode
  {
    headerTitle: { color: "#F4F5FA" },
    centerText: { color: "#B5BBCB" },
    emptyTitle: { color: "#C9CEDA" },
    row: { backgroundColor: "#262838", borderColor: "rgba(255,255,255,0.08)" },
    rowUnread: { backgroundColor: "#33233A", borderColor: "rgba(197,57,154,0.55)" },
    avatar: { backgroundColor: "#343746" },
    body: { color: "#D9DCE6" },
    handle: { color: "#FFFFFF" },
    time: { color: "#9AA1B4" },
    followingBtn: { backgroundColor: "#3A2A3C" },
    followingText: { color: "#F29BD3" },
  },
);
