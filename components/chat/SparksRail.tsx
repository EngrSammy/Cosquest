// ==========================================
// SPARKS RAIL (Figma M03 · Option A: side rail) + DORMANT CARD (M08)
// ==========================================
// Circles down the right side of the chat, each with a gradient ring, the
// sparkle icon, its subject and "3 people" (quiet Sparks: "Quiet", a grey
// ring). Active ones pulse; revived ones get a teal ring. "Create Spark"
// at the end starts a new one.
// DormantSparkCard is the card shown in the main chat under a quiet Spark's
// last message. Built from the screenshots for testing.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as React from "react";
import { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONTS } from "@/constants/fonts";
import { type Spark } from "@/services/sparks";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

const PINK = "#B63D91";
const TEAL = "#2A8A92";
const INK = "#24283C";
const MUTED = "#66738A";
const LILAC = "#F0EDF9";

// Circles shown on the rail (active and pinned first, then quiet); the
// rest are under "All".
const MAX_CIRCLES = 3;

const SPARKLE = require("@/assets/images/magenta-sparkles.png");
const SPARKLE_WHITE = require("@/assets/images/white-sparkles.png");

// Ring gradients (Figma): taken in turn, so neighbours differ.
const RINGS: [string, string][] = [
  ["#F05DB4", "#7E2A63"],
  ["#F5A524", "#B63D91"],
  ["#8E6CF0", "#B63D91"],
];
const REVIVED_RING: [string, string] = ["#5CCBD1", "#1F6F77"];
const QUIET_RING: [string, string] = ["#D3D8E2", "#9AA3B5"];
const CREATE_RING: [string, string] = ["#3DDC84", "#B63D91"];
const CREATE_FILL: [string, string] = ["#B63D91", "#2E6B5E"];

const CIRCLE = 58;
const RING_W = 3;

// A gradient ring around a filled middle with the sparkle icon.
function RingCircle({
  ring,
  fill,
  white,
}: {
  ring: [string, string];
  fill?: [string, string];
  white?: boolean;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <LinearGradient colors={ring} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ring}>
      {fill ? (
        <LinearGradient colors={fill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ringInner}>
          <Image source={white ? SPARKLE_WHITE : SPARKLE} style={styles.sparkle} contentFit="contain" />
        </LinearGradient>
      ) : (
        <View style={styles.ringInner}>
          <Image source={white ? SPARKLE_WHITE : SPARKLE} style={styles.sparkle} contentFit="contain" />
        </View>
      )}
    </LinearGradient>
  );
}

function timeOf(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function SparkCircle({ spark, index, onPress }: { spark: Spark; index: number; onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const pulse = useRef(new Animated.Value(0)).current;
  const quiet = !spark.active && !spark.pinned;
  const ring = spark.revived ? REVIVED_RING : quiet ? QUIET_RING : RINGS[index % RINGS.length];
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
    <Pressable
      onPress={onPress}
      style={styles.circleItem}
      accessibilityLabel={`${quiet ? "Quiet Spark" : "Spark"}: ${spark.subject}`}>
      <View style={styles.circleWrap}>
        {spark.active ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pulse,
              {
                borderColor: ring[0],
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] }) }],
              },
            ]}
          />
        ) : null}
        <View style={[styles.shadow, quiet && styles.quiet]}>
          <RingCircle ring={ring} />
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
      {quiet ? (
        <Text style={styles.circleQuiet}>Quiet</Text>
      ) : (
        <Text style={[styles.circlePeople, { color }]}>
          {spark.participantCount} {spark.participantCount === 1 ? "person" : "people"}
        </Text>
      )}
    </Pressable>
  );
}

function CreateCircle({ onPress }: { onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <Pressable onPress={onPress} style={styles.circleItem} accessibilityRole="button" accessibilityLabel="Create Spark">
      <View style={styles.circleWrap}>
        <View style={styles.shadow}>
          <RingCircle ring={CREATE_RING} fill={CREATE_FILL} white />
        </View>
      </View>
      <Text style={styles.circleLabel}>Create Spark</Text>
    </Pressable>
  );
}

