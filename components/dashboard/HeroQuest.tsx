// ==========================================
// DASHBOARD HERO: the featured quest on the big CosQuest pin
// ==========================================
// Venue chip on top, the 3D pin with "Join" in its drop, "Live Now"
// (green) or "Starting Soon" (red), the time left while it's live, and
// how many have joined (the backend's registrationCount / spacesRemaining).
// Only the countdown re-renders each second.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { FONTS } from "@/constants/fonts";
import type { Quest } from "@/services/quests";

import { formatCountdown, isLiveQuest, questPlace } from "./questFormat";

const PIN = require("@/assets/images/dashboard/cosquest home pin icon.png");
const DROP = require("@/assets/images/dashboard/Vector 9.png");
export const RED_PIN = require("@/assets/images/dashboard/red location pin.png");

const PIN_W = 220;
const PIN_H = Math.round(PIN_W * (398 / 285));
// The drop sits in the pin's hole (measured from the artwork).
const DROP_W = Math.round(PIN_W * 0.34);
const DROP_H = Math.round(DROP_W * (125 / 93));
const DROP_LEFT = Math.round(PIN_W * 0.52 - DROP_W / 2);
const DROP_TOP = Math.round(PIN_H * 0.385 - DROP_H / 2);

// The timer chip, greyed out with "--:--:--" when nothing is running.
function TimerChip({ text, idle }: { text: string; idle?: boolean }) {
  return (
    <View style={[styles.chip, styles.timer, idle && styles.timerIdle]} accessibilityLabel={idle ? "No quest running" : `${text} left`}>
      <Ionicons name="stopwatch-outline" size={18} color={idle ? "#8A8FA0" : "#191922"} />
      <Text style={[styles.timerText, idle && styles.timerTextIdle]}>{text}</Text>
    </View>
  );
}

function Countdown({ target }: { target: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return target > now ? <TimerChip text={formatCountdown(target - now)} /> : <TimerChip text="--:--:--" idle />;
}

export default function HeroQuest({
  quest,
  joined,
  busy,
  dark,
  onJoin,
}: {
  quest: Quest | null;
  joined: boolean;
  busy: boolean;
  // Dark mode: the text on the map turns light (the chips stay pastel).
  dark?: boolean;
  onJoin: () => void;
}) {
  const live = !!quest && isLiveQuest(quest);
  const target = quest ? new Date((live ? quest.endsAt : quest.startsAt) || 0).getTime() : 0;
  const count = quest?.registrationCount ?? 0;
  // Not live: "Starting Soon" within a day, else "Not Live Yet".
  const startsSoon = !live && target > Date.now() && target - Date.now() < 86_400_000;

  return (
    <View style={styles.hero}>
      <View style={[styles.chip, styles.place]}>
        <Image source={RED_PIN} style={styles.placePin} contentFit="contain" />
        <Text style={styles.placeText} numberOfLines={1}>
          {quest ? questPlace(quest) || quest.title : "No quests nearby yet"}
        </Text>
      </View>

      <View style={styles.stage}>
        {/* Faint pins on the map, like the Figma */}
        <Ionicons name="location" size={44} color="rgba(200,219,120,0.55)" style={styles.ghostLeft} />
        <Ionicons name="location" size={40} color="rgba(225,120,150,0.5)" style={styles.ghostRight} />

        <View style={styles.pinWrap}>
          <Image source={PIN} style={styles.pin} contentFit="contain" />
          <Pressable
            style={styles.drop}
            onPress={onJoin}
            disabled={!quest || busy || joined}
            accessibilityRole="button"
            accessibilityLabel={quest ? `Join ${quest.title}` : "Join"}>
            <Image source={DROP} style={StyleSheet.absoluteFill} contentFit="contain" />
            {busy ? (
              <ActivityIndicator color="#FFFFFF" style={styles.dropContent} />
            ) : (
              <Text style={[styles.joinText, styles.dropContent]} adjustsFontSizeToFit numberOfLines={1}>
                {joined ? "Joined" : quest ? "Join" : "—"}
              </Text>
            )}
          </Pressable>
        </View>

        {quest ? (
          <View style={[styles.chip, styles.liveChip]}>
            <View style={[styles.liveDot, !live && styles.offDot]} />
            <Text style={styles.liveText}>{live ? "Live Now" : startsSoon ? "Starting Soon" : "Not Live Yet"}</Text>
          </View>
        ) : null}

        {/* Time left while the quest is live; a greyed placeholder otherwise. */}
        {live && quest?.endsAt ? <Countdown target={target} /> : <TimerChip text="--:--:--" idle />}

        {quest ? (
          <View style={styles.joinedBox}>
            <Text style={styles.joinedTitle} numberOfLines={2}>
              {quest.title}
            </Text>
            <Text style={[styles.joinedText, dark && styles.lightText]}>
              {count ? `${count} Joined` : "Be the first to join"}
              {typeof quest.spacesRemaining === "number" ? ` · ${quest.spacesRemaining} spots left` : ""}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", marginTop: 20 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    backgroundColor: "rgba(230,205,226,0.75)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
  },
  place: { maxWidth: "92%", paddingHorizontal: 14, paddingVertical: 6 },
  placePin: { width: 18, height: 27 },
  placeText: { flexShrink: 1, fontFamily: FONTS.medium, fontSize: 18, color: "#191922" },
  stage: { width: "100%", height: PIN_H + 20, alignItems: "center", justifyContent: "center" },
  pinWrap: { width: PIN_W, height: PIN_H },
  pin: { width: PIN_W, height: PIN_H },
  drop: {
    position: "absolute",
    left: DROP_LEFT,
    top: DROP_TOP,
    width: DROP_W,
    height: DROP_H,
    alignItems: "center",
  },
  // The drop's round part is its top two thirds.
  dropContent: { marginTop: DROP_H * 0.28 },
  joinText: { maxWidth: DROP_W - 14, fontFamily: FONTS.bold, fontSize: 24, color: "#FFFFFF" },
  liveChip: { position: "absolute", right: 16, top: PIN_H * 0.2, paddingHorizontal: 10, paddingVertical: 4 },
  liveDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: "#5BD15B" },
  offDot: { backgroundColor: "#E5484D" },
  liveText: { fontFamily: FONTS.medium, fontSize: 16, color: "#191922" },
  timer: { position: "absolute", left: 16, top: PIN_H * 0.56, paddingHorizontal: 12, paddingVertical: 4 },
  timerText: { fontFamily: FONTS.semibold, fontSize: 18, color: "#191922", fontVariant: ["tabular-nums"] },
  timerIdle: { opacity: 0.7 },
  timerTextIdle: { color: "#8A8FA0" },
  joinedBox: { position: "absolute", right: 16, top: PIN_H * 0.72, maxWidth: 140, alignItems: "flex-end" },
  joinedTitle: { textAlign: "right", fontFamily: FONTS.semibold, fontSize: 12, color: "#B63D91" },
  joinedText: { marginTop: 2, textAlign: "right", fontFamily: FONTS.regular, fontSize: 12, color: "#191922" },
  lightText: { color: "#E9EAF2" },
  ghostLeft: { position: "absolute", left: "30%", top: PIN_H * 0.62 },
  ghostRight: { position: "absolute", right: "16%", top: PIN_H * 0.5 },
});
