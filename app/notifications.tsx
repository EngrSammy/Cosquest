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
            <ActivityIndicator size="small" color="#FFFFFF" />
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

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => safeBack()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color="#191922" />
        </Pressable>

        <Text style={styles.headerTitle}>Notifications</Text>

        <View style={{ width: 24 }} />
      </View>

      {loading && notifications.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color="#C5399A" />

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
          <Ionicons name="notifications-outline" size={38} color="#9C9CAA" />

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
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: "#191922",
  },

  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 8,
  },

  centerText: { fontSize: 12, color: "#79797E" },

  errorText: { fontSize: 13, color: "#B42318", textAlign: "center" },

  retryText: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
    color: "#C5399A",
  },

  emptyTitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: "600",
    color: "#5F606B",
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },

  rowUnread: {
    borderColor: "rgba(197,57,154,0.45)",
    backgroundColor: "rgba(197,57,154,0.06)",
  },

  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#EEE",
    borderWidth: 2,
    borderColor: "rgba(197,57,154,0.5)",
  },
  rowText: { flex: 1 },
  body: { fontSize: 13.5, color: "#3a3a40", lineHeight: 19 },
  handle: { fontWeight: "700", color: "#191922" },
  time: { fontSize: 12, color: "#9C9CAA", marginTop: 3 },

  followBtn: {
    minWidth: 78,
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: "#C5399A",
  },
  followingBtn: { backgroundColor: "#191922" },
  followBtnDisabled: { opacity: 0.6 },
  followText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  followingText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
});
