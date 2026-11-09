// A game result in a chat bubble (message kind "game_result", task 059;
// F-34 / F-44): won or played, where, the XP and coins, the level, and a
// Play button into the game. Older servers send the same result as text.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { GF, realmColor, realmIcon } from "@/components/game/theme";
import { FONTS } from "@/constants/fonts";
import { normalizeResult } from "@/features/world/gameInvite";
import { world } from "@/features/world/worldState";
import { C, radius, space } from "@/theme/tokens";
import { haptic } from "@/utils/haptics";

export default function GameResultCard({ raw, onLongPress }: { raw: unknown; mine: boolean; onLongPress?: () => void }) {
  const result = normalizeResult(raw);
  if (!result) return null;
  const tint = realmColor(result.realm);
  const where = result.pointName ? ` at ${result.pointName}` : "";
  const label = `${result.headline}${where}${result.xp ? `, plus ${result.xp} XP` : ""}${result.coins ? `, ${result.coins} coins` : ""}`;
  return (
    <Pressable onLongPress={onLongPress} delayLongPress={300} style={styles.card} accessible accessibilityLabel={`Game result: ${label}`} testID="game-result-card">
      <View style={[styles.band, { backgroundColor: tint }]}>
        <Ionicons name={result.win ? "trophy" : realmIcon(result.realm)} size={18} color={C.white} />
        <Text style={styles.bandText}>{result.win ? "VICTORY" : "COSTQUEST"}</Text>
        {result.level ? (
          <View style={styles.levelPill}>
            <Text style={styles.levelText}>LV {result.level}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        <Text style={styles.headline} numberOfLines={2}>
          {result.headline}
        </Text>
        {result.pointName ? (
          <Text style={styles.place} numberOfLines={1}>
            {result.pointName}
          </Text>
        ) : null}
        <View style={styles.stats}>
          {result.xp ? <Text style={styles.stat}>+{result.xp} XP</Text> : null}
          {result.coins ? <Text style={styles.stat}>+{result.coins} coins</Text> : null}
          {result.rank ? <Text style={styles.rank}>{result.rank}</Text> : null}
        </View>
        <Pressable
          onPress={() => {
            haptic.tap();
            if (router.canDismiss()) router.dismissAll();
            world.openGame(null);
          }}
          style={({ pressed }) => [styles.play, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
          accessibilityLabel="Play CosQuest">
          <Text style={styles.playText}>Play</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 240, borderRadius: radius.lg, overflow: "hidden", backgroundColor: C.white, borderWidth: 1, borderColor: "rgba(36,40,60,0.08)" },
  band: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
  bandText: { flex: 1, fontFamily: GF.display, fontSize: 15, letterSpacing: 1, color: C.white },
  levelPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.25)" },
  levelText: { fontFamily: GF.bold, fontSize: 12, color: C.white },
  body: { padding: space.md, gap: 4 },
  headline: { fontFamily: GF.display, fontSize: 18, lineHeight: 22, color: C.gameInk },
  place: { fontFamily: FONTS.medium, fontSize: 12.5, color: C.slate },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: 2 },
  stat: { fontFamily: GF.bold, fontSize: 14, color: C.gameSunDeep },
  rank: { fontFamily: GF.body, fontSize: 13, color: C.gameMist },
  play: { marginTop: space.sm, alignSelf: "flex-start", paddingHorizontal: space.lg, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: C.gameSun },
  playText: { fontFamily: GF.display, fontSize: 15, color: C.white },
});
