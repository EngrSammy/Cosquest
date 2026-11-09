// The Friends button: a round berry button with the count of gifts waiting,
// for the tile in the More sheet (costquest-ios Features/FriendsFeature.swift
// FriendsButton; placed by Roam/RoamHomeView.swift moreTiles). It opens the
// sheet through `onPress`; the game root owns the sheet, as it does the journal.
import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { Pressable, type StyleProp, Text, View, type ViewStyle } from "react-native";

import { friendsButtonLabel, pendingFromMe } from "@/features/game/friends";
import { friendsModel, useFriends } from "@/features/game/friendsRuntime";
import { useGame } from "@/features/game/runtime";

import { ACCENT, ELEVATION, SURFACES, useLook } from "./look";
import { GF } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

export default function FriendsButton({ onPress, size = 46, style }: { onPress: () => void; size?: number; style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const look = useLook();
  const friends = useFriends();
  const me = useGame((s) => s.me);
  // The list's count once it is in; /me's until then.
  const pending = friends.payload ? friends.payload.pending_gifts : pendingFromMe(me);

  useEffect(() => {
    void friendsModel.refresh();
  }, []);

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={friendsButtonLabel(pending)} hitSlop={6} style={style}>
      {({ pressed }) => (
        // A paper map control like the rest of the rail and More (look.ts), the glyph in Berry.
        <View style={{ width: size, height: size, transform: [{ scale: pressed ? 0.94 : 1 }] }}>
          <View style={[styles.face, { width: size, height: size, borderRadius: size / 2 }, !look.dark && ELEVATION.float]}>
            <Ionicons name="people" size={Math.round(size * 0.46)} color={look.dark ? "#FF8A8F" : ACCENT.berry.fill} />
          </View>
          {pending > 0 ? (
            <View style={styles.badge} pointerEvents="none">
              <Text style={styles.badgeText}>{pending}</Text>
            </View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const STYLE_PAIR = themedStyles(
  {
    face: { backgroundColor: SURFACES.light.surface, borderWidth: 1, borderColor: SURFACES.light.hairline, alignItems: "center", justifyContent: "center" },
    badge: {
      position: "absolute",
      top: -6,
      right: -6,
      minWidth: 22,
      height: 22,
      paddingHorizontal: 6,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: SURFACES.light.surface,
      backgroundColor: ACCENT.sun.fill,
      alignItems: "center",
      justifyContent: "center",
    },
    // Ink on Sun: never white.
    badgeText: { fontFamily: GF.display, fontSize: 12, lineHeight: 15, color: ACCENT.sun.label },
  },
  {
    face: { backgroundColor: SURFACES.dark.surface, borderColor: SURFACES.dark.hairline },
    badge: { borderColor: SURFACES.dark.surface },
    badgeText: { color: ACCENT.sun.label },
  },
);
