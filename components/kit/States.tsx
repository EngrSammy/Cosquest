// Empty and error states for every list in the app, chat and game alike.
// One retry wording everywhere: RETRY_LABEL.
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { GF, GP } from "@/components/game/theme";
import { FONTS } from "@/constants/fonts";
import { space, type, useRoles } from "@/theme";

import { Button } from "./Button";

/** The one label for "do that again" (was "Retry", "Try again" and "Try Again"). */
export const RETRY_LABEL = "Try again";

type IconName = ComponentProps<typeof Ionicons>["name"];

export function EmptyState({
  icon = "sparkles-outline",
  title,
  message,
  actionLabel,
  onAction,
  tone = "app",
  compact,
  style,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: "app" | "game";
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const r = useRoles();
  const game = tone === "game";
  const ink = game ? GP.ink : r.text;
  const sub = game ? GP.mist : r.textMuted;
  return (
    <View style={[styles.wrap, compact && styles.compact, style]} accessible accessibilityLabel={message ? `${title}. ${message}` : title}>
      <View style={[styles.icon, { backgroundColor: game ? "rgba(255,255,255,0.6)" : r.accentTint }]}>
        <Ionicons name={icon} size={26} color={game ? GP.skyDeep : r.accent} />
      </View>
      <Text style={[styles.title, game && { fontFamily: GF.display, fontSize: 20 }, { color: ink }]}>{title}</Text>
      {message ? <Text style={[styles.message, game && { fontFamily: GF.regular }, { color: sub }]}>{message}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} tone={tone} small style={styles.action} /> : null}
    </View>
  );
}

export function ErrorState({
  title = "Couldn't load this",
  message = "Check your connection and try again.",
  onRetry,
  tone = "app",
  compact,
  style,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  tone?: "app" | "game";
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title={title}
      message={message}
      actionLabel={onRetry ? RETRY_LABEL : undefined}
      onAction={onRetry}
      tone={tone}
      compact={compact}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", paddingHorizontal: space.xxl, paddingVertical: space.xxxl * 1.5, gap: space.sm },
  compact: { paddingVertical: space.xl },
  icon: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: space.xs },
  title: { fontFamily: FONTS.semibold, ...type.title, textAlign: "center" },
  message: { fontFamily: FONTS.regular, ...type.small, textAlign: "center", maxWidth: 300 },
  action: { marginTop: space.sm },
});
