// ==========================================
// WIDE GROUP PAGES · COMPUTER (Figma D6 · settings and members,
//                              D7 · moderation and Sparks)
// ==========================================
// A page title, then the group's own screens side by side as columns
// (for example Group settings | Members | Join requests). Each column is
// the real screen, told it's embedded (AdminEmbedded), so it drops its own
// back / close header and background and everything inside keeps working.
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { ScreenGradient } from "@/components/chat/ui";
import { AdminEmbedded } from "@/components/groups/AdminUi";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";

// Group info, Group settings and Moderation open as single screens. Set to
// true to show them side by side on a computer instead (Figma D6/D7).
export const GROUP_WORKSPACES = false;

const PINK = "#C34D9C";
const INK = "#24283C";
const MUTED = "#66738A";

export default function DesktopGroupWorkspace({
  title,
  subtitle,
  chip,
  columns,
}: {
  title: string;
  subtitle?: string;
  chip?: string;
  columns: ReactNode[];
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.page}>
      <ScreenGradient />
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {chip ? (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{chip}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.columns}>
        {columns.map((column, index) => (
          <View key={index} style={styles.column}>
            <AdminEmbedded.Provider value={true}>{column}</AdminEmbedded.Provider>
          </View>
        ))}
      </View>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    flex: { flex: 1, minWidth: 0 },
    page: { flex: 1 },
    head: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 26, paddingTop: 22, paddingBottom: 10 },
    title: { fontFamily: FONTS.regular, fontSize: 26, color: INK },
    subtitle: { marginTop: 4, fontFamily: FONTS.regular, fontSize: 12.5, color: MUTED },
    chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: "#F3DDED" },
    chipText: { fontFamily: FONTS.medium, fontSize: 11, color: PINK },
    columns: { flex: 1, flexDirection: "row", gap: 18, paddingHorizontal: 18, paddingBottom: 18, minHeight: 0 },
    column: { flex: 1, minWidth: 0, minHeight: 0 },
  },
  {
    title: { color: "#F4F5FA" },
    subtitle: { color: "#B5BBCB" },
    chip: { backgroundColor: "#40283B" },
    chipText: { color: "#F0A6D7" },
  },
);
