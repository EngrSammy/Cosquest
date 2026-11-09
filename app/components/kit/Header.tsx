// A screen's top bar: Back, the title, an optional right-hand action. Sits
// under the status bar (safe-area inset) on both platforms.
import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONTS } from "@/constants/fonts";
import { space, type, useRoles } from "@/theme";
import { haptic } from "@/utils/haptics";
import { safeBack } from "@/utils/safeBack";

export function Header({
  title,
  onBack,
  backTo = "/community",
  right,
  inset = true,
}: {
  title: string;
  /** Instead of going back (default: back, or `backTo` when there is no history). */
  onBack?: () => void;
  backTo?: string;
  right?: ReactNode;
  /** Add the status bar inset (off when the screen already pads for it). */
  inset?: boolean;
}) {
  const r = useRoles();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: (inset ? insets.top : 0) + space.sm }]}>
      <Pressable
        onPress={() => {
          haptic.tap();
          if (onBack) onBack();
          else safeBack(backTo as any);
        }}
        hitSlop={10}
        style={styles.side}
        accessibilityRole="button"
        accessibilityLabel="Back">
        <Ionicons name="arrow-back" size={24} color={r.text} />
      </Pressable>
      <Text style={[styles.title, { color: r.text }]} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.sm },
  side: { minWidth: 44, minHeight: 44, justifyContent: "center" },
  right: { alignItems: "flex-end" },
  title: { flex: 1, textAlign: "center", fontFamily: FONTS.semibold, ...type.title },
});
