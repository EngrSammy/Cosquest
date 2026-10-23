// ==========================================
// SCHEDULED CALL CARD (in the group chat)
// ==========================================
// The backend posts a message (kind "scheduled_call") when a call is
// scheduled in a group, and again when it's cancelled. Shown inside the
// sender's bubble: the topic, when, and "View call" (Call details). For a
// repeating call the date is when the card was posted; Call details shows
// the next one.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { formatShortDate, formatTimeRange } from "@/services/scheduledCalls";

export type ScheduledCallCardData = {
  id: string;
  topic: string;
  startsAt: string;
  durationMin: number;
  hostId?: string;
  status: "scheduled" | "cancelled";
};

const PINK = "#C5399A";

export default function ScheduledCallMessage({
  card,
  onLongPress,
}: {
  card: ScheduledCallCardData;
  onLongPress?: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const cancelled = card.status === "cancelled";
  const start = new Date(card.startsAt);
  const when = Number.isNaN(start.getTime())
    ? ""
    : `${formatShortDate(start)} · ${formatTimeRange({ startsAt: card.startsAt, durationMin: card.durationMin || 30 })}`;

  const open = () => router.push({ pathname: "/group/scheduled-call/[callId]", params: { callId: card.id } });

  return (
    <Pressable
      onPress={open}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`${cancelled ? "Call cancelled" : "Call scheduled"}: ${card.topic}. ${when}. View call.`}>
      <View style={styles.head}>
        <View style={[styles.icon, cancelled && styles.iconCancelled]}>
          <Ionicons name={cancelled ? "close" : "calendar"} size={16} color={cancelled ? "#E5484D" : PINK} />
        </View>
        <Text style={[styles.label, cancelled && styles.labelCancelled]}>
          {cancelled ? "Call cancelled" : "Call scheduled"}
        </Text>
      </View>
      <Text style={[styles.topic, cancelled && styles.topicCancelled]} numberOfLines={2}>
        {card.topic}
      </Text>
      {when ? <Text style={styles.when}>{when}</Text> : null}
      <View style={styles.button}>
        <Text style={styles.buttonText}>View call</Text>
        <Ionicons name="chevron-forward" size={14} color={ink.text(PINK)} />
      </View>
    </Pressable>
  );
}

const STYLE_PAIR = themedStyles(
  {
    card: { minWidth: 220, maxWidth: 280, gap: 4, paddingVertical: 2 },
    head: { flexDirection: "row", alignItems: "center", gap: 8 },
    icon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(197,57,154,0.12)",
    },
    iconCancelled: { backgroundColor: "rgba(229,72,77,0.12)" },
    label: { fontFamily: FONTS.semibold, fontSize: 12, letterSpacing: 0.3, color: PINK },
    labelCancelled: { color: "#E5484D" },
    topic: { marginTop: 2, fontFamily: FONTS.semibold, fontSize: 15, lineHeight: 20, color: "#191922" },
    topicCancelled: { textDecorationLine: "line-through", color: "#6B6F80" },
    when: { fontFamily: FONTS.regular, fontSize: 12.5, color: "#5F6170" },
    button: {
      marginTop: 6,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      height: 34,
      borderRadius: 17,
      backgroundColor: "rgba(197,57,154,0.10)",
    },
    buttonText: { fontFamily: FONTS.semibold, fontSize: 13, color: PINK },
  },
  {
    topic: { color: "#F4F5FA" },
    topicCancelled: { color: "#9AA1B4" },
    when: { color: "#B5BBCB" },
    icon: { backgroundColor: "rgba(197,57,154,0.20)" },
    button: { backgroundColor: "rgba(197,57,154,0.18)" },
    buttonText: { color: "#F29BD3" },
  },
);
