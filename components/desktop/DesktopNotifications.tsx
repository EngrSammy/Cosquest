// ==========================================
// NOTIFICATIONS ON A COMPUTER
// ==========================================
// Two columns, like the other computer pages:
//   Main (720):  title + "N new", filter tabs (All · Follows · Mentions ·
//                Groups · CosQuest), notifications grouped by Today /
//                This week / Earlier in one card, each with a small icon for
//                its kind, the time in pink while new, and its action
//                (Follow / Following, Open chat).
//   Side (300):  what's in here (counts per kind, each one filters), and
//                notification settings.
// Phones keep app/notifications.tsx's own list.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { ScreenGradient } from "@/components/chat/ui";
import { AVATARS } from "@/constants/avatars";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import type { AppNotificationItem } from "@/services/notifications";

const PINK = "#C5399A";
const BLUE = "#2E9BF0";
const INK = "#191922";
const MUTED = "#6B6F80";

type Kind = "follow" | "mention" | "group" | "cosquest";
type Filter = "all" | Kind;

const KINDS: Record<Kind, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  follow: { label: "Follows", icon: "person-add", color: PINK },
  mention: { label: "Mentions", icon: "at", color: BLUE },
  group: { label: "Groups", icon: "people", color: BLUE },
  cosquest: { label: "CosQuest", icon: "sparkles", color: PINK },
};

function kindOf(item: AppNotificationItem): Kind {
  if (item.type === "follow") return "follow";
  if (item.type === "mention") return "mention";
  const text = `${item.type || ""} ${item.message || ""}`.toLowerCase();
  if (/group|join|squad|faction|invite|request/.test(text) && item.actor) return "group";
  return "cosquest";
}

function avatarOf(actor: AppNotificationItem["actor"]) {
  if (actor?.avatarPhotoUrl) return { uri: actor.avatarPhotoUrl };
  const preset = AVATARS.find((avatar) => avatar.id === actor?.avatarKey);
  return preset?.source || require("@/assets/images/dp-avatar.png");
}

