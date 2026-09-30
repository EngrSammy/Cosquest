import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

// Long captions fold with "See more".
const LONG_CAPTION_CHARS = 200;
const COLLAPSED_LINES = 3;

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

// Bold username + caption, then the hashtags as pink chips.
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
    <View style={styles.wrap}>
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
        <View style={styles.chips}>
          {hashtags.map((tag) => (
            <View key={tag} style={styles.chip}>
              <Text style={styles.chipText}>{tag}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    paddingHorizontal: 4,
  },

  caption: {
    fontSize: 14,
    lineHeight: 21,
    color: "#29292F",
  },

  username: {
    fontWeight: "800",
    color: "#191922",
  },

  more: {
    marginTop: 3,
    fontSize: 12.5,
    fontWeight: "700",
    color: "#8A8A93",
  },

  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },

  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#FBEAF0",
  },

  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#993556",
  },
});
