// What a point paid, counted up where you can see it: "Rewards!" (or "For
// trying") over the encounter, a cream panel whose lines appear every 90 ms,
// the XP rolling up over 600 ms (art direction rewardCount), the level bar moving from where it was (and a LEVEL UP
// ceremony if it crossed a level). The numbers are the server's.
// costquest-ios Roam/RewardView.swift. Swift never shows coins on a reward.
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HELD_LINE } from "@/features/game/duelFlow";
import { gameStore } from "@/features/game/runtime";
import {
  ceremonyTimeline,
  type DailyDone,
  dailiesDone,
  factionLine,
  ioniconForSymbol,
  lineAmount,
  standingProgress,
} from "@/features/game/rewardCeremony";
import { settle } from "@/features/game/spring";
import { dailyMoment } from "@/features/game/warden";
import type { DuelOutcome, QuestPoint, RoamDaily, RoamExtra, RoamMe, RoamStanding, RoamVerdict } from "@/features/game/wire";

import { showBanner } from "./Banner";
import { ForgeCelebrate } from "./ForgeWorld";
import { announce, GameButton, GamePanel, GameTitle, MAX_FONT_SCALE } from "./kit";
import { LevelUp } from "./LevelUp";
import { ACCENT, useLook } from "./look";
import { Pop } from "./Pop";
import { RelicDropExtra } from "./RelicDropCard";
import { playSound } from "./sound";
import { GF, GP, realmColor } from "./theme";
import { wardenVoice } from "./wardenVoice";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

export type RewardSummary = {
  pointName: string;
  realm: string;
  win: boolean;
  headline: string;
  xp: number;
  coins: number;
  factionPoints: number;
  lines: { label: string; xp: number; coins: number; factionPoints: number }[];
  before: RoamStanding | null;
  after: RoamStanding | null;
  leveledUp: boolean;
  rankUp: boolean;
  dailiesCompleted: string[];
  extras: RoamExtra[];
  /** Held: the server would not pay this fight, and says why. */
  note?: string | null;
  /** The dailies completed, by title (from me.dailies); the banner and the Warden's line on leaving. */
  dailiesInfo?: DailyDone<RoamDaily>[];
  /** The Warden's level-up line: said 2.4 s in, when the ceremony has started. */
  speakLevel?: () => void;
  /** A fight's own numbers (the 3D fight, cq 061): shown as rows, each with testID `reward-<id>`. */
  stats?: { id: string; label: string; value: string }[];
  /** A fight the server did not count (the test arena, an unanswered finish): "Not counted" instead of "+0 XP". */
  practice?: boolean;
};

export function rewardFromVerdict(v: RoamVerdict, point: QuestPoint, me?: RoamMe | null): RewardSummary {
  const win = v.correct > 0 && !v.late;
  return {
    pointName: v.point_name || point.name,
    realm: point.realm,
    win,
    headline: v.late ? "Time's up" : v.kind === "blitz" ? `${v.correct} of ${v.total}` : win ? "Point taken!" : "Not this time",
    xp: v.reward.xp,
    coins: v.reward.coins,
    factionPoints: v.reward.faction_points,
    lines: v.reward.lines.map((l) => ({ label: l.label, xp: l.xp, coins: l.coins, factionPoints: l.faction_points })),
    before: v.before,
    after: v.after,
    leveledUp: v.leveled_up,
    rankUp: v.rank_up,
    dailiesCompleted: v.dailies_completed,
    extras: v.extras ?? [],
    dailiesInfo: dailiesDone(v.dailies_completed, (v.me ?? me)?.dailies ?? me?.dailies),
  };
}

export function rewardFromDuel(o: DuelOutcome, point: QuestPoint, before: RoamStanding | null, after: RoamStanding | null): RewardSummary {
  const pay = o.point?.reward ?? null;
  const won = o.status === "won";
  return {
    pointName: point.name,
    realm: point.realm,
    win: won,
    headline: o.status === "held" ? "Checking the score" : won ? "Guardian down!" : "The Guardian held",
    xp: pay?.xp ?? o.reward?.xp ?? 0,
    coins: 0,
    factionPoints: pay?.faction_points ?? o.reward?.faction_points ?? 0,
    lines: (pay?.lines ?? []).map((l) => ({ label: l.label, xp: l.xp ?? 0, coins: 0, factionPoints: l.faction_points ?? 0 })),
    before,
    after,
    leveledUp: !!o.point?.leveled_up || (!!before && !!after && after.level > before.level),
    rankUp: !!before && !!after && after.rank !== before.rank,
    dailiesCompleted: [],
    extras: o.point?.extras ?? [],
    note: o.status === "held" ? HELD_LINE : null,
  };
}

