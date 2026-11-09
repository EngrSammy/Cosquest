// A bottom sheet for both halves: a scrim, a grabber, a title, then either
// a list of options or anything you put inside. A native Modal, so it sits
// above every screen (and the game) and Android's Back closes it.
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONTS } from "@/constants/fonts";
import { radius, space, type, useRoles } from "@/theme";
import { haptic } from "@/utils/haptics";

export type SheetOption = {
  key: string;
  label: string;
  icon?: ComponentProps<typeof Ionicons>["name"];
  destructive?: boolean;
  /** A checkmark (the chosen reason). */
  selected?: boolean;
  onPress: () => void;
};

export function Sheet({
  visible,
  onClose,
  title,
  message,
  options,
  children,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  options?: SheetOption[];
  children?: ReactNode;
  testID?: string;
}) {
  const r = useRoles();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: r.scrim }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: r.surface, paddingBottom: insets.bottom + space.lg }]} testID={testID} accessibilityViewIsModal>
        <View style={[styles.grabber, { backgroundColor: r.border }]} />
        {title ? (
          <Text style={[styles.title, { color: r.text }]} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        {message ? <Text style={[styles.message, { color: r.textMuted }]}>{message}</Text> : null}
        <ScrollView bounces={false} style={styles.body} contentContainerStyle={{ gap: space.xs }}>
          {options?.map((o) => (
            <Pressable
              key={o.key}
              onPress={() => {
                haptic.select();
                o.onPress();
              }}
              style={({ pressed }) => [styles.option, { backgroundColor: pressed ? r.surfaceAlt : "transparent" }]}
              accessibilityRole="button"
              accessibilityLabel={o.label}
              accessibilityState={{ selected: !!o.selected }}>
              {o.icon ? <Ionicons name={o.icon} size={20} color={o.destructive ? r.danger : r.text} /> : null}
              <Text style={[styles.optionLabel, { color: o.destructive ? r.danger : r.text }]}>{o.label}</Text>
              {o.selected ? <Ionicons name="checkmark-circle" size={20} color={r.accent} /> : null}
            </Pressable>
          ))}
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "85%",
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  grabber: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, marginBottom: space.md },
  title: { fontFamily: FONTS.semibold, ...type.title, textAlign: "center" },
  message: { fontFamily: FONTS.regular, ...type.small, textAlign: "center", marginTop: space.xs, marginHorizontal: space.lg },
  body: { marginTop: space.md },
  option: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52, paddingHorizontal: space.md, borderRadius: radius.md },
  optionLabel: { flex: 1, fontFamily: FONTS.medium, ...type.body },
});
