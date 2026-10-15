// ==========================================
// SPARK PANEL (Figma M07 active · M09 revived)
// ==========================================
// A rounded panel over the chat from the right (the main chat stays visible
// on the left). Header: subject + "Active · 3 people" (pink) or "Revived ·
// since Nov 2025" (teal). A "Sparks bot · Running summary" card. Each message
// with its date-time dot, avatar, name, Owner/Admin, rank line and bubble.
// Revived Sparks add a legend, a coloured timeline line (purple past ->
// teal today) and seam cards ("11 months later"). Reply box at the bottom.
// Admins: the ⋯ menu (pin, merge, delete). Built from the screenshots.
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { RankLine } from "@/components/chat/RankBadge";
import { FONTS } from "@/constants/fonts";
import {
  deleteSpark,
  eraColor,
  getSpark,
  mergeSpark,
  monthYear,
  pinSpark,
  replyInSpark,
  sparkColor,
  type Spark,
  type SparkSeam,
} from "@/services/sparks";
import { useAppSelector } from "@/store/hooks";
import { apiRequest } from "@/services/api";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

const PINK = "#B63D91";
const TEAL = "#2A8A92";
const INK = "#24283C";
const MUTED = "#66738A";
const LILAC = "#F0EDF9";

const AVATAR_TINTS = ["#E9E1F5", "#DCE8EF", "#F3DDED", "#E2F0E8", "#F5E6D8"];

function avatarTint(name?: string) {
  let hash = 0;
  for (const char of String(name || "")) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

function initialsOf(name?: string) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || "?").slice(0, 2);
  return letters.toUpperCase();
}

function messageText(message: any) {
  if (message.deleted) return "This message was deleted.";
  if (message.kind === "poll") return `📊 ${message.poll?.question || message.content || "Poll"}`;
  if (message.kind === "image") return message.content ? `📷 ${message.content}` : "📷 Photo";
  if (message.kind === "video") return message.content ? `🎥 ${message.content}` : "🎥 Video";
  if (message.kind === "audio") return message.media?.transcript ? `🎤 ${message.media.transcript}` : "🎤 Voice message";
  return message.content || "Message";
}

function timeOf(value?: string) {
  return value ? new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
}

