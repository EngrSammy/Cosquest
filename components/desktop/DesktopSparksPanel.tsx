// ==========================================
// SPARKS IN THIS CHAT (Figma D1 · right column)
// ==========================================
// Computer only: a third column beside the open chat, instead of the Spark
// strip under the pinned bar (phones keep the strip).
//   Active Sparks: pink circles ("Next CosQuest · Active · 3 people").
//   Quiet Sparks:  cards ("Route ideas · Quiet · September 19 · 6
//                  messages", summary, "Return to conversation ->").
//   Pinned in this group: the pinned message and who pinned it.
// Tapping a Spark opens its thread, exactly like the strip does.
import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import type { Spark } from "@/services/sparks";

const PINK = "#C34D9C";
const INK = "#24283C";
const MUTED = "#66738A";
const TEAL = "#2A8A92";

function people(count: number) {
  return `${count} ${count === 1 ? "person" : "people"}`;
}

function messagesLabel(count: number) {
  return `${count} ${count === 1 ? "message" : "messages"}`;
}

function dayLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString([], { month: "long", day: "numeric" });
}

// The chat and, on a computer, the panel beside it.
export function DesktopChatRow({ panel, children }: { panel: ReactNode; children: ReactNode }) {
  const styles = useThemedStyles(STYLE_PAIR);
  if (!panel) return <>{children}</>;
  return (
    <View style={styles.row}>
      <View style={styles.chat}>{children}</View>
      {panel}
    </View>
  );
}

