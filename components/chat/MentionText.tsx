// ==========================================
// MESSAGE TEXT WITH @ MENTIONS
// ==========================================
// Shows @names (and @everyone) in bold pink, and keeps links clickable
// (everything that isn't a mention goes through LinkText as before).
// Rendered INSIDE the bubble's <Text>, so it returns plain text pieces.
import { Fragment } from "react";
import { StyleSheet, Text } from "react-native";

import { FONTS } from "@/constants/fonts";

import { LinkText } from "./LinkText";

// @everyone, or @username (letters, numbers, _ and .)
const MENTION_PATTERN = /(@everyone\b|@[A-Za-z0-9_.]+)/g;

export function MentionText({ text, mine }: { text: string; mine: boolean }) {
  const parts = text.split(MENTION_PATTERN);

  return (
    <>
      {parts.map((part, index) => {
        if (!part) {
          return null;
        }

        // split() with a capture group puts the mentions at odd positions.
        if (index % 2 === 1) {
          return (
            <Text key={index} style={styles.mention}>
              {part}
            </Text>
          );
        }

        return (
          <Fragment key={index}>
            <LinkText text={part} mine={mine} />
          </Fragment>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  mention: {
    fontFamily: FONTS.semibold,
    color: "#C34D9C",
  },
});
