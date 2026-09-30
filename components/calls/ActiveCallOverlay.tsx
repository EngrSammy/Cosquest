// ==========================================
// ONGOING CALL — full screen, or minimized
// ==========================================
// Mounted once in app/_layout.tsx. While there's an active call, the call
// (CallSession) stays mounted here the WHOLE time — so minimizing it and
// using the rest of the app (chat, feed, ...) never ends the call.
//   Full screen: the normal call screen, with a ⌄ button to minimize.
//                (Android's Back button also minimizes instead of hanging up.)
//   Minimized:   hidden here; CallBannerFrame shows the green
//                "Tap to return to call" bar at the top of the app.
import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { BackHandler, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppSelector } from "@/store/hooks";

import CallSession from "./CallSession";
import { setCallMinimized, useCallMinimized } from "./callUi";

export default function ActiveCallOverlay() {
  const insets = useSafeAreaInsets();

  const active = useAppSelector((state) => state.call.active);
  const minimized = useCallMinimized();

  const callId = active?.call.id;

  // Every new call opens full screen; no call = nothing minimized.
  useEffect(() => {
    setCallMinimized(false);
  }, [callId]);

  // Android Back while the call is full screen: minimize, don't hang up.
  useEffect(() => {
    if (!callId || minimized) {
      return;
    }

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        setCallMinimized(true);
        return true;
      },
    );

    return () => subscription.remove();
  }, [callId, minimized]);

  if (!active) {
    return null;
  }

  return (
    <View
      style={[styles.overlay, minimized && styles.hidden]}
      pointerEvents={minimized ? "none" : "auto"}>
      <CallSession />

      {/* ⌄ minimize: go back to the app, the call keeps going */}
      <Pressable
        style={[styles.minimize, { top: insets.top + 12 }]}
        onPress={() => setCallMinimized(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Minimize call">
        <Ionicons name="chevron-down" size={24} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: "#1B0714",
  },

  // Still mounted (the call keeps running), just not shown.
  hidden: {
    display: "none",
  },

  minimize: {
    position: "absolute",
    left: 14,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    zIndex: 10,
  },
});
