// ==========================================
// GROUP VIDEO — one tile per person
// ==========================================
// Used by both the phone and the website call screens. A tile shows the
// person's video when their camera is on (passed in as children), or their
// avatar when it's off. Their name sits at the bottom, and the tile gets a
// pink border while they're talking.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { CallPerson } from "@/services/calls";
import { getAvatarSource } from "@/utils/callHelpers";

import { CALL_COLORS } from "./CallVisuals";

// How big each tile is, depending on how many people are on screen:
//   1 → full screen        2 → one on top of the other
//   3-4 → 2 x 2            5-6 → 2 x 3            7-8 → 2 x 4
export function gridTileSize(count: number) {
  if (count <= 1) return { width: "100%", height: "100%" } as const;
  if (count === 2) return { width: "100%", height: "50%" } as const;
  if (count <= 4) return { width: "50%", height: "50%" } as const;
  if (count <= 6) return { width: "50%", height: "33.333%" } as const;
  return { width: "50%", height: "25%" } as const;
}

export default function VideoGridTile({
  person,
  isMe,
  speaking,
  micOff,
  count,
  children,
}: {
  person?: CallPerson | null;
  isMe?: boolean;
  speaking?: boolean;
  micOff?: boolean;
  // How many tiles are on screen (sets the tile size).
  count: number;
  // The video, when their camera is on.
  children?: ReactNode;
}) {
  const size = gridTileSize(count);
  const name = isMe
    ? "You"
    : (person?.name || person?.username || "Someone").split(" ")[0];

  return (
    <View style={[styles.cell, size]}>
      <View style={[styles.tile, speaking && styles.tileSpeaking]}>
        {children ? (
          <View style={StyleSheet.absoluteFill}>{children}</View>
        ) : (
          <View style={styles.noVideo}>
            <Image
              source={getAvatarSource(person || null)}
              style={styles.avatar}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          </View>
        )}

        <View style={styles.label}>
          {micOff ? (
            <Ionicons name="mic-off" size={12} color="#FFFFFF" />
          ) : null}
          <Text style={styles.labelText} numberOfLines={1}>
            {name}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    padding: 3,
  },

  tile: {
    flex: 1,
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: "#2A1030",
  },

  // Talking right now.
  tileSpeaking: {
    borderColor: CALL_COLORS.pink,
  },

  noVideo: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  avatar: {
    width: "42%",
    maxWidth: 110,
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: "#3A1A40",
  },

  label: {
    position: "absolute",
    left: 8,
    bottom: 8,
    maxWidth: "80%",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.45)",
  },

  labelText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