// "Oct 8 · 9:30 AM" (with the year when it isn't this year).
function stampOf(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const day = date.toLocaleDateString([], { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
  return `${day} · ${timeOf(value)}`;
}

export default function SparkPanel({
  visible,
  conversationId,
  sparkId,
  token,
  otherSparks,
  refreshKey,
  onClose,
  onSent,
  onRemoved,
}: {
  visible: boolean;
  conversationId: string;
  sparkId: string | null;
  token: string;
  // For "Merge into…".
  otherSparks: Spark[];
  // Changes when this Spark is updated live -> reload.
  refreshKey: number;
  onClose: () => void;
  // A reply sent from the panel (also shown in the main chat).
  onSent: (message: any) => void;
  // Deleted / merged away.
  onRemoved: (sparkId: string) => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();
  const listRef = useRef<ScrollView>(null);
  const myUserId = useAppSelector((state) => String((state.auth.user as any)?.id || (state.call as any)?.myUserId || ""));

  const [spark, setSpark] = useState<Spark | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [seams, setSeams] = useState<SparkSeam[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showMerge, setShowMerge] = useState(false);

  // VOICE REPLIES inside the Spark: tap the mic to record, tap again to send.
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);

  const toggleVoice = async () => {
    if (!sparkId || sending) return;

    if (!recording) {
      try {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) {
          Alert.alert("Microphone", "Please allow CosQuest to use your microphone.");
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setRecording(true);
      } catch {
        Alert.alert("Voice reply", "Couldn't start recording.");
      }
      return;
    }

    try {
      setRecording(false);
      setSending(true);
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error("Nothing was recorded.");

      const form = new FormData();
      if (Platform.OS === "web") {
        const blob = await (await fetch(uri)).blob();
        form.append("media", blob, `voice-${Date.now()}.webm`);
      } else {
        form.append("media", { uri, name: `voice-${Date.now()}.m4a`, type: "audio/m4a" } as any);
      }
      form.append("sparkId", sparkId);

      const response = await apiRequest<any>(`/api/chats/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        body: form as any,
        token,
      });
      const raw = response?.message ?? response;
      const message = { ...raw, id: String(raw?.id ?? raw?._id ?? ""), conversationId };
      setMessages((current) => (current.some((m) => m.id === message.id) ? current : [...current, message]));
      onSent(message);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (error) {
      Alert.alert("Voice reply", error instanceof Error ? error.message : "Couldn't send the voice reply.");
    } finally {
      setSending(false);
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    }
  };

  const load = useCallback(async () => {
    if (!sparkId || !token) return;
    try {
      setLoading((current) => current || !spark);
      const result = await getSpark(conversationId, sparkId, token);
      setSpark(result.spark);
      setMessages(result.messages);
      setSeams(result.seams);
      setCanManage(result.canManage);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 50);
    } catch (error) {
      Alert.alert("Spark", error instanceof Error ? error.message : "Couldn't open this Spark.");
      onClose();
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, sparkId, token]);

  useEffect(() => {
    if (visible && sparkId) {
      setDraft("");
      setShowMenu(false);
      setShowMerge(false);
      load();
    }
    if (!visible) {
      setSpark(null);
      setMessages([]);
    }
  }, [visible, sparkId, load]);

  // Live: new messages / summary / revival for this Spark.
  useEffect(() => {
    if (visible && sparkId && refreshKey) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !sparkId || sending) return;
    try {
      setSending(true);
      const message = await replyInSpark(conversationId, sparkId, text, token);
      setDraft("");
      setMessages((current) => (current.some((m) => m.id === message.id) ? current : [...current, message]));
      onSent(message);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    } catch (error) {
      Alert.alert("Spark", error instanceof Error ? error.message : "Couldn't send.");
    } finally {
      setSending(false);
    }
  };

  const togglePin = async () => {
    if (!spark) return;
    setShowMenu(false);
    try {
      setSpark(await pinSpark(conversationId, spark.id, !spark.pinned, token));
    } catch (error) {
      Alert.alert("Spark", error instanceof Error ? error.message : "Couldn't change the pin.");
    }
  };

  const confirmDelete = () => {
    if (!spark) return;
    setShowMenu(false);
    Alert.alert(`Delete the "${spark.subject}" Spark?`, "This is an admin-only action. Its messages stay in the main chat.", [
      { text: "Keep Spark", style: "cancel" },
      {
        text: "Delete Spark",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteSpark(conversationId, spark.id, token);
            onRemoved(spark.id);
            onClose();
          } catch (error) {
            Alert.alert("Spark", error instanceof Error ? error.message : "Couldn't delete it.");
          }
        },
      },
    ]);
  };

  const mergeInto = (target: Spark) => {
    if (!spark) return;
    Alert.alert(
      `Merge into ${target.subject}?`,
      `Combine the ${spark.subject} and ${target.subject} conversation histories. No automatic merge: this needs your confirmation.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm merge",
          onPress: async () => {
            try {
              await mergeSpark(conversationId, spark.id, target.id, token);
              onRemoved(spark.id);
              onClose();
            } catch (error) {
              Alert.alert("Spark", error instanceof Error ? error.message : "Couldn't merge.");
            }
          },
        },
      ],
    );
  };

  const totalEras = spark?.eras?.length || 1;
  const revived = !!spark?.revived;
  const accent = spark ? sparkColor(spark) : PINK;
  const seamBefore = new Map(seams.map((seam) => [seam.beforeMessageId, seam.label]));
  const mergeTargets = otherSparks.filter((item) => item.id !== spark?.id);
  const firstEra = spark?.eras?.[0]?.startedAt || spark?.createdAt;
  const lastEra = spark?.eras?.[totalEras - 1]?.startedAt || spark?.lastActivityAt;

  const status = !spark
    ? ""
    : revived
      ? `Revived · since ${monthYear(firstEra)}`
      : spark.active
        ? `Active · ${spark.participantCount} ${spark.participantCount === 1 ? "person" : "people"}`
        : `Quiet · last reply ${timeOf(spark.lastActivityAt)}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* The main chat stays visible on the left; tap it to close. */}
        <Pressable style={styles.dim} onPress={onClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.panel, { marginTop: insets.top + 64, marginBottom: insets.bottom + 12 }]}>
          {/* HEADER */}
          <View style={styles.header}>
            <Ionicons name={revived ? "time-outline" : "sparkles-outline"} size={24} color={accent} />
            <View style={styles.headerText}>
              <Text style={styles.subject} numberOfLines={2}>
                {spark?.subject || "Spark"}
              </Text>
              {spark ? (
                <View style={styles.statusRow}>
                  <View style={[styles.statusDot, { backgroundColor: accent }]} />
                  <Text style={[styles.status, { color: accent }]} numberOfLines={1}>
                    {status}
                    {spark.pinned ? " · pinned" : ""}
                  </Text>
                </View>
              ) : null}
            </View>
            {canManage ? (
              <Pressable onPress={() => setShowMenu((current) => !current)} hitSlop={8} accessibilityLabel="Manage Spark">
                <Ionicons name="ellipsis-horizontal" size={22} color={MUTED} />
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={MUTED} />
            </Pressable>
          </View>

          {/* ADMIN MENU (M31 powers) */}
          {showMenu ? (
            <View style={styles.menu}>
              <Pressable style={styles.menuItem} onPress={togglePin}>
                <View style={styles.menuText}>
                  <Text style={styles.menuLabel}>{spark?.pinned ? "Unpin Spark" : "Pin Spark"}</Text>
                  <Text style={styles.menuHint}>Keep visible through quiet periods</Text>
                </View>
                <Ionicons name={spark?.pinned ? "pin" : "pin-outline"} size={20} color={MUTED} />
              </Pressable>
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  setShowMerge(true);
                }}>
                <Text style={[styles.menuLabel, styles.menuText]}>Merge into another Spark…</Text>
                <Ionicons name="git-merge-outline" size={20} color={MUTED} />
              </Pressable>
              <Pressable style={[styles.menuItem, styles.menuLast]} onPress={confirmDelete}>
                <Text style={[styles.menuLabel, styles.menuText, styles.danger]}>Delete Spark</Text>
                <Ionicons name="trash-outline" size={20} color="#C0394B" />
              </Pressable>
            </View>
          ) : null}

          {showMerge ? (
            <View style={styles.menu}>
              <Text style={styles.mergeTitle}>Merge into…</Text>
              {mergeTargets.length === 0 ? <Text style={styles.empty}>No other Sparks in this chat.</Text> : null}
              {mergeTargets.map((target) => (
                <Pressable key={target.id} style={styles.menuItem} onPress={() => mergeInto(target)}>
                  <View style={styles.menuText}>
                    <Text style={styles.menuLabel} numberOfLines={1}>
                      {target.subject}
                    </Text>
                    <Text style={styles.menuHint}>
                      {target.active ? `Active · ${target.participantCount} people` : "Quiet"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={MUTED} />
                </Pressable>
              ))}
              <Pressable style={[styles.menuItem, styles.menuLast]} onPress={() => setShowMerge(false)}>
                <Text style={[styles.menuLabel, styles.muted]}>Cancel</Text>
              </Pressable>
            </View>
          ) : null}

          {/* RUNNING SUMMARY (Figma M07/M09: stays at the top while the
              messages scroll under it) */}
          {!loading && spark?.summary ? (
            <View style={styles.summary}>
              <Text style={styles.summaryLabel}>Sparks bot · Running summary</Text>
              <Text style={styles.summaryText} numberOfLines={6}>
                {spark.summary}
              </Text>
            </View>
          ) : null}

          {loading ? (
            <ActivityIndicator color={PINK} style={styles.loading} />
          ) : (
            <ScrollView ref={listRef} style={styles.list} contentContainerStyle={styles.listContent}>

              {/* LEGEND (revived): past -> history -> today */}
              {revived ? (
                <View style={styles.legend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: eraColor(0, totalEras) }]} />
                    <Text style={styles.legendText}>{monthYear(firstEra)}</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: "#7E95D8" }]} />
                    <Text style={styles.legendText}>History</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: eraColor(totalEras - 1, totalEras) }]} />
                    <Text style={styles.legendText}>{monthYear(lastEra)}</Text>
                  </View>
                </View>
              ) : null}

              {/* MESSAGES (oldest first) */}
              {messages.map((message) => {
                const seam = seamBefore.get(message.id);
                const era = message.spark?.era ?? 0;
                const color = eraColor(era, totalEras);
                const name = message.sender?.name || message.sender?.username || "Someone";
                const mine = String(message.sender?.id || message.sender?._id || "") === myUserId;

                return (
                  <View key={message.id}>
                    {seam ? (
                      <View style={styles.seam}>
                        <Text style={styles.seamTitle}>{seam}</Text>
                        <Text style={styles.seamText}>Conversation resumed · {stampOf(message.createdAt).split(" · ")[0]}</Text>
                      </View>
                    ) : null}

                    <View style={[styles.messageWrap, revived && styles.timeline, revived && { borderLeftColor: color }]}>
                      <View style={styles.stampRow}>
                        <View style={[styles.stampDot, { backgroundColor: color }]} />
                        <Text style={[styles.stamp, { color }]}>{stampOf(message.createdAt)}</Text>
                      </View>

                      <View style={styles.senderRow}>
                        <View style={[styles.avatar, { backgroundColor: avatarTint(name) }]}>
                          <Text style={styles.avatarText}>{initialsOf(name)}</Text>
                        </View>
                        <View style={styles.senderText}>
                          <View style={styles.nameRow}>
                            <Text style={styles.name} numberOfLines={1}>
                              {name}
                            </Text>
                            {message.senderGroupRole ? (
                              <Text style={styles.role}>{message.senderGroupRole === "owner" ? "Owner" : "Admin"}</Text>
                            ) : null}
                          </View>
                          <RankLine rank={message.sender?.rank} />
                        </View>
                      </View>

                      <View style={[styles.bubble, mine && styles.bubbleMine]}>
                        <Text style={styles.bubbleText}>{messageText(message)}</Text>
                        <Text style={styles.bubbleTime}>
                          {timeOf(message.createdAt)}
                          {mine ? " · ✓✓" : ""}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
              {!messages.length ? <Text style={styles.empty}>No messages yet.</Text> : null}
            </ScrollView>
          )}

          {/* REPLY */}
          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder={recording ? "Recording… tap the red button to send" : "Reply to this Spark"}
              placeholderTextColor={MUTED}
              multiline
              maxLength={2000}
              style={styles.input}
            />
            <Pressable
              hitSlop={6}
              onPress={toggleVoice}
              accessibilityLabel={recording ? "Stop and send voice reply" : "Record a voice reply"}>
              <Ionicons
                name={recording ? "stop-circle" : "mic-outline"}
                size={recording ? 30 : 24}
                color={recording ? "#C0394B" : PINK}
              />
            </Pressable>
            <Pressable
              style={[styles.sendButton, (!draft.trim() || sending) && styles.sendOff]}
              disabled={!draft.trim() || sending}
              onPress={send}
              accessibilityLabel="Send">
              {sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="arrow-up" size={22} color="#FFFFFF" />}
            </Pressable>
          </View>

          {spark?.active && !revived ? (
            <Text style={styles.footer}>Also visible in the main conversation</Text>
          ) : (
            <Pressable onPress={onClose} hitSlop={6}>
              <Text style={styles.footerLink}>← Return to main conversation</Text>
            </Pressable>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const STYLE_PAIR = themedStyles({
  overlay: { flex: 1, flexDirection: "row" },

  dim: { flex: 1, backgroundColor: "rgba(36,40,60,0.18)" },

  panel: {
    width: "81%",
    maxWidth: 440,
    backgroundColor: "#FFFFFF",
    // Figma M07/M09: a floating card over the chat, not a flush sheet.
    borderRadius: 24,
    marginRight: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    shadowColor: "#24283C",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: -4, height: 4 },
    elevation: 10,
  },

  // HEADER
  header: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingBottom: 12 },

  headerText: { flex: 1, minWidth: 0 },

  subject: { fontFamily: FONTS.semibold, fontSize: 18, lineHeight: 24, color: INK },

  statusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },

  statusDot: { width: 7, height: 7, borderRadius: 4 },

  status: { flexShrink: 1, fontFamily: FONTS.regular, fontSize: 12.5 },

  // ADMIN MENU
  menu: { marginBottom: 12, paddingHorizontal: 12, borderRadius: 16, backgroundColor: LILAC },

  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(36,40,60,0.08)",
  },

  menuLast: { borderBottomWidth: 0 },

  menuText: { flex: 1, minWidth: 0 },

  menuLabel: { fontFamily: FONTS.semibold, fontSize: 14, color: INK },

  menuHint: { marginTop: 1, fontFamily: FONTS.regular, fontSize: 11.5, color: MUTED },

  mergeTitle: { paddingTop: 12, fontFamily: FONTS.semibold, fontSize: 12, color: MUTED },

  danger: { color: "#C0394B" },

  muted: { color: MUTED },

  loading: { paddingVertical: 30 },

  list: { flex: 1 },

  listContent: { paddingBottom: 12 },

  // SUMMARY
  summary: { padding: 14, borderRadius: 16, backgroundColor: LILAC, marginBottom: 14 },

  summaryLabel: { fontFamily: FONTS.semibold, fontSize: 12, color: PINK, marginBottom: 6 },

  summaryText: { fontFamily: FONTS.regular, fontSize: 14, lineHeight: 21, color: INK },

  // LEGEND (revived)
  legend: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12, paddingHorizontal: 2 },

  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },

  legendDot: { width: 7, height: 7, borderRadius: 4 },

  legendText: { fontFamily: FONTS.regular, fontSize: 11.5, color: MUTED },

  // MESSAGES
  messageWrap: { paddingBottom: 14 },

  // Revived: the coloured timeline line down the left.
  timeline: { borderLeftWidth: 3, paddingLeft: 10, marginLeft: 2 },

  stampRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 },

  stampDot: { width: 7, height: 7, borderRadius: 4 },

  stamp: { fontFamily: FONTS.regular, fontSize: 11.5 },

  senderRow: { flexDirection: "row", alignItems: "center", gap: 8 },

  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },

  avatarText: { fontFamily: FONTS.bold, fontSize: 10, color: "#7D356D" },

  senderText: { flex: 1, minWidth: 0, gap: 3 },

  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },

  name: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 13, color: INK },

  role: { fontFamily: FONTS.semibold, fontSize: 11, color: PINK },

  bubble: {
    marginTop: 8,
    marginLeft: 38,
    padding: 12,
    borderRadius: 16,
    borderTopLeftRadius: 4,
    // Figma M07/M09: soft grey bubbles on the white panel.
    backgroundColor: "#EEF1F6",
  },

  bubbleMine: { backgroundColor: "#EBCBE6" },

  bubbleText: { fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20, color: INK },

  bubbleTime: { marginTop: 8, fontFamily: FONTS.regular, fontSize: 11, color: MUTED },

  // SEAM ("11 months later")
  seam: { marginBottom: 14, padding: 12, borderRadius: 12, backgroundColor: "#DDEFF8" },

  seamTitle: { fontFamily: FONTS.semibold, fontSize: 14, color: TEAL },

  seamText: { marginTop: 3, fontFamily: FONTS.regular, fontSize: 11.5, color: MUTED },

  empty: { paddingVertical: 12, fontFamily: FONTS.regular, fontSize: 12.5, color: MUTED },

  // REPLY
  composer: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10 },

  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 110,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 22,
    backgroundColor: "#F0F4F9",
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: INK,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PINK,
  },

  sendOff: { opacity: 0.5 },

  footer: { marginTop: 12, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },

  footerLink: { marginTop: 12, fontFamily: FONTS.medium, fontSize: 12.5, color: PINK },
});
