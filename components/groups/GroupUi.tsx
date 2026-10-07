// ==========================================
// SHARED LOOK FOR THE GROUP SCREENS
// ==========================================
// Same style as Settings / Edit Profile: the Figma gradient background,
// milky rows, pink accents and Poppins. When the designer's group screens
// arrive, most of the look can be adjusted here in one place.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONTS } from "@/constants/fonts";

export const PINK = "#C34D9C";
export const INK = "#191922";
export const MUTED = "#7A7A84";

// The milky, pressed-in box used across the app's Figma screens.
export const MILKY = {
  borderRadius: 14,
  backgroundColor: "#0000000D",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.75)",
  shadowColor: "#000000",
  shadowOpacity: 0.09,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

// Background + header (back arrow, title, optional right side).
export function GroupScreen({
  title,
  onBack,
  right,
  children,
}: {
  title: string;
  onBack: () => void;
  right?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={["#FFFFFF", "#E1F3FF"]}
        locations={[0, 0.6442]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable
          onPress={onBack}
          hitSlop={10}
          style={styles.headerSide}
          accessibilityRole="button"
          accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={INK} />
        </Pressable>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>

        <View style={[styles.headerSide, styles.headerRight]}>{right}</View>
      </View>

      {children}
    </View>
  );
}

// A group's photo, or its initials on pink.
export function GroupAvatar({
  name,
  photoUrl,
  size = 48,
}: {
  name?: string | null;
  photoUrl?: string | null;
  size?: number;
}) {
  const initials =
    (name || "?")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() || "")
      .join("") || "?";

  if (photoUrl) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "#F1E4EE",
        }}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(195,77,156,0.18)",
      }}>
      <Text
        style={{
          fontFamily: FONTS.semibold,
          fontSize: size * 0.36,
          color: PINK,
        }}>
        {initials}
      </Text>
    </View>
  );
}

// "Section title" in small caps.
export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

// A row of options to pick one from (milky selector, pink when chosen).
export function OptionSelector<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.selector}>
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={[styles.option, selected && styles.optionSelected]}
            accessibilityRole="radio"
            accessibilityState={{ selected }}>
            <Text
              style={[styles.optionText, selected && styles.optionTextSelected]}
              numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// A tappable milky row with a pink icon chip.
export function GroupRow({
  icon,
  label,
  detail,
  danger,
  onPress,
  right,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  danger?: boolean;
  onPress?: () => void;
  right?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && onPress ? styles.pressed : null,
      ]}>
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <Ionicons name={icon} size={16} color={danger ? "#D64545" : PINK} />
      </View>

      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger && styles.danger]}>{label}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>

      {right ??
        (onPress && !danger ? (
          <Ionicons name="chevron-forward" size={16} color="#8A8A93" />
        ) : null)}
    </Pressable>
  );
}

export const groupStyles = StyleSheet.create({
  input: {
    ...MILKY,
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: FONTS.regular,
    fontSize: 14.5,
    color: INK,
  },

  primaryButton: {
    height: 52,
    borderRadius: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: PINK,
    shadowColor: PINK,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },

  primaryButtonOff: { opacity: 0.5 },

  primaryButtonText: {
    fontFamily: FONTS.semibold,
    fontSize: 15.5,
    color: "#FFFFFF",
  },

  hint: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    lineHeight: 17,
    color: MUTED,
  },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },

  headerSide: { width: 64, height: 36, justifyContent: "center" },

  headerRight: { alignItems: "flex-end" },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: FONTS.semibold,
    fontSize: 18,
    color: "#000000",
  },

  sectionLabel: {
    marginTop: 22,
    marginBottom: 10,
    fontFamily: FONTS.medium,
    fontSize: 11,
    letterSpacing: 0.4,
    color: MUTED,
  },

  selector: {
    ...MILKY,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    padding: 4,
  },

  option: {
    flex: 1,
    minHeight: 36,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },

  optionSelected: { backgroundColor: PINK },

  optionText: { fontFamily: FONTS.medium, fontSize: 12.5, color: "#55555E" },

  optionTextSelected: { color: "#FFFFFF" },

  row: {
    ...MILKY,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  pressed: { opacity: 0.75 },

  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(195,77,156,0.12)",
  },

  rowIconDanger: { backgroundColor: "rgba(214,69,69,0.10)" },

  rowText: { flex: 1, minWidth: 0 },

  rowLabel: { fontFamily: FONTS.medium, fontSize: 14, color: INK },

  rowDetail: {
    marginTop: 1,
    fontFamily: FONTS.regular,
    fontSize: 11.5,
    color: MUTED,
  },

  danger: { color: "#D64545" },
});
