// ==========================================
// VOICE CHAT: session state, the header call button, the "Call live" card
// (Group Calls doc · board "Social call · Faction chat entry")
// ==========================================
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { FONTS } from "@/constants/fonts";
import { getSocket } from "@/services/socket";
import { getVoiceRoom, joinVoiceRoom, normalizeVoiceRoom, type VoiceJoinInfo, type VoiceRoom } from "@/services/voiceRooms";
import { useAppSelector } from "@/store/hooks";
import { ensureCallPermissions } from "@/utils/callHelpers";

const PINK = "#B63D91";
const INK = "#24283C";
const MUTED = "#66738A";

// ---------------------------------------------------------------------
// Session state (one voice chat at a time, app-wide)
// ---------------------------------------------------------------------
export type VoiceSession = VoiceJoinInfo & { title: string };

let session: VoiceSession | null = null;
let minimized = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function startVoiceSession(next: VoiceSession) {
  session = next;
  minimized = false;
  emit();
}

export function updateVoiceRoom(room: VoiceRoom) {
  if (session && session.voiceRoom.id === room.id) {
    session = { ...session, voiceRoom: room };
    emit();
  }
}

export function endVoiceSession() {
  session = null;
  minimized = false;
  emit();
}

export function setVoiceMinimized(value: boolean) {
  minimized = value;
  emit();
}

export function useVoiceSession() {
  return useSyncExternalStore(subscribe, () => session, () => session);
}

export function useVoiceMinimized() {
  return useSyncExternalStore(subscribe, () => minimized, () => minimized);
}

// ---------------------------------------------------------------------
// Joining (or starting) a voice chat
// ---------------------------------------------------------------------
export function useJoinVoice(conversationId: string, title: string) {
  const token = useAppSelector((state) => state.auth.token);
  const inCall = useAppSelector((state) => !!state.call.active);
  const [joining, setJoining] = useState(false);

  const join = async () => {
    if (!token || joining) return;
    if (session?.voiceRoom.conversationId === conversationId) {
      setVoiceMinimized(false);
      return;
    }
    if (inCall) {
      Alert.alert("Voice chat", "Finish your current call first.");
      return;
    }
    try {
      setJoining(true);
      if (Platform.OS !== "web" && !(await ensureCallPermissions("audio"))) return;
      const info = await joinVoiceRoom(conversationId, token);
      startVoiceSession({ ...info, title });
    } catch (error) {
      Alert.alert("Voice chat", error instanceof Error ? error.message : "Couldn't join the voice chat.");
    } finally {
      setJoining(false);
    }
  };

  return { join, joining };
}

// Live voice chat in this chat (kept current by the "voice:updated" event).
export function useLiveVoiceRoom(conversationId: string) {
  const token = useAppSelector((state) => state.auth.token);
  const [room, setRoom] = useState<VoiceRoom | null>(null);

  useEffect(() => {
    if (!token || !conversationId) return;
    let cancelled = false;
    getVoiceRoom(conversationId, token)
      .then((result) => !cancelled && setRoom(result))
      .catch(() => {});

    const socket: any = getSocket();
    const onUpdate = (payload: any) => {
      if (String(payload?.conversationId) !== String(conversationId)) return;
      const next = normalizeVoiceRoom(payload?.voiceRoom);
      setRoom(next);
      if (next) updateVoiceRoom(next);
    };
    socket?.on?.("voice:updated", onUpdate);
    return () => {
      cancelled = true;
      socket?.off?.("voice:updated", onUpdate);
    };
  }, [conversationId, token]);

  return room;
}

// ---------------------------------------------------------------------
// Header button: start or join the voice chat
// ---------------------------------------------------------------------
export function VoiceStartButton({ conversationId, title }: { conversationId: string; title: string }) {
  const { join, joining } = useJoinVoice(conversationId, title);
  return (
    <Pressable hitSlop={8} onPress={join} disabled={joining} accessibilityLabel="Start or join a voice chat">
      {joining ? <ActivityIndicator size="small" color={PINK} /> : <Ionicons name="call-outline" size={21} color="#C5399A" />}
    </Pressable>
  );
}

// ---------------------------------------------------------------------
// "CALL LIVE · Player 4 started a call · [N] on call · Join call"
// ---------------------------------------------------------------------
export function VoiceLiveCard({ conversationId, title }: { conversationId: string; title: string }) {
  const room = useLiveVoiceRoom(conversationId);
  const current = useVoiceSession();
  const { join, joining } = useJoinVoice(conversationId, title);

  if (!room?.active || !room.memberCount) return null;

  const mine = current?.voiceRoom.id === room.id;
  const starter = room.startedBy?.name || room.startedBy?.username || "Someone";

  return (
    <View style={styles.card}>
      {/* Mini orbit */}
      <View style={styles.mini}>
        <View style={styles.miniRing} />
        <View style={styles.miniCenter} />
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[styles.miniDot, { left: i % 2 ? 46 : 2, top: i < 2 ? 4 : 48 }]}
          />
        ))}
      </View>

      <View style={styles.flex}>
        <View style={styles.liveRow}>
          <View style={styles.liveDot} />
          <Text style={styles.live}>CALL LIVE</Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {starter} started a call
        </Text>
        <Text style={styles.count}>
          {room.memberCount} on call
        </Text>
        <Pressable style={[styles.join, joining && styles.off]} onPress={join} disabled={joining}>
          {joining ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.joinText}>{mine ? "Return to call" : "Join call"}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  off: { opacity: 0.6 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 4,
    padding: 16,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(182,61,145,0.15)",
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  mini: { width: 70, height: 70 },
  miniRing: {
    position: "absolute",
    left: 10,
    top: 10,
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "rgba(102,115,138,0.25)",
  },
  miniCenter: {
    position: "absolute",
    left: 22,
    top: 22,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#B9C0CC",
    backgroundColor: "#FFFFFF",
  },
  miniDot: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#C9B8E8",
    backgroundColor: "#EEE7F8",
  },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: PINK },
  live: { fontFamily: FONTS.semibold, fontSize: 11, letterSpacing: 0.5, color: PINK },
  title: { marginTop: 4, fontFamily: FONTS.semibold, fontSize: 16, color: INK },
  count: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12.5, color: MUTED },
  join: {
    marginTop: 10,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PINK,
  },
  joinText: { fontFamily: FONTS.semibold, fontSize: 15, color: "#FFFFFF" },
});
