import { StyleSheet, Text, View } from "react-native";

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

export function PostCaption({
  username,
  content,
}: {
  username: string;
  content?: string;
}) {
  if (!content) {
    return null;
  }

  const hashtags = extractHashtags(content);

  const caption = removeHashtags(content);

  return (
    <View>
      {caption ? (
        <Text style={styles.caption}>
          {username ? <Text style={styles.username}>{username} </Text> : null}

          {caption}
        </Text>
      ) : null}

      {hashtags.length > 0 ? (
        <Text style={styles.hashtags}>{hashtags.join(" ")}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  caption: {
    marginTop: 11,
    fontSize: 14,
    lineHeight: 20,
    color: "#29292F",
  },

  username: {
    fontWeight: "800",
    color: "#191922",
  },

  hashtags: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    color: "#C5399A",
  },
});
