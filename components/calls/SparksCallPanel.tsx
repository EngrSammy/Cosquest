// ==========================================
// SPARKS PANEL (swipe the call screen right)
// ==========================================
// Sparks in a call works like Sparks in chat: as people talk, Sparks picks
// out the topics, each one a Spark, and the live transcription goes under
// the Spark it belongs to. The Spark the call is on now is marked Live; one
// the call comes back to picks up where it left off. After the call, the
// same Sparks are written up (the call's entry in the chat opens them).
// Above the Sparks: who is in the call's transcript and who isn't (each
// phone writes down only its owner's voice), checked every 20 seconds, and
// a way into the full transcript.
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { callNotesEnabled } from "@/components/calls/CallNotesSheet";
import { CALL_COLORS } from "@/components/calls/CallVisuals";
import { setCallMinimized, useCallMinimized } from "@/components/calls/callUi";
import { TOPIC_COLORS, nameOf } from "@/components/calls/SparksCallNotes";
import { useCallCoverage } from "@/components/calls/TranscriptCoverage";
import { describeCoverage, inCallMissing, type TranscriptParticipant, type TranscriptSpeakers } from "@/services/callTranscriptCopy";
import type { Call } from "@/services/calls";
import type { CallNotes, CallSpark } from "@/services/sparksCallNotes";
import { useAppSelector } from "@/store/hooks";

type Coverage = { participants: TranscriptParticipant[]; speakers: TranscriptSpeakers };

/** Who's in the transcript: "2 of 4 people are in the transcript", then who's missing and why. */
export function TranscriptCoverageRow({
  coverage,
  myUserId,
  onOpenTranscript,
}: {
  coverage: Coverage | null;
  myUserId: string | null;
  onOpenTranscript: () => void;
}) {
  const summary = coverage ? describeCoverage(coverage.participants, myUserId, coverage.speakers, { live: true }) : null;
  const missing = coverage ? inCallMissing(coverage.participants, myUserId, coverage.speakers) : [];
  return (
    <View style={styles.coverage}>
      <View style={styles.coverageHead}>
        <Ionicons name="people-outline" size={16} color={CALL_COLORS.muted} />
        <Text style={styles.coverageTitle} numberOfLines={2}>
          {summary?.total ? summary.summary : "The call's transcript"}
        </Text>
      </View>
      {missing.map((m) => (
        <Text key={m.userId} style={styles.coverageLine} numberOfLines={2}>
          <Text style={styles.coverageMark}>• </Text>
          {m.text}
        </Text>
      ))}
      {summary?.explainer ? <Text style={styles.coverageNote}>{summary.explainer}</Text> : null}
      <Pressable
        onPress={onOpenTranscript}
        hitSlop={10}
        style={styles.coverageOpen}
        accessibilityRole="button"
        accessibilityLabel="Open the full transcript">
        <Text style={styles.coverageLink}>Full transcript ›</Text>
      </Pressable>
    </View>
  );
}

function LiveDot({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={styles.liveDotWrap}>
      <Animated.View
        style={[
          styles.liveRing,
          { borderColor: color, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }) },
          { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] }) }] },
        ]}
      />
      <View style={[styles.liveDot, { backgroundColor: color }]} />
    </View>
  );
}

function SparkCard({ spark, call, myUserId }: { spark: CallSpark; call: Call; myUserId: string | null }) {
  const color = spark.title ? TOPIC_COLORS[spark.colorIndex % TOPIC_COLORS.length] : CALL_COLORS.muted;
  const speakers = [...new Set(spark.lines.map((l) => nameOf(call, l.userId, myUserId)))];
  return (
    <View style={[styles.card, spark.live && { borderColor: color }]}>
      <View style={styles.cardHead}>
        {spark.live ? <LiveDot color={color} /> : <View style={[styles.dot, { backgroundColor: color }]} />}
        <Text style={styles.cardTitle} numberOfLines={2}>
          {spark.title ?? "Getting started"}
        </Text>
        {spark.live ? (
          <View style={[styles.badge, { backgroundColor: color }]}>
            <Text style={styles.badgeText}>Live</Text>
          </View>
        ) : spark.title ? (
          <Text style={styles.quiet}>Quiet</Text>
        ) : null}
      </View>
      {speakers.length ? (
        <Text style={styles.meta} numberOfLines={1}>
          {speakers.join(", ")} · {spark.lines.filter((l) => l.final).length} said
        </Text>
      ) : null}
      {spark.lines.map((line) => (
        <Text key={line.key} style={[styles.line, !line.final && styles.linePartial]}>
          <Text style={styles.speaker}>{nameOf(call, line.userId, myUserId)}: </Text>
          {line.text}
        </Text>
      ))}
    </View>
  );
}

