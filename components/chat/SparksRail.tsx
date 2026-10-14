// ==========================================
// SPARKS RAIL (Figma M03 · Option A: side rail) + DORMANT CARD (M08)
// ==========================================
// Circles down the right side of the chat for active (pulsing) and pinned
// Sparks, each with its subject and "3 people"; quiet Sparks as small cards
// ("Route ideas · Quiet · Open ->"). Revived Sparks are teal with a clock.
// DormantSparkCard is the card shown in the main chat under a quiet Spark's
// last message. Built from the screenshots for testing.
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONTS } from "@/constants/fonts";
import { type Spark } from "@/services/sparks";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

const PINK = "#B63D91";
const TEAL = "#2A8A92";
const INK = "#24283C";
const MUTED = "#66738A";
const LILAC = "#F0EDF9";

const MAX_CIRCLES = 3;
const MAX_QUIET = 2;

function timeOf(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function SparkCircle({ spark, onPress }: { spark: Spark; onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const pulse = useRef(new Animated.Value(0)).current;
  const color = spark.revived ? TEAL : PINK;

  useEffect(() => {
    if (!spark.active) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [spark.active, pulse]);

  return (
    <Pressable onPress={onPress} style={styles.circleItem} accessibilityLabel={`Spark: ${spark.subject}`}>
      <View style={styles.circleWrap}>
        {spark.active ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pulse,
              {
                borderColor: color,
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }],
              },
            ]}
          />
        ) : null}
        <View style={[styles.circle, spark.revived && styles.circleRevived]}>
          <Ionicons name={spark.revived ? "time-outline" : "sparkles-outline"} size={24} color={color} />
        </View>
        {spark.pinned ? (
          <View style={styles.pinBadge}>
            <Ionicons name="pin" size={9} color="#FFFFFF" />
          </View>
        ) : null}
      </View>
      <Text style={styles.circleLabel} numberOfLines={2}>
        {spark.subject}
      </Text>
      <Text style={[styles.circlePeople, { color }]}>
        {spark.participantCount} {spark.participantCount === 1 ? "person" : "people"}
      </Text>
    </Pressable>
  );
}

function QuietCard({ spark, onPress }: { spark: Spark; onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <Pressable onPress={onPress} style={styles.quietCard} accessibilityLabel={`Quiet Spark: ${spark.subject}`}>
      <Text style={styles.quietTitle} numberOfLines={2}>
        {spark.subject}
      </Text>
      <Text style={styles.quietState}>Quiet</Text>
      <Text style={styles.quietOpen}>Open →</Text>
    </Pressable>
  );
}