function timeAgo(createdAt?: string) {
  const at = createdAt ? new Date(createdAt).getTime() : NaN;
  if (Number.isNaN(at)) return "";
  const minutes = Math.floor(Math.max(0, Date.now() - at) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(at).toLocaleDateString([], { day: "numeric", month: "short" });
}

function groupOf(createdAt?: string) {
  const at = createdAt ? new Date(createdAt) : null;
  if (!at || Number.isNaN(at.getTime())) return "Earlier";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (at >= today) return "Today";
  if (Date.now() - at.getTime() < 7 * 24 * 3600 * 1000) return "This week";
  return "Earlier";
}

// The backend writes the username into the message ("cena started following
// you."); the name is shown in bold in front, so it isn't repeated.
function messageWithoutName(item: AppNotificationItem) {
  const message = (item.message || "").trim();
  const name = item.actor?.username;
  if (name && message.toLowerCase().startsWith(name.toLowerCase())) return message.slice(name.length).trim();
  return message;
}

export default function DesktopNotifications({
  notifications,
  loading,
  error,
  onRetry,
  isFollowing,
  isBusy,
  onToggleFollow,
}: {
  notifications: AppNotificationItem[];
  loading: boolean;
  error: string | null | undefined;
  onRetry: () => void;
  isFollowing: (username?: string) => boolean;
  isBusy: (username?: string) => boolean;
  onToggleFollow: (username?: string) => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const result: Record<Kind, number> = { follow: 0, mention: 0, group: 0, cosquest: 0 };
    notifications.forEach((item) => (result[kindOf(item)] += 1));
    return result;
  }, [notifications]);
  const unread = notifications.filter((item) => !item.read).length;

  const sections = useMemo(() => {
    const shown = filter === "all" ? notifications : notifications.filter((item) => kindOf(item) === filter);
    const order = ["Today", "This week", "Earlier"];
    return order
      .map((title) => ({ title, items: shown.filter((item) => groupOf(item.createdAt) === title) }))
      .filter((section) => section.items.length);
  }, [notifications, filter]);

  const tabs: Filter[] = ["all", "follow", "mention", "group", "cosquest"];

  return (
    <View style={styles.page}>
      <ScreenGradient />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.columns}>
          {/* ---------- MAIN ---------- */}
          <View style={styles.main}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Notifications</Text>
              {unread ? (
                <View style={styles.newPill}>
                  <Text style={styles.newText}>{unread} new</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.tabs}>
              {tabs.map((tab) => {
                const on = filter === tab;
                const count = tab === "all" ? notifications.length : counts[tab];
                return (
                  <Pressable
                    key={tab}
                    onPress={() => setFilter(tab)}
                    style={({ hovered }: any) => [styles.tab, on && styles.tabOn, hovered && !on && styles.tabHover]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}>
                    <Text style={[styles.tabText, on && styles.tabTextOn]}>
                      {tab === "all" ? "All" : KINDS[tab].label}
                    </Text>
                    {count ? <Text style={[styles.tabCount, on && styles.tabTextOn]}>{count}</Text> : null}
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.card}>
              {loading && !notifications.length ? (
                <View style={styles.empty}>
                  <ActivityIndicator color={ink.text(PINK)} />
                  <Text style={styles.emptyText}>Loading notifications…</Text>
                </View>
              ) : error && !notifications.length ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>{error}</Text>
                  <Pressable onPress={onRetry}>
                    <Text style={styles.link}>Try again</Text>
                  </Pressable>
                </View>
              ) : !sections.length ? (
                <View style={styles.empty}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="notifications-outline" size={26} color={ink.text(PINK)} />
                  </View>
                  <Text style={styles.emptyTitle}>
                    {filter === "all" ? "You're all caught up" : `No ${KINDS[filter as Kind].label.toLowerCase()} yet`}
                  </Text>
                  <Text style={styles.emptyText}>New follows, mentions and group news show up here.</Text>
                </View>
              ) : (
                sections.map((section, sectionIndex) => (
                  <View key={section.title}>
                    <Text style={[styles.sectionTitle, sectionIndex > 0 && styles.sectionGap]}>{section.title}</Text>
                    {section.items.map((item) => {
                      const kind = KINDS[kindOf(item)];
                      const username = item.actor?.username;
                      const following = isFollowing(username);
                      const busy = isBusy(username);
                      const openChat = item.conversationId
                        ? () => router.push({ pathname: "/chat/[id]", params: { id: item.conversationId! } })
                        : undefined;
                      const openProfile = username ? () => router.push(`/user/${username}` as any) : undefined;
                      return (
                        <Pressable
                          key={item.id}
                          onPress={openChat || openProfile}
                          disabled={!openChat && !openProfile}
                          style={({ hovered }: any) => [styles.row, !item.read && styles.rowNew, hovered && styles.rowHover]}>
                          <View>
                            <Image source={avatarOf(item.actor)} style={styles.avatar} contentFit="cover" />
                            <View style={[styles.badge, { backgroundColor: kind.color }]}>
                              <Ionicons name={kind.icon} size={11} color="#FFFFFF" />
                            </View>
                          </View>

                          <View style={styles.rowText}>
                            <Text style={styles.body} numberOfLines={3}>
                              {username && item.type !== "mention" ? (
                                <Text style={styles.name}>{item.actor?.name || `@${username}`} </Text>
                              ) : null}
                              {messageWithoutName(item)}
                            </Text>
                            <Text style={[styles.time, !item.read && styles.timeNew]}>{timeAgo(item.createdAt)}</Text>
                          </View>

                          {item.type === "follow" && username ? (
                            <Pressable
                              onPress={() => onToggleFollow(username)}
                              disabled={busy}
                              style={[styles.action, following ? styles.actionSoft : styles.actionPink, busy && styles.off]}>
                              {busy ? (
                                <ActivityIndicator size="small" color={following ? ink.text(PINK) : "#FFFFFF"} />
                              ) : (
                                <Text style={following ? styles.actionSoftText : styles.actionPinkText}>
                                  {following ? "Following" : "Follow back"}
                                </Text>
                              )}
                            </Pressable>
                          ) : openChat ? (
                            <Pressable onPress={openChat} style={[styles.action, styles.actionSoft]}>
                              <Text style={styles.actionSoftText}>Open chat</Text>
                            </Pressable>
                          ) : null}

                          {!item.read ? <View style={styles.dot} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ))
              )}
            </View>
          </View>

          {/* ---------- SIDE ---------- */}
          <View style={styles.side}>
            <View style={styles.sideCard}>
              <Text style={styles.sideTitle}>In your notifications</Text>
              {(Object.keys(KINDS) as Kind[]).map((key) => (
                <Pressable
                  key={key}
                  onPress={() => setFilter(filter === key ? "all" : key)}
                  style={({ hovered }: any) => [styles.sideRow, filter === key && styles.sideRowOn, hovered && styles.rowHover]}>
                  <View style={[styles.sideIcon, { backgroundColor: KINDS[key].color }]}>
                    <Ionicons name={KINDS[key].icon} size={14} color="#FFFFFF" />
                  </View>
                  <Text style={styles.sideLabel}>{KINDS[key].label}</Text>
                  <Text style={styles.sideCount}>{counts[key]}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              onPress={() => router.push("/notification-preferences" as any)}
              style={({ hovered }: any) => [styles.sideCard, styles.settingsCard, hovered && styles.rowHover]}>
              <View style={[styles.sideIcon, styles.settingsIcon]}>
                <Ionicons name="settings-outline" size={15} color={ink.text(PINK)} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.sideLabelStrong}>Notification settings</Text>
                <Text style={styles.sideHint}>Choose what you're told about</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={ink.text(MUTED)} />
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    flex: { flex: 1, minWidth: 0 },
    off: { opacity: 0.6 },
    page: { flex: 1 },
    scroll: { paddingVertical: 28, paddingHorizontal: 24 },
    columns: { flexDirection: "row", alignItems: "flex-start", gap: 24, width: "100%", maxWidth: 1060, alignSelf: "center" },
    main: { flex: 1, minWidth: 0, maxWidth: 720 },
    side: { width: 300, gap: 16, marginTop: 58 },

    titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    title: { fontFamily: FONTS.bold, fontSize: 26, color: INK },
    newPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, backgroundColor: "rgba(197,57,154,0.12)" },
    newText: { fontFamily: FONTS.semibold, fontSize: 12, color: PINK },

    tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14, marginBottom: 14 },
    tab: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      height: 34,
      paddingHorizontal: 14,
      borderRadius: 17,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "rgba(36,40,60,0.08)",
    },
    tabOn: { backgroundColor: PINK, borderColor: PINK },
    tabHover: { backgroundColor: "#F7EEF5" },
    tabText: { fontFamily: FONTS.medium, fontSize: 13, color: INK },
    tabTextOn: { color: "#FFFFFF" },
    tabCount: { fontFamily: FONTS.regular, fontSize: 12, color: MUTED },

    card: {
      paddingVertical: 8,
      borderRadius: 18,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "rgba(36,40,60,0.07)",
      shadowColor: "#000000",
      shadowOpacity: 0.05,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 4 },
      overflow: "hidden",
    },
    sectionTitle: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 6, fontFamily: FONTS.semibold, fontSize: 13, color: MUTED },
    sectionGap: { marginTop: 6, borderTopWidth: 1, borderTopColor: "rgba(36,40,60,0.06)", paddingTop: 14 },

    row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 18, paddingVertical: 12 },
    rowNew: { backgroundColor: "rgba(197,57,154,0.05)" },
    rowHover: { backgroundColor: "rgba(36,40,60,0.04)" },
    avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#EEE" },
    badge: {
      position: "absolute",
      right: -3,
      bottom: -3,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: "#FFFFFF",
    },
    rowText: { flex: 1, minWidth: 0 },
    body: { fontFamily: FONTS.regular, fontSize: 14, lineHeight: 21, color: "#3A3A44" },
    name: { fontFamily: FONTS.semibold, color: INK },
    time: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },
    timeNew: { fontFamily: FONTS.semibold, color: PINK },

    action: { minWidth: 104, height: 34, paddingHorizontal: 14, borderRadius: 17, alignItems: "center", justifyContent: "center" },
    actionPink: { backgroundColor: PINK },
    actionPinkText: { fontFamily: FONTS.semibold, fontSize: 13, color: "#FFFFFF" },
    actionSoft: { backgroundColor: "#F3E6EF" },
    actionSoftText: { fontFamily: FONTS.semibold, fontSize: 13, color: PINK },
    dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: PINK },

    empty: { alignItems: "center", paddingVertical: 56, paddingHorizontal: 24, gap: 8 },
    emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: "#F7EEF5" },
    emptyTitle: { marginTop: 4, fontFamily: FONTS.semibold, fontSize: 16, color: INK },
    emptyText: { fontFamily: FONTS.regular, fontSize: 13, color: MUTED, textAlign: "center" },
    link: { fontFamily: FONTS.semibold, fontSize: 13, color: PINK },

    sideCard: {
      padding: 16,
      borderRadius: 18,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "rgba(36,40,60,0.07)",
    },
    sideTitle: { marginBottom: 8, fontFamily: FONTS.semibold, fontSize: 15, color: INK },
    sideRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9, paddingHorizontal: 8, marginHorizontal: -8, borderRadius: 12 },
    sideRowOn: { backgroundColor: "rgba(197,57,154,0.08)" },
    sideIcon: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
    sideLabel: { flex: 1, fontFamily: FONTS.medium, fontSize: 14, color: INK },
    sideCount: { fontFamily: FONTS.semibold, fontSize: 13, color: MUTED },
    settingsCard: { flexDirection: "row", alignItems: "center", gap: 12 },
    settingsIcon: { backgroundColor: "#F7EEF5" },
    sideLabelStrong: { fontFamily: FONTS.semibold, fontSize: 14, color: INK },
    sideHint: { marginTop: 1, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },
  },
  // Dark mode
  {
    title: { color: "#F4F5FA" },
    newPill: { backgroundColor: "rgba(197,57,154,0.22)" },
    newText: { color: "#F29BD3" },
    tab: { backgroundColor: "#262838", borderColor: "rgba(255,255,255,0.08)" },
    tabOn: { backgroundColor: PINK, borderColor: PINK },
    tabHover: { backgroundColor: "#30324A" },
    tabText: { color: "#E3E6EE" },
    tabTextOn: { color: "#FFFFFF" },
    tabCount: { color: "#9AA1B4" },
    card: { backgroundColor: "#1F2130", borderColor: "rgba(255,255,255,0.07)" },
    sectionTitle: { color: "#9AA1B4" },
    sectionGap: { borderTopColor: "rgba(255,255,255,0.06)" },
    rowNew: { backgroundColor: "rgba(197,57,154,0.10)" },
    rowHover: { backgroundColor: "rgba(255,255,255,0.04)" },
    avatar: { backgroundColor: "#343746" },
    badge: { borderColor: "#1F2130" },
    body: { color: "#D9DCE6" },
    name: { color: "#FFFFFF" },
    time: { color: "#9AA1B4" },
    timeNew: { color: "#F29BD3" },
    actionPink: { backgroundColor: PINK },
    actionPinkText: { color: "#FFFFFF" },
    actionSoft: { backgroundColor: "#3A2A3C" },
    actionSoftText: { color: "#F29BD3" },
    emptyIcon: { backgroundColor: "#33233A" },
    emptyTitle: { color: "#F4F5FA" },
    emptyText: { color: "#9AA1B4" },
    sideCard: { backgroundColor: "#1F2130", borderColor: "rgba(255,255,255,0.07)" },
    sideTitle: { color: "#F4F5FA" },
    sideRowOn: { backgroundColor: "rgba(197,57,154,0.16)" },
    sideLabel: { color: "#E3E6EE" },
    sideCount: { color: "#9AA1B4" },
    settingsIcon: { backgroundColor: "#33233A" },
    sideLabelStrong: { color: "#F4F5FA" },
    sideHint: { color: "#9AA1B4" },
  },
);
