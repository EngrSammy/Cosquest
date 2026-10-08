import { Ionicons } from "@expo/vector-icons";
import { useEvent } from "expo";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { getCloudinaryVideoPoster } from "@/utils/videoPoster";

export function PostVideo({ uri }: { uri: string }) {
  const [muted, setMuted] = useState(true);

  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.play();
  });

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
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => {
          if (player.playing) {
            player.pause();
          } else {
            player.play();
          }
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

      <Pressable
        style={styles.sound}
        onPress={() => setMuted((value) => !value)}>
        <Ionicons
          name={muted ? "volume-mute" : "volume-high"}
          size={18}
          color="#FFFFFF"
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
