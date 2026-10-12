// ==========================================
// SPARKS · OPTION B "TOP ORBIT" (Figma M04) + OPTION C "INLINE CARDS" (M05)
// ==========================================
// SparksOrbit: a strip under the pinned bar - pulsing circles for active
// (and pinned) Sparks with "3 people", then quiet Sparks as small cards
// ("Route ideas · Quiet · Open ->"). Scrolls sideways when there are many.
// SparkCard: the card shown inside the conversation after a Spark's latest
// message - lilac "Next CosQuest · 3 people planning Saturday >" while
// active (Option C), the dormant card (M08) when quiet.
// Which layout shows is set in constants/sparkLayout.ts.
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { DormantSparkCard } from "@/components/chat/SparksRail";
import { FONTS } from "@/constants/fonts";
import { type Spark } from "@/services/sparks";

const PINK = "#B63D91";
const TEAL = "#2A8A92";
const INK = "#24283C";
const MUTED = "#66738A";
const LILAC = "#F0EDF9";

function people(spark: Spark) {
  return `${spark.participantCount} ${spark.participantCount === 1 ? "person" : "people"}`;
}

function OrbitCircle({ spark, onPress }: { spark: Spark; onPress: () => void }) {
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
    <Pressable onPress={onPress} style={styles.item} accessibilityLabel={`Spark: ${spark.subject}`}>
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
          <View style={styles.pin}>
            <Ionicons name="pin" size={9} color="#FFFFFF" />
          </View>
        ) : null}
      </View>
      <Text style={styles.subject} numberOfLines={2}>
        {spark.subject}
      </Text>
      <Text style={[styles.people, { color }]}>{people(spark)}</Text>
    </Pressable>
  );
}

export default function SparksOrbit({
  sparks,
  onOpen,
  onShowAll,
}: {
  sparks: Spark[];
  onOpen: (spark: Spark) => void;
  onShowAll: () => void;
}) {
  if (!sparks.length) return null;

  const circles = sparks.filter((spark) => spark.active || spark.pinned);
  const quiet = sparks.filter((spark) => !spark.active && !spark.pinned).slice(0, 3);
  const hidden = sparks.length - circles.length - quiet.length;

  return (
    <View style={styles.strip}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {circles.map((spark) => (
          <OrbitCircle key={spark.id} spark={spark} onPress={() => onOpen(spark)} />
        ))}

        {quiet.map((spark) => (
          <Pressable key={spark.id} style={styles.quiet} onPress={() => onOpen(spark)}>
            <Text style={styles.quietTitle} numberOfLines={2}>
              {spark.subject}
            </Text>
            <Text style={styles.quietState}>Quiet</Text>
            <Text style={styles.quietOpen}>Open →</Text>
          </Pressable>
        ))}

        {hidden > 0 ? (
          <Pressable style={styles.all} onPress={onShowAll}>
            <Text style={styles.allText}>All · {sparks.length}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

// In the conversation after a Spark's latest message: the active inline
// card (Option C), or the dormant card when the Spark has gone quiet (M08).
export function SparkCard({ spark, onOpen }: { spark: Spark; onOpen: (spark: Spark) => void }) {
  if (!spark.active) return <DormantSparkCard spark={spark} onOpen={onOpen} />;

  return (
    <Pressable style={styles.inline} onPress={() => onOpen(spark)} accessibilityLabel={`Open Spark: ${spark.subject}`}>
      <Ionicons name={spark.revived ? "time-outline" : "sparkles-outline"} size={22} color={spark.revived ? TEAL : PINK} />
      <View style={styles.inlineText}>
        <Text style={styles.inlineTitle} numberOfLines={1}>
          {spark.subject}
        </Text>
        <Text style={styles.inlineMeta} numberOfLines={1}>
          {people(spark)} · {spark.summary ? spark.summary : "active now"}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={PINK} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // OPTION B: strip under the pinned bar
  strip: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(36,40,60,0.06)",
  },

  row: { alignItems: "flex-start", gap: 18, paddingHorizontal: 18, paddingVertical: 14 },

  item: { width: 96, alignItems: "center" },

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

  pin: {
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

  subject: { marginTop: 6, textAlign: "center", fontFamily: FONTS.semibold, fontSize: 12.5, lineHeight: 16, color: INK },

  people: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 11.5 },

  quiet: { width: 130, padding: 12, borderRadius: 16, backgroundColor: LILAC },

  quietTitle: { fontFamily: FONTS.semibold, fontSize: 13, lineHeight: 17, color: INK },

  quietState: { marginTop: 4, fontFamily: FONTS.regular, fontSize: 11.5, color: MUTED },

  quietOpen: { marginTop: 6, fontFamily: FONTS.medium, fontSize: 12.5, color: PINK },

  all: { alignSelf: "center", paddingHorizontal: 12, height: 30, borderRadius: 15, justifyContent: "center", backgroundColor: LILAC },

  allText: { fontFamily: FONTS.medium, fontSize: 12, color: PINK },

  // OPTION C: inline card in the conversation
  inline: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: LILAC,
    borderWidth: 1,
    borderColor: "rgba(182,61,145,0.18)",
  },

  inlineText: { flex: 1, minWidth: 0 },

  inlineTitle: { fontFamily: FONTS.semibold, fontSize: 16, color: INK },

  inlineMeta: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 12.5, color: MUTED },
});
