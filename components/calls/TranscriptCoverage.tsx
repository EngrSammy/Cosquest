// ==========================================
// WHO'S IN THIS TRANSCRIPT
// ==========================================
// Each phone writes down only its owner's voice, so a call's transcript can
// be missing people: their phone needs Sparks, they turned transcription off
// for the call, or they opted out. One compact line says so
// ("2 of 4 in the transcript · Cy needs Sparks · Eve opted out"); tapping it
// shows the full sentences, a chip per person and why. The viewer's own
// missing lines get their own line with a way to fix it. The words come from
// services/callTranscriptCopy.ts.
//
// Two looks: "screen" (light/dark app screens) and "call" (on the dark call
// background). Also: useCallCoverage(), the light poll the in-call Sparks
// panel uses while the call is on.
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { CALL_COLORS } from "@/components/calls/CallVisuals";
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

const CHIP_ICON: Record<CoverageChip["status"], keyof typeof Ionicons.glyphMap> = {
  transcribed: "checkmark-circle",
  silent: "ellipse-outline",
  no_sparks: "cloud-download-outline",
  not_accepted: "pause-circle-outline",
  declined: "remove-circle-outline",
};

export default function TranscriptCoverage({
  participants,
  myUserId,
  speakers,
  tone = "screen",
  defaultExpanded = false,
  hideWhenAllIn = false,
  style,
  onNavigate,
}: {
  participants: TranscriptParticipant[] | null | undefined;
  myUserId: string | null;
  speakers?: TranscriptSpeakers | null;
  tone?: "screen" | "call";
  defaultExpanded?: boolean;
  /** Nothing at all when nobody is missing (the in-call panel). */
  hideWhenAllIn?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Opens a screen (the Sparks setup). Default: router.push. */
  onNavigate?: (href: string) => void;
}) {
  const themed = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const coverage = describeCoverage(participants, myUserId, speakers);
  if (!coverage.total || (hideWhenAllIn && coverage.allIn)) return null;

  const onCall = tone === "call";
  const styles = onCall ? CALL_STYLES : themed;
  const color = (light: string, call: string) => (onCall ? call : ink.text(light));
  const muted = color(UI.MUTED, CALL_COLORS.muted);
  const warn = color(AMBER, "#F5A524");
  const good = color(TEAL, CALL_COLORS.teal);
  const iconColor = (status: CoverageChip["status"]) =>
    status === "transcribed" ? good : status === "no_sparks" || status === "not_accepted" ? warn : muted;
  const mine = coverage.mine;
  const open = (href: string) => (onNavigate ? onNavigate(href) : router.push(href as Href));

  return (
    <View style={[styles.card, style]}>
      {mine ? (
        <Pressable
          style={styles.row}
          disabled={!mine.href}
          onPress={() => mine.href && open(mine.href)}
          accessibilityRole={mine.href ? "link" : undefined}>
          <Ionicons name="person-circle-outline" size={17} color={warn} style={styles.icon} />
          {/* "Your lines aren't here: get Sparks on this phone ›": the fix reads as the link. */}
          <Text style={styles.mine}>
            {mine.href && mine.text.includes(": ") ? (
              <>
                {mine.text.slice(0, mine.text.indexOf(": ") + 2)}
                <Text style={styles.link}>{mine.text.slice(mine.text.indexOf(": ") + 2)} ›</Text>
              </>
            ) : (
              mine.text
            )}
          </Text>
        </Pressable>
      ) : null}

      <Pressable
        style={styles.row}
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityHint={expanded ? "Hides who is in the transcript" : "Shows who is in the transcript"}>
        <Ionicons
          name={coverage.allIn ? "checkmark-done" : "people-outline"}
          size={16}
          color={coverage.allIn ? good : muted}
          style={styles.icon}
        />
        <Text style={styles.line} numberOfLines={expanded ? undefined : 2}>
          {coverage.line}
        </Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={muted} style={styles.icon} />
      </Pressable>

      {expanded ? (
        <View style={styles.more}>
          {coverage.notes.map((note) => (
            <Text key={note.kind} style={styles.note}>
              {note.text}
            </Text>
          ))}
          <View style={styles.chips}>
            {coverage.chips.map((chip) => (
              <View
                key={chip.userId}
                style={[styles.chip, !chip.inTranscript && styles.chipOut]}
                accessibilityLabel={`${chip.name}${chip.isMe ? " (you)" : ""}: ${chip.mark}`}>
                <Ionicons name={CHIP_ICON[chip.status]} size={14} color={iconColor(chip.status)} />
                <Text style={styles.chipName} numberOfLines={1}>
                  {chip.name}
                  {chip.isMe ? <Text style={styles.chipYou}> (you)</Text> : null}
                </Text>
                <Text style={[styles.chipMark, { color: iconColor(chip.status) }]}>{chip.mark}</Text>
              </View>
            ))}
          </View>
          {coverage.explainer ? <Text style={styles.explainer}>{coverage.explainer}</Text> : null}
        </View>
      ) : null}
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

const BASE = {
  card: { borderRadius: UI.CARD_RADIUS, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, gap: 6 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  icon: { marginTop: 2 },
  line: { flex: 1, fontFamily: FONTS.medium, fontSize: 13.5, lineHeight: 19 },
  mine: { flex: 1, fontFamily: FONTS.medium, fontSize: 13.5, lineHeight: 19 },
  link: { fontFamily: FONTS.semibold },
  more: { gap: 8, paddingLeft: 24, paddingBottom: 3 },
  note: { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 18 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: "100%",
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  chipOut: {},
  chipName: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 12.5 },
  chipYou: { fontFamily: FONTS.regular },
  chipMark: { fontFamily: FONTS.regular, fontSize: 12 },
  explainer: { fontFamily: FONTS.regular, fontSize: 12, lineHeight: 17 },
} as const;

const STYLE_PAIR = themedStyles({
  ...BASE,
  card: { ...BASE.card, borderColor: UI.BORDER, backgroundColor: "#FFFFFF" },
  line: { ...BASE.line, color: UI.INK },
  mine: { ...BASE.mine, color: UI.INK },
  link: { ...BASE.link, color: UI.PINK },
  note: { ...BASE.note, color: UI.INK },
  chip: { ...BASE.chip, backgroundColor: "#EAF7F8" },
  chipOut: { backgroundColor: "#F3F4F7" },
  chipName: { ...BASE.chipName, color: UI.INK },
  chipYou: { ...BASE.chipYou, color: UI.MUTED },
  explainer: { ...BASE.explainer, color: UI.MUTED },
});

// On the dark call background (the in-call Sparks panel).
const CALL_STYLES = StyleSheet.create({
  ...BASE,
  card: { ...BASE.card, borderRadius: 14, borderColor: CALL_COLORS.glassBorder, backgroundColor: "rgba(0,0,0,0.25)" },
  line: { ...BASE.line, fontFamily: undefined, fontWeight: "600", color: CALL_COLORS.text },
  mine: { ...BASE.mine, fontFamily: undefined, fontWeight: "600", color: CALL_COLORS.text },
  link: { fontWeight: "700", color: CALL_COLORS.teal },
  note: { ...BASE.note, fontFamily: undefined, color: CALL_COLORS.text },
  chip: { ...BASE.chip, backgroundColor: "rgba(63,211,224,0.14)" },
  chipOut: { backgroundColor: "rgba(255,255,255,0.08)" },
  chipName: { ...BASE.chipName, fontFamily: undefined, fontWeight: "700", color: CALL_COLORS.text },
  chipYou: { fontWeight: "400", color: CALL_COLORS.muted },
  chipMark: { ...BASE.chipMark, fontFamily: undefined },
  explainer: { ...BASE.explainer, fontFamily: undefined, color: CALL_COLORS.muted },
});
