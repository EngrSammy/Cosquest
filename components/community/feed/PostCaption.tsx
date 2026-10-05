import { FONTS } from "@/constants/fonts";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

// Long captions fold with "See more".
const LONG_CAPTION_CHARS = 200;
const COLLAPSED_LINES = 3;

// Figma: Poppins ~14, black text, bold username, pink hashtags.
const CAPTION_SIZE = 14; // Updated from 13.5
const CAPTION_LINE_HEIGHT = 22; // Updated from 21
const CAPTION_COLOR = "#191922";
const HASHTAG_COLOR = "#C5399A";

function extractHashtags(text?: string) {
  if (!text) {
    return [];
  }

  return Array.from(new Set(text.match(/#[a-zA-Z0-9_]+/g) || []));
}

function removeHashtags(text?: string) {
  if (!text) {
    return "";
  }

  return text
    .replace(/#[a-zA-Z0-9_]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Bold username + caption, then the hashtags as plain pink text (like the
// Figma). No side padding of its own: the card decides the edges.
export function PostCaption({
  username,
  content,
}: {
  username: string;
  content?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!content) {
    return null;
  }

  const hashtags = extractHashtags(content);
  const caption = removeHashtags(content);

  const isLong = caption.length > LONG_CAPTION_CHARS;
  const collapsed = isLong && !expanded;

  return (
    <View>
      {caption ? (
        <Text
          style={styles.caption}
          numberOfLines={collapsed ? COLLAPSED_LINES : undefined}>
          {username ? <Text style={styles.username}>{username} </Text> : null}
          {caption}
        </Text>
      ) : null}

      {isLong ? (
        <Pressable onPress={() => setExpanded((value) => !value)} hitSlop={6}>
          <Text style={styles.more}>{expanded ? "See less" : "See more"}</Text>
        </Pressable>
      ) : null}

      {hashtags.length > 0 ? (
        <Text style={[styles.caption, styles.hashtags]}>
          {hashtags.join(" ")}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caption: {
    fontFamily: FONTS.regular,
    fontSize: CAPTION_SIZE,
    lineHeight: CAPTION_LINE_HEIGHT,
    color: CAPTION_COLOR,
  },

  username: {
    fontFamily: FONTS.semibold,
    color: "#000000",
  },

  hashtags: {
    color: HASHTAG_COLOR,
  },

  more: {
    marginTop: 3,
    fontFamily: FONTS.semibold,
    fontSize: 12.5,
    color: "#8A8A93",
  },
});