export default function DesktopSparksPanel({
  sparks,
  pinnedText,
  pinnedBy,
  onOpen,
  onOpenPinned,
}: {
  sparks: Spark[];
  pinnedText?: string | null;
  pinnedBy?: string | null;
  onOpen: (spark: Spark) => void;
  onOpenPinned?: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();

  // Pinned Sparks never fade, so they count as live circles.
  const live = sparks.filter((spark) => spark.active || spark.pinned);
  const quiet = sparks
    .filter((spark) => !spark.active && !spark.pinned)
    .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());

  return (
    <View style={styles.panel}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.section}>SPARKS IN THIS CHAT</Text>

        {live.length ? (
          <View style={styles.circles}>
            {live.map((spark) => (
              <Pressable
                key={spark.id}
                style={styles.circleItem}
                onPress={() => onOpen(spark)}
                accessibilityRole="button"
                accessibilityLabel={`Open the ${spark.subject} Spark`}>
                <View style={[styles.circleOuter, spark.revived && styles.circleOuterRevived]}>
                  <View style={styles.circle}>
                    <Ionicons
                      name={spark.revived ? "time-outline" : "sparkles-outline"}
                      size={24}
                      color={ink.text(spark.revived ? TEAL : PINK)}
                    />
                  </View>
                </View>
                <Text style={styles.circleTitle} numberOfLines={2}>
                  {spark.subject}
                </Text>
                <Text style={[styles.circleState, spark.revived && styles.circleStateRevived]}>
                  {spark.pinned && !spark.active ? "Pinned" : spark.revived ? "Revived" : "Active"} ·{" "}
                  {people(spark.participantCount)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>No active Sparks right now.</Text>
        )}

        {quiet.slice(0, 6).map((spark) => (
          <Pressable key={spark.id} style={styles.card} onPress={() => onOpen(spark)}>
            <View style={styles.cardHead}>
              <Ionicons name="time-outline" size={18} color={ink.text(PINK)} />
              <Text style={styles.cardTitle} numberOfLines={1}>
                {spark.subject}
              </Text>
            </View>
            <Text style={styles.cardMeta}>
              Quiet{dayLabel(spark.lastActivityAt) ? ` · ${dayLabel(spark.lastActivityAt)}` : ""} ·{" "}
              {messagesLabel(spark.messageCount)}
            </Text>
            {spark.summary ? (
              <Text style={styles.cardText} numberOfLines={3}>
                {spark.summary}
              </Text>
            ) : null}
            <Text style={styles.cardLink}>Return to conversation →</Text>
          </Pressable>
        ))}

        {pinnedText ? (
          <Pressable style={styles.card} onPress={onOpenPinned} disabled={!onOpenPinned}>
            <Text style={styles.cardTitle}>Pinned in this group</Text>
            <Text style={styles.pinnedText} numberOfLines={3}>
              {pinnedText}
            </Text>
            {pinnedBy ? <Text style={styles.cardMeta}>{pinnedBy}</Text> : null}
          </Pressable>
        ) : null}

        <Text style={styles.footnote}>
          Sparks appear when the conversation needs them. Start one from any message.
        </Text>
      </ScrollView>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    row: { flex: 1, flexDirection: "row", minHeight: 0 },
    chat: { flex: 1, minWidth: 0 },

    panel: {
      width: 270,
      backgroundColor: "#F3F9FE",
      borderLeftWidth: 1,
      borderLeftColor: "rgba(36,40,60,0.06)",
    },
    content: { padding: 18, paddingBottom: 30 },
    section: { fontFamily: FONTS.medium, fontSize: 12, letterSpacing: 0.5, color: MUTED },
    empty: { marginTop: 12, fontFamily: FONTS.regular, fontSize: 12.5, color: MUTED },

    circles: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
    circleItem: { width: 108, alignItems: "center" },
    circleOuter: {
      width: 70,
      height: 70,
      borderRadius: 35,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(195,77,156,0.12)",
    },
    circleOuterRevived: { backgroundColor: "rgba(42,138,146,0.14)" },
    circle: {
      width: 58,
      height: 58,
      borderRadius: 29,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: PINK,
      backgroundColor: "#FFFFFF",
    },
    circleTitle: { marginTop: 8, textAlign: "center", fontFamily: FONTS.regular, fontSize: 12, color: INK },
    circleState: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 11, color: PINK },
    circleStateRevived: { color: TEAL },

    card: {
      marginTop: 16,
      padding: 12,
      borderRadius: 14,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#DAE5EF",
      shadowColor: "#000000",
      shadowOpacity: 0.06,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 3 },
    },
    cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
    cardTitle: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 15, color: INK },
    cardMeta: { marginTop: 3, fontFamily: FONTS.regular, fontSize: 12, color: MUTED },
    cardText: { marginTop: 8, fontFamily: FONTS.regular, fontSize: 13, lineHeight: 18, color: INK },
    cardLink: { marginTop: 8, fontFamily: FONTS.semibold, fontSize: 13, color: PINK },
    pinnedText: { marginTop: 6, fontFamily: FONTS.regular, fontSize: 13.5, lineHeight: 19, color: INK },
    footnote: { marginTop: 18, fontFamily: FONTS.regular, fontSize: 12, lineHeight: 17, color: MUTED },
  },
  {
    panel: { backgroundColor: "#1D1F2C", borderLeftColor: "rgba(255,255,255,0.06)" },
    section: { color: "#B5BBCB" },
    empty: { color: "#B5BBCB" },
    circleOuter: { backgroundColor: "rgba(195,77,156,0.2)" },
    circleOuterRevived: { backgroundColor: "rgba(42,138,146,0.22)" },
    circle: { backgroundColor: "#252837", borderColor: "#E07CC0" },
    circleTitle: { color: "#F4F5FA" },
    circleState: { color: "#F0A6D7" },
    circleStateRevived: { color: "#7FD3DA" },
    card: { backgroundColor: "#252837", borderColor: "rgba(255,255,255,0.12)" },
    cardTitle: { color: "#F4F5FA" },
    cardMeta: { color: "#B5BBCB" },
    cardText: { color: "#D5D8E4" },
    cardLink: { color: "#F0A6D7" },
    pinnedText: { color: "#F4F5FA" },
    footnote: { color: "#B5BBCB" },
  },
);
