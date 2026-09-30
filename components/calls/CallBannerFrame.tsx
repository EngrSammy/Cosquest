// ==========================================
// GREEN "TAP TO RETURN TO CALL" BAR
// ==========================================
// Wraps the whole app (app/_layout.tsx). While a call is minimized, a green
// bar sits at the very top and the app moves down under it, like WhatsApp -
// so nothing (back buttons, headers) is covered. Tap it to go back to the
// full call screen.
import { Ionicons } from "@expo/vector-icons";
import { ReactNode, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
      SafeAreaInsetsContext,
      useSafeAreaInsets,
} from "react-native-safe-area-context";

import { useAppSelector } from "@/store/hooks";

import { setCallMinimized, useCallMinimized } from "./callUi";

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = (seconds % 60).toString().padStart(2, "0");

  return `${minutes.toString().padStart(2, "0")}:${rest}`;
}

function CallBanner({ topInset }: { topInset: number }) {
  const active = useAppSelector((state) => state.call.active);

  const conversation = useAppSelector((state) =>
    active
      ? state.chat.conversationDetails[active.call.conversationId]
      : undefined,
  );

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(interval);
  }, []);

  if (!active) {
    return null;
  }

  const name =
    active.direction === "incoming"
      ? active.call.caller?.name || active.call.caller?.username || "Call"
      : conversation?.title ||
        conversation?.otherParticipant?.username ||
        "Call";

  const answeredAt = active.call.answeredAt
    ? new Date(active.call.answeredAt).getTime()
    : null;

  const status =
    answeredAt && !Number.isNaN(answeredAt)
      ? formatDuration((now - answeredAt) / 1000)
      : "Ringing…";

  return (
    <Pressable
      style={[styles.banner, { paddingTop: topInset + 6 }]}
      onPress={() => setCallMinimized(false)}
      accessibilityRole="button"
      accessibilityLabel="Return to call">
      <Ionicons
        name={active.call.type === "video" ? "videocam" : "call"}
        size={16}
        color="#FFFFFF"
      />

      <Text style={styles.bannerText} numberOfLines={1}>
        Tap to return to call · {name}
      </Text>

      <Text style={styles.bannerTime}>{status}</Text>
    </Pressable>
  );
}

export default function CallBannerFrame({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();

  const hasCall = useAppSelector((state) => !!state.call.active);
  const minimized = useCallMinimized();

  const showBanner = hasCall && minimized;

  return (
    <View style={styles.frame}>
      {showBanner ? <CallBanner topInset={insets.top} /> : null}

      {/* Under the bar, screens shouldn't add the status-bar space again. */}
      <SafeAreaInsetsContext.Provider
        value={showBanner ? { ...insets, top: 0 } : insets}>
        <View style={styles.frame}>{children}</View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
  },

  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: "#1FA855",
  },

  bannerText: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 13.5,
    fontWeight: "700",
  },

  bannerTime: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});
