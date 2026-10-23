// ==========================================
// WHO'S IN THIS TRANSCRIPT
// ==========================================
// Each phone writes down only its owner's voice, so a call's transcript can
// be missing people: their phone has no Sparks yet, Sparks was off for them,
// or they chose not to be transcribed. This card says so in plain words, with
// a chip per person (name + a short mark), so nobody reads a one-sided
// transcript as the whole call. The words come from services/callTranscriptCopy.ts.
//
// Also: useCallCoverage(), the light poll the in-call Sparks panel uses to
// show who is (and isn't) being written down while the call is on.
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { UI } from "@/components/chat/ui";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { fetchCallTranscript } from "@/services/callTranscript";
import {
  describeCoverage,
  type CoverageChip,
  type TranscriptParticipant,
  type TranscriptSpeakers,
} from "@/services/callTranscriptCopy";

const TEAL = "#2A8A92";
const AMBER = "#B7791F";

const CHIP_ICON: Record<CoverageChip["status"], { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  transcribed: { name: "checkmark-circle", color: TEAL },
  silent: { name: "ellipse-outline", color: UI.MUTED },
  no_sparks: { name: "cloud-download-outline", color: AMBER },
  not_accepted: { name: "pause-circle-outline", color: AMBER },
  declined: { name: "remove-circle-outline", color: UI.MUTED },
};

export default function TranscriptCoverage({
  participants,
  myUserId,
  speakers,
  live,
  style,
  onNavigate,
}: {
  participants: TranscriptParticipant[] | null | undefined;
  myUserId: string | null;
  speakers?: TranscriptSpeakers | null;
  /** The call is still going (present tense). */
  live?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Opens a screen (the Sparks setup). Default: router.push. */
  onNavigate?: (href: string) => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const coverage = describeCoverage(participants, myUserId, speakers, { live });
  if (!coverage.total) return null;

  return (
    <View style={[styles.card, style]} accessibilityLabel={coverage.summary}>
      {coverage.allIn ? (
        <View style={styles.noteRow}>
          <Ionicons name="checkmark-done" size={16} color={ink.text(TEAL)} />
          <Text style={styles.allIn}>{coverage.allIn}</Text>
        </View>
      ) : (
        <>
          {coverage.notes.map((note) => (
            <View key={note.kind} style={styles.noteRow}>
              <Ionicons
                name={note.kind.startsWith("me_") ? "person-circle-outline" : "information-circle-outline"}
                size={17}
                color={ink.text(note.kind === "no_sparks" || note.kind === "me_no_sparks" ? AMBER : UI.MUTED)}
                style={styles.noteIcon}
              />
              <View style={styles.noteBody}>
                <Text style={styles.note}>{note.text}</Text>
                {note.action ? (
                  <Pressable
                    onPress={() => (onNavigate ? onNavigate(note.action!.href) : router.push(note.action!.href as Href))}
                    accessibilityRole="button"
                    hitSlop={8}>
                    <Text style={styles.action}>{note.action.label} ›</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
          {coverage.explainer ? <Text style={styles.explainer}>{coverage.explainer}</Text> : null}
        </>
      )}

      <View style={styles.chips}>
        {coverage.chips.map((chip) => {
          const icon = CHIP_ICON[chip.status];
          return (
            <View
              key={chip.userId}
              style={[styles.chip, !chip.inTranscript && styles.chipOut]}
              accessibilityLabel={`${chip.name}${chip.isMe ? " (you)" : ""}: ${chip.mark}`}>
              <Ionicons name={icon.name} size={14} color={ink.text(icon.color)} />
              <Text style={styles.chipName} numberOfLines={1}>
                {chip.name}
                {chip.isMe ? <Text style={styles.chipYou}> (you)</Text> : null}
              </Text>
              <Text
                style={[styles.chipMark, (chip.status === "no_sparks" || chip.status === "not_accepted") && styles.chipMarkOut]}>
                {chip.mark}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Who's in a live call's transcript: the first page of the transcript
 * (limit 1 still carries everyone's status), now and every `everyMs` while
 * `enabled`. Errors keep the last answer (the row just doesn't update).
 */
export function useCallCoverage({
  callId,
  token,
  enabled,
  everyMs = 20_000,
}: {
  callId: string;
  token: string | null | undefined;
  enabled: boolean;
  everyMs?: number;
}) {
  const [coverage, setCoverage] = useState<{
    participants: TranscriptParticipant[];
    speakers: TranscriptSpeakers;
  } | null>(null);

  useEffect(() => {
    if (!enabled || !token || !callId) return;
    let cancelled = false;
    const load = () =>
      fetchCallTranscript(callId, token, { limit: 1 })
        .then((page) => {
          if (!cancelled && page.participants) setCoverage({ participants: page.participants, speakers: page.speakers });
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, everyMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [callId, token, enabled, everyMs]);

  return coverage;
}

const STYLE_PAIR = themedStyles({
  card: {
    borderRadius: UI.CARD_RADIUS,
    borderWidth: 1,
    borderColor: UI.BORDER,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  noteIcon: { marginTop: 1 },
  noteBody: { flex: 1, minWidth: 0, gap: 2 },
  note: { fontFamily: FONTS.medium, fontSize: 13.5, lineHeight: 19, color: UI.INK },
  allIn: { flex: 1, fontFamily: FONTS.medium, fontSize: 13.5, lineHeight: 19, color: UI.INK },
  action: { fontFamily: FONTS.semibold, fontSize: 13.5, color: UI.PINK, marginTop: 2 },
  explainer: { fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 17, color: UI.MUTED, marginLeft: 25 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: "100%",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#EAF7F8",
  },
  chipOut: { backgroundColor: "#F3F4F7" },
  chipName: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 12.5, color: UI.INK },
  chipYou: { fontFamily: FONTS.regular, color: UI.MUTED },
  chipMark: { fontFamily: FONTS.regular, fontSize: 12, color: UI.MUTED },
  chipMarkOut: { color: AMBER },
});
