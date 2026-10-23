// ==========================================
// VOICE CHAT OVERLAY (mounted once in app/_layout.tsx)
// ==========================================
// While you're in a voice chat it stays mounted the whole time, so
// minimizing it and using the app never drops you out:
//   Full screen: the orbit.
//   Minimized:   a small pink "Voice chat · Return" pill at the top.
import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONTS } from "@/constants/fonts";

import VoiceRoomSession from "./VoiceRoomSession";
import { setVoiceMinimized, useVoiceMinimized, useVoiceSession } from "./voiceUi";

export default function VoiceRoomOverlay() {
  const insets = useSafeAreaInsets();
  const session = useVoiceSession();
  const minimized = useVoiceMinimized();

  // Android Back while full screen: minimize, don't leave.
  useEffect(() => {
    if (!session || minimized) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setVoiceMinimized(true);
      return true;
    });
    return () => subscription.remove();
  }, [session, minimized]);

  if (!session) return null;

  return (
    <>
      <View style={[styles.overlay, minimized && styles.hidden]} pointerEvents={minimized ? "none" : "auto"}>
        <VoiceRoomSession session={session} />
      </View>

      {minimized ? (
        <Pressable
          style={[styles.pill, { top: insets.top + 6 }]}
          onPress={() => setVoiceMinimized(false)}
          accessibilityRole="button"
          accessibilityLabel="Return to voice chat">
          <Ionicons name="call" size={14} color="#FFFFFF" />
          <Text style={styles.pillText} numberOfLines={1}>
            Voice chat · {session.title} · Return
          </Text>
        </Pressable>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 999,
    elevation: 999,
    backgroundColor: "#F4F8FD",
  },
  // Still mounted (you stay in the voice chat), just not shown.
  hidden: { display: "none" },
  pill: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 1001,
    elevation: 1001,
    maxWidth: "90%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#B63D91",
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  pillText: { fontFamily: FONTS.semibold, fontSize: 13, color: "#FFFFFF" },
});
