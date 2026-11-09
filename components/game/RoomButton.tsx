// The Battle button: opens the Battle sheet, with the count of public Rooms
// near you (costquest-ios Features/RoomsFeature.swift BattleButton). Shaped
// like the rail's own buttons (Hud.tsx), in berry, so it sits in the rail.
import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

import { useRooms } from "@/features/game/roomsRuntime";

import { ACCENT, ELEVATION, SURFACES, useLook } from "./look";
import { GF } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

export default function RoomButton({ onPress }: { onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const look = useLook();
  const { nearby } = useRooms();
  const n = nearby.length;
  return (
    <Pressable
      style={styles.button}
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={n ? `Battle, ${n} ${n === 1 ? "room" : "rooms"} near you` : "Battle"}>
      <Ionicons name="flash" size={22} color={look.dark ? "#FF8A8F" : ACCENT.berry.fill} />
      {n ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{n > 9 ? "9+" : n}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// A paper map control (look.ts), the glyph in Berry; the count Sun with an ink label.
const STYLE_PAIR = themedStyles(
  {
    button: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: SURFACES.light.surface,
      borderWidth: 1,
      borderColor: SURFACES.light.hairline,
      alignItems: "center",
      justifyContent: "center",
      ...ELEVATION.float,
    },
    badge: {
      position: "absolute",
      top: -5,
      right: -5,
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: ACCENT.sun.fill,
      borderWidth: 2,
      borderColor: SURFACES.light.surface,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 3,
    },
    badgeText: { fontFamily: GF.display, fontSize: 12, lineHeight: 15, color: ACCENT.sun.label },
  },
  {
    button: { backgroundColor: SURFACES.dark.surface, borderColor: SURFACES.dark.hairline, shadowOpacity: 0, elevation: 0, boxShadow: "none" },
    badge: { borderColor: SURFACES.dark.surface },
    badgeText: { color: ACCENT.sun.label },
  },
);
