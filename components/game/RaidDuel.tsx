// A boss fought as a Guardian Duel (the server's raid_duel knob; staging has
// it on): the briefing DuelScreen shows for a boss instead of a Guardian's,
// and the reward summary of what the fight did to the crew's shared pool.
// The fight itself is DuelScreen's arena, unchanged: mode "raid" of
// /v1/duel/start, judged by the server like any duel.
// costquest-ios Features/DuelFeature.swift (DuelView with .raid(point):
// title "Boss raid · ...", raidPanel, the raid subtitle lines).
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { distanceM, distanceText } from "@/features/game/geo";
import { RAID_COLOR, raidDuelBlurb, raidDuelReward, raidHp, raidLineText } from "@/features/game/raids";
import { gameStore, useGame } from "@/features/game/runtime";
import type { DuelOutcome, QuestPoint, RoamStanding } from "@/features/game/wire";

import { GameBackdrop } from "./GameBackdrop";
import { announce, GameButton, GameIconButton, MAX_FONT_SCALE } from "./kit";
import { contrast, edgeColor, ELEVATION, RADIUS, SURFACES, TEXT_ON_DARK, TEXT_ON_LIGHT, useLook } from "./look";
import { useMinuteClock } from "./RaidBanner";
import { RaidCrown, RaidHPBar } from "./RaidParts";
import type { RewardSummary } from "./Reward";
import { GF } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

/** DuelScreen's reward for a raid fight (typed here so a drift from Reward.tsx fails the typecheck). */
export function raidDuelRewardSummary(o: DuelOutcome, point: QuestPoint, before: RoamStanding | null, after: RoamStanding | null): RewardSummary {
  return raidDuelReward(o, point, before, after);
}

/** The briefing for a boss: same props as DuelScreen's own Briefing. */
export function RaidDuelBriefing({
  point,
  busy,
  problem,
  onFight,
  onClose,
}: {
  point: QuestPoint;
  busy: boolean;
  problem: string | null;
  onFight: () => void;
  onClose: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();
  const look = useLook();
  const now = useMinuteClock();
  const hp = raidHp(point);
  // Values from the store's snapshot, never read off the singleton in render (React Compiler).
  const me = useGame((s) => s.me);
  const fix = useGame((s) => s.fix);
  const config = useGame((s) => s.config);
  const realm = config?.factions.find((f) => f.id === point.realm)?.name ?? gameStore.factionName(point.realm);
  // iOS has no live regions: say a refusal when it arrives.
  useEffect(() => {
    if (problem) announce(problem);
  }, [problem]);
  return (
    <View style={styles.root}>
      <GameBackdrop tint={RAID_COLOR} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.emblem}>
          <RaidCrown size={280} color={`${RAID_COLOR}24`} />
        </View>
        <View style={styles.topBar}>
          <GameIconButton icon="close" diameter={42} onPress={onClose} accessibilityLabel={`Leave the boss raid at ${point.name}`} />
          <Text style={styles.placeChip} numberOfLines={1}>
            BOSS RAID
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <Animated.View entering={FadeIn.duration(400)} style={{ gap: 8 }}>
          <Text style={[styles.kicker, { color: readableTint(RAID_COLOR, look.screen, look.text) }]}>{raidLineText(point, now)}</Text>
          <Text style={styles.guardian} numberOfLines={3} adjustsFontSizeToFit maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityRole="header">
            {point.name}
          </Text>
          {hp ? <RaidHPBar hp={hp.left} maxHp={hp.max} onLight={!look.dark} /> : null}
        </Animated.View>
      </View>
      <View style={[styles.lower, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.facts}>
          <Fact label="BOSS" value={realm} color={readableTint(RAID_COLOR, look.surface, look.text)} />
          <View style={styles.divider} />
          <Fact label="YOU" value={me ? `Lv ${me.standing.level}` : "-"} color={look.text} />
          <View style={styles.divider} />
          <Fact label="DISTANCE" value={distanceText(fix ? distanceM(fix, point) : null)} color={look.text} />
        </View>
        <Text style={styles.blurb}>{raidDuelBlurb(point)}</Text>
        <Text style={styles.howto}>Tap to strike · Hold to block, keep holding to charge · Flick toward to dash, away to dodge · Drag to walk</Text>
        {problem ? <Text style={styles.problem}>{problem}</Text> : null}
        {busy ? (
          <ActivityIndicator color={look.textMuted} accessibilityLabel="Finding the boss" />
        ) : (
          <GameButton title="Fight the boss" color={RAID_COLOR} onPress={onFight} icon={<RaidCrown size={20} />} testID="duel-fight" />
        )}
      </View>
    </View>
  );
}

function Fact({ label, value, color }: { label: string; value: string; color: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.fact} accessible accessibilityLabel={`${label.toLowerCase()}: ${value}`}>
      <Text style={styles.factLabel} maxFontSizeMultiplier={MAX_FONT_SCALE}>{label}</Text>
      <Text style={[styles.factValue, { color }]} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {value}
      </Text>
    </View>
  );
}

/** A tint as words on the page: itself if it reads (AA), else its darker edge, else the ink. */
function readableTint(color: string, page: string, ink: string): string {
  if (contrast(color, page) >= 4.5) return color;
  const edge = edgeColor(color, 0.6);
  return contrast(edge, page) >= 4.5 ? edge : ink;
}

const L = SURFACES.light;
const D = SURFACES.dark;

const STYLE_PAIR = themedStyles(
  {
  root: { ...StyleSheet.absoluteFill, backgroundColor: L.screen },
  header: { flex: 1, paddingHorizontal: 16, paddingBottom: 22, overflow: "hidden" },
  emblem: { position: "absolute", right: -70, top: 20 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  placeChip: {
    maxWidth: "70%",
    fontFamily: GF.bold,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 0.6,
    color: L.text,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.chip,
    overflow: "hidden",
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.hairline,
  },
  kicker: { fontFamily: GF.bold, fontSize: 13, lineHeight: 16, letterSpacing: 1 },
  guardian: { fontFamily: GF.display, fontSize: 40, lineHeight: 44, color: L.text },
  lower: { paddingHorizontal: 16, paddingTop: 18, gap: 14 },
  facts: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderRadius: RADIUS.card, backgroundColor: L.surface, ...ELEVATION.low },
  fact: { flex: 1, alignItems: "center", gap: 4 },
  factLabel: { fontFamily: GF.bold, fontSize: 12, lineHeight: 15, letterSpacing: 0.8, color: L.textMuted },
  factValue: { fontFamily: GF.display, fontSize: 20, lineHeight: 24 },
  divider: { width: 1, height: 36, backgroundColor: L.hairline },
  blurb: { fontFamily: GF.body, fontSize: 15, lineHeight: 21, color: L.text },
  howto: { fontFamily: GF.regular, fontSize: 12, lineHeight: 16, color: L.textMuted },
  problem: { fontFamily: GF.body, fontSize: 14, lineHeight: 18, color: TEXT_ON_LIGHT.danger },
  },
  {
  root: { backgroundColor: D.screen },
  placeChip: { color: D.text, backgroundColor: D.surface, borderColor: D.hairline },
  guardian: { color: D.text },
  facts: { backgroundColor: D.surface, borderWidth: 1, borderColor: D.hairline, shadowOpacity: 0, elevation: 0, boxShadow: "none" },
  factLabel: { color: D.textMuted },
  divider: { backgroundColor: D.hairline },
  blurb: { color: D.text },
  howto: { color: D.textMuted },
  problem: { color: TEXT_ON_DARK.danger },
  },
);
