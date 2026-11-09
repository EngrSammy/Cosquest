// Haptics for the whole app, so the chat answers a tap the way the game
// does (the game's controls tap on press-down: components/game/kit.tsx).
// Every call is fire-and-forget; a phone without a motor just does nothing.
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const on = Platform.OS === "ios" || Platform.OS === "android";

export const haptic = {
  /** A light tap: send, react, select, toggle. */
  tap() {
    if (on) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  /** A firmer tap: long-press menus, start a call. */
  press() {
    if (on) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  /** Moving through a picker or a segmented control. */
  select() {
    if (on) Haptics.selectionAsync().catch(() => {});
  },
  success() {
    if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  warning() {
    if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  error() {
    if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
};
