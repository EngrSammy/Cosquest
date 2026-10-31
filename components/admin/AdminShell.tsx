// ==========================================
// SUPER ADMIN DASHBOARD - the frame (sidebar + top bar)
// ==========================================
// The "Community administration" designs: CosQuest, the workspace switcher,
// WORKSPACE and ADMINISTRATION sections, "A safer space to create", and the
// top bar (breadcrumb, search, notifications, the signed-in admin).
// Narrow windows: the sidebar opens from a menu button.
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { type ReactNode, useState, useSyncExternalStore } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";

import { FONTS } from "@/constants/fonts";
import { signOutAdmin, useAdminSession } from "@/services/admin";

import { useAdminTheme } from "./theme";
import { initials } from "./ui";

type Item = { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; path: string };

export const WORKSPACE: Item[] = [
  { key: "overview", label: "Overview", icon: "grid-outline", path: "/admin" },
  { key: "moderation", label: "Moderation", icon: "shield-checkmark-outline", path: "/admin/moderation" },
  { key: "members", label: "Members", icon: "people-outline", path: "/admin/members" },
  { key: "groups", label: "Groups", icon: "albums-outline", path: "/admin/groups" },
  { key: "feeds", label: "Feeds", icon: "newspaper-outline", path: "/admin/feeds" },
  { key: "chats", label: "Chats", icon: "chatbubbles-outline", path: "/admin/chats" },
  { key: "sparks", label: "Sparks", icon: "flash-outline", path: "/admin/sparks" },
];

export const ADMINISTRATION: Item[] = [
  { key: "roles", label: "Roles & permissions", icon: "key-outline", path: "/admin/roles" },
  { key: "settings", label: "Settings", icon: "options-outline", path: "/admin/settings" },
  { key: "audit", label: "Audit log", icon: "time-outline", path: "/admin/audit" },
];

export const ALL_ITEMS = [...WORKSPACE, ...ADMINISTRATION];

// The open-reports count on "Moderation" (set by pages that load it).
let openReports = 0;
const badgeListeners = new Set<() => void>();
export function setOpenReportsBadge(count: number) {
  openReports = count;
  badgeListeners.forEach((listener) => listener());
}
function useOpenReportsBadge() {
  return useSyncExternalStore(
    (listener) => {
      badgeListeners.add(listener);
      return () => badgeListeners.delete(listener);
    },
    () => openReports,
    () => openReports,
  );
}

function current(path: string) {
  return ALL_ITEMS.find((item) => (item.path === "/admin" ? path === "/admin" || path === "/admin/" : path.startsWith(item.path))) || WORKSPACE[0];
}

function Sidebar({ onPick }: { onPick?: () => void }) {
  const t = useAdminTheme();
  const path = usePathname() || "/admin";
  const active = current(path);
  const badge = useOpenReportsBadge();

  const row = (item: Item) => {
    const on = item.key === active.key;
    return (
      <Pressable
        key={item.key}
        onPress={() => {
          router.navigate(item.path as any);
          onPick?.();
        }}
        accessibilityRole="link"
        accessibilityState={{ selected: on }}
        style={({ hovered }: any) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          height: 40,
          paddingHorizontal: 12,
          borderRadius: 10,
          backgroundColor: on ? t.pinkSoft : hovered ? t.cardSoft : "transparent",
        })}>
        <Ionicons name={item.icon} size={18} color={on ? t.pinkText : t.muted} />
        <Text style={{ flex: 1, fontFamily: on ? FONTS.medium : FONTS.regular, fontSize: 13.5, color: on ? t.pinkText : t.text }}>{item.label}</Text>
        {item.key === "moderation" && badge > 0 ? (
          <View style={{ minWidth: 22, paddingHorizontal: 6, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: t.pinkSoft }}>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 11, color: t.pinkText }}>{badge > 99 ? "99+" : badge}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  return (
    <View style={{ width: 216, height: "100%", paddingHorizontal: 16, paddingTop: 22, paddingBottom: 18, borderRightWidth: 1, borderRightColor: t.border, backgroundColor: t.sidebar }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 6 }}>
        <Ionicons name="sparkles-outline" size={24} color={t.pink} />
        <Text style={{ fontFamily: FONTS.regular, fontSize: 21, color: t.text }}>CosQuest</Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 22, padding: 12, borderRadius: 12, backgroundColor: t.pinkSoft }}>
        <View style={{ width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: t.card }}>
          <Ionicons name="planet-outline" size={17} color={t.pink} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }}>Community</Text>
          <Text style={{ fontFamily: FONTS.regular, fontSize: 11, color: t.muted }}>Administration</Text>
        </View>
      </View>

      <ScrollView style={{ flex: 1, marginTop: 22 }} showsVerticalScrollIndicator={false}>
        <Text style={{ marginBottom: 8, paddingHorizontal: 12, fontFamily: FONTS.medium, fontSize: 10.5, letterSpacing: 0.6, color: t.faint }}>WORKSPACE</Text>
        <View style={{ gap: 4 }}>{WORKSPACE.map(row)}</View>
        <Text style={{ marginTop: 22, marginBottom: 8, paddingHorizontal: 12, fontFamily: FONTS.medium, fontSize: 10.5, letterSpacing: 0.6, color: t.faint }}>ADMINISTRATION</Text>
        <View style={{ gap: 4 }}>{ADMINISTRATION.map(row)}</View>
      </ScrollView>

      <View style={{ padding: 14, borderRadius: 12, backgroundColor: t.blueSoft, gap: 6 }}>
        <Ionicons name="shield-checkmark-outline" size={18} color={t.blue} />
        <Text style={{ fontFamily: FONTS.medium, fontSize: 12.5, color: t.text }}>A safer space to create.</Text>
        <Text style={{ fontFamily: FONTS.regular, fontSize: 11.5, lineHeight: 16, color: t.muted }}>Permissions follow admin roles, never faction rank.</Text>
      </View>
      <Pressable onPress={() => router.navigate("/community" as any)} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, paddingHorizontal: 12 }}>
        <Ionicons name="arrow-up-outline" size={14} color={t.muted} style={{ transform: [{ rotate: "45deg" }] }} />
        <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>Open community</Text>
      </Pressable>
    </View>
  );
}

