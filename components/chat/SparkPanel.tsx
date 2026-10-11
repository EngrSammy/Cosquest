// ==========================================
// SPARK PANEL (side panel over the chat)
// ==========================================
// Spec: "Tapping a circle opens a side panel over the main feed, not a
// full-screen takeover, so the main chat stays alive underneath. The panel
// shows a running summary, the messages, and a reply box."
// Each message has a colour marker for where it sits in time (past ->
// present gradient); long silences show a seam ("11 months later").
// Admins: pin, merge into another Spark, delete.
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
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONTS } from "@/constants/fonts";
import {
  deleteSpark,
  eraColor,
  getSpark,
  mergeSpark,
  pinSpark,
  replyInSpark,
  sparkColor,
  type Spark,
  type SparkSeam,
} from "@/services/sparks";

const PINK = "#C34D9C";
const INK = "#191922";
const MUTED = "#7A7A84";

function messageText(message: any) {
  if (message.deleted) return "This message was deleted.";
  if (message.kind === "poll") return `📊 ${message.poll?.question || message.content || "Poll"}`;
  if (message.kind === "image") return message.content ? `📷 ${message.content}` : "📷 Photo";
  if (message.kind === "video") return message.content ? `🎥 ${message.content}` : "🎥 Video";
  if (message.kind === "audio") return message.media?.transcript ? `🎤 ${message.media.transcript}` : "🎤 Voice message";
  return message.content || "Message";
}

