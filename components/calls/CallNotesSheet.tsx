// ==========================================
// A CALL'S SPARKS (after the call)
// ==========================================
// What Sparks wrote up for a finished call: a summary, then each Spark
// (topic) with its points, decisions and to-dos. Written by the phones that
// were on the call and stored by our backend (GET /api/calls/:id/outline),
// so the website shows it too. Only people who were on the call (and the
// chat's admins) can read it.
// While the write-up isn't ready it checks again (every 15 s, every 60 s
// after five minutes) and listens for the "notes are ready" message on
// phones with Sparks. When nobody on the call had Sparks on, the server
// says so (status "none") and the sheet says there will be no notes.
// Quick notes (key lines picked from the transcript by CosQuest's server
// when no phone wrote the notes) are labelled, and replaced by full notes
// if a phone with Sparks writes them later: while quick notes are open the
// sheet keeps checking (every 30 s, for 10 minutes).
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TOPIC_COLORS } from "@/components/calls/SparksCallNotes";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { useIsDesktop } from "@/hooks/useDesktop";
import {
  QUICK_NOTES_MODEL,
  fetchCallOutline,
  transcriptsUnavailable,
  type CallOutlineReply,
  type TranscriptSpeakers,
} from "@/services/callTranscript";
import { firstName, joinNames, ownerLabel, personName, saidLabel, splitQuotes } from "@/services/callTranscriptCopy";
import { getSparksSdk, modelStatus, onModelStatus, sparksEnabled } from "@/services/sparksSdk";

import type { CallOutline } from "@cosquest/sparks-sdk";

// Sparks in calls needs the backend's Sparks module (same switch as the rest of Sparks).
export const callNotesEnabled = ["module", "qlm"].includes(String(process.env.EXPO_PUBLIC_SPARKS_ENGINE || ""));

const MINUTE = 60_000;

/** How long until the next check (null: stop). */
function nextCheckMs(loaded: Loaded, quick: boolean, openForMs: number): number | null {
  if (loaded.state === "pending") return openForMs < 5 * MINUTE ? 15_000 : 60_000;
  if (loaded.state === "ready" && quick && openForMs < 10 * MINUTE) return 30_000;
  return null;
}

/**
 * Does this phone already have the Sparks AI (the model that writes full
 * notes) downloaded? Speech files alone don't count. Website: true (nothing
 * to set up there).
 */
const AI_READY = ["ready", "loading", "loaded"];
function usePhoneHasSparksAI(active: boolean) {
  const [has, setHas] = useState(() => Platform.OS === "web" || AI_READY.includes(modelStatus()?.phase || ""));
  useEffect(() => {
    if (!active || Platform.OS === "web" || !sparksEnabled()) return;
    setHas(AI_READY.includes(modelStatus()?.phase || ""));
    return onModelStatus((status) => setHas(AI_READY.includes(status?.phase || "")));
  }, [active]);
  return has;
}

