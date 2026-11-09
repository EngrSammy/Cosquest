import { Ionicons } from "@expo/vector-icons";
import { useEvent } from "expo";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { getCloudinaryVideoPoster } from "@/utils/videoPoster";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";

import { usePostOnScreen } from "./feedVisibility";

export function PostVideo({ uri }: { uri: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const [muted, setMuted] = useState(true);
  // In the feed, only the videos on screen play (audit B2).
  const onScreen = usePostOnScreen();
  const [pausedByTap, setPausedByTap] = useState(false);

  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = true;
  });

  useEffect(() => {
    if (onScreen && !pausedByTap) player.play();
    else player.pause();
  }, [player, onScreen, pausedByTap]);

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);

  // FIRST FRAME: show Cloudinary's first-frame picture straight away,
  // instead of a black box while the video loads. Hidden for good the
  // moment the video starts playing, so it never covers the real video.
  const posterUrl = useMemo(() => getCloudinaryVideoPoster(uri), [uri]);

  const [videoVisible, setVideoVisible] = useState(false);

  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });

  useEffect(() => {
    if (isPlaying) {
      setVideoVisible(true);
    }
  }, [isPlaying]);

  return (
    <View style={styles.container}>
      <Pressable accessibilityRole="button" accessibilityLabel="Play or pause video"
        style={StyleSheet.absoluteFill}
        onPress={() => {
          setPausedByTap(player.playing);
        }}>
        <VideoView
          player={player}
          style={styles.video}
          contentFit="cover"
          nativeControls={false}
          onFirstFrameRender={() => setVideoVisible(true)}
        />

        {posterUrl && !videoVisible ? (
          <Image
            source={{ uri: posterUrl }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            cachePolicy="memory-disk"
            pointerEvents="none"
          />
        ) : null}
      </Pressable>

      <Pressable accessibilityRole="button" accessibilityLabel={muted ? "Sound on" : "Sound off"}
        style={styles.sound}
        onPress={() => setMuted((value) => !value)}>
        <Ionicons
          name={muted ? "volume-mute" : "volume-high"}
          size={18}
          color={ink.text("#FFFFFF")}
        />
      </Pressable>
    </View>
  );
}

const STYLE_PAIR = themedStyles({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },

  video: {
    width: "100%",
    height: "100%",
  },

  sound: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
});
