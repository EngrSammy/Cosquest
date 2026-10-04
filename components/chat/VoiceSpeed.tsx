// ==========================================
// VOICE NOTE SPEED  —  1× · 1.5× · 2×  (like WhatsApp)
// ==========================================
// A small pill next to a voice note's time. Tap to cycle the speed; the
// voice stays at its normal pitch. The chosen speed is remembered for the
// next voice notes (chats and voice comments).
import type { AudioPlayer } from "expo-audio";
import { Pressable, StyleSheet, Text } from "react-native";

export const VOICE_SPEEDS = [1, 1.5, 2] as const;

// Remembered while the app is open.
let rememberedSpeed = 1;

export function getRememberedSpeed() {
  return rememberedSpeed;
}

export function nextSpeed(current: number) {
  const index = VOICE_SPEEDS.indexOf(current as (typeof VOICE_SPEEDS)[number]);
  const next = VOICE_SPEEDS[(index + 1) % VOICE_SPEEDS.length];

  rememberedSpeed = next;

  return next;
}

function keepNormalPitch(player: AudioPlayer) {
  try {
    player.shouldCorrectPitch = true;
  } catch {
    // Not available on every platform - fine.
  }
}

// Sets the speed on a player, keeping the voice's NORMAL pitch (no
// "chipmunk / baby voice"). The pitch correction has to be given together
// with the speed - turning it on separately wasn't enough - and it's set
// again afterwards in case setting the speed reset it.
export function applySpeed(player: AudioPlayer, speed: number) {
  keepNormalPitch(player);

  try {
    player.setPlaybackRate(speed, "high");
  } catch {
    try {
      player.setPlaybackRate(speed);
    } catch {
      // Older players: keep normal speed.
    }
  }

  keepNormalPitch(player);
}

export function SpeedPill({
  speed,
  onPress,
  light,
}: {
  speed: number;
  onPress: () => void;
  // White pill (for your own pink bubbles).
  light?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={[styles.pill, light && styles.pillLight]}
      accessibilityRole="button"
      accessibilityLabel={`Playback speed ${speed} times. Tap to change.`}>
      <Text style={[styles.text, light && styles.textLight]}>{speed}×</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minWidth: 34,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "rgba(197,57,154,0.14)",
  },

  pillLight: {
    backgroundColor: "rgba(255,255,255,0.28)",
  },

  text: {
    fontSize: 11,
    fontWeight: "800",
    color: "#C5399A",
    fontVariant: ["tabular-nums"],
  },

  textLight: {
    color: "#FFFFFF",
  },
});
