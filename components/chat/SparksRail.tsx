// ==========================================
// SPARKS RAIL (layout option A: "side rail")
// ==========================================
// Circles down the right side of the chat: one per active (pulsing) or
// pinned Spark, with its subject. Revived Sparks pulse in a different
// colour. "All" opens every Spark, including quiet ones (static cards).
// (Options B-D - top orbit strip, inline cards, dark mode - would replace
// only this file; the panel and logic stay the same.)
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONTS } from "@/constants/fonts";
import { sparkColor, type Spark } from "@/services/sparks";

const MAX_CIRCLES = 4;

function timeAgo(value: string) {
  const ms = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return new Date(value).toLocaleDateString();
}

function SparkCircle({ spark, onPress }: { spark: Spark; onPress: () => void }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const color = sparkColor(spark);

  useEffect(() => {
    if (!spark.active) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [spark.active, pulse]);

  const initials =
    spark.subject
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() || "")
      .join("") || "⚡";

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
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
              },
            ]}
          />
        ) : null}
        <View style={[styles.circle, { backgroundColor: color }, !spark.active && styles.circleQuiet]}>
          <Text style={styles.circleText}>{initials}</Text>
        </View>
        {spark.pinned ? (
          <View style={styles.pinBadge}>
            <Ionicons name="pin" size={9} color="#FFFFFF" />
          </View>
        ) : null}
        {spark.revived ? (
          <View style={[styles.pinBadge, styles.revivedBadge]}>
            <Ionicons name="time" size={9} color="#FFFFFF" />
          </View>
        ) : null}
      </View>
      <Text style={styles.circleLabel} numberOfLines={2}>
        {spark.subject}
      </Text>
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
  const shown = sparks.filter((spark) => spark.active || spark.pinned).slice(0, MAX_CIRCLES);

  if (!sparks.length) {
    return null;
  }

  return (
    <View style={[styles.rail, { top }]} pointerEvents="box-none">
      {shown.map((spark) => (
        <SparkCircle key={spark.id} spark={spark} onPress={() => onOpen(spark)} />
      ))}

      <Pressable onPress={onShowAll} style={styles.allButton} accessibilityLabel="All Sparks">
        <Ionicons name="flash" size={13} color="#C34D9C" />
        <Text style={styles.allText}>{sparks.length}</Text>
      </Pressable>
    </View>
  );
}

// Every Spark: active (pulsing), pinned, and quiet ones as static cards.
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
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
        <View style={styles.handle} />
        <View style={styles.sheetHeader}>
          <Ionicons name="flash" size={18} color="#C34D9C" />
          <Text style={styles.sheetTitle}>Sparks</Text>
        </View>
        <Text style={styles.sheetHint}>Sub-conversations the Sparks bot found in this chat (or members started).</Text>

        <ScrollView style={styles.list}>
          {sparks.length === 0 ? <Text style={styles.empty}>No Sparks yet.</Text> : null}
          {sparks.map((spark) => (
            <Pressable key={spark.id} style={styles.card} onPress={() => onOpen(spark)}>
              <View style={[styles.cardDot, { backgroundColor: sparkColor(spark) }, spark.active && styles.cardDotActive]} />
              <View style={styles.cardText}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {spark.subject}
                  </Text>
                  {spark.pinned ? <Ionicons name="pin" size={12} color="#C34D9C" /> : null}
                </View>
                {spark.summary ? (
                  <Text style={styles.cardSummary} numberOfLines={2}>
                    {spark.summary}
                  </Text>
                ) : null}
                <Text style={styles.cardMeta}>
                  {spark.active ? "Active now" : `Quiet · ${timeAgo(spark.lastActivityAt)}`} · {spark.messageCount} messages
                  {spark.revived ? " · revived" : ""}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  rail: { position: "absolute", right: 8, alignItems: "center", gap: 10, zIndex: 5 },

  circleItem: { width: 62, alignItems: "center" },

  circleWrap: { width: 46, height: 46, alignItems: "center", justifyContent: "center" },

  pulse: { position: "absolute", width: 46, height: 46, borderRadius: 23, borderWidth: 3 },

  circle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },

  circleQuiet: { opacity: 0.75 },

  circleText: { fontFamily: FONTS.bold, fontSize: 14, color: "#FFFFFF" },

  pinBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 17,
    height: 17,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#191922",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },

  revivedBadge: { top: undefined, bottom: -2, backgroundColor: "#8E91F2" },

  circleLabel: {
    marginTop: 3,
    maxWidth: 62,
    textAlign: "center",
    fontFamily: FONTS.medium,
    fontSize: 9.5,
    lineHeight: 12,
    color: "#3B3B42",
    backgroundColor: "rgba(255,255,255,0.7)",
    borderRadius: 6,
    paddingHorizontal: 3,
    overflow: "hidden",
  },

  allButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 9,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: "rgba(195,77,156,0.35)",
  },

  allText: { fontFamily: FONTS.semibold, fontSize: 11.5, color: "#C34D9C" },

  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },

  sheet: {
    maxHeight: "80%",
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 10,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#FFFFFF",
  },

  handle: { alignSelf: "center", width: 42, height: 5, borderRadius: 3, backgroundColor: "#D5D5DA", marginBottom: 10 },

  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 6 },

  sheetTitle: { fontFamily: FONTS.semibold, fontSize: 18, color: "#191922" },

  sheetHint: { marginTop: 2, marginBottom: 10, fontFamily: FONTS.regular, fontSize: 12, color: "#7A7A84" },

  list: { maxHeight: 520 },

  empty: { paddingVertical: 24, textAlign: "center", fontFamily: FONTS.regular, fontSize: 13, color: "#7A7A84" },

  card: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: "#0000000D",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.75)",
  },

  cardDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4, opacity: 0.6 },

  cardDotActive: { opacity: 1 },

  cardText: { flex: 1, minWidth: 0 },

  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },

  cardTitle: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 14.5, color: "#191922" },

  cardSummary: { marginTop: 3, fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 17, color: "#4A4A52" },

  cardMeta: { marginTop: 4, fontFamily: FONTS.regular, fontSize: 11, color: "#7A7A84" },
});
