// ==========================================
// SCHEDULED CALL CARDS (group Calls tab)
// ==========================================
// FeaturedCallCard: the next call, in full (Spark chip, time, description,
// who's coming, "View call & invitation").
// CallRow: every other call, as a date tile + one-line summary.
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { Card, UI } from "@/components/chat/ui";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import {
  dateTile,
  formatClock,
  formatDuration,
  formatTimeRange,
  isLiveCall,
  REPEAT_LABELS,
  timeZoneLabel,
  type ScheduledCall,
} from "@/services/scheduledCalls";

import { PersonAvatar, personName } from "./ChoiceSheet";

export function SparkChip({ subject }: { subject: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.chip}>
      <Ionicons name="sparkles" size={11} color={UI.PINK} />
      <Text style={styles.chipText} numberOfLines={1}>
        {subject}
      </Text>
    </View>
  );
}

export function rsvpSummary(call: ScheduledCall) {
  const accepted = call.participants.filter((person) => person.status === "accepted").length;
  const awaiting = call.participants.filter((person) => person.status === "pending").length;
  const parts = [`${accepted} accepted`];
  if (awaiting) parts.push(`${awaiting} awaiting`);
  return parts.join(" · ");
}

export function FeaturedCallCard({
  call,
  myId,
  onOpen,
  onJoin,
}: {
  call: ScheduledCall;
  myId: string;
  onOpen: () => void;
  // While the call is on: join it straight from the card.
  onJoin?: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const hosting = call.host.id === myId;
  const live = isLiveCall(call) && !!onJoin;
  const faces = [call.host, ...call.participants].slice(0, 4);

  return (
    <Card style={styles.featured}>
      <View style={styles.topRow}>
        {call.spark ? <SparkChip subject={call.spark.subject} /> : <View />}
        {live ? (
          <View style={styles.liveTag}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Live now</Text>
          </View>
        ) : hosting ? (
          <Text style={styles.hosting}>You&apos;re hosting</Text>
        ) : null}
      </View>

      <Text style={styles.topic}>{call.topic}</Text>

      <View style={styles.timeRow}>
        <Ionicons name="time-outline" size={16} color={UI.PINK} />
        <Text style={styles.timeText}>
          {formatTimeRange(call)} · {timeZoneLabel().split(" (")[0]}
        </Text>
      </View>

      {call.description ? <Text style={styles.description}>{call.description}</Text> : null}

      <View style={styles.divider} />

      <View style={styles.peopleRow}>
        <View style={styles.faces}>
          {faces.map((person, index) => (
            <View key={person.id} style={[styles.face, index > 0 && styles.faceOverlap]}>
              <PersonAvatar person={person} size={26} />
            </View>
          ))}
        </View>
        <Text style={styles.rsvp}>{rsvpSummary(call)}</Text>
      </View>

      <Pressable style={styles.open} onPress={live ? onJoin : onOpen} accessibilityRole="button">
        <Ionicons name={live ? "call-outline" : "arrow-up-outline"} size={16} color={ink.text(UI.PINK)} style={live ? undefined : styles.arrow} />
        <Text style={styles.openText}>{live ? "Join call" : "View call & invitation"}</Text>
      </Pressable>
    </Card>
  );
}

export function CallRow({
  call,
  myId,
  onOpen,
}: {
  call: ScheduledCall;
  myId: string;
  onOpen: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const start = new Date(call.startsAt);
  const tile = dateTile(start);
  const cancelled = call.status === "cancelled";
  const hostText = call.host.id === myId ? "You're hosting" : `${personName(call.host).split(" ")[0]} hosting`;
  const detail = [
    call.spark?.subject || (call.repeat !== "none" ? REPEAT_LABELS[call.repeat] : null),
    cancelled ? "Cancelled" : hostText,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable onPress={onOpen} accessibilityRole="button">
      <Card style={styles.row}>
        <View style={styles.tile}>
          <Text style={styles.tileDay}>{tile.weekday}</Text>
          <Text style={styles.tileDate}>{tile.day}</Text>
        </View>
        <View style={styles.rowText}>
          <Text style={[styles.rowTopic, cancelled && styles.struck]} numberOfLines={1}>
            {call.topic}
          </Text>
          <Text style={styles.rowTime} numberOfLines={1}>
            {formatClock(start)} · {formatDuration(call.durationMin)}
          </Text>
          <Text style={styles.rowDetail} numberOfLines={1}>
            {detail}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={ink.text(UI.MUTED)} />
      </Card>
    </Pressable>
  );
}

const STYLE_PAIR = themedStyles(
  {
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      maxWidth: "70%",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: "#FBE3F2",
    },
    chipText: { fontFamily: FONTS.medium, fontSize: 12, color: UI.PINK },

    featured: { padding: 16 },
    topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    hosting: { fontFamily: FONTS.regular, fontSize: 12, color: UI.MUTED },
    liveTag: { flexDirection: "row", alignItems: "center", gap: 5 },
    liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#E5484D" },
    liveText: { fontFamily: FONTS.semibold, fontSize: 12, color: "#E5484D" },
    topic: { marginTop: 12, fontFamily: FONTS.bold, fontSize: 20, lineHeight: 26, color: UI.INK },
    timeRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
    timeText: { flexShrink: 1, fontFamily: FONTS.medium, fontSize: 14, color: UI.INK },
    description: {
      marginTop: 10,
      fontFamily: FONTS.regular,
      fontSize: 13,
      lineHeight: 19,
      color: UI.MUTED,
    },
    divider: { height: 1, marginVertical: 12, backgroundColor: UI.BORDER },
    peopleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    faces: { flexDirection: "row" },
    face: { borderRadius: 15, borderWidth: 2, borderColor: "#FFFFFF" },
    faceOverlap: { marginLeft: -8 },
    rsvp: { flexShrink: 1, fontFamily: FONTS.regular, fontSize: 12, color: UI.MUTED },
    open: {
      marginTop: 14,
      height: 46,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      borderRadius: 23,
      backgroundColor: "#F7DDEE",
    },
    arrow: { transform: [{ rotate: "45deg" }] },
    openText: { fontFamily: FONTS.semibold, fontSize: 14, color: UI.PINK },

    row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
    tile: {
      width: 50,
      height: 54,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      backgroundColor: "#FBE3F2",
    },
    tileDay: { fontFamily: FONTS.semibold, fontSize: 10, color: UI.PINK },
    tileDate: { fontFamily: FONTS.bold, fontSize: 20, lineHeight: 24, color: UI.PINK },
    rowText: { flex: 1, minWidth: 0 },
    rowTopic: { fontFamily: FONTS.semibold, fontSize: 15, color: UI.INK },
    struck: { textDecorationLine: "line-through", color: UI.MUTED },
    rowTime: { marginTop: 2, fontFamily: FONTS.regular, fontSize: 13, color: UI.INK },
    rowDetail: { marginTop: 1, fontFamily: FONTS.regular, fontSize: 12, color: UI.MUTED },
  },
  {
    chip: { backgroundColor: "#3A2740" },
    chipText: { color: "#F0A6D7" },
    hosting: { color: "#B5BBCB" },
    topic: { color: "#F4F5FA" },
    timeText: { color: "#F4F5FA" },
    description: { color: "#B5BBCB" },
    divider: { backgroundColor: "rgba(255,255,255,0.12)" },
    face: { borderColor: "#252837" },
    rsvp: { color: "#B5BBCB" },
    open: { backgroundColor: "#3A2740" },
    openText: { color: "#F0A6D7" },
    tile: { backgroundColor: "#3A2740" },
    tileDay: { color: "#F0A6D7" },
    tileDate: { color: "#F0A6D7" },
    rowTopic: { color: "#F4F5FA" },
    rowTime: { color: "#F4F5FA" },
    rowDetail: { color: "#B5BBCB" },
  },
);
