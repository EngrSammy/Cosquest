// ==========================================
// SHARED CHAT UI (Figma M11-M20)
// ==========================================
// One place for the pieces every sheet repeats, with the exact Figma values:
//   pink #C34D9C, buttons 50 high / radius 14, cards radius 18 with a #DAE5EF
//   border, 20px between sections, white -> #D5F1FF screen gradient.
// Light and dark both come from chatTheme (themedStyles), so a screen that
// uses these never needs its own dark styles for them.
//
// Save as: components/chat/ui.tsx
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import {
      ActivityIndicator,
      Platform,
      Pressable,
      Text,
      TextInput,
      View,
      type StyleProp,
      type TextInputProps,
      type ViewStyle,
} from "react-native";

import {
      DARK_SCREEN_GRADIENT,
      LIGHT_SCREEN_GRADIENT,
      SCREEN_GRADIENT_LOCATIONS,
      themedStyles,
      useInk,
      useThemedStyles,
} from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";

// Light-mode tokens. Pass them through ink.text() / ink.surface() when you use
// them outside a stylesheet (icons, placeholders).
export const UI = {
  PINK: "#C34D9C",
  INK: "#24283C",
  MUTED: "#66738A",
  LILAC: "#F0EDF9",
  PLACEHOLDER: "#9AA3B5",
  BORDER: "#DAE5EF",
  GAP: 20, // space between sections
  BUTTON_HEIGHT: 50,
  BUTTON_RADIUS: 14,
  CARD_RADIUS: 18,
  SHEET_RADIUS: 28,
} as const;

// ---------- screen background ----------

/** The Figma background. Put it first inside a full-screen / sheet container. */
export function ScreenGradient({ style }: { style?: StyleProp<ViewStyle> }) {
  const ink = useInk();
  return (
    <LinearGradient
      colors={ink.dark ? DARK_SCREEN_GRADIENT : LIGHT_SCREEN_GRADIENT}
      locations={SCREEN_GRADIENT_LOCATIONS as unknown as [number, number]}
      style={[
        { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
        style,
      ]}
      pointerEvents="none"
    />
  );
}

// ---------- header ----------

export function SheetHeader({
  title,
  subtitle,
  onBack,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onClose?: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={ink.text(UI.INK)} />
        </Pressable>
      ) : null}
      <View style={styles.headerText}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitleSmall}>{subtitle}</Text> : null}
      </View>
      {onClose ? (
        <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
          <Ionicons name="close" size={24} color={ink.text(UI.MUTED)} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------- text ----------

export function BigTitle({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return <Text style={styles.bigTitle}>{children}</Text>;
}

export function Description({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return <Text style={styles.description}>{children}</Text>;
}

// ---------- buttons ----------

type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  style,
}: ButtonProps) {
  const styles = useThemedStyles(STYLE_PAIR);
  const off = disabled || loading;
  return (
    <Pressable
      style={[styles.primary, off && styles.off, style]}
      disabled={off}
      onPress={onPress}>
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={styles.primaryText}>{label}</Text>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
  loading,
  style,
}: ButtonProps) {
  const styles = useThemedStyles(STYLE_PAIR);
  const off = disabled || loading;
  return (
    <Pressable
      style={[styles.secondary, off && styles.off, style]}
      disabled={off}
      onPress={onPress}>
      {loading ? (
        <ActivityIndicator color={UI.PINK} />
      ) : (
        <Text style={styles.secondaryText}>{label}</Text>
      )}
    </Pressable>
  );
}

// ---------- card ----------

/** White card, radius 18, 1px #DAE5EF border, Figma drop shadow. */
export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  return <View style={[styles.card, style]}>{children}</View>;
}

// ---------- form ----------

export function FieldLabel({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return <Text style={styles.label}>{children}</Text>;
}

export function TextField(
  props: TextInputProps & { style?: StyleProp<ViewStyle> },
) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const { style, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={ink.text(UI.PLACEHOLDER)}
      {...rest}
      style={[styles.input, style as any]}
    />
  );
}

/** A selectable thumbnail/row needs a check badge: used by M17 media and M20 group type. */
export function CheckBadge({
  checked,
  size = 22,
}: {
  checked: boolean;
  size?: number;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View
      style={[
        styles.check,
        { width: size, height: size, borderRadius: size / 2 },
        checked && styles.checkOn,
      ]}>
      {checked ? (
        <Ionicons name="checkmark" size={size - 6} color="#FFFFFF" />
      ) : null}
    </View>
  );
}

// ---------- styles ----------

const STYLE_PAIR = themedStyles(
  {
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      justifyContent: "space-between",
    },
    headerText: { flex: 1, minWidth: 0 },
    title: {
      fontFamily: FONTS.semibold,
      fontSize: 20,
      lineHeight: 26,
      color: UI.INK,
    },
    subtitleSmall: {
      marginTop: 2,
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: UI.MUTED,
    },

    bigTitle: {
      marginTop: UI.GAP,
      fontFamily: FONTS.semibold,
      fontSize: 20,
      lineHeight: 26,
      color: UI.INK,
    },
    description: {
      marginTop: UI.GAP,
      fontFamily: FONTS.regular,
      fontSize: 14,
      lineHeight: 21,
      color: UI.MUTED,
    },

    primary: {
      marginTop: UI.GAP,
      height: UI.BUTTON_HEIGHT,
      borderRadius: UI.BUTTON_RADIUS,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: UI.PINK,
    },
    primaryText: { fontFamily: FONTS.semibold, fontSize: 15, color: "#FFFFFF" },
    secondary: {
      marginTop: 10,
      height: UI.BUTTON_HEIGHT,
      borderRadius: UI.BUTTON_RADIUS,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: UI.LILAC,
    },
    secondaryText: { fontFamily: FONTS.semibold, fontSize: 15, color: UI.PINK },
    off: { opacity: 0.5 },

    card: {
      padding: 14,
      borderRadius: UI.CARD_RADIUS,
      backgroundColor: "rgba(255,255,255,0.94)",
      borderWidth: 1,
      borderColor: UI.BORDER,
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.09,
      shadowRadius: 4,
    },

    label: {
      marginTop: 18,
      marginBottom: 8,
      fontFamily: FONTS.semibold,
      fontSize: 13,
      color: UI.INK,
    },
    input: {
      minHeight: 50,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "rgba(102,115,138,0.3)",
      fontFamily: FONTS.regular,
      fontSize: 15,
      color: UI.INK,
      ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
    },

    check: {
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: "#B9C2D3",
      backgroundColor: "rgba(255,255,255,0.9)",
    },
    checkOn: { backgroundColor: UI.PINK, borderColor: UI.PINK },
  },
  {
    title: { color: "#F4F5FA" },
    subtitleSmall: { color: "#B5BBCB" },
    bigTitle: { color: "#F4F5FA" },
    description: { color: "#B5BBCB" },
    secondary: { backgroundColor: "#343044" },
    secondaryText: { color: "#F0A6D7" },
    card: { backgroundColor: "#252837", borderColor: "rgba(255,255,255,0.12)" },
    label: { color: "#F0F1F7" },
    input: {
      backgroundColor: "#252837",
      borderColor: "rgba(255,255,255,0.18)",
      color: "#F4F5FA",
    },
    check: { backgroundColor: "rgba(37,40,55,0.9)", borderColor: "#6E7690" },
    checkOn: { backgroundColor: UI.PINK, borderColor: UI.PINK },
  },
);
