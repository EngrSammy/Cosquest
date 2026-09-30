// Shows message text with any links in it CLICKABLE (like WhatsApp):
//   - CosQuest post links (https://<our site>/post/<id>, cosquest://post/<id>)
//     open the post screen INSIDE the app
//   - any other link opens in the browser
// Plain text around the links stays as it is.
import { router } from "expo-router";
import { Fragment } from "react";
import { Linking, Platform, StyleSheet, Text } from "react-native";

import { getWebBaseUrl } from "@/utils/shareLinks";

// http(s):// or cosquest:// up to the next space.
const LINK_PATTERN = /((?:https?|cosquest):\/\/[^\s]+)/gi;

// Punctuation that's usually the end of a sentence, not part of the link:
// "see https://x.com/post/1." -> link is https://x.com/post/1
const TRAILING_PUNCTUATION = /[.,!?;:)\]'"]+$/;

function splitTrailing(url: string) {
  const match = url.match(TRAILING_PUNCTUATION);

  if (!match) {
    return { link: url, rest: "" };
  }

  return {
    link: url.slice(0, -match[0].length),
    rest: match[0],
  };
}

// Is this a link to one of our own posts? Returns the post id if so.
function getOwnPostId(url: string): string | null {
  const appLink = url.match(/^cosquest:\/\/post\/([A-Za-z0-9_-]+)/i);

  if (appLink) {
    return appLink[1];
  }

  const webMatch = url.match(/^https?:\/\/([^/]+)\/post\/([A-Za-z0-9_-]+)/i);

  if (!webMatch) {
    return null;
  }

  const base = getWebBaseUrl();
  const ourHost = base ? base.replace(/^https?:\/\//i, "").split("/")[0] : "";
  const linkHost = webMatch[1];

  // Our website (or localhost while developing).
  if (
    (ourHost && linkHost.toLowerCase() === ourHost.toLowerCase()) ||
    /^localhost(:\d+)?$/i.test(linkHost)
  ) {
    return webMatch[2];
  }

  return null;
}

function openLink(url: string) {
  const postId = getOwnPostId(url);

  if (postId) {
    router.push({ pathname: "/post/[id]", params: { id: postId } });
    return;
  }

  Linking.openURL(url).catch(() => {
    // Nothing on this device can open it — leave it as text.
  });
}

export function LinkText({ text, mine }: { text: string; mine: boolean }) {
  const parts = text.split(LINK_PATTERN);

  return (
    <>
      {parts.map((part, index) => {
        // split() with a capture group puts the links at odd positions.
        if (index % 2 === 0) {
          return part ? <Fragment key={index}>{part}</Fragment> : null;
        }

        const { link, rest } = splitTrailing(part);

        return (
          <Fragment key={index}>
            <Text
              style={[styles.link, mine ? styles.linkMine : styles.linkTheirs]}
              onPress={() => openLink(link)}
              accessibilityRole="link">
              {link}
            </Text>
            {rest}
          </Fragment>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  link: {
    textDecorationLine: "underline",
    fontWeight: "600",
    // Long links wrap inside the bubble instead of running out of it.
    ...(Platform.OS === "web"
      ? ({ wordBreak: "break-all", overflowWrap: "anywhere" } as object)
      : null),
  },

  // White on your own (pink) bubbles, pink on theirs (white).
  linkMine: { color: "#FFFFFF" },

  linkTheirs: { color: "#C5399A" },
});