export default function SparksCallPanel({
  notes,
  call,
  myUserId,
  topInset,
  bottomInset,
  onBack,
  coverage: coverageOverride,
  onOpenTranscript,
}: {
  notes: CallNotes;
  call: Call;
  myUserId: string | null;
  topInset: number;
  bottomInset: number;
  onBack: () => void;
  /** Fixed "who's in the transcript" (dev previews); otherwise it's fetched. */
  coverage?: Coverage | null;
  /** Default: minimizes the call and opens the transcript screen. */
  onOpenTranscript?: () => void;
}) {
  const scroll = useRef<ScrollView>(null);
  const token = useAppSelector((state) => state.auth.token);
  const minimized = useCallMinimized();
  // Fetched while the call screen is up (not minimized), every 20 s.
  const fetched = useCallCoverage({
    callId: call.id,
    token,
    enabled: callNotesEnabled && coverageOverride === undefined && !minimized,
  });
  const coverage = coverageOverride === undefined ? fetched : coverageOverride;
  const openTranscript =
    onOpenTranscript ||
    (() => {
      // The call keeps going under the green "return to call" bar.
      setCallMinimized(true);
      router.push(`/call-transcript/${encodeURIComponent(call.id)}`);
    });
  const named = notes.sparks.filter((s) => s.title).length;

  // Follow the conversation: keep the newest line in view.
  const lineCount = notes.sparks.reduce((n, s) => n + s.lines.length, 0);
  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [lineCount, notes.sparks.length]);

  const status =
    notes.phase === "on"
      ? notes.paused
        ? "Paused for you"
        : "Live"
      : notes.phase === "declined"
        ? "Off for you"
        : notes.phase === "waiting"
          ? "Starts once Sparks AI has downloaded"
          : null;

  return (
    <View style={[styles.root, { paddingTop: topInset + 12, paddingBottom: bottomInset + 12 }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.back} accessibilityRole="button" accessibilityLabel="Back to the call">
          <Ionicons name="chevron-back" size={20} color={CALL_COLORS.text} />
          <Text style={styles.backText}>Call</Text>
        </Pressable>
      </View>

      <View style={styles.titleRow}>
        <Ionicons name="sparkles" size={20} color={CALL_COLORS.teal} />
        <Text style={styles.title}>Sparks</Text>
        {status ? <Text style={styles.status}>{status}</Text> : null}
      </View>
      <Text style={styles.sub}>
        {named
          ? `${named} ${named === 1 ? "Spark" : "Sparks"} on this call so far`
          : "Sparks picks out the topics as people talk."}
      </Text>

      {notes.phase === "declined" ? (
        <Pressable style={styles.turnOn} onPress={notes.accept} accessibilityRole="button">
          <Text style={styles.turnOnText}>Turn on Sparks for you</Text>
        </Pressable>
      ) : null}

      {callNotesEnabled || coverageOverride !== undefined ? (
        <TranscriptCoverageRow coverage={coverage} myUserId={myUserId} onOpenTranscript={openTranscript} />
      ) : null}

      <ScrollView ref={scroll} style={styles.list} contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
        {notes.sparks.length ? (
          notes.sparks.map((spark) => <SparkCard key={spark.key} spark={spark} call={call} myUserId={myUserId} />)
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              Each topic becomes a Spark here, with what was said under it, live. When the call ends, Sparks writes up
              each one.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20 },

  header: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
  back: { flexDirection: "row", alignItems: "center", gap: 2 },
  backText: { color: CALL_COLORS.text, fontSize: 15, fontWeight: "600" },

  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: CALL_COLORS.text, fontSize: 28, fontWeight: "800", flexShrink: 1 },
  status: { color: CALL_COLORS.green, fontSize: 13, fontWeight: "700", marginLeft: 4 },
  sub: { color: CALL_COLORS.muted, fontSize: 14, marginTop: 4, marginBottom: 16 },

  turnOn: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: CALL_COLORS.pink,
    marginBottom: 14,
  },
  turnOnText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },

  list: { flex: 1 },

  coverage: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    backgroundColor: "rgba(0,0,0,0.25)",
    borderWidth: 1,
    borderColor: CALL_COLORS.glassBorder,
    gap: 4,
  },
  coverageHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  coverageTitle: { flex: 1, color: CALL_COLORS.text, fontSize: 13, fontWeight: "700" },
  coverageOpen: { alignSelf: "flex-start", marginLeft: 24, marginTop: 4 },
  coverageLink: { color: CALL_COLORS.teal, fontSize: 13, fontWeight: "700" },
  coverageLine: { color: CALL_COLORS.text, fontSize: 13, lineHeight: 18, marginLeft: 24 },
  coverageMark: { color: "#F5A524" },
  coverageNote: { color: CALL_COLORS.muted, fontSize: 12, lineHeight: 16, marginLeft: 24, marginTop: 2 },

  card: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 6,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardTitle: { color: CALL_COLORS.text, fontSize: 16, fontWeight: "800", flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  liveDotWrap: { width: 10, height: 10, alignItems: "center", justifyContent: "center" },
  liveDot: { width: 10, height: 10, borderRadius: 5 },
  liveRing: { position: "absolute", width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: "#14060F", fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  quiet: { color: CALL_COLORS.muted, fontSize: 12, fontWeight: "600" },
  meta: { color: CALL_COLORS.muted, fontSize: 12, marginBottom: 2 },

  line: { color: CALL_COLORS.text, fontSize: 14, lineHeight: 20 },
  linePartial: { color: CALL_COLORS.muted, fontStyle: "italic" },
  speaker: { fontWeight: "700" },

  empty: { paddingVertical: 30 },
  emptyText: { color: CALL_COLORS.muted, fontSize: 14, lineHeight: 20, textAlign: "center" },
});
