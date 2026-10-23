// ==========================================
// A CALL'S SPARKS (after the call)
// ==========================================
// What Sparks wrote up for a finished call: a summary, then each Spark
// (topic) with its points, decisions and to-dos. Written by the phones that
// were on the call and stored by our backend (GET /api/calls/:id/outline),
// so the website shows it too. Only people who were on the call (and the
// chat's admins) can read it.
// While the write-up isn't ready it checks again every 15 seconds (and
// listens for the "notes are ready" message on phones with Sparks). Notes
// written by CosQuest's server from the transcript, without a model, are
// labelled "Quick notes". "Read the transcript" opens everything that was said.
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TOPIC_COLORS } from "@/components/calls/SparksCallNotes";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { useIsDesktop } from "@/hooks/useDesktop";
import {
  QUICK_NOTES_MODEL,
  fetchCallOutline,
  type CallOutlineReply,
  type TranscriptSpeakers,
} from "@/services/callTranscript";
import { joinNames } from "@/services/callTranscriptCopy";
import { getSparksSdk } from "@/services/sparksSdk";

import type { CallOutline } from "@cosquest/sparks-sdk";

// Sparks in calls needs the backend's Sparks module (same switch as the rest of Sparks).
export const callNotesEnabled = ["module", "qlm"].includes(String(process.env.EXPO_PUBLIC_SPARKS_ENGINE || ""));

const PENDING_POLL_MS = 15_000;

type Loaded =
  | { state: "loading" }
  | { state: "ready"; outline: CallOutline; speakers: TranscriptSpeakers }
  | { state: "pending" }
  | { state: "error"; message: string };

