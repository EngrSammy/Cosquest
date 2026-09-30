import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ReactNode, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { PostVideo } from "./PostVideo";

// ==========================================
// SIZE
// ==========================================
// The photo fills the card's width and its HEIGHT follows the photo's real
// shape (tall photos are tall, wide ones shorter), limited to the range
// Facebook/Instagram use: portrait 4:5 up to wide 1.91:1.
const TALLEST_RATIO = 4 / 5;
const WIDEST_RATIO = 1.91;
// Until the photo has loaded, and always for reels: portrait 4:5.
const DEFAULT_RATIO = 4 / 5;

function clampRatio(ratio: number) {
  return Math.min(WIDEST_RATIO, Math.max(TALLEST_RATIO, ratio));
}

// Every photo/video link on a post, whatever shape the backend sends.
export function getMediaUrls(post: any): string[] {
  const urls: string[] = [];

  const add = (value: any) => {
    if (typeof value === "string" && value.trim()) {
      urls.push(value);
    } else if (value && typeof value.url === "string" && value.url.trim()) {
      urls.push(value.url);
    }
  };

  if (Array.isArray(post?.media)) {
    post.media.forEach(add);
  } else {
    add(post?.media);
  }

  if (!urls.length) {
    add(post?.image);
    add(post?.video);
  }

  return urls;
}

// The rounded photo / reel / gallery inside the post card.
// `children` are drawn ON TOP of it (the like / comment / share panel and
// the save button — see PostActions).
export function PostMedia({
  post,
  children,
}: {
  post: any;
  children?: ReactNode;
}) {
  const urls = getMediaUrls(post);
  const isReel = post?.type === "reel";

  const [ratio, setRatio] = useState(DEFAULT_RATIO);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);

  if (!urls.length) {
    return null;
  }

  const aspectRatio = isReel ? DEFAULT_RATIO : ratio;

  const handleImageLoad = (event: {
    source: { width: number; height: number };
  }) => {
    const { width: imageWidth, height: imageHeight } = event.source || {};

    if (imageWidth > 0 && imageHeight > 0) {
      setRatio(clampRatio(imageWidth / imageHeight));
    }
  };

  const handleGalleryScroll = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    if (!width) {
      return;
    }

    const next = Math.round(event.nativeEvent.contentOffset.x / width);

    if (next !== index) {
      setIndex(next);
    }
  };

  let media;

  if (isReel) {
    media = <PostVideo uri={urls[0]} />;
  } else if (urls.length === 1) {
    media = (
      <Image
        source={{ uri: urls[0] }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
        onLoad={handleImageLoad}
      />
    );
  } else {
    // GALLERY — swipe sideways; the first photo sets the height.
    media =
      width > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleGalleryScroll}
          scrollEventThrottle={16}
          style={StyleSheet.absoluteFill}>
          {urls.map((url, itemIndex) => (
            <Image
              key={`${url}-${itemIndex}`}
              source={{ uri: url }}
              style={{ width, height: "100%" }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
              onLoad={itemIndex === 0 ? handleImageLoad : undefined}
            />
          ))}
        </ScrollView>
      ) : null;
  }

  return (
    <View
      style={[styles.frame, { aspectRatio }]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {media}

      {/* Soft shade at the bottom so the white icons are always readable */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.35)"]}
        style={styles.shade}
        pointerEvents="none"
      />

      {isReel ? (
        <View style={[styles.label, styles.reelLabel]} pointerEvents="none">
          <Text style={styles.labelText}>Reel</Text>
        </View>
      ) : null}

      {urls.length > 1 ? (
        <View style={[styles.label, styles.counter]} pointerEvents="none">
          <Text style={styles.labelText}>
            {index + 1}/{urls.length}
          </Text>
        </View>
      ) : null}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: "100%",
    maxHeight: 640,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#2C2C2A",
    position: "relative",
  },

  shade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "35%",
  },

  label: {
    position: "absolute",
    top: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
  },

  reelLabel: {
    left: 10,
    backgroundColor: "#C5399A",
  },

  counter: {
    right: 10,
  },

  labelText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
});
