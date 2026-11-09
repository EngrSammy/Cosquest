// ==========================================
// SETTINGS ON A COMPUTER · LIST | PAGE
// ==========================================
// /settings and its pages (Account information, Privacy & visibility,
// Notification preferences, Appearance, Data usage, Help & support) share
// one frame: the Settings list on the left, the open page on the right.
// The shell (DesktopShell) places these around the screens, which always
// stay in the same spot - so moving around never resets navigation.
import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { ScreenGradient } from "@/components/chat/ui";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import Settings from "@/app/settings";

const PINK = "#C34D9C";
const INK = "#24283C";
const MUTED = "#66738A";

// The pages that open in the right pane.
export const SETTINGS_PAGES = [
  "/account-information",
  "/privacy-visibility",
  "/notification-preferences",
  "/appearance",
  "/data-usage",
  "/help-support",
];

export function isSettingsPath(path: string) {
  return path === "/settings" || SETTINGS_PAGES.includes(path);
}

// Left: the Settings list.
export function DesktopSettingsList() {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.list}>
      <Settings />
    </View>
  );
}

// Right, on /settings itself: nothing picked yet.
export function DesktopSettingsPlaceholder() {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  return (
    <View style={styles.pane}>
      <ScreenGradient />
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Ionicons name="settings-outline" size={28} color={ink.text(PINK)} />
        </View>
        <Text style={styles.emptyTitle}>Pick a setting on the left</Text>
        <Text style={styles.emptyText}>
          Your account, privacy, notifications, appearance, data and help open here.
        </Text>
      </View>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    list: { width: 420, minHeight: 0, borderRightWidth: 1, borderRightColor: "rgba(36,40,60,0.08)" },
    pane: { flex: 1, minWidth: 0, minHeight: 0 },
    empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30 },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#F7E3F0",
    },
    emptyTitle: { marginTop: 14, fontFamily: FONTS.semibold, fontSize: 18, color: INK },
    emptyText: { marginTop: 6, maxWidth: 340, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19, color: MUTED },
  },
  {
    list: { borderRightColor: "rgba(255,255,255,0.08)" },
    emptyIcon: { backgroundColor: "#40283B" },
    emptyTitle: { color: "#F4F5FA" },
    emptyText: { color: "#B5BBCB" },
  },
);
