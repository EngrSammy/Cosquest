// ==========================================
// DESKTOP SHELL (Figma D1-D8 · Social workspace)
// ==========================================
// On a computer, every screen of the website sits inside the same frame:
//   Top bar: CosQuest logo, "Community / Chats" (where you are), the
//            "Free core features" chip, search, notifications, your avatar.
//   Left rail: Cosquest (map), Live, Community, Profile, Settings - it
//            replaces the phone's bottom tab bar.
//   Content: full width for the map, Live and chats; a comfortable centred
//            column for one-column pages (feed, profile, settings...).
// Phones and narrow windows: nothing changes (this renders its children).
// Not shown before login or during onboarding.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, usePathname } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { AVATARS } from "@/constants/avatars";
import { FONTS } from "@/constants/fonts";
import { useIsDesktop } from "@/hooks/useDesktop";
import { DesktopSettingsList, DesktopSettingsPlaceholder, isSettingsPath } from "@/components/desktop/DesktopSettingsSplit";
import { useAppSelector } from "@/store/hooks";

const PINK = "#C34D9C";
const INK = "#24283C";
const MUTED = "#66738A";

type RailItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconOn: keyof typeof Ionicons.glyphMap;
  href: string;
  // Which addresses light this item up.
  match: (path: string) => boolean;
};

const RAIL: RailItem[] = [
  {
    key: "map",
    label: "Cosquest",
    icon: "compass-outline",
    iconOn: "compass",
    href: "/home",
    match: (p) => p.startsWith("/home"),
  },
  {
    key: "live",
    label: "Live",
    icon: "radio-outline",
    iconOn: "radio",
    href: "/live",
    match: (p) => p.startsWith("/live"),
  },
  {
    key: "community",
    label: "Community",
    icon: "chatbubbles-outline",
    iconOn: "chatbubbles",
    href: "/community",
    match: (p) => p.startsWith("/community") || p.startsWith("/chat") || p.startsWith("/group") || p.startsWith("/post"),
  },
  {
    key: "profile",
    label: "Profile",
    icon: "person-outline",
    iconOn: "person",
    href: "/profile",
    match: (p) =>
      p.startsWith("/profile") || p.startsWith("/edit-profile") || p.startsWith("/followers") || p.startsWith("/following"),
  },
  {
    key: "settings",
    label: "Settings",
    icon: "settings-outline",
    iconOn: "settings",
    href: "/settings",
    match: (p) =>
      [
        "/settings",
        "/account-information",
        "/privacy-visibility",
        "/notification-preferences",
        "/appearance",
        "/data-usage",
        "/help-support",
        "/sparks-model",
      ].some((prefix) => p.startsWith(prefix)),
  },
];

// "Community / Chats" etc.
function whereAmI(path: string) {
  if (path.startsWith("/chat")) return "Community / Chats";
  if (path.startsWith("/group")) return "Community / Groups";
  if (path.startsWith("/post")) return "Community / Post";
  if (path.startsWith("/community")) return "Community";
  if (path.startsWith("/home")) return "Cosquest map";
  if (path.startsWith("/live")) return "Live";
  if (path.startsWith("/notifications")) return "Notifications";
  if (path.startsWith("/user")) return "Profile";
  const item = RAIL.find((rail) => rail.match(path));
  return item?.label || "";
}

// Screens that use the whole width (the map, Live, the chat workspace).
function isFullWidth(path: string) {
  return path.startsWith("/notifications") || (
    path.startsWith("/home") ||
    path.startsWith("/live") ||
    path.startsWith("/chat") ||
    path.startsWith("/community") ||
    path === "/edit-profile" ||
    // Wide pages in columns (Figma D5)
    path === "/profile" ||
    path.startsWith("/group/new") ||
    path.startsWith("/group/settings") ||
    // A group's own page (/group/<id>), not /group/new, /group/discover or /group/join
    /^\/group\/(?!new$|discover$|join\/)[^/]+$/.test(path)
  );
}

// No frame before login, during onboarding, or on the full-screen call.
function shellHidden(path: string) {
  return path === "/" || path.startsWith("/onboarding") || path.startsWith("/call");
}

function MyAvatar() {
  const styles = useThemedStyles(STYLE_PAIR);
  const user = useAppSelector((state) => (state.user.user || state.auth.user) as any);
  const profile = user?.profile || user || {};
  const photo = profile.avatarPhotoUrl || profile.profilePicture || null;
  const preset = profile.avatarKey ? AVATARS.find((avatar) => avatar.id === profile.avatarKey)?.source : null;
  const source = photo ? { uri: photo } : preset || require("@/assets/images/dp-avatar.png");
  return <Image source={source as any} style={styles.avatar} contentFit="cover" />;
}

