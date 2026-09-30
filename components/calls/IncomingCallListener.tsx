import { Ionicons } from "@expo/vector-icons";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { acceptCall, declineCall } from "@/store/thunks/callThunks";
import { ensureCallPermissions, getAvatarSource } from "@/utils/callHelpers";

import {
  AnimatedDots,
  CALL_COLORS,
  CallAvatar,
  CallBackground,
  CallLogo,
} from "./CallVisuals";
import { useCallTone } from "./useCallTone";

// Shows full screen whenever state.call.incoming is set. That happens
// through the call:incoming socket event (useSocketConnection), or the
// safety-net check when the app comes back to the foreground.
// Mounted once in app/_layout.tsx, so it rings on any screen.
export default function IncomingCallListener() {
  const dispatch = useAppDispatch();
  const insets = useSafeAreaInsets();

  const token = useAppSelector((state) => state.auth.token);
  const incoming = useAppSelector((state) => state.call.incoming);

  const [answering, setAnswering] = useState(false);

  // Vibrate while ringing; stops automatically when the call is
  // answered, declined, cancelled or missed (incoming becomes null).
  useEffect(() => {
    if (!incoming) {
      return;
    }

    Vibration.vibrate([0, 800, 1200], true);

    return () => {
      Vibration.cancel();
    };
  }, [incoming]);

  // Ringtone while it rings (stops once you tap Accept, or the call ends).
  useCallTone("ringtone", !!incoming && !answering);

  if (!incoming || !token) {
    return null;
  }

  const callerName =
    incoming.caller?.name || incoming.caller?.username || "Someone";

  const callLabel =
    incoming.type === "video" ? "Incoming video call" : "Incoming voice call";

  const accept = async () => {
    if (answering) {
      return;
    }

    Vibration.cancel();

    const allowed = await ensureCallPermissions(incoming.type);

    if (!allowed) {
      return;
    }

    try {
      setAnswering(true);

      const result = await dispatch(
        acceptCall({ callId: incoming.id, token }),
      ).unwrap();

      // The call opens full screen by itself (ActiveCallOverlay).
      void result;
    } catch (error) {
      Alert.alert(
        "Call",
        typeof error === "string" ? error : "This call is no longer available.",
      );
    } finally {
      setAnswering(false);
    }
  };

  const decline = () => {
    dispatch(declineCall({ callId: incoming.id, token }));
  };

  return (
    <Modal
      visible
      animationType="fade"
      statusBarTranslucent
      onRequestClose={decline}>
      <CallBackground>
        <View style={[styles.top, { paddingTop: insets.top + 24 }]}>
          <CallLogo />
        </View>

        <View style={styles.center}>
          <CallAvatar source={getAvatarSource(incoming.caller)} />

          <Text style={styles.name} numberOfLines={1}>
            {callerName}
          </Text>

          <View style={styles.statusRow}>
            <Ionicons
              name={incoming.type === "video" ? "videocam" : "call"}
              size={15}
              color={CALL_COLORS.muted}
            />
            <Text style={styles.status}>{callLabel}</Text>
            <AnimatedDots />
          </View>
        </View>

        <View style={[styles.card, { marginBottom: insets.bottom + 20 }]}>
          <View style={styles.actions}>
            <View style={styles.actionItem}>
              <Pressable
                style={[styles.actionButton, styles.decline]}
                onPress={decline}
                disabled={answering}
                accessibilityRole="button"
                accessibilityLabel="Decline call">
                <MaterialIcons name="call-end" size={32} color="#FFFFFF" />
              </Pressable>
              <Text style={styles.actionLabel}>Decline</Text>
            </View>

            <View style={styles.actionItem}>
              <Pressable
                style={[styles.actionButton, styles.accept]}
                onPress={accept}
                disabled={answering}
                accessibilityRole="button"
                accessibilityLabel="Accept call">
                {answering ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Ionicons
                    name={incoming.type === "video" ? "videocam" : "call"}
                    size={30}
                    color="#FFFFFF"
                  />
                )}
              </Pressable>
              <Text style={styles.actionLabel}>Accept</Text>
            </View>
          </View>
        </View>
      </CallBackground>
    </Modal>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: "center" },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  name: {
    fontSize: 32,
    fontWeight: "800",
    color: CALL_COLORS.text,
    marginTop: 18,
    maxWidth: "90%",
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },

  status: { fontSize: 16, color: CALL_COLORS.muted },

  card: {
    marginHorizontal: 20,
    paddingVertical: 26,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  actions: {
    flexDirection: "row",
    justifyContent: "space-around",
  },

  actionItem: { alignItems: "center" },

  actionButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },

  decline: { backgroundColor: CALL_COLORS.red },

  accept: { backgroundColor: CALL_COLORS.green },

  actionLabel: {
    color: CALL_COLORS.muted,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 10,
  },
});
