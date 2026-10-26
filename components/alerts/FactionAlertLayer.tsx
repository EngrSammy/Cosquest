// ==========================================
// "FACTION IN DANGER" - the alert everyone in the faction sees
// ==========================================
// Full screen, red, with the sender's photo and message, its own sound and
// vibration. "Respond" joins their call or voice chat (for 30 minutes);
// "Not now" closes it. Mounted once in app/_layout.tsx.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Easing, Modal, Pressable, Text, View } from "react-native";

import { startVoiceSession } from "@/components/voice/voiceUi";
import { FONTS } from "@/constants/fonts";
import { respondToFactionAlert } from "@/services/alerts";
import { normalizeCall } from "@/services/calls";
import { normalizeVoiceRoom } from "@/services/voiceRooms";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { joinedFromAlert } from "@/store/slices/callSlice";
import { ensureCallPermissions, getAvatarSource } from "@/utils/callHelpers";

import { playAlert } from "./alertSound";
import { dismissFactionAlert, useFactionAlert } from "./alertStore";

const RED = "#E5484D";

function minutesLeft(until: string) {
  return Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 60000));
}

export default function FactionAlertLayer() {
  const alert = useFactionAlert();
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.auth.token);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  const pulse = useRef(new Animated.Value(0)).current;

  const name = alert?.from?.name || alert?.from?.username || "Someone";
  const body = alert?.message ? `${name}: ${alert.message}` : `${name} needs backup.`;

  // Sound and vibration, once per alert.
  useEffect(() => {
    if (!alert) return;
    playAlert("Faction in danger", body, alert.alertId);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    const timer = setInterval(() => setTick((n) => n + 1), 30000);
    return () => {
      loop.stop();
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alert?.alertId]);

  if (!alert) return null;
  const left = minutesLeft(alert.respondUntil);

  const respond = async () => {
    if (!token || busy) return;
    if (!(await ensureCallPermissions("audio"))) return;
    setBusy(true);
    try {
      const reply = await respondToFactionAlert(alert.alertId, token);
      if (reply?.call) {
        // Like accepting a call: the call screen opens.
        dispatch(joinedFromAlert({ ...reply, call: normalizeCall(reply.call) }));
      } else if (reply?.voiceRoom) {
        const voiceRoom = normalizeVoiceRoom(reply.voiceRoom);
        if (voiceRoom) {
          startVoiceSession({
            voiceRoom,
            token: reply.token,
            livekitUrl: reply.livekitUrl,
            canModerate: Boolean(reply.canModerate),
            canManageStage: Boolean(reply.canManageStage),
            canEnd: Boolean(reply.canEnd),
            title: "Faction voice chat",
          });
        }
      }
      dismissFactionAlert();
    } catch (error) {
      Alert.alert("Respond", (error as any)?.message || "Couldn't join. The alert may have ended.");
    } finally {
      setBusy(false);
    }
  };

  const ring = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismissFactionAlert}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityLiveRegion="assertive" accessibilityLabel={`Faction in danger. ${body}`}>
          <View style={styles.header}>
            <Ionicons name="warning" size={18} color="#FFFFFF" />
            <Text style={styles.headerText}>FACTION IN DANGER</Text>
          </View>

          <View style={styles.avatarWrap}>
            <Animated.View style={[styles.glow, { opacity: glow, transform: [{ scale: ring }] }]} />
            <Image source={getAvatarSource(alert.from as any) as any} style={styles.avatar} contentFit="cover" />
            <View style={styles.flare}>
              <Ionicons name="flame" size={16} color="#FFFFFF" />
            </View>
          </View>

          <Text style={styles.name}>{name} needs backup</Text>
          {alert.message ? <Text style={styles.message}>“{alert.message}”</Text> : null}
          <Text style={styles.meta}>
            From a {alert.source === "call" ? "call" : "voice chat"} · {left > 0 ? `Respond within ${left} min` : "Ended"}
          </Text>

          <Pressable style={[styles.respond, (busy || left === 0) && styles.disabled]} onPress={respond} disabled={busy || left === 0} accessibilityRole="button">
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="call" size={20} color="#FFFFFF" />
                <Text style={styles.respondText}>Respond</Text>
              </>
            )}
          </Pressable>
          <Pressable style={styles.later} onPress={dismissFactionAlert} accessibilityRole="button">
            <Text style={styles.laterText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = {
  backdrop: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, padding: 24, backgroundColor: "rgba(20,4,8,0.78)" },
  card: { width: "100%" as const, maxWidth: 420, alignItems: "center" as const, paddingBottom: 22, borderRadius: 28, overflow: "hidden" as const, backgroundColor: "#FFFFFF" },
  header: { alignSelf: "stretch" as const, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 8, paddingVertical: 12, backgroundColor: RED },
  headerText: { fontFamily: FONTS.bold, fontSize: 14, letterSpacing: 1.2, color: "#FFFFFF" },
  avatarWrap: { marginTop: 28, width: 104, height: 104, alignItems: "center" as const, justifyContent: "center" as const },
  glow: { position: "absolute" as const, width: 104, height: 104, borderRadius: 52, backgroundColor: RED },
  avatar: { width: 92, height: 92, borderRadius: 46, borderWidth: 4, borderColor: RED, backgroundColor: "#EEE" },
  flare: { position: "absolute" as const, right: 2, bottom: 2, width: 32, height: 32, borderRadius: 16, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: RED, borderWidth: 3, borderColor: "#FFFFFF" },
  name: { marginTop: 16, paddingHorizontal: 20, textAlign: "center" as const, fontFamily: FONTS.bold, fontSize: 21, color: "#191922" },
  message: { marginTop: 8, paddingHorizontal: 24, textAlign: "center" as const, fontFamily: FONTS.medium, fontSize: 16, lineHeight: 22, color: "#3A3A44" },
  meta: { marginTop: 10, fontFamily: FONTS.regular, fontSize: 13, color: "#6B6F80" },
  respond: { marginTop: 22, width: "86%" as const, height: 56, borderRadius: 28, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 10, backgroundColor: RED },
  respondText: { fontFamily: FONTS.bold, fontSize: 17, color: "#FFFFFF" },
  disabled: { opacity: 0.5 },
  later: { marginTop: 10, paddingVertical: 10, paddingHorizontal: 20 },
  laterText: { fontFamily: FONTS.semibold, fontSize: 15, color: "#6B6F80" },
};
