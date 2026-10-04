import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  applySpeed,
  getRememberedSpeed,
  nextSpeed,
  SpeedPill,
} from "@/components/chat/VoiceSpeed";

export type CommentMedia = {
  url?: string;
  durationSeconds?: number;
  // Same convention as chat voice notes: set by the backend once
  // speech-to-text finishes. transcribing:true means it's still
  // processing — shown as "Transcribing…" until transcript arrives.
  transcript?: string | null;
  transcribing?: boolean;
};

// Same bar count/sizing as chat's AudioBubble, so a voice comment reads
// as the same component family as a voice message.
const WAVE_BARS = 28;

function getWaveform(seed: string) {
  let hash = 7;

  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  }

  return Array.from({ length: WAVE_BARS }, () => {
    hash = (hash * 1103515245 + 12345) & 0x7fffffff;

    return 0.25 + ((hash % 1000) / 1000) * 0.75;
  });
}

function formatDuration(totalSeconds?: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));

  const minutes = Math.floor(seconds / 60);

  return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function CommentAudio({ media }: { media?: CommentMedia | null }) {
  const url = media?.url;

  const player = useAudioPlayer(url || "");

  const status = useAudioPlayerStatus(player);

  const bars = useMemo(() => getWaveform(url || ""), [url]);

  const [showTranscript, setShowTranscript] = useState(false);

  // 1× / 1.5× / 2× - remembered for the next voice notes.
  const [speed, setSpeed] = useState(getRememberedSpeed);

  if (!url) {
    return null;
  }

  const duration =
    typeof status.duration === "number" && status.duration > 0
      ? status.duration
      : media?.durationSeconds || 0;

  const currentTime =
    typeof status.currentTime === "number" ? status.currentTime : 0;

  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  const transcript = media?.transcript;

  const transcribing = media?.transcribing;

  const hasTranscriptContent = Boolean(transcript || transcribing);

  const togglePlayback = () => {
    if (status.playing) {
      player.pause();

      return;
    }

    if (duration > 0 && currentTime >= duration - 0.05) {
      player.seekTo(0);
    }

    applySpeed(player, speed);
    player.play();
  };

  const changeSpeed = () => {
    const next = nextSpeed(speed);
    setSpeed(next);
    applySpeed(player, next);
  };

  return (
    <View style={styles.audioWrap}>
      <View style={styles.audioMessage}>
        <Pressable
          onPress={togglePlayback}
          hitSlop={8}
          style={styles.audioPlay}
          accessibilityRole="button"
          accessibilityLabel={
            status.playing ? "Pause voice comment" : "Play voice comment"
          }>
          <Ionicons
            name={status.playing ? "pause" : "play"}
            size={18}
            color="#FFFFFF"
          />
        </Pressable>

        <View style={styles.audioBody}>
          <View style={styles.waveRow}>
            {bars.map((bar, index) => (
              <View
                key={`wave-${index}`}
                style={[
                  styles.waveBar,
                  {
                    height: 4 + bar * 18,
                    backgroundColor:
                      index / WAVE_BARS < progress ? "#C5399A" : "#D8D8DF",
                  },
                ]}
              />
            ))}
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.audioText}>
              {formatDuration(
                status.playing || currentTime > 0 ? currentTime : duration,
              )}
            </Text>

            {status.playing || currentTime > 0 ? (
              <SpeedPill speed={speed} onPress={changeSpeed} />
            ) : null}
          </View>
        </View>

        {hasTranscriptContent ? (
          <Pressable
            onPress={() => setShowTranscript((current) => !current)}
            hitSlop={8}
            style={styles.transcriptToggle}
            accessibilityRole="button"
            accessibilityLabel={
              showTranscript ? "Hide transcript" : "Show transcript"
            }>
            <Ionicons
              name={showTranscript ? "chevron-up" : "text-outline"}
              size={16}
              color="#8A8A90"
            />
          </Pressable>
        ) : null}
      </View>

      {showTranscript ? (
        <View style={styles.transcriptBox}>
          {transcribing && !transcript ? (
            <View style={styles.transcriptLoadingRow}>
              <ActivityIndicator size="small" color="#C5399A" />

              <Text style={styles.transcriptLoadingText}>Transcribing…</Text>
            </View>
          ) : (
            <Text style={styles.transcriptText}>{transcript}</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  audioWrap: {
    marginTop: 6,
    minWidth: 220,
    maxWidth: 260,
  },

  audioMessage: {
    minWidth: 220,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 2,
  },

  audioPlay: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#C5399A",
    alignItems: "center",
    justifyContent: "center",
  },

  audioBody: {
    flex: 1,
  },

  waveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 26,
  },

  waveBar: {
    width: 3,
    borderRadius: 2,
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 1,
  },

  audioText: {
    fontSize: 11,
    color: "#777783",
  },

  transcriptToggle: {
    paddingLeft: 6,
    alignItems: "center",
    justifyContent: "center",
  },

  transcriptBox: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(150,150,160,0.25)",
  },

  transcriptText: {
    fontSize: 13,
    lineHeight: 18,
    color: "#4C4C56",
    fontStyle: "italic",
  },

  transcriptLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  transcriptLoadingText: {
    fontSize: 12,
    color: "#8A8A90",
    fontStyle: "italic",
  },
});
