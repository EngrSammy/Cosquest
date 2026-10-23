// ==========================================
// VOICE CHAT: session state, the header call button, the "Call live" card
// (Group Calls doc · board "Social call · Faction chat entry")
// ==========================================
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import CallNotesSheet, { callNotesEnabled } from "@/components/calls/CallNotesSheet";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { getPref, setPref } from "@/utils/prefsStorage";
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
  rememberVoiceChat(next.voiceRoom);
  minimized = false;
  emit();
}

export function updateVoiceRoom(room: VoiceRoom) {
  if (session && session.voiceRoom.id === room.id) {
    session = { ...session, voiceRoom: room };
    rememberVoiceChat(room);
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

  if (!room?.active || !room.memberCount) return <VoiceEndedCard conversationId={conversationId} />;

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

// ---------------------------------------------------------------------
// After a voice chat: "Voice chat ended · Sparks from this voice chat"
// ---------------------------------------------------------------------
// The server keeps each voice chat's Sparks notes (GET /api/calls/:id/outline
// takes a voice chat id), but no entry is posted in the chat when it ends.
// So this phone remembers the last voice chat you were in, per chat (for 3
// days), with the names of the people in it, and offers its notes. Only
// people who were in it can read them.
type RememberedVoiceChat = {
  roomId: string;
  startedAt: string;
  names: Record<string, string>;
  dismissed?: boolean;
};

const REMEMBER_FOR_MS = 3 * 24 * 3600 * 1000;
const voiceKey = (conversationId: string) => `voice.last.${conversationId}`;
const remembered = new Map<string, RememberedVoiceChat>();

function rememberVoiceChat(room: VoiceRoom) {
  if (!room?.id || !room.conversationId) return;
  const previous = remembered.get(room.conversationId);
  const same = previous?.roomId === room.id;
  const names: Record<string, string> = same ? { ...previous!.names } : {};
  room.members.forEach((member) => {
    const id = member.user?.id;
    if (id) names[id] = member.user.name || member.user.username || names[id] || "Someone";
  });
  const next: RememberedVoiceChat = {
    roomId: room.id,
    startedAt: room.startedAt || (same ? previous!.startedAt : new Date().toISOString()),
    names,
  };
  remembered.set(room.conversationId, next);
  setPref(voiceKey(room.conversationId), JSON.stringify(next));
}

function useRememberedVoiceChat(conversationId: string) {
  const [value, setValue] = useState<RememberedVoiceChat | null>(() => remembered.get(conversationId) || null);
  useEffect(() => {
    let cancelled = false;
    getPref(voiceKey(conversationId)).then((saved) => {
      if (cancelled || !saved) return;
      try {
        const parsed = JSON.parse(saved) as RememberedVoiceChat;
        if (!remembered.has(conversationId)) remembered.set(conversationId, parsed);
        setValue(remembered.get(conversationId) || parsed);
      } catch {}
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);
  const dismiss = () => {
    const current = remembered.get(conversationId) || value;
    if (!current) return;
    const next = { ...current, dismissed: true };
    remembered.set(conversationId, next);
    setPref(voiceKey(conversationId), JSON.stringify(next));
    setValue(next);
  };
  return { value, dismiss };
}

function VoiceEndedCard({ conversationId }: { conversationId: string }) {
  const ended = useThemedStyles(ENDED_STYLES);
  const ink = useInk();
  const token = useAppSelector((state) => state.auth.token);
  const myId = useAppSelector((state) => state.call.myUserId);
  const { value, dismiss } = useRememberedVoiceChat(conversationId);
  const [open, setOpen] = useState(false);

  if (!callNotesEnabled || !value || value.dismissed) return null;
  const started = new Date(value.startedAt);
  if (Number.isNaN(started.getTime()) || Date.now() - started.getTime() > REMEMBER_FOR_MS) return null;

  const when = started.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });
  const people = Object.keys(value.names).length;

  return (
    <>
      <View style={ended.card}>
        <View style={ended.icon}>
          <Ionicons name="mic-outline" size={18} color={ink.text(PINK)} />
        </View>
        <View style={ended.flex}>
          <Text style={ended.title} numberOfLines={1}>
            Voice chat ended
          </Text>
          <Text style={ended.meta} numberOfLines={1}>
            Started {when}
            {people ? ` · ${people} ${people === 1 ? "person" : "people"}` : ""}
          </Text>
          <Pressable onPress={() => setOpen(true)} hitSlop={8} style={ended.link} accessibilityRole="button">
            <Ionicons name="sparkles" size={13} color={ink.text(PINK)} />
            <Text style={ended.linkText}>Sparks from this voice chat</Text>
            <Ionicons name="chevron-forward" size={14} color={ink.text(PINK)} />
          </Pressable>
        </View>
        <Pressable onPress={dismiss} hitSlop={10} accessibilityLabel="Hide">
          <Ionicons name="close" size={18} color={ink.text(MUTED)} />
        </Pressable>
      </View>
      <CallNotesSheet
        callId={value.roomId}
        token={token}
        visible={open}
        onClose={() => setOpen(false)}
        nameOf={(userId) => (userId === myId ? "you" : value.names[userId] || "someone on the call")}
      />
    </>
  );
}

const ENDED_STYLES = themedStyles(
  {
    flex: { flex: 1, minWidth: 0 },
    card: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      marginHorizontal: 14,
      marginTop: 10,
      marginBottom: 4,
      padding: 14,
      borderRadius: 20,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "rgba(182,61,145,0.15)",
    },
    icon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(182,61,145,0.10)",
    },
    title: { fontFamily: FONTS.semibold, fontSize: 15, color: INK },
    meta: { marginTop: 1, fontFamily: FONTS.regular, fontSize: 12.5, color: MUTED },
    link: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
    linkText: { fontFamily: FONTS.semibold, fontSize: 13.5, color: PINK },
  },
  {
    card: { backgroundColor: "#262838", borderColor: "rgba(195,77,156,0.30)" },
    icon: { backgroundColor: "rgba(195,77,156,0.18)" },
    title: { color: "#F4F5FA" },
    meta: { color: "#B5BBCB" },
  },
);
