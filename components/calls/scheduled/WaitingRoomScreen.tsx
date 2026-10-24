// ==========================================
// WAITING ROOM (guest) - shown while the host hasn't let you in yet
// ==========================================
// Same look as Sammy's Calls screens. You join by yourself as soon as the
// host admits you (socket "scheduled-call:admission").
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SparkChip } from "@/components/calls/scheduled/ScheduledCallCard";
import { ScreenGradient } from "@/components/chat/ui";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { formatShortDate, formatTimeRange, type ScheduledCall } from "@/services/scheduledCalls";

const PINK = "#C34D9C";

function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function WaitingRoomScreen({
  call,
  since,
  onLeave,
}: {
  call: ScheduledCall;
  since: number;
  onLeave: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const host = (call.host?.name || call.host?.username || "the host").split(" ")[0];
  const start = new Date(call.startsAt);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
      <ScreenGradient />
      <View style={styles.column}>
        {call.spark ? <SparkChip subject={call.spark.subject} /> : null}
        <Text style={styles.topic} numberOfLines={2}>
          {call.topic}
        </Text>
        <Text style={styles.when}>
          {formatShortDate(start)} · {formatTimeRange(call)}
        </Text>

        <View style={styles.center}>
          <View style={styles.door}>
            <Ionicons name="enter-outline" size={30} color={ink.text(PINK)} />
          </View>
          <Text style={styles.title}>Waiting for {host} to let you in</Text>
          <Text style={styles.text}>You'll join the call as soon as the host admits you.</Text>
          <Text style={styles.timer}>Waiting · {clock(now - since)}</Text>
        </View>

        <View style={styles.chips}>
          <View style={styles.chip}>
            <Ionicons name="mic-off-outline" size={16} color={ink.text("#5F6170")} />
            <Text style={styles.chipText}>Mic off</Text>
          </View>
          <View style={styles.chip}>
            <Ionicons name="videocam-off-outline" size={16} color={ink.text("#5F6170")} />
            <Text style={styles.chipText}>Camera off</Text>
          </View>
        </View>

        <Pressable style={styles.leave} onPress={onLeave} accessibilityRole="button">
          <Text style={styles.leaveText}>Leave waiting room</Text>
        </Pressable>
      </View>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    root: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1500, elevation: 1500, backgroundColor: "#F4F8FD" },
    column: { flex: 1, width: "100%", maxWidth: 520, alignSelf: "center", paddingHorizontal: 22 },
    topic: { marginTop: 12, fontFamily: FONTS.bold, fontSize: 24, lineHeight: 30, color: "#191922" },
    when: { marginTop: 4, fontFamily: FONTS.regular, fontSize: 14, color: "#5F6170" },
    center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
    door: { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(195,77,156,0.12)", marginBottom: 18 },
    title: { fontFamily: FONTS.semibold, fontSize: 18, color: "#191922", textAlign: "center" },
    text: { marginTop: 6, fontFamily: FONTS.regular, fontSize: 14, lineHeight: 20, color: "#5F6170", textAlign: "center" },
    timer: { marginTop: 14, fontFamily: FONTS.medium, fontSize: 13, color: PINK },
    chips: { flexDirection: "row", gap: 10 },
    chip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44, borderRadius: 22, backgroundColor: "#FFFFFF" },
    chipText: { fontFamily: FONTS.medium, fontSize: 13.5, color: "#3A3A44" },
    leave: { marginTop: 12, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(195,77,156,0.12)" },
    leaveText: { fontFamily: FONTS.semibold, fontSize: 15, color: PINK },
  },
  {
    root: { backgroundColor: "#14151F" },
    topic: { color: "#F4F5FA" },
    when: { color: "#B5BBCB" },
    door: { backgroundColor: "rgba(195,77,156,0.22)" },
    title: { color: "#F4F5FA" },
    text: { color: "#B5BBCB" },
    timer: { color: "#F29BD3" },
    chip: { backgroundColor: "#262838" },
    chipText: { color: "#E3E6EE" },
    leave: { backgroundColor: "rgba(195,77,156,0.22)" },
    leaveText: { color: "#F29BD3" },
  },
);
