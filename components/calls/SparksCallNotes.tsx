// ==========================================
// SPARKS CALL NOTES (on the call screen)
// ==========================================
// The notice (first call only), a small "Sparks on" pill that pauses Sparks
// for you, live captions of the last few lines, the current Spark (topic)
// and a way into the Sparks panel (also: swipe the call screen right).
// Nothing is shown when Sparks isn't running on this phone.
import Ionicons from "@expo/vector-icons/Ionicons";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { CALL_COLORS } from "@/components/calls/CallVisuals";
import type { Call } from "@/services/calls";
import type { CallNotes } from "@/services/sparksCallNotes";

// Topic colours; a topic that comes back keeps its colour (colorIndex).
export const TOPIC_COLORS = ["#3FD3E0", "#F5A524", "#C5399A", "#2FB36B", "#8B7CF6", "#FF7A59", "#4C9AFF", "#E5D04B"];

export function nameOf(call: Call, userId: string, myUserId: string | null) {
  if (userId === myUserId) return "You";
  const person =
    call.members.find((m) => m.user.id === userId)?.user || (call.caller?.id === userId ? call.caller : null);
  return person?.name || person?.username || "Someone";
}

// memo: the call screen re-renders every second (timer); the notes only
// when the captions do (useSparksCallNotes keeps the same object till then).
export default memo(function SparksCallNotes({
  notes,
  call,
  myUserId,
  style,
  overlayBottom,
  onOpenSparks,
}: {
  notes: CallNotes;
  call: Call;
  myUserId: string | null;
  style?: StyleProp<ViewStyle>;
  /** Audio layout: float above the call controls (this far from the bottom) instead of taking space. */
  overlayBottom?: number;
  /** Opens the call's Sparks panel. */
  onOpenSparks?: () => void;
}) {
  const { phase, notice } = notes;
  if (phase === "off") return null;

  // 1. The notice, once.
  if (phase === "ask" && notice) {
    const card = (
      <View style={[styles.card, overlayBottom === undefined && style]}>
        <View style={styles.cardHead}>
          <Ionicons name="sparkles" size={16} color={CALL_COLORS.teal} />
          <Text style={styles.cardTitle}>{notice.title}</Text>
        </View>
        <Text style={styles.cardBody}>{notice.body}</Text>
        <View style={styles.cardButtons}>
          <Pressable style={[styles.button, styles.buttonGhost]} onPress={notes.decline} accessibilityRole="button">
            <Text style={styles.buttonGhostText}>{notice.declineLabel}</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.buttonMain]} onPress={notes.accept} accessibilityRole="button">
            <Text style={styles.buttonMainText}>{notice.acceptLabel}</Text>
          </Pressable>
        </View>
      </View>
    );
    // Over the whole screen, dimmed, so it never squeezes the call layout.
    return overlayBottom === undefined ? (
      card
    ) : (
      <View style={[StyleSheet.absoluteFill, styles.backdrop, { paddingBottom: overlayBottom }]}>{card}</View>
    );
  }

  // 2. The pill.
  const pill =
    phase === "on"
      ? notes.paused
        ? { text: "Sparks paused for you", dot: CALL_COLORS.muted, action: notes.togglePaused }
        : { text: notice?.indicatorLabel || "Sparks on", dot: CALL_COLORS.green, action: notes.togglePaused }
      : phase === "declined"
        ? { text: "Sparks off for you · Turn on", dot: CALL_COLORS.muted, action: notes.accept }
        : phase === "waiting"
          ? { text: "Sparks starts once Sparks AI has downloaded", dot: "#F5A524", action: undefined }
          : phase === "error"
            ? { text: "Sparks unavailable right now", dot: CALL_COLORS.red, action: undefined }
            : { text: "Starting Sparks", dot: "#F5A524", action: undefined };

  const topicColor = notes.topic ? TOPIC_COLORS[notes.topic.colorIndex % TOPIC_COLORS.length] : null;

  return (
    <View
      style={[styles.wrap, overlayBottom === undefined ? style : [styles.floating, { bottom: overlayBottom }]]}
      pointerEvents="box-none">
      <View style={styles.pillRow}>
        <Pressable
          style={styles.pill}
          onPress={pill.action}
          disabled={!pill.action}
          accessibilityRole={pill.action ? "button" : undefined}
          accessibilityLabel={pill.text}>
          <View style={[styles.dot, { backgroundColor: pill.dot }]} />
          <Text style={styles.pillText} numberOfLines={1}>
            {pill.text}
          </Text>
        </Pressable>
        {notes.topic && topicColor ? (
          <Pressable
            style={[styles.topic, { borderColor: topicColor }]}
            onPress={onOpenSparks}
            disabled={!onOpenSparks}
            accessibilityRole={onOpenSparks ? "button" : undefined}
            accessibilityLabel={`Spark: ${notes.topic.title}`}>
            <View style={[styles.dot, { backgroundColor: topicColor }]} />
            <Text style={styles.topicText} numberOfLines={1}>
              {notes.topic.title}
            </Text>
          </Pressable>
        ) : null}
        {onOpenSparks ? (
          <Pressable style={styles.open} onPress={onOpenSparks} accessibilityRole="button" accessibilityLabel="Open Sparks">
            <Text style={styles.openText}>Sparks ›</Text>
          </Pressable>
        ) : null}
      </View>

      {notes.lines.length ? (
        <View style={styles.captions}>
          {/* The call page shows the newest line; the Sparks panel has them all. */}
          {notes.lines.slice(-1).map((line) => (
            <Text key={line.key} style={[styles.line, !line.final && styles.linePartial]} numberOfLines={2}>
              <Text style={styles.speaker}>{nameOf(call, line.userId, myUserId)}: </Text>
              {line.text}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { alignSelf: "stretch", marginHorizontal: 20, gap: 8 },
  floating: { position: "absolute", left: 0, right: 0 },
  backdrop: { justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },

  pillRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1,
    borderColor: CALL_COLORS.glassBorder,
    maxWidth: "100%",
  },
  pillText: { color: CALL_COLORS.text, fontSize: 13, fontWeight: "600", flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },

  topic: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    maxWidth: 150,
  },
  open: { paddingHorizontal: 10, paddingVertical: 6 },
  openText: { color: CALL_COLORS.teal, fontSize: 13, fontWeight: "700" },
  topicText: { color: CALL_COLORS.text, fontSize: 12, fontWeight: "600", flexShrink: 1 },

  captions: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(0,0,0,0.35)",
    gap: 4,
  },
  line: { color: CALL_COLORS.text, fontSize: 14, lineHeight: 19 },
  linePartial: { color: CALL_COLORS.muted },
  speaker: { fontWeight: "700" },

  card: {
    alignSelf: "stretch",
    marginHorizontal: 20,
    borderRadius: 18,
    padding: 16,
    // Solid, so the call screen behind never shows through the text.
    backgroundColor: "#22101C",
    borderWidth: 1,
    borderColor: CALL_COLORS.glassBorder,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { color: CALL_COLORS.text, fontSize: 16, fontWeight: "800", flexShrink: 1 },
  cardBody: { color: CALL_COLORS.muted, fontSize: 13, lineHeight: 18, marginTop: 8 },
  cardButtons: { flexDirection: "row", gap: 10, marginTop: 14 },
  button: { flex: 1, borderRadius: 999, paddingVertical: 11, alignItems: "center" },
  buttonGhost: { borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  buttonGhostText: { color: CALL_COLORS.text, fontWeight: "700", fontSize: 14 },
  buttonMain: { backgroundColor: CALL_COLORS.pink },
  buttonMainText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
});
