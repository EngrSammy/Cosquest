// A banner under the top bar while a boss is out near the player: its name,
// its shared health when the server puts it on the point (a boss fought as
// duels), how far, and "Fight the boss", which opens the boss point's sheet
// (where reach is judged). costquest-ios Features/RaidsFeature.swift
// RaidBanner, placed by Roam/RoamHomeView.swift worldBanners (line ~109).
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";

import { distanceM, distanceText, type LatLng } from "@/features/game/geo";
import { nearestBoss, RAID_COLOR, raidHp } from "@/features/game/raids";
import type { QuestPoint } from "@/features/game/wire";

import { announce, GameButton, HUD_FONT_SCALE } from "./kit";
import { RaidBadge, RaidHPBar } from "./RaidParts";
import { ELEVATION, RADIUS, SURFACES } from "./look";
import { GF } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

/** Re-reads the clock every `ms` (the boss's window is minutes long; iOS ticks every 30 s). */
export function useMinuteClock(ms = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export default function RaidBanner({
  points,
  fix,
  onFight,
}: {
  /** Nearby points, nearest first (GameRoot's `nearby`). */
  points: QuestPoint[];
  /** Where the player is (the store's `fix`): a value, so the distance re-renders with it. */
  fix: LatLng | null;
  /** Opens the boss point's sheet. Omit to show no button. */
  onFight?: (boss: QuestPoint) => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const now = useMinuteClock();
  const boss = nearestBoss(points, now);
  // iOS has no live regions: say it once when a boss comes into range.
  const announced = useRef<string | null>(null);
  const bossId = boss?.id ?? null;
  const bossName = boss?.name ?? "";
  useEffect(() => {
    if (bossId === null) {
      announced.current = null;
    } else if (announced.current !== bossId) {
      announced.current = bossId;
      announce(`A boss has appeared: ${bossName}`);
    }
  }, [bossId, bossName]);
  if (!boss) return null;
  const hp = raidHp(boss);
  const away = distanceText(fix ? distanceM(fix, boss) : null);
  return (
    <Animated.View
      entering={FadeInUp.duration(250)}
      exiting={FadeOutUp.duration(180)}
      style={styles.banner}>
      <RaidBadge />
      <View style={styles.body} accessible accessibilityRole="summary" accessibilityLabel={`A boss has appeared: ${boss.name}. ${away}.${hp ? ` Boss health ${Math.max(0, hp.left)} of ${hp.max}.` : ""}`}>
        {/* Two lines, not shrunk to fit: Android ignores minimumFontScale and
            shrank the name to nothing beside the button. */}
        <Text style={styles.title} numberOfLines={2} maxFontSizeMultiplier={HUD_FONT_SCALE}>
          {`Boss out: ${boss.name}`}
        </Text>
        {hp ? <RaidHPBar hp={hp.left} maxHp={hp.max} compact /> : null}
        <Text style={styles.sub} maxFontSizeMultiplier={HUD_FONT_SCALE}>{away}</Text>
      </View>
      {onFight ? (
        <GameButton title="Fight the boss" small color={RAID_COLOR} onPress={() => onFight(boss)} accessibilityLabel={`Fight the boss: ${boss.name}`}
          style={styles.fight} />
      ) : null}
    </Animated.View>
  );
}

const L = SURFACES.light;
const D = SURFACES.dark;

const STYLE_PAIR = themedStyles(
  {
    // A block in GameRoot's banner column (under the top bar, left of the rail): a paper plate like the rest of the HUD.
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 10,
      borderRadius: RADIUS.card,
      backgroundColor: L.surface,
      borderWidth: 1,
      borderColor: L.hairline,
      ...ELEVATION.float,
    },
    body: { flex: 1, gap: 3 },
    fight: { flexShrink: 0 },
    title: { fontFamily: GF.display, fontSize: 16, lineHeight: 20, color: L.text },
    sub: { fontFamily: GF.regular, fontSize: 12, lineHeight: 16, color: L.textMuted, fontVariant: ["tabular-nums"] },
  },
  {
    banner: { backgroundColor: D.surface, borderColor: D.hairline, shadowOpacity: 0, elevation: 0, boxShadow: "none" },
    title: { color: D.text },
    sub: { color: D.textMuted },
  },
);