export default function CallNotesSheet({
  callId,
  token,
  visible,
  onClose,
  nameOf,
  myUserId,
  load,
  onOpenTranscript,
}: {
  callId: string;
  token: string | null | undefined;
  visible: boolean;
  onClose: () => void;
  /** A person's display name from their user id (people in this chat): used when the server sends no name. */
  nameOf: (userId: string) => string;
  /** The viewer: "you" in the notes. */
  myUserId?: string | null;
  /** Replaces the network (dev previews). */
  load?: () => Promise<CallOutlineReply>;
  /** Opens the call's transcript. Default: closes the sheet and opens the transcript screen. */
  onOpenTranscript?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  // Computers: a centred dialog instead of a bottom sheet.
  const desktop = useIsDesktop();
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [check, setCheck] = useState(0);

  const fetchReply = useCallback(
    () => (load ? load() : token ? fetchCallOutline(callId, token) : Promise.reject(new Error("Log in to see this call's Sparks."))),
    [load, token, callId],
  );

  // On open, then every 15 s while the notes are still being written.
  const pending = loaded.state === "pending";
  useEffect(() => {
    if (!visible || (!token && !load)) return;
    let cancelled = false;
    if (check === 0) setLoaded({ state: "loading" });
    fetchReply()
      .then((reply) => {
        if (cancelled) return;
        setLoaded((current) =>
          reply.outline
            ? { state: "ready", outline: reply.outline, speakers: reply.speakers || {} }
            : current.state === "ready"
              ? current // already here from the phone's "ready" message
              : { state: "pending" },
        );
      })
      .catch((error: any) => {
        // A failed re-check keeps the waiting message.
        if (!cancelled && check === 0) setLoaded({ state: "error", message: error?.message || "Couldn't load this call's Sparks." });
      });
    return () => {
      cancelled = true;
    };
  }, [visible, token, load, fetchReply, check]);

  useEffect(() => {
    if (!visible || !pending) return;
    const timer = setInterval(() => setCheck((n) => n + 1), PENDING_POLL_MS);
    return () => clearInterval(timer);
  }, [visible, pending]);

  // Closed: the next open starts fresh.
  useEffect(() => {
    if (!visible) setCheck(0);
  }, [visible]);

  // Phones with Sparks hear "notes ready" straight away (then fetch, for the names).
  useEffect(() => {
    if (!visible || !pending) return;
    const sdk = getSparksSdk();
    if (!sdk) return;
    return sdk.on("call.outlineReady", (outline) => {
      if (outline?.callId !== callId) return;
      setLoaded({ state: "ready", outline, speakers: {} });
      setCheck((n) => n + 1);
    });
  }, [visible, pending, callId]);

  const outline = loaded.state === "ready" ? loaded.outline : null;
  const speakers = loaded.state === "ready" ? loaded.speakers : {};
  const topics = outline ? [...outline.topics].sort((a, b) => a.order - b.order) : [];
  const quick = outline?.generatedBy?.modelVersion === QUICK_NOTES_MODEL;

  // Names: the server's (covers group calls), then the chat's.
  const isMe = (userId: string) => Boolean(myUserId) && userId === myUserId;
  const nameFor = (userId: string) =>
    isMe(userId) ? "you" : speakers[userId]?.name || speakers[userId]?.username || nameOf(userId);
  const withWhom = (ids: string[]) => {
    const unique = [...new Set(ids)];
    const names = [...unique.filter((id) => !isMe(id)).map(nameFor), ...unique.filter(isMe).map(() => "you")];
    return names.length ? joinNames(names, 4) : "";
  };

  const openTranscript = () => {
    if (onOpenTranscript) return onOpenTranscript();
    onClose();
    router.push(`/call-transcript/${encodeURIComponent(callId)}`);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.backdrop, desktop && styles.backdropDesktop]}>
        <View style={[styles.sheet, desktop && styles.sheetDesktop, { paddingBottom: desktop ? 22 : insets.bottom + 16 }]}>
          <View style={styles.header}>
            <Ionicons name="sparkles" size={18} color="#C5399A" />
            <Text style={styles.headerTitle} numberOfLines={2}>
              {outline?.title || "Sparks from this call"}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={ink.text("#191922")} />
            </Pressable>
          </View>

          {loaded.state === "loading" ? (
            <ActivityIndicator style={{ marginVertical: 40 }} color={ink.text("#C5399A")} />
          ) : loaded.state === "pending" ? (
            <View style={styles.pendingBox}>
              <View style={styles.pendingRow}>
                <ActivityIndicator size="small" color={ink.text("#C5399A")} />
                <Text style={styles.pendingTitle}>{"Notes usually appear a few minutes after the call."}</Text>
              </View>
              <Text style={styles.pendingText}>
                {
                  "They're written from what was said. A phone with Sparks that was on the call writes the fullest notes. This page updates by itself."
                }
              </Text>
              <Pressable
                onPress={() => {
                  onClose();
                  router.push("/sparks-model");
                }}
                accessibilityRole="button"
                hitSlop={8}>
                <Text style={styles.setupLink}>Set up Sparks on this phone ›</Text>
              </Pressable>
            </View>
          ) : loaded.state === "error" ? (
            <Text style={styles.empty}>{loaded.message}</Text>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
              {quick ? (
                <View style={styles.quick}>
                  <View style={styles.quickBadge}>
                    <Ionicons name="reader-outline" size={13} color={ink.text("#2A8A92")} />
                    <Text style={styles.quickBadgeText}>Quick notes · from the transcript</Text>
                  </View>
                  <Text style={styles.quickText}>
                    {"Written by CosQuest's server from what was said, without AI. Sparks on a phone writes fuller notes."}
                  </Text>
                </View>
              ) : null}
              {outline?.summary ? <Text style={styles.summary}>{outline.summary}</Text> : null}
              {topics.map((topic) => {
                const color = TOPIC_COLORS[topic.colorIndex % TOPIC_COLORS.length];
                const people = withWhom(topic.speakerIds || []);
                return (
                  <View key={topic.topicId} style={[styles.topic, { borderLeftColor: color }]}>
                    <Text style={styles.topicTitle}>{topic.title}</Text>
                    {people ? <Text style={styles.people}>With {people}</Text> : null}
                    {topic.summary ? <Text style={styles.text}>{topic.summary}</Text> : null}
                    {topic.points.map((point, i) => (
                      <Text key={`p${i}`} style={styles.bullet}>
                        • {point}
                      </Text>
                    ))}
                    {topic.decisions.length ? <Text style={styles.label}>Decided</Text> : null}
                    {topic.decisions.map((decision, i) => (
                      <Text key={`d${i}`} style={styles.bullet}>
                        • {decision}
                      </Text>
                    ))}
                    {topic.actionItems.length ? <Text style={styles.label}>To do</Text> : null}
                    {topic.actionItems.map((item, i) => (
                      <Text key={`a${i}`} style={styles.bullet}>
                        • {item.text}
                        {item.ownerUserId ? <Text style={styles.owner}> ({nameFor(item.ownerUserId)})</Text> : null}
                      </Text>
                    ))}
                  </View>
                );
              })}
              {outline && !topics.length && !outline.summary ? (
                <Text style={styles.empty}>{"Sparks didn't pick up any topics on this call."}</Text>
              ) : null}
            </ScrollView>
          )}

          {/* Everything that was said, whatever state the notes are in. */}
          <Pressable
            onPress={openTranscript}
            style={styles.transcriptButton}
            accessibilityRole="button"
            accessibilityLabel="Open the call's transcript">
            <Ionicons name="document-text-outline" size={17} color={ink.text("#C5399A")} />
            <Text style={styles.transcriptText}>Read the transcript</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const STYLE_PAIR = themedStyles(
  {
    backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
    backdropDesktop: { justifyContent: "center", alignItems: "center", padding: 24 },
    sheet: {
      maxHeight: "85%",
      backgroundColor: "#FFFFFF",
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 20,
      paddingTop: 16,
    },
    // Computers: centred, readable width, rounded all round.
    sheetDesktop: { width: "100%", maxWidth: 640, maxHeight: "80%", borderRadius: 24, paddingHorizontal: 26, paddingTop: 22 },
    header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
    headerTitle: { flex: 1, fontFamily: FONTS.bold, fontSize: 18, color: "#191922" },
    summary: { fontFamily: FONTS.regular, fontSize: 15, lineHeight: 22, color: "#191922", marginBottom: 16 },
    topic: { borderLeftWidth: 3, paddingLeft: 12, marginBottom: 16 },
    topicTitle: { fontFamily: FONTS.semibold, fontSize: 15, color: "#191922", marginBottom: 4 },
    text: { fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20, color: "#3A3A44", marginBottom: 4 },
    label: { fontFamily: FONTS.semibold, fontSize: 11.5, letterSpacing: 0.4, color: "#8A8A90", marginTop: 8, marginBottom: 2, textTransform: "uppercase" },
    bullet: { fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20, color: "#3A3A44" },
    owner: { color: "#8A8A90" },
    empty: { fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20, color: "#6B6B72", marginVertical: 24 },
    setupLink: { fontFamily: FONTS.semibold, fontSize: 14, color: "#C5399A", marginTop: 14 },
    people: { fontFamily: FONTS.regular, fontSize: 12.5, color: "#8A8A90", marginBottom: 4 },
    transcriptButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      height: 46,
      marginTop: 8,
      borderRadius: 14,
      backgroundColor: "#F7E8F2",
    },
    transcriptText: { fontFamily: FONTS.semibold, fontSize: 15, color: "#C5399A" },
    pendingBox: { marginTop: 4, marginBottom: 16 },
    pendingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    pendingTitle: { flex: 1, fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 21, color: "#191922" },
    pendingText: { fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20, color: "#6B6B72", marginTop: 8 },
    quick: { marginBottom: 14, gap: 6 },
    quickBadge: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: "#E6F5F6",
    },
    quickBadgeText: { fontFamily: FONTS.semibold, fontSize: 12, color: "#2A8A92" },
    quickText: { fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 18, color: "#8A8A90" },
  },
  // Dark mode
  {
    sheet: { backgroundColor: "#1F2130" },
    headerTitle: { color: "#F4F5FA" },
    summary: { color: "#F4F5FA" },
    topicTitle: { color: "#F4F5FA" },
    text: { color: "#D9DCE6" },
    label: { color: "#9AA1B4" },
    bullet: { color: "#D9DCE6" },
    owner: { color: "#9AA1B4" },
    empty: { color: "#B5BBCB" },
    people: { color: "#9AA1B4" },
    pendingTitle: { color: "#F4F5FA" },
    pendingText: { color: "#B5BBCB" },
    quickText: { color: "#9AA1B4" },
  },
);
