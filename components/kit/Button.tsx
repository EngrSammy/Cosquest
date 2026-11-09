// The app's one button. `tone="game"` is the game's chunky GameButton (the
// same component, so both halves share one API); the app tones are the
// chat's pill buttons. Haptic tap on press-down, like the game.
import { ActivityIndicator, Pressable, type StyleProp, StyleSheet, Text, type ViewStyle } from "react-native";

import { GameButton } from "@/components/game/kit";
import { FONTS } from "@/constants/fonts";
import { C, radius, space, type, useRoles } from "@/theme";
import { haptic } from "@/utils/haptics";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  label,
  onPress,
  variant = "primary",
  tone = "app",
  disabled,
  loading,
  small,
  style,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  tone?: "app" | "game";
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}) {
  const r = useRoles();
  if (tone === "game") {
    const color = variant === "danger" ? C.gameBerry : variant === "secondary" ? C.gameSkyDeep : C.gameSun;
    return (
      <GameButton
        title={label}
        color={color}
        onPress={onPress}
        disabled={disabled || loading}
        small={small}
        style={style}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      />
    );
  }
  const face =
    variant === "primary"
      ? { backgroundColor: r.accent, borderColor: r.accent }
      : variant === "danger"
        ? { backgroundColor: r.danger, borderColor: r.danger }
        : variant === "secondary"
          ? { backgroundColor: r.surface, borderColor: r.accent }
          : { backgroundColor: "transparent", borderColor: "transparent" };
  const ink = variant === "primary" || variant === "danger" ? r.onAccent : r.accent;
  const off = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPressIn={() => {
        if (!off) haptic.tap();
      }}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [styles.base, small && styles.small, face, pressed && styles.pressed, off && styles.off, style]}>
      {loading ? <ActivityIndicator size="small" color={ink} /> : <Text style={[styles.label, small && styles.labelSmall, { color: ink }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  small: { minHeight: 36, paddingHorizontal: space.lg },
  pressed: { opacity: 0.75 },
  off: { opacity: 0.45 },
  label: { fontFamily: FONTS.semibold, ...type.bodyLarge },
  labelSmall: { ...type.small },
});
