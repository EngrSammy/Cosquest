import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

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
        />
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
