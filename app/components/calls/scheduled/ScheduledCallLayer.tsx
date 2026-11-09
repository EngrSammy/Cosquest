// ==========================================
// SCHEDULED CALL LAYER (mounted once in app/_layout.tsx)
// ==========================================
// Waiting: the waiting room. Connected: the call, full screen, or a pink
// "Return" pill at the top while minimized (you stay in the call).
import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONTS } from "@/constants/fonts";

import ScheduledCallSession from "./ScheduledCallSession";
import { leaveScheduledCall, setScheduledMinimized, useScheduledMinimized, useScheduledSession } from "./scheduledCallJoin";
import WaitingRoomScreen from "./WaitingRoomScreen";

export default function ScheduledCallLayer() {
  const insets = useSafeAreaInsets();
  const session = useScheduledSession();
  const minimized = useScheduledMinimized();

  // Android Back on the full-screen call: minimize, don't leave.
  useEffect(() => {
    if (!session || (session.phase === "connected" && minimized)) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (session.phase === "waiting") leaveScheduledCall();
      else setScheduledMinimized(true);
      return true;
    });
    return () => subscription.remove();
  }, [session, minimized]);

  if (!session) return null;
  if (session.phase === "waiting") {
    return <WaitingRoomScreen call={session.call} since={session.since} onLeave={leaveScheduledCall} />;
  }

  return (
    <>
      <View style={[styles.overlay, minimized && styles.hidden]} pointerEvents={minimized ? "none" : "auto"}>
        <ScheduledCallSession session={session} />
      </View>
      {minimized ? (
        <Pressable
          style={[styles.pill, { top: insets.top + 6 }]}
          onPress={() => setScheduledMinimized(false)}
          accessibilityRole="button"
          accessibilityLabel="Return to the call">
          <Ionicons name="call" size={14} color="#FFFFFF" />
          <Text style={styles.pillText} numberOfLines={1}>
            {session.call.topic} · Return
          </Text>
        </Pressable>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 999, elevation: 999, backgroundColor: "#F4F8FD" },
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
  },
  pillText: { fontFamily: FONTS.semibold, fontSize: 13, color: "#FFFFFF" },
});
