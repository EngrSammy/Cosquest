import { Image } from "expo-image";
import { ReactNode, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { FONTS } from "@/constants/fonts";

import { PostVideo } from "./PostVideo";

// ==========================================
// FIGMA CARD
// ==========================================
// width 355.42, height 384.19, left 24, no rotation, opacity 1,
// box-shadow: 0px 4px 4px 0px #00000040
const CARD_WIDTH = 355.42;
const CARD_HEIGHT = 440;
const CARD_RATIO = CARD_WIDTH / CARD_HEIGHT;
const CARD_MARGIN = 24; // "left: 24px" - same gap on the right
const CARD_RADIUS = 24; // corner radius (adjust if the Figma shows another)

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

// The rounded photo / reel / gallery card.
// `children` are drawn ON TOP of it (the name pill and ⋯ at the top, the
// dark swoosh with like / comment / share and the save button at the
// bottom - see PostCard / PostActions).
//
// Every card is the same Figma size; photos are cropped to fill it.
export function PostMedia({
  post,
  children,
}: {
  post: any;
  children?: ReactNode;
}) {
  const urls = getMediaUrls(post);
  const isReel = post?.type === "reel";

  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);

  if (!urls.length) {
    return null;
  }

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
      />
    );
  } else {
    // GALLERY - swipe sideways.
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
            />
          ))}
        </ScrollView>
      ) : null;
  }

  return (
    // Outer view carries the shadow (it can't sit on a view that clips).
    <View style={styles.shadow}>
      <View
        style={styles.frame}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {media}

        {/* (Reels: "Reel" is shown in the name pill, so no extra label
            here - it would sit under the pill.) */}

        {urls.length > 1 ? (
          <View style={[styles.label, styles.counter]} pointerEvents="none">
            <Text style={styles.labelText}>
              {index + 1}/{urls.length}
            </Text>
          </View>
        ) : null}

        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // box-shadow: 0px 4px 4px 0px #00000040
  shadow: {
    marginHorizontal: CARD_MARGIN,
    borderRadius: CARD_RADIUS,
    backgroundColor: "#2C2C2A",

    shadowColor: "#000000",
    shadowOpacity: 0.25, // 0x40 = 25%
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },

  frame: {
    width: "100%",
    aspectRatio: CARD_RATIO,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    backgroundColor: "#2C2C2A",
    position: "relative",
  },

  label: {
    position: "absolute",
    top: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
  },

  // Below the ⋯ menu button (top-right) on your own posts.
  counter: {
    top: 56,
    right: 12,
  },

  labelText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: FONTS.semibold,
  },
});
