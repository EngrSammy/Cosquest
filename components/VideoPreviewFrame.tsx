// Shows a video's FIRST FRAME as a still picture (instead of a black box).
//   1. Cloudinary video      -> Cloudinary's first-frame picture
//   2. Website, local video  -> the browser draws the first frame
//   3. Phone, local video    -> expo-video-thumbnails makes the frame
// Used by Create Post's preview.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useEffect, useMemo, useState } from "react";
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import VideoFirstFrame from "@/components/chat/VideoFirstFrame";
import { getCloudinaryVideoPoster } from "@/utils/videoPoster";

const frameCache = new Map<string, string>();

export function VideoPreviewFrame({
  uri,
  style,
}: {
  uri: string;
  style?: StyleProp<ViewStyle>;
}) {
  const posterUrl = useMemo(() => getCloudinaryVideoPoster(uri, 480), [uri]);

  const [posterFailed, setPosterFailed] = useState(false);

  const [frameUri, setFrameUri] = useState<string | null>(
    frameCache.get(uri) || null,
  );

  const usePoster = !!posterUrl && !posterFailed;

  useEffect(() => {
    if (usePoster || Platform.OS === "web" || frameCache.has(uri)) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { uri: frame } = await VideoThumbnails.getThumbnailAsync(uri, {
          time: 0,
        });

        frameCache.set(uri, frame);

        if (!cancelled) {
          setFrameUri(frame);
        }
      } catch {
        // Keep the placeholder.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uri, usePoster]);

  let content = (
    <View style={styles.placeholder}>
      <Ionicons name="videocam-outline" size={26} color="#FFFFFF" />
    </View>
  );

  if (usePoster) {
    content = (
      <Image
        source={{ uri: posterUrl! }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        onError={() => setPosterFailed(true)}
      />
    );
  } else if (Platform.OS === "web") {
    content = <VideoFirstFrame uri={uri} />;
  } else if (frameUri) {
    content = (
      <Image
        source={{ uri: frameUri }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
    );
  }

  return <View style={[styles.wrap, style]}>{content}</View>;
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
    backgroundColor: "#25252D",
  },

  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