function timeLabel(value: string) {
  const date = new Date(value);
  const sameDay = date.toDateString() === new Date().toDateString();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return sameDay ? time : `${date.toLocaleDateString([], { day: "numeric", month: "short" })} ${time}`;
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
  const insets = useSafeAreaInsets();
  const listRef = useRef<ScrollView>(null);

  const [spark, setSpark] = useState<Spark | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [seams, setSeams] = useState<SparkSeam[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showMerge, setShowMerge] = useState(false);

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
    Alert.alert("Delete this Spark?", "Its messages stay in the main chat.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
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

  const mergeInto = async (target: Spark) => {
    if (!spark) return;
    try {
      await mergeSpark(conversationId, spark.id, target.id, token);
      onRemoved(spark.id);
      onClose();
    } catch (error) {
      Alert.alert("Spark", error instanceof Error ? error.message : "Couldn't merge.");
    }
  };

  const totalEras = spark?.eras?.length || 1;
  const seamBefore = new Map(seams.map((seam) => [seam.beforeMessageId, seam.label]));
  const mergeTargets = otherSparks.filter((item) => item.id !== spark?.id);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Tap the dimmed chat to close: the main chat stays visible. */}
        <Pressable style={styles.dim} onPress={onClose} />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[styles.panel, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
          {/* HEADER */}
          <View style={styles.header}>
            <View style={[styles.headerDot, { backgroundColor: spark ? sparkColor(spark) : PINK }]}>
              <Ionicons name="flash" size={14} color="#FFFFFF" />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.subject} numberOfLines={2}>
                {spark?.subject || "Spark"}
              </Text>
              {spark ? (
                <Text style={styles.meta} numberOfLines={1}>
                  {spark.active ? "Active" : "Quiet"} · {spark.messageCount} messages · {spark.participantCount}{" "}
                  {spark.participantCount === 1 ? "person" : "people"}
                  {spark.pinned ? " · pinned" : ""}
                </Text>
              ) : null}
            </View>
            {canManage ? (
              <Pressable onPress={() => setShowMenu((current) => !current)} hitSlop={8} accessibilityLabel="Spark options">
                <Ionicons name="ellipsis-vertical" size={20} color={INK} />
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={INK} />
            </Pressable>
          </View>

          {/* ADMIN MENU */}
          {showMenu ? (
            <View style={styles.menu}>
              <Pressable style={styles.menuItem} onPress={togglePin}>
                <Ionicons name={spark?.pinned ? "pin" : "pin-outline"} size={17} color={PINK} />
                <Text style={styles.menuText}>{spark?.pinned ? "Unpin (can fade when quiet)" : "Pin (never fades)"}</Text>
              </Pressable>
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setShowMenu(false);
                  setShowMerge(true);
                }}>
                <Ionicons name="git-merge-outline" size={17} color={PINK} />
                <Text style={styles.menuText}>Merge into another Spark…</Text>
              </Pressable>
              <Pressable style={styles.menuItem} onPress={confirmDelete}>
                <Ionicons name="trash-outline" size={17} color="#D64545" />
                <Text style={[styles.menuText, styles.danger]}>Delete Spark</Text>
              </Pressable>
            </View>
          ) : null}

          {showMerge ? (
            <View style={styles.menu}>
              <Text style={styles.mergeTitle}>Merge into…</Text>
              {mergeTargets.length === 0 ? <Text style={styles.metaPad}>No other Sparks in this chat.</Text> : null}
              {mergeTargets.map((target) => (
                <Pressable key={target.id} style={styles.menuItem} onPress={() => mergeInto(target)}>
                  <View style={[styles.smallDot, { backgroundColor: sparkColor(target) }]} />
                  <Text style={styles.menuText} numberOfLines={1}>
                    {target.subject}
                  </Text>
                </Pressable>
              ))}
              <Pressable style={styles.menuItem} onPress={() => setShowMerge(false)}>
                <Text style={[styles.menuText, styles.muted]}>Cancel</Text>
              </Pressable>
            </View>
          ) : null}

          {/* SUMMARY */}
          {spark?.summary ? (
            <View style={styles.summary}>
              <View style={styles.summaryHead}>
                <Ionicons name="sparkles" size={13} color={PINK} />
                <Text style={styles.summaryLabel}>{spark.summarizedByAi ? "Summary (Sparks bot)" : "Summary"}</Text>
              </View>
              <Text style={styles.summaryText}>{spark.summary}</Text>
            </View>
          ) : null}

          {/* MESSAGES (oldest first) */}
          {loading ? (
            <ActivityIndicator color={PINK} style={styles.loading} />
          ) : (
            <ScrollView ref={listRef} style={styles.list} contentContainerStyle={styles.listContent}>
              {messages.map((message) => {
                const seam = seamBefore.get(message.id);
                const era = message.spark?.era ?? 0;
                const color = eraColor(era, totalEras);

                return (
                  <View key={message.id}>
                    {seam ? (
                      <View style={styles.seam}>
                        <View style={styles.seamLine} />
                        <Text style={styles.seamText}>{seam}</Text>
                        <View style={styles.seamLine} />
                      </View>
                    ) : null}

                    <View style={styles.message}>
                      {/* where it sits in time: past -> present */}
                      <View style={[styles.eraMarker, { backgroundColor: color }]} />
                      <View style={styles.messageBody}>
                        <View style={styles.messageHead}>
                          <Text style={styles.sender} numberOfLines={1}>
                            {message.sender?.name || message.sender?.username || "Someone"}
                          </Text>
                          <Text style={styles.time}>{message.createdAt ? timeLabel(message.createdAt) : ""}</Text>
                        </View>
                        <Text style={styles.messageText}>{messageText(message)}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
              {!messages.length ? <Text style={styles.metaPad}>No messages yet.</Text> : null}
            </ScrollView>
          )}

          {/* REPLY (posts in the Spark, and shows in the main chat) */}
          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Reply in this Spark…"
              placeholderTextColor="#9C9CAA"
              multiline
              maxLength={2000}
              style={styles.input}
            />
            <Pressable
              style={[styles.sendButton, (!draft.trim() || sending) && styles.sendOff]}
              disabled={!draft.trim() || sending}
              onPress={send}
              accessibilityLabel="Send">
              {sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="send" size={16} color="#FFFFFF" />}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: "row" },

  dim: { flex: 1, backgroundColor: "rgba(0,0,0,0.25)" },

  panel: {
    width: "86%",
    maxWidth: 440,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
    paddingHorizontal: 14,
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: -4, height: 0 },
    elevation: 10,
  },

  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 10 },

  headerDot: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },

  headerText: { flex: 1, minWidth: 0 },

  subject: { fontFamily: FONTS.semibold, fontSize: 16, color: INK },

  meta: { marginTop: 1, fontFamily: FONTS.regular, fontSize: 11.5, color: MUTED },

  metaPad: { paddingVertical: 10, fontFamily: FONTS.regular, fontSize: 12.5, color: MUTED },

  menu: {
    marginBottom: 10,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: "#F7F2F6",
  },

  menuItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10 },

  menuText: { flex: 1, fontFamily: FONTS.medium, fontSize: 13.5, color: INK },

  mergeTitle: { paddingHorizontal: 12, paddingTop: 8, fontFamily: FONTS.semibold, fontSize: 12, color: MUTED },

  smallDot: { width: 10, height: 10, borderRadius: 5 },

  danger: { color: "#D64545" },

  muted: { color: MUTED },

  summary: {
    marginBottom: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(195,77,156,0.08)",
    borderWidth: 1,
    borderColor: "rgba(195,77,156,0.2)",
  },

  summaryHead: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 },

  summaryLabel: { fontFamily: FONTS.medium, fontSize: 11, color: PINK },

  summaryText: { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19, color: "#3B3B42" },

  loading: { paddingVertical: 30 },

  list: { flex: 1 },

  listContent: { paddingBottom: 10 },

  seam: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 10 },

  seamLine: { flex: 1, height: 1, backgroundColor: "rgba(142,145,242,0.4)" },

  seamText: { fontFamily: FONTS.semibold, fontSize: 11, color: "#8E91F2" },

  message: { flexDirection: "row", gap: 10, paddingVertical: 7 },

  eraMarker: { width: 4, borderRadius: 2 },

  messageBody: { flex: 1, minWidth: 0 },

  messageHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },

  sender: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 12.5, color: PINK },

  time: { fontFamily: FONTS.regular, fontSize: 10.5, color: MUTED },

  messageText: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 14, lineHeight: 19, color: INK },

  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingTop: 8 },

  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 21,
    backgroundColor: "rgba(11,7,19,0.07)",
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: INK,
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null),
  },

  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PINK,
  },

  sendOff: { opacity: 0.5 },
});