export default function DesktopShell({ children }: { children: ReactNode }) {
  const desktop = useIsDesktop();
  const path = usePathname() || "/";
  const token = useAppSelector((state) => state.auth.token);
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();

  if (!desktop || !token || shellHidden(path)) {
    return <>{children}</>;
  }

  const full = isFullWidth(path);
  const settings = isSettingsPath(path);

  return (
    <View style={styles.frame}>
      {/* TOP BAR */}
      <View style={styles.topBar}>
        <Pressable style={styles.brand} onPress={() => router.navigate("/community")} accessibilityLabel="CosQuest home">
          <Ionicons name="sparkles-outline" size={26} color={ink.text(PINK)} />
          <Text style={styles.brandText}>CosQuest</Text>
        </Pressable>
        <Text style={styles.where} numberOfLines={1}>
          {whereAmI(path)}
        </Text>
        <View style={styles.flex} />
        <View style={styles.freeChip}>
          <Text style={styles.freeChipText}>Free core features</Text>
        </View>
        <Pressable
          style={styles.topIcon}
          onPress={() => router.navigate("/community")}
          accessibilityLabel="Search"
          hitSlop={6}>
          <Ionicons name="search-outline" size={22} color={ink.text(INK)} />
        </Pressable>
        <Pressable
          style={styles.topIcon}
          onPress={() => router.navigate("/notifications")}
          accessibilityLabel="Notifications"
          hitSlop={6}>
          <Ionicons name="notifications-outline" size={22} color={ink.text(PINK)} />
        </Pressable>
        <Pressable onPress={() => router.navigate("/profile")} accessibilityLabel="Your profile">
          <MyAvatar />
        </Pressable>
      </View>

      <View style={styles.body}>
        {/* LEFT RAIL */}
        <View style={styles.rail}>
          {RAIL.map((item) => {
            const on = item.match(path);
            return (
              <Pressable
                key={item.key}
                onPress={() => router.navigate(item.href as any)}
                style={[styles.railItem, on && styles.railItemOn]}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: on }}>
                <Ionicons name={on ? item.iconOn : item.icon} size={22} color={ink.text(on ? PINK : MUTED)} />
                <Text style={[styles.railLabel, on && styles.railLabelOn]} numberOfLines={1}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* CONTENT. The screens always sit in the same place (key "screen");
            only their width changes, so moving between pages never
            restarts navigation. Settings adds its list beside them. */}
        <View style={styles.content}>
          {settings ? <DesktopSettingsList /> : null}
          <View
            key="screen"
            style={
              settings
                ? path === "/settings"
                  ? styles.hidden
                  : styles.full
                : full
                  ? styles.full
                  : [styles.column, path.startsWith("/community") && (styles as any).columnFeed]
            }>
            {children}
          </View>
          {settings && path === "/settings" ? <DesktopSettingsPlaceholder /> : null}
        </View>
      </View>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    flex: { flex: 1 },
    frame: { flex: 1, backgroundColor: "#FFFFFF" },

    topBar: {
      height: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: 18,
      paddingHorizontal: 22,
      backgroundColor: "#FFFFFF",
      borderBottomWidth: 1,
      borderBottomColor: "rgba(36,40,60,0.06)",
    },
    brand: { flexDirection: "row", alignItems: "center", gap: 10 },
    brandText: { fontFamily: FONTS.semibold, fontSize: 22, color: INK },
    where: { fontFamily: FONTS.regular, fontSize: 13.5, color: MUTED },
    freeChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: "#F7E3F0" },
    freeChipText: { fontFamily: FONTS.semibold, fontSize: 11, color: PINK },
    topIcon: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
    avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#E9E1F5" },

    body: { flex: 1, flexDirection: "row", minHeight: 0 },

    rail: {
      width: 76,
      paddingTop: 16,
      alignItems: "center",
      gap: 6,
      backgroundColor: "#FFFFFF",
      borderRightWidth: 1,
      borderRightColor: "rgba(36,40,60,0.06)",
    },
    railItem: { width: 62, paddingVertical: 8, borderRadius: 14, alignItems: "center", gap: 3 },
    railItemOn: { backgroundColor: "#F7E3F0" },
    railLabel: { fontFamily: FONTS.regular, fontSize: 10, color: MUTED },
    railLabelOn: { fontFamily: FONTS.semibold, color: PINK },

    content: { flex: 1, minWidth: 0, flexDirection: "row", justifyContent: "center", backgroundColor: "#FFFFFF" },
    full: { flex: 1, minWidth: 0 },
    hidden: { display: "none" },
    // One-column pages: centred, like a feed.
    column: { flex: 1, width: "100%", maxWidth: 760, overflow: "hidden" },
    // The feed: about the width social apps use, so photos stay a sensible size.
    columnFeed: { maxWidth: 620 },
  },
  {
    frame: { backgroundColor: "#1D1F2C" },
    topBar: { backgroundColor: "#1D1F2C", borderBottomColor: "rgba(255,255,255,0.06)" },
    brandText: { color: "#F4F5FA" },
    where: { color: "#B5BBCB" },
    freeChip: { backgroundColor: "#40283B" },
    freeChipText: { color: "#F0A6D7" },
    avatar: { backgroundColor: "#343044" },
    rail: { backgroundColor: "#1D1F2C", borderRightColor: "rgba(255,255,255,0.06)" },
    railItemOn: { backgroundColor: "#40283B" },
    railLabel: { color: "#B5BBCB" },
    railLabelOn: { color: "#F0A6D7" },
    content: { backgroundColor: "#171823" },
  },
);
