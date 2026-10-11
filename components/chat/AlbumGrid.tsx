// ==========================================
// ALBUM (Figma M19 · several photos/videos in one message)
// ==========================================
// Two per row (one alone fills the width); videos show a ▶ and their
// length. Tap a photo to see it full screen; videos open in the player.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONTS } from "@/constants/fonts";

export type AlbumItem = {
  kind: "image" | "video";
  url?: string;
  thumbnailUrl?: string | null;
  duration?: number | null;
};

function lengthOf(seconds?: number | null) {
  if (!seconds || seconds <= 0) return "";
  const total = Math.round(seconds > 1000 ? seconds / 1000 : seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default function AlbumGrid({ items }: { items: AlbumItem[] }) {
  const insets = useSafeAreaInsets();
  const [viewing, setViewing] = useState<string | null>(null);

  if (!items?.length) return null;
  const single = items.length === 1;

  const open = (item: AlbumItem) => {
    if (!item.url) return;
    if (item.kind === "video") Linking.openURL(item.url).catch(() => {});
    else setViewing(item.url);
  };

  return (
    <View style={styles.grid}>
      {items.slice(0, 10).map((item, index) => {
        const preview = item.kind === "video" ? item.thumbnailUrl : item.url;
        return (
          <Pressable
            key={`${item.url || "item"}-${index}`}
            onPress={() => open(item)}
            style={[styles.tile, single && styles.tileSingle]}
            accessibilityLabel={item.kind === "video" ? "Play video" : "Open photo"}>
            {preview ? (
              <Image source={{ uri: preview }} style={styles.media} contentFit="cover" />
            ) : (
              <View style={[styles.media, styles.videoBlank]} />
            )}
            {item.kind === "video" ? (
              <View style={styles.videoBadge}>
                <Ionicons name="play" size={12} color="#FFFFFF" />
                {lengthOf(item.duration) ? <Text style={styles.videoText}>{lengthOf(item.duration)}</Text> : null}
              </View>
            ) : null}
          </Pressable>
        );
      })}

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={styles.viewer}>
          <Pressable
            style={[styles.close, { top: insets.top + 12 }]}
            onPress={() => setViewing(null)}
            hitSlop={10}
            accessibilityLabel="Close">
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </Pressable>
          {viewing ? <Image source={{ uri: viewing }} style={styles.full} contentFit="contain" /> : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6, width: 270, marginBottom: 8 },

  tile: { width: 132, height: 110, borderRadius: 14, overflow: "hidden", backgroundColor: "#E3E7EF" },

  tileSingle: { width: 270, height: 200 },

  media: { width: "100%", height: "100%" },

  videoBlank: { backgroundColor: "#2A2D3A" },

  videoBadge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
  },

  videoText: { fontFamily: FONTS.medium, fontSize: 11, color: "#FFFFFF" },

  viewer: { flex: 1, backgroundColor: "#000000", alignItems: "center", justifyContent: "center" },

  close: { position: "absolute", right: 18, zIndex: 2 },

  full: { width: "100%", height: "80%" },
});