/**
 * RoamHomeView.celebrate: "Quest done!" for each daily the point completed (the
 * daily's title, else "Daily quest"), and 1.2 s later the Warden's line for it.
 * Called when the player leaves the reward (or the reveal).
 */
export function celebrate(reward: RewardSummary) {
  const done = reward.dailiesInfo ?? dailiesDone(reward.dailiesCompleted, gameStore.get().me?.dailies);
  for (const d of done) showBanner("Quest done!", { subtitle: d.title, color: GP.mint, sound: "fanfare" });
  const last = [...done].reverse().find((d) => d.daily);
  if (last?.daily) {
    const daily = last.daily as RoamDaily;
    setTimeout(() => {
      wardenVoice.speak(dailyMoment({ me: gameStore.get().me, playerName: gameStore.playerName() }, daily), 4000).catch(() => {});
    }, 1200);
  }
}

const LINE_SPRING = settle(0.35);

export default function Reward({ reward, onDone, onShare }: { reward: RewardSummary; onDone: () => void; onShare?: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  // Art direction 6.5: the screen follows the map's day/dusk state (cream by day, ink by dusk).
  const look = useLook();
  const insets = useSafeAreaInsets();
  const before = reward.before ?? reward.after;
  const after = reward.after;
  const [shownLines, setShownLines] = useState(0);
  const [xpCounted, setXpCounted] = useState(0);
  const [barLevel, setBarLevel] = useState(before?.level ?? 1);
  const [xpDone, setXpDone] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const bar = useSharedValue(standingProgress(before));
  const panelOpacity = useSharedValue(1);
  const levelsUp = reward.leveledUp && !!after;

  // Lines every 90 ms, then the XP rolls up (rewardCount) with the bar filling alongside.
  useEffect(() => {
    const t = ceremonyTimeline(reward.lines.length, reward.xp, levelsUp);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const settle = () => {
      // rewardCount's curve: the bar fills as the number rolls up.
      bar.value = withTiming(standingProgress(after), { duration: t.settleMs, easing: Easing.out(Easing.cubic) });
    };
    t.lineAt.forEach((ms, i) =>
      at(ms, () => {
        setShownLines(i + 1);
        // CosCoins are bought, not earned: a line is XP, never coins, so never the coin sound.
        playSound("tap");
      }),
    );
    t.xp.forEach((s) => at(s.atMs, () => setXpCounted(s.value)));
    at(t.xpDoneAt, () => {
      setXpDone(true);
      announce(`${reward.win ? "Rewards" : "For trying"}. Plus ${reward.xp} XP.${after && !levelsUp ? ` Level ${after.level}.` : ""}`);
    });
    if (t.level && after) {
      at(t.level.fillAt, () => {
        bar.value = withTiming(1, { duration: t.level?.fillMs ?? 500, easing: Easing.in(Easing.quad) });
      });
      at(t.level.popAt, () => {
        setBarLevel(after.level);
        bar.value = 0;
        playSound("fanfare");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setShowLevelUp(true);
        settle();
      });
    } else {
      at(t.settleAt, settle);
    }
    return () => timers.forEach(clearTimeout);
    // The reward is fixed for the life of the screen.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The Warden's level-up line lands with the ceremony (2.4 s in).
  useEffect(() => {
    if (!reward.leveledUp || !reward.speakLevel) return;
    const timer = setTimeout(() => reward.speakLevel?.(), 2400);
    return () => clearTimeout(timer);
  }, [reward]);

  useEffect(() => {
    panelOpacity.value = withTiming(showLevelUp ? 0 : 1, { duration: 300, easing: Easing.inOut(Easing.cubic) });
  }, [showLevelUp, panelOpacity]);

  const barStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, bar.value)) * 100}%` }));
  const panelStyle = useAnimatedStyle(() => ({ opacity: panelOpacity.value }));
  const faction = factionLine(reward.factionPoints);
  const dailies = reward.dailiesInfo ?? dailiesDone(reward.dailiesCompleted, null);

  return (
    // look-fight (art direction 7): the screen colour (cream by day, ink by dusk, 6.5), not the darkened
    // realm backdrop; the realm keeps a soft 8 % wash at the top so the place still colours the moment
    <View style={[styles.root, { backgroundColor: look.screen }]}>
      <LinearGradient colors={[`${realmColor(reward.realm)}14`, `${look.screen}00`]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <Animated.View
        style={[styles.column, { paddingTop: insets.top + 12 }, panelStyle]}
        pointerEvents={showLevelUp ? "none" : "auto"}
        importantForAccessibility={showLevelUp ? "no-hide-descendants" : "auto"}
        accessibilityElementsHidden={showLevelUp}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} testID="reward-screen">
          <View testID={reward.win ? "reward-win" : "reward-lose"}>
            <GameTitle text={reward.win ? "Rewards!" : "For trying"} size={44} color={reward.win ? GP.sun : "#FFFDF8"} edge="#1C2B3A" />
          </View>
          {/* Your Forge avatar celebrates a win (cq 056); nothing without one. */}
          {reward.win ? <ForgeCelebrate size={130} /> : null}
          <View style={styles.panelWrap}>
            <GamePanel>
              <View style={{ gap: 10 }}>
                {reward.stats?.map((st) => (
                  <View key={st.id} style={styles.line} testID={`reward-${st.id}`} accessible accessibilityLabel={`${st.label}, ${st.value}`}>
                    <Text style={styles.lineLabel} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                      {st.label}
                    </Text>
                    <Text style={styles.lineXp} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                      {st.value}
                    </Text>
                  </View>
                ))}
                {/* Every line is laid out from the start and slides in when its turn comes: lines inserted one by one
                    moved their siblings mid-animation, and Android drew them over the level row. */}
                {reward.lines.map((l, i) => (
                  <RewardLine key={`${l.label}-${i}`} label={l.label} amount={lineAmount(l)} shown={i < shownLines} />
                ))}
                <View style={styles.divider} />
                <View style={styles.levelRow} accessible accessibilityLabel={`Level ${barLevel}${after ? `, ${after.rank}` : ""}, ${reward.practice ? "not counted" : `plus ${reward.xp} XP`}`}>
                  <Text style={styles.level} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    Level {barLevel}
                  </Text>
                  {after ? <Text style={styles.rank}>{after.rank}</Text> : null}
                  <View style={{ flex: 1 }} />
                  <Text style={styles.xpCount} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    {reward.practice ? "Not counted" : `+${xpCounted} XP`}
                  </Text>
                </View>
                <View style={styles.track} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                  <Animated.View style={[styles.fill, barStyle]}>
                    <LinearGradient colors={["#FFC54D", "#F59E2A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
                    <View style={styles.gloss} />
                  </Animated.View>
                </View>
                {reward.extras.map((x, i) =>
                  x.kind === "relic" && x.relic ? (
                    // Lands after the XP has counted: its own moment, not one more line.
                    xpDone ? (
                      <Pop key={`${x.kind}-${i}`} from={0.6} response={0.5}>
                        <RelicDropExtra extra={x} />
                      </Pop>
                    ) : null
                  ) : (
                    <View key={`${x.kind}-${i}`} style={styles.extra} accessible accessibilityLabel={`${x.title}${x.subtitle ? `, ${x.subtitle}` : ""}${x.new ? ", new" : ""}`}>
                      <View style={styles.extraIcon}>
                        <Ionicons name={extraIcon(x)} size={18} color="#FFFFFF" />
                      </View>
                      <View style={{ flex: 1, gap: 1 }}>
                        <Text style={styles.extraTitle}>{x.title}</Text>
                        {x.subtitle ? <Text style={styles.extraSub}>{x.subtitle}</Text> : null}
                      </View>
                    </View>
                  ),
                )}
                {faction ? (
                  <View style={styles.factionRow} accessible accessibilityLabel={faction}>
                    <Ionicons name="flag" size={16} color={look.textMuted} />
                    <Text style={styles.faction}>{faction}</Text>
                  </View>
                ) : null}
                {dailies.map((d) => (
                  <View key={d.id} style={styles.factionRow} accessible accessibilityLabel={`Quest done: ${d.title}`}>
                    <Ionicons name="checkmark-circle" size={18} color={GP.mint} />
                    <Text style={styles.daily}>{d.title}</Text>
                  </View>
                ))}
                {reward.note ? <Text style={styles.note}>{reward.note}</Text> : null}
              </View>
            </GamePanel>
          </View>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
          {onShare ? <GameButton title="Share to a chat" color={look.surfaceAlt} onPress={onShare} style={{ marginBottom: 10 }} /> : null}
          {/* The primary is Sun with an ink label (art direction 2.6, 7 "Win screen"). */}
          <GameButton
            title="Back to the map"
            testID="reward-done"
            color={ACCENT.sun.fill}
            onPress={() => {
              celebrate(reward);
              onDone();
            }}
          />
        </View>
      </Animated.View>
      {showLevelUp && after ? (
        <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(300)} style={StyleSheet.absoluteFill}>
          <LevelUp level={after.level} rank={after.rank} rankUp={reward.rankUp} onDone={() => setShowLevelUp(false)} />
        </Animated.View>
      ) : null}
    </View>
  );
}

function extraIcon(x: RoamExtra): keyof typeof Ionicons.glyphMap {
  const name = ioniconForSymbol(x.icon, x.kind);
  return name in Ionicons.glyphMap ? (name as keyof typeof Ionicons.glyphMap) : "sparkles";
}

const STYLE_PAIR = themedStyles({
  root: { ...StyleSheet.absoluteFill },
  column: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", gap: 18, paddingVertical: 12 },
  panelWrap: { paddingHorizontal: 18 },
  line: { flexDirection: "row", alignItems: "center", gap: 8 },
  lineLabel: { flex: 1, fontFamily: GF.body, fontSize: 16, color: GP.ink },
  lineXp: { fontFamily: GF.display, fontSize: 18, color: GP.skyDeep },
  divider: { height: StyleSheet.hairlineWidth * 2, backgroundColor: "rgba(31,59,77,0.2)" },
  levelRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  level: { fontFamily: GF.display, fontSize: 22, color: GP.ink },
  rank: { fontFamily: GF.body, fontSize: 14, color: "rgba(31,59,77,0.6)" },
  xpCount: { fontFamily: GF.display, fontSize: 22, color: GP.skyDeep, fontVariant: ["tabular-nums"] },
  track: { height: 16, borderRadius: 8, backgroundColor: "rgba(31,59,77,0.12)", overflow: "hidden" },
  fill: { height: 16, minWidth: 12, borderRadius: 8, overflow: "hidden" },
  gloss: { position: "absolute", top: 2, left: 6, right: 6, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)" },
  extra: { flexDirection: "row", alignItems: "center", gap: 10 },
  extraIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: GP.skyDeep, alignItems: "center", justifyContent: "center" },
  extraTitle: { fontFamily: GF.display, fontSize: 17, color: GP.ink },
  extraSub: { fontFamily: GF.body, fontSize: 13, color: "rgba(31,59,77,0.6)" },
  factionRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  faction: { fontFamily: GF.body, fontSize: 14, color: "rgba(31,59,77,0.7)" },
  daily: { flex: 1, fontFamily: GF.body, fontSize: 14, color: GP.ink },
  note: { fontFamily: GF.body, fontSize: 14, color: "rgba(31,59,77,0.7)" },
  footer: { paddingHorizontal: 18, paddingTop: 8 },
});

/** One pay line: `.move(edge: .leading)`, settling in 0.35 s with no bounce when its turn comes. */
function RewardLine({ label, amount, shown }: { label: string; amount: string; shown: boolean }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const t = useSharedValue(shown ? 1 : 0);
  useEffect(() => {
    if (shown) t.set(withSpring(1, LINE_SPRING));
  }, [shown, t]);
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, t.get() * 1.5), transform: [{ translateX: (1 - t.get()) * -60 }] }));
  return (
    <Animated.View
      accessible={shown}
      accessibilityElementsHidden={!shown}
      importantForAccessibility={shown ? "yes" : "no-hide-descendants"}
      accessibilityLabel={amount ? `${label}, ${amount.replace("+", "plus ")}` : label}
      style={[styles.line, style]}>
      <Text style={styles.lineLabel} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {label}
      </Text>
      <Text style={styles.lineXp} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {amount}
      </Text>
    </Animated.View>
  );
}
