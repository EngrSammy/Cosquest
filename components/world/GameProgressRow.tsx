// One identity (task 059): the game level, rank and XP on the chat profile,
// under the chat points and faction rank, from the same player the game
// shows (one login, features/game/store.ts `me.standing`). Tap: into the game.
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { GF } from "@/components/game/theme";
import { FONTS } from "@/constants/fonts";
import { useGame } from "@/features/game/runtime";
import { world } from "@/features/world/worldState";
import { C, radius, space } from "@/theme/tokens";
import { haptic } from "@/utils/haptics";

export function GameProgressRow() {
  const standing = useGame((s) => s.me?.standing ?? null);
  const progress = standing ? (standing.max_level ? 1 : Math.max(0, Math.min(1, standing.into_level / Math.max(1, standing.level_span)))) : 0;
  const label = standing
    ? `In the game: level ${standing.level}, ${standing.rank}, ${standing.max_level ? "top level" : `${standing.into_level} of ${standing.level_span} XP to level ${standing.level + 1}`}`
    : "In the game: not played yet";
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        world.openGame(null);
      }}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens the game"
      testID="profile-game-progress">
      <View style={styles.level}>
        <Text style={styles.levelText} maxFontSizeMultiplier={1.2}>
          {standing?.level ?? "–"}
        </Text>
      </View>
      <View style={styles.body}>
        <View style={styles.head}>
          <Text style={styles.title} numberOfLines={1}>
            {standing ? `Game level ${standing.level} · ${standing.rank}` : "CostQuest: start playing"}
          </Text>
          <Text style={styles.value} numberOfLines={1}>
            {standing ? (standing.max_level ? `${standing.xp.toLocaleString()} XP` : `${standing.into_level} / ${standing.level_span} XP`) : ""}
          </Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={C.slate} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.md, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(36,40,60,0.12)" },
  level: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.gameSun, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: C.white },
  levelText: { fontFamily: GF.display, fontSize: 16, color: C.white },
  body: { flex: 1, gap: 6 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm },
  title: { flexShrink: 1, fontFamily: FONTS.semibold, fontSize: 12.5, color: C.ink },
  value: { fontFamily: FONTS.medium, fontSize: 11.5, color: C.gameSunDeep },
  track: { height: 7, borderRadius: radius.sm, backgroundColor: "rgba(242,153,46,0.18)", overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3, backgroundColor: C.gameSun },
});