export default function SparksRail({
  sparks,
  top,
  onOpen,
  onShowAll,
}: {
  sparks: Spark[];
  // Distance from the top of the chat (below the header / pinned bar).
  top: number;
  onOpen: (spark: Spark) => void;
  onShowAll: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  if (!sparks.length) {
    return null;
  }

  const circles = sparks.filter((spark) => spark.active || spark.pinned).slice(0, MAX_CIRCLES);
  const quiet = sparks.filter((spark) => !spark.active && !spark.pinned).slice(0, MAX_QUIET);
  const hidden = sparks.length - circles.length - quiet.length;

  return (
    <View style={[styles.rail, { top }]} pointerEvents="box-none">
      {circles.map((spark) => (
        <SparkCircle key={spark.id} spark={spark} onPress={() => onOpen(spark)} />
      ))}

      {quiet.map((spark) => (
        <QuietCard key={spark.id} spark={spark} onPress={() => onOpen(spark)} />
      ))}

      {hidden > 0 ? (
        <Pressable onPress={onShowAll} style={styles.allButton} accessibilityLabel="All Sparks">
          <Text style={styles.allText}>All · {sparks.length}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Figma M08: a quiet Spark's card in the main chat, under its last message.
export function DormantSparkCard({ spark, onOpen }: { spark: Spark; onOpen: (spark: Spark) => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.dormant}>
      <View style={styles.dormantHead}>
        <Ionicons name="time-outline" size={22} color={MUTED} />
        <Text style={styles.dormantTitle} numberOfLines={2}>
          {spark.subject}
        </Text>
        {spark.pinned ? <Ionicons name="pin" size={14} color={PINK} /> : null}
      </View>
      <Text style={styles.dormantMeta}>
        Quiet · last reply {timeOf(spark.lastActivityAt)} · {spark.messageCount}{" "}
        {spark.messageCount === 1 ? "message" : "messages"}
      </Text>
      {spark.summary ? (
        <Text style={styles.dormantSummary} numberOfLines={3}>
          {spark.summary}
        </Text>
      ) : null}
      <Pressable style={({ pressed }) => [styles.dormantButton, pressed && styles.pressed]} onPress={() => onOpen(spark)}>
        <Text style={styles.dormantButtonText}>Open conversation</Text>
      </Pressable>
    </View>
  );
}

// Every Spark: active, pinned, and quiet ones.
export function SparksListSheet({
  visible,
  sparks,
  onClose,
  onOpen,
}: {
  visible: boolean;
  sparks: Spark[];
  onClose: () => void;
  onOpen: (spark: Spark) => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
        <View style={styles.handle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Sparks in this chat</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={INK} />
          </Pressable>
        </View>
        <Text style={styles.sheetHint}>Sparks appear when the conversation needs them. Start one from any message.</Text>

        <ScrollView style={styles.list}>
          {sparks.length === 0 ? <Text style={styles.empty}>No Sparks yet.</Text> : null}
          {sparks.map((spark) => (
            <Pressable key={spark.id} style={styles.card} onPress={() => onOpen(spark)}>
              <View style={[styles.cardIcon, spark.revived && styles.circleRevived]}>
                <Ionicons
                  name={spark.active ? "sparkles-outline" : "time-outline"}
                  size={18}
                  color={spark.revived ? TEAL : PINK}
                />
              </View>
              <View style={styles.cardText}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {spark.subject}
                  </Text>
                  {spark.pinned ? <Ionicons name="pin" size={12} color={PINK} /> : null}
                </View>
                <Text style={styles.cardMeta}>
                  {spark.active ? `Active · ${spark.participantCount} people` : `Quiet · ${timeOf(spark.lastActivityAt)}`} ·{" "}
                  {spark.messageCount} messages{spark.revived ? " · revived" : ""}
                </Text>
                {spark.summary ? (
                  <Text style={styles.cardSummary} numberOfLines={2}>
                    {spark.summary}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const STYLE_PAIR = themedStyles({
  pressed: { opacity: 0.75 },

  // RAIL
  rail: { position: "absolute", right: 8, width: 82, alignItems: "center", gap: 14, zIndex: 5 },

  circleItem: { width: 82, alignItems: "center" },

  circleWrap: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },

  pulse: { position: "absolute", width: 56, height: 56, borderRadius: 28, borderWidth: 3 },

  circle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3DDED",
    borderWidth: 3,
    borderColor: "rgba(182,61,145,0.16)",
  },

  circleRevived: { backgroundColor: "#DDEFF2", borderColor: "rgba(42,138,146,0.18)" },

  pinBadge: {
    position: "absolute",
    top: 0,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: INK,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },

  circleLabel: {
    marginTop: 6,
    textAlign: "center",
    fontFamily: FONTS.semibold,
    fontSize: 12,
    lineHeight: 16,
    color: INK,
  },

  circlePeople: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 11, lineHeight: 14 },

  quietCard: { width: 76, padding: 10, borderRadius: 14, backgroundColor: LILAC },

  quietTitle: { fontFamily: FONTS.semibold, fontSize: 12, lineHeight: 16, color: INK },

  quietState: { marginTop: 4, fontFamily: FONTS.regular, fontSize: 11, color: MUTED },

  quietOpen: { marginTop: 6, fontFamily: FONTS.medium, fontSize: 12, color: PINK },

  allButton: { paddingHorizontal: 10, height: 26, borderRadius: 13, justifyContent: "center", backgroundColor: LILAC },

  allText: { fontFamily: FONTS.medium, fontSize: 11.5, color: PINK },

  // DORMANT CARD (M08)
  dormant: {
    marginTop: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(182,61,145,0.18)",
  },

  dormantHead: { flexDirection: "row", alignItems: "center", gap: 10 },

  dormantTitle: { flex: 1, fontFamily: FONTS.semibold, fontSize: 17, lineHeight: 22, color: INK },

  dormantMeta: { marginTop: 6, fontFamily: FONTS.regular, fontSize: 12, lineHeight: 17, color: MUTED },

  dormantSummary: { marginTop: 8, fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20, color: INK },

  dormantButton: {
    marginTop: 12,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: LILAC,
  },

  dormantButtonText: { fontFamily: FONTS.semibold, fontSize: 15, color: PINK },

  // LIST SHEET
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },

  sheet: {
    maxHeight: "80%",
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#FFFFFF",
  },

  handle: { alignSelf: "center", width: 42, height: 5, borderRadius: 3, backgroundColor: "#D5D5DA", marginBottom: 10 },

  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  sheetTitle: { fontFamily: FONTS.semibold, fontSize: 20, color: INK },

  sheetHint: { marginTop: 4, marginBottom: 12, fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 18, color: MUTED },

  list: { maxHeight: 520 },

  empty: { paddingVertical: 24, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, color: MUTED },

  card: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    marginBottom: 10,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(36,40,60,0.08)",
  },

  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3DDED",
  },

  cardText: { flex: 1, minWidth: 0 },

  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },

  cardTitle: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 15, color: INK },

  cardMeta: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5, color: MUTED },

  cardSummary: { marginTop: 6, fontFamily: FONTS.regular, fontSize: 13, lineHeight: 18, color: INK },
});
