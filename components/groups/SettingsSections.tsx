// ==========================================
// GROUP SETTINGS · WHERE AN OPENED SECTION GOES
// ==========================================
// The settings list stays short; an opened section (Members, Join requests,
// Moderation, Manage Sparks, Administrators, Joining & privacy) gets its own
// space, with its own scrolling:
//   Computer: two panes - the list on the left, the section on the right.
//   Phone:    a full-height sheet over the list, "‹ Back" to return.
import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenGradient } from "@/components/chat/ui";
import { AdminEmbedded } from "@/components/groups/AdminUi";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";

const PINK = "#C34D9C";
const INK = "#24283C";
const MUTED = "#66738A";

export default function SettingsSections({
  split,
  section,
  sectionTitle,
  onClose,
  children,
}: {
  // Computer: list | section side by side. Otherwise: a sheet.
  split: boolean;
  section: ReactNode | null;
  sectionTitle?: string;
  onClose: () => void;
  // The settings list.
  children: ReactNode;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();

  if (split) {
    return (
      <View style={styles.split}>
        <View style={styles.list}>{children}</View>
        <View style={styles.pane}>
          <ScreenGradient />
          {section ? (
            <AdminEmbedded.Provider value={true}>{section}</AdminEmbedded.Provider>
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="options-outline" size={28} color={ink.text(PINK)} />
              </View>
              <Text style={styles.emptyTitle}>Pick a section on the left</Text>
              <Text style={styles.emptyText}>
                Members, join requests, moderation, Sparks and joining options open here.
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <>
      {children}
      <Modal visible={!!section} animationType="slide" onRequestClose={onClose}>
        <View style={styles.sheet}>
          <ScreenGradient />
          <Pressable
            style={[styles.back, { paddingTop: insets.top + 12 }]}
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Back to group settings">
            <Ionicons name="chevron-back" size={24} color={ink.text(INK)} />
            <Text style={styles.backText}>{sectionTitle ? "Group settings" : "Back"}</Text>
          </Pressable>
          <View style={styles.sheetBody}>
            {section ? <AdminEmbedded.Provider value={true}>{section}</AdminEmbedded.Provider> : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const STYLE_PAIR = themedStyles(
  {
    split: { flex: 1, flexDirection: "row", minHeight: 0 },
    list: { width: 400, minHeight: 0, borderRightWidth: 1, borderRightColor: "rgba(36,40,60,0.08)" },
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

    sheet: { flex: 1 },
    back: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, paddingBottom: 4 },
    backText: { fontFamily: FONTS.medium, fontSize: 15, color: INK },
    sheetBody: { flex: 1, minHeight: 0 },
  },
  {
    list: { borderRightColor: "rgba(255,255,255,0.08)" },
    emptyIcon: { backgroundColor: "#40283B" },
    emptyTitle: { color: "#F4F5FA" },
    emptyText: { color: "#B5BBCB" },
    backText: { color: "#F4F5FA" },
  },
);