type Loaded =
  | { state: "loading" }
  | { state: "ready"; outline: CallOutline; speakers: TranscriptSpeakers }
  | { state: "pending"; quickNotes: boolean }
  | { state: "none" }
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
  const openedAt = useRef(Date.now());
  const phoneHasAI = usePhoneHasSparksAI(visible);
  // An older server (no quickNotes in its answer) has no transcripts: don't offer one.
  const [transcriptServer, setTranscriptServer] = useState(true);

  const fetchReply = useCallback(
    () => (load ? load() : token ? fetchCallOutline(callId, token) : Promise.reject(new Error("Log in to see this call's Sparks."))),
    [load, token, callId],
  );

  // On open, then again while the notes are being written (or are quick notes).
  useEffect(() => {
    if (!visible || (!token && !load)) return;
    let cancelled = false;
    if (check === 0) {
      openedAt.current = Date.now();
      setLoaded({ state: "loading" });
    }
    fetchReply()
      .then((reply) => {
        if (cancelled) return;
        setTranscriptServer(typeof reply.quickNotes === "boolean");
        setLoaded((current) =>
          reply.outline
            ? { state: "ready", outline: reply.outline, speakers: reply.speakers || {} }
            : current.state === "ready"
              ? { ...current } // already here (the phone's "ready" message): keep it
              : reply.status === "none"
                ? { state: "none" }
                : { state: "pending", quickNotes: Boolean(reply.quickNotes) },
        );
      })
      .catch((error: any) => {
        if (cancelled) return;
        // A failed re-check keeps what's shown (a fresh object, so the next check is scheduled).
        setLoaded((current) =>
          check === 0 ? { state: "error", message: error?.message || "Couldn't load this call's Sparks." } : { ...current },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [visible, token, load, fetchReply, check]);

  const outline = loaded.state === "ready" ? loaded.outline : null;
  const quick = outline?.generatedBy?.modelVersion === QUICK_NOTES_MODEL;

  // The next check, after each answer.
  useEffect(() => {
    if (!visible) return;
    const wait = nextCheckMs(loaded, quick, Date.now() - openedAt.current);
    if (wait === null) return;
    const timer = setTimeout(() => setCheck((n) => n + 1), wait);
    return () => clearTimeout(timer);
  }, [visible, loaded, quick]);

  // Closed: the next open starts fresh.
  useEffect(() => {
    if (!visible) setCheck(0);
  }, [visible]);

  // Phones with Sparks hear "notes ready" straight away (then fetch, for the names).
  const waiting = loaded.state === "pending" || (loaded.state === "ready" && quick);
  useEffect(() => {
    if (!visible || !waiting) return;
    const sdk = getSparksSdk();
    if (!sdk) return;
    return sdk.on("call.outlineReady", (ready) => {
      if (ready?.callId !== callId) return;
      setLoaded((current) => ({ state: "ready", outline: ready, speakers: current.state === "ready" ? current.speakers : {} }));
      setCheck((n) => n + 1);
    });
  }, [visible, waiting, callId]);

  const speakers = loaded.state === "ready" ? loaded.speakers : {};
  const topics = outline ? [...outline.topics].sort((a, b) => a.order - b.order) : [];

  // Names: the server's (covers group calls), then the chat's.
  const isMe = (userId: string) => Boolean(myUserId) && userId === myUserId;
  const nameFor = (userId: string) =>
    isMe(userId) ? "you" : speakers[userId]?.name || speakers[userId]?.username || nameOf(userId);
  const withWhom = (ids: string[]) => {
    const unique = [...new Set(ids)];
    const names = [...unique.filter((id) => !isMe(id)).map(nameFor), ...unique.filter(isMe).map(() => "you")];
    return names.length ? joinNames(names, 4) : "";
  };

  // One bullet. Quick notes quote people ("Ben: ...", sometimes a short
  // exchange "Amara: ...? Ben: ..."): each name becomes a bold label, with
  // "(you)" on the viewer's. A to-do with no name was said by its owner.
  const firstNames = Object.keys(speakers).map((id) => firstName(personName(id, speakers)));
  const bullet = (key: string, text: string, ownerUserId?: string) => {
    const parts = quick ? splitQuotes(text, firstNames) : [{ who: null, text }];
    const quoted = parts[0].who !== null;
    const ownerQuick = quick && ownerUserId ? ownerLabel(ownerUserId, myUserId, speakers, nameOf(ownerUserId)) : null;
    const labels = parts.map((part) => (part.who ? saidLabel(part.who, myUserId, speakers) : null));
    if (!quoted && ownerQuick) labels[0] = ownerQuick;
    // The owner, unless the line already ends with them speaking.
    const owner = !ownerUserId
      ? null
      : !quick
        ? nameFor(ownerUserId)
        : quoted && labels[labels.length - 1] !== ownerQuick
          ? ownerQuick
          : null;
    return (
      <View key={key} style={styles.bulletRow}>
        <Text style={styles.bullet}>•</Text>
        <Text style={[styles.bullet, styles.bulletText]}>
          {parts.map((part, i) => (
            <Text key={i}>
              {i > 0 ? " " : null}
              {labels[i] ? <Text style={styles.said}>{labels[i]}: </Text> : null}
              {part.text.trim()}
            </Text>
          ))}
          {owner ? <Text style={styles.owner}> ({owner})</Text> : null}
        </Text>
      </View>
    );
  };

  const openTranscript = () => {
    if (onOpenTranscript) return onOpenTranscript();
    onClose();
    router.push(`/call-transcript/${encodeURIComponent(callId)}`);
  };
  const showTranscript = loaded.state !== "none" && transcriptServer && !transcriptsUnavailable();

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
                <Text style={styles.pendingTitle}>
                  {loaded.quickNotes
                    ? "Notes appear a couple of minutes after the call."
                    : "Notes are written by the phone of someone on the call who has the Sparks AI download, next time they open CosQuest."}
                </Text>
              </View>
              <Text style={styles.pendingText}>This updates by itself.</Text>
              {phoneHasAI ? null : (
                <Pressable
                  onPress={() => {
                    onClose();
                    router.push("/sparks-model");
                  }}
                  accessibilityRole="link"
                  hitSlop={8}>
                  <Text style={styles.setupLink}>Set up Sparks on this phone ›</Text>
                </Pressable>
              )}
            </View>
          ) : loaded.state === "none" ? (
            <View style={styles.noneRow}>
              <Ionicons name="document-outline" size={20} color={ink.text("#8A8A90")} />
              <Text style={styles.noneText}>No notes for this call: nobody on it had Sparks turned on.</Text>
            </View>
          ) : loaded.state === "error" ? (
            <Text style={styles.empty}>{loaded.message}</Text>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
              {quick ? (
                <View style={styles.quick}>
                  <View style={styles.quickBadge}>
                    <Ionicons name="reader-outline" size={13} color={ink.text("#2A8A92")} />
                    <Text style={styles.quickBadgeText}>Quick notes</Text>
                  </View>
                  <Text style={styles.quickText}>Key lines from the call. Full notes need someone on the call with the Sparks AI download.</Text>
                </View>
              ) : null}
              {outline?.summary ? <Text style={styles.summary}>{outline.summary}</Text> : null}
              {topics.map((topic) => {
                const color = TOPIC_COLORS[topic.colorIndex % TOPIC_COLORS.length];
                const people = withWhom(topic.speakerIds || []);
                // Quick notes: the topic's summary is a quoted line too; it leads the
                // points (once, if it is also one of them).
                const points =
                  quick && topic.summary
                    ? [topic.summary, ...topic.points.filter((p) => p.trim() !== topic.summary.trim())]
                    : topic.points;
                return (
                  <View key={topic.topicId} style={[styles.topic, { borderLeftColor: color }]}>
                    <Text style={styles.topicTitle}>{topic.title}</Text>
                    {people ? <Text style={styles.people}>With {people}</Text> : null}
                    {topic.summary && !quick ? <Text style={styles.text}>{topic.summary}</Text> : null}
                    {points.map((point, i) => bullet(`p${i}`, point))}
                    {topic.decisions.length ? <Text style={styles.label}>Decided</Text> : null}
                    {topic.decisions.map((decision, i) => bullet(`d${i}`, decision))}
                    {topic.actionItems.length ? <Text style={styles.label}>To do</Text> : null}
                    {topic.actionItems.map((item, i) => bullet(`a${i}`, item.text, item.ownerUserId))}
                  </View>
                );
              })}
              {outline && !topics.length && !outline.summary ? (
                <Text style={styles.empty}>{"Sparks didn't pick up any topics on this call."}</Text>
              ) : null}
            </ScrollView>
          )}

          {/* Everything that was said (when there is a transcript to read). */}
          {showTranscript ? (
            <Pressable
              onPress={openTranscript}
              style={styles.transcriptButton}
              accessibilityRole="button"
              accessibilityLabel="Open the call's transcript">
              <Ionicons name="document-text-outline" size={17} color={ink.text("#C5399A")} />
              <Text style={styles.transcriptText}>Read the transcript</Text>
            </Pressable>
          ) : null}
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
    bulletRow: { flexDirection: "row", gap: 6, marginBottom: 2 },
    bulletText: { flex: 1 },
    owner: { color: "#8A8A90" },
    said: { fontFamily: FONTS.semibold, color: "#191922" },
    empty: { fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20, color: "#6B6B72", marginVertical: 24 },
    setupLink: { fontFamily: FONTS.semibold, fontSize: 14, color: "#C5399A", marginTop: 12, marginLeft: 30 },
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
    noneRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 6, marginBottom: 20 },
    noneText: { flex: 1, fontFamily: FONTS.medium, fontSize: 15, lineHeight: 21, color: "#3A3A44" },
    pendingRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    pendingTitle: { flex: 1, fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 21, color: "#191922" },
    pendingText: { fontFamily: FONTS.regular, fontSize: 13.5, lineHeight: 19, color: "#6B6B72", marginTop: 6, marginLeft: 30 },
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
    said: { color: "#F4F5FA" },
    empty: { color: "#B5BBCB" },
    people: { color: "#9AA1B4" },
    pendingTitle: { color: "#F4F5FA" },
    pendingText: { color: "#B5BBCB" },
    quickText: { color: "#9AA1B4" },
    noneText: { color: "#D9DCE6" },
  },
);