export default function SparksRail({
  sparks,
  top,
  onOpen,
  onShowAll,
  onCreate,
}: {
  sparks: Spark[];
  // Distance from the top of the chat (below the header / pinned bar).
  top: number;
  onOpen: (spark: Spark) => void;
  onShowAll: () => void;
  // "Create Spark" circle at the end, shown even when there are no Sparks yet
  // (left out when not given).
  onCreate?: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  if (!sparks.length && !onCreate) {
    return null;
  }

  const lit = sparks.filter((spark) => spark.active || spark.pinned);
  const quiet = sparks.filter((spark) => !spark.active && !spark.pinned);
  const circles = [...lit, ...quiet].slice(0, MAX_CIRCLES);
  const hidden = sparks.length - circles.length;

  return (
    <View style={[styles.rail, { top }]} pointerEvents="box-none">
      {circles.map((spark, index) => (
        <SparkCircle key={spark.id} spark={spark} index={index} onPress={() => onOpen(spark)} />
      ))}

      {hidden > 0 ? (
        <Pressable onPress={onShowAll} style={styles.allButton} accessibilityLabel="All Sparks">
          <Text style={styles.allText}>All · {sparks.length}</Text>
        </Pressable>
      ) : null}

      {onCreate ? <CreateCircle onPress={onCreate} /> : null}
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
// The list of a chat's Sparks with the All / History filter: inside the
// "All Sparks" sheet (from the rail) and on the group's Sparks page.
export function SparksList({
  sparks,
  onOpen,
  style,
  contentContainerStyle,
}: {
  sparks: Spark[];
  onOpen: (spark: Spark) => void;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const [filter, setFilter] = React.useState<"all" | "history">("all");
  const filteredSparks = filter === "history"
    ? sparks.filter((spark) => spark.revived)
    : sparks;

  return (
    <>
      <View style={styles.filterRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: filter === "all" }}
          onPress={() => setFilter("all")}
          style={[styles.filterTab, filter === "all" && styles.filterTabSelected]}>
          <Text style={[styles.filterText, filter === "all" && styles.filterTextSelected]}>All Sparks</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: filter === "history" }}
          onPress={() => setFilter("history")}
          style={[styles.filterTab, filter === "history" && styles.filterTabSelected]}>
          <Ionicons name="time-outline" size={15} color={filter === "history" ? TEAL : MUTED} />
          <Text style={[styles.filterText, filter === "history" && styles.filterTextSelected]}>History</Text>
        </Pressable>
      </View>

      <ScrollView style={style} contentContainerStyle={contentContainerStyle} showsVerticalScrollIndicator={false}>
        {filteredSparks.length === 0 ? (
          <Text style={styles.empty}>
            {filter === "history" ? "No revived Spark history yet." : "No Sparks yet."}
          </Text>
        ) : null}
        {filteredSparks.map((spark) => (
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
                {spark.messageCount} {spark.messageCount === 1 ? "message" : "messages"}{spark.revived ? " · revived" : ""}
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
    </>
  );
}

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
        <Text style={styles.sheetHint}>Browse Sparks in this conversation or revisit revived Spark history.</Text>
        <SparksList sparks={sparks} onOpen={onOpen} style={styles.list} />
      </View>
    </Modal>
  );
}

const STYLE_PAIR = themedStyles({
  pressed: { opacity: 0.75 },

  // RAIL
  rail: { position: "absolute", right: 8, width: 82, alignItems: "center", gap: 14, zIndex: 5 },

  circleItem: { width: 82, alignItems: "center" },

  circleWrap: { width: CIRCLE, height: CIRCLE, alignItems: "center", justifyContent: "center" },

  pulse: { position: "absolute", width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, borderWidth: 3 },

  shadow: {
    borderRadius: CIRCLE / 2,
    shadowColor: "#8E2E6F",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },

  quiet: { opacity: 0.85 },

  ring: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    padding: RING_W,
  },

  ringInner: {
    flex: 1,
    borderRadius: CIRCLE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8E8F1",
  },

  sparkle: { width: 26, height: 26 },

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

  circleQuiet: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 11, lineHeight: 14, color: MUTED },

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

  filterRow: { flexDirection: "row", gap: 8, marginBottom: 12 },

  filterTab: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 18, borderWidth: 1, borderColor: "rgba(36,40,60,0.10)", backgroundColor: "#FFFFFF" },

  filterTabSelected: { backgroundColor: "#F3DDED", borderColor: "rgba(182,61,145,0.24)" },

  filterText: { fontFamily: FONTS.medium, fontSize: 13, color: MUTED },

  filterTextSelected: { color: PINK },

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