function TopBar({ narrow, onMenu }: { narrow: boolean; onMenu: () => void }) {
  const t = useAdminTheme();
  const session = useAdminSession();
  const path = usePathname() || "/admin";
  const page = current(path);
  const [menu, setMenu] = useState(false);
  const name = session?.admin.name || "Admin";

  return (
    <View style={{ height: 70, flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 28, borderBottomWidth: 1, borderBottomColor: t.border, backgroundColor: t.card, zIndex: 10 }}>
      {narrow ? (
        <Pressable onPress={onMenu} hitSlop={8} accessibilityLabel="Menu">
          <Ionicons name="menu-outline" size={24} color={t.text} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>Community</Text>
        <Ionicons name="chevron-forward" size={13} color={t.faint} />
        <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }}>{page.label === "Overview" ? "Overview" : page.label}</Text>
      </View>

      {!narrow ? (
        <View style={{ width: 280, height: 38, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: t.cardSoft }}>
          <Ionicons name="search-outline" size={16} color={t.faint} />
          <Text style={{ flex: 1, fontFamily: FONTS.regular, fontSize: 12.5, color: t.faint }} numberOfLines={1}>
            Search members, content, groups…
          </Text>
          <Text style={{ fontFamily: FONTS.regular, fontSize: 11, color: t.faint }}>⌘ K</Text>
        </View>
      ) : null}

      <Ionicons name="notifications-outline" size={20} color={t.muted} />
      <View style={{ width: 1, height: 28, backgroundColor: t.border }} />

      <View>
        <Pressable onPress={() => setMenu((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 10 }} accessibilityRole="button" accessibilityLabel="Account menu">
          <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: t.pinkSoft }}>
            <Text style={{ fontFamily: FONTS.medium, fontSize: 12, color: t.pinkText }}>{initials(name)}</Text>
          </View>
          {!narrow ? (
            <View>
              <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }}>{name}</Text>
              <Text style={{ fontFamily: FONTS.regular, fontSize: 11, color: t.muted }}>Super admin</Text>
            </View>
          ) : null}
          <Ionicons name="chevron-down" size={15} color={t.muted} />
        </Pressable>
        {menu ? (
          <View style={{ position: "absolute", right: 0, top: 46, width: 200, padding: 6, borderRadius: 12, borderWidth: 1, borderColor: t.border, backgroundColor: t.card, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }}>
            {[
              { label: "Open CosQuest", icon: "open-outline" as const, onPress: () => router.navigate("/community" as any) },
              {
                label: "Sign out of admin",
                icon: "log-out-outline" as const,
                onPress: async () => {
                  await signOutAdmin();
                  router.replace("/admin/login" as any);
                },
              },
            ].map((item) => (
              <Pressable
                key={item.label}
                onPress={() => {
                  setMenu(false);
                  item.onPress();
                }}
                style={({ hovered }: any) => ({ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 8, backgroundColor: hovered ? t.cardSoft : "transparent" })}>
                <Ionicons name={item.icon} size={16} color={t.muted} />
                <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: t.text }}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const t = useAdminTheme();
  const { width } = useWindowDimensions();
  const narrow = width < 960;
  const [open, setOpen] = useState(false);

  return (
    <View style={{ flex: 1, flexDirection: "row", backgroundColor: t.page }}>
      {!narrow ? <Sidebar /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <TopBar narrow={narrow} onMenu={() => setOpen(true)} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: narrow ? 16 : 32, width: "100%", maxWidth: 1440, alignSelf: "center" }}>
          {children}
        </ScrollView>
      </View>
      {narrow && open ? (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "row", zIndex: 50 }}>
          <Sidebar onPick={() => setOpen(false)} />
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} onPress={() => setOpen(false)} accessibilityLabel="Close menu" />
        </View>
      ) : null}
    </View>
  );
}
