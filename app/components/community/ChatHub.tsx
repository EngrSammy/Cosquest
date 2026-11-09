// ==========================================
// COMPUTERS: the chat list with a Chats | Community switch
// ==========================================
// The left column of the chat page and the sidebar beside the feed. The
// choice is remembered while the app is open (the Community page's tabs set
// it before opening the chat page).
import { useSyncExternalStore } from "react";
import { Pressable, Text, View } from "react-native";

import { themedStyles, useThemedStyles } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";

import { Chats } from "./Chats";

type HubTab = "chats" | "community";

let current: HubTab = "chats";
const listeners = new Set<() => void>();

export function setHubView(view: HubTab) {
  current = view;
  listeners.forEach((listener) => listener());
}

function useHubView() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => current,
  );
}

export default function ChatHub() {
  const styles = useThemedStyles(STYLE_PAIR);
  const view = useHubView();
  return (
    <View>
      <View style={styles.switch} accessibilityRole="tablist">
        {(["chats", "community"] as HubTab[]).map((key) => {
          const on = view === key;
          return (
            <Pressable
              key={key}
              onPress={() => setHubView(key)}
              style={({ hovered }: any) => [styles.item, on && styles.itemOn, hovered && !on && styles.itemHover]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}>
              <Text style={[styles.text, on && styles.textOn]}>{key === "chats" ? "Chats" : "Community"}</Text>
            </Pressable>
          );
        })}
      </View>
      <Chats view={view} />
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    switch: { flexDirection: "row", gap: 6, padding: 4, marginHorizontal: 4, marginBottom: 10, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.75)" },
    item: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 11 },
    itemOn: { backgroundColor: "#C34D9C" },
    itemHover: { backgroundColor: "rgba(195,77,156,0.08)" },
    text: { fontFamily: FONTS.medium, fontSize: 13.5, color: "#5F6170" },
    textOn: { fontFamily: FONTS.semibold, color: "#FFFFFF" },
  },
  {
    switch: { backgroundColor: "#252837" },
    text: { color: "#B5BBCB" },
  },
);
