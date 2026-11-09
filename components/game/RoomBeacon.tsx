// A public Room on the home map: a berry beacon among the shrines, taller
// than a point so it reads as a gathering (costquest-ios RoomsFeature.swift
// RoomBeacons, Roam/RoamHomeView.swift roomObjects, ~lines 464-471). WorldMap
// places it in its world view at the Room's local offset, like a PointMarker.
import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import type { NearbyRoom } from "@/features/game/rooms";

import { ACCENT } from "./look";
import { GF } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

const SIZE = 44;

function RoomBeacon({ room, left, top, onPress }: { room: NearbyRoom; left: number; top: number; onPress: (room: NearbyRoom) => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const who = room.host_handle || "Someone";
  return (
    <Pressable
      onPress={() => onPress(room)}
      hitSlop={10}
      style={[styles.marker, { left: left - SIZE / 2, top: top - SIZE - 14 }]}
      accessibilityRole="button"
      accessibilityLabel={`${who}'s Room, ${room.players ?? 0} ${room.players === 1 ? "player" : "players"}`}
      accessibilityHint="Opens the Battle sheet on this room">
      <View style={styles.pin}>
        <Ionicons name="flash" size={20} color="#FFFFFF" />
        {room.players ? (
          <View style={styles.count}>
            <Text style={styles.countText}>{room.players}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.stem} />
      <View style={styles.shadow} />
    </Pressable>
  );
}

export default memo(RoomBeacon);

// Stands like a Quest Point pin (WorldMap PointMarker): a white ring, a 2 px
// white stem, a soft shadow on the ground; Berry because a Room is a fight.
const STYLE_PAIR = themedStyles(
  {
    marker: { position: "absolute", width: SIZE, height: SIZE + 14, alignItems: "center", zIndex: 2 },
    pin: {
      width: SIZE,
      height: SIZE,
      borderRadius: SIZE / 2,
      borderWidth: 3,
      borderColor: "#FFFFFF",
      backgroundColor: ACCENT.berry.fill,
      alignItems: "center",
      justifyContent: "center",
    },
    stem: { width: 2, height: 12, borderRadius: 1, backgroundColor: "#FFFFFF" },
    shadow: { width: 18, height: 6, marginTop: -3, borderRadius: 9, backgroundColor: "rgba(16,24,40,0.2)" },
    count: {
      position: "absolute",
      top: -6,
      right: -8,
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 3,
      backgroundColor: ACCENT.sun.fill,
      borderWidth: 2,
      borderColor: "#FFFFFF",
      alignItems: "center",
      justifyContent: "center",
    },
    countText: { fontFamily: GF.display, fontSize: 12, lineHeight: 15, color: ACCENT.sun.label },
  },
  { pin: { borderColor: "#FFFFFF" }, stem: { backgroundColor: "#FFFFFF" }, count: { borderColor: "#FFFFFF" }, countText: { color: ACCENT.sun.label } },
);
