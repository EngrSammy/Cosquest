// The verdict (costquest-ios Features/DuelFeature.swift DuelResultView):
// VICTORY / DEFEAT / CHECKING, the mode's line, the HP card, a run's points or
// a raid's damage, what it paid, a Relic, and the way back.
//
// look-fight (1 Nov 2026, art direction 7 "Win screen" / "Loss screen"): a light screen and a
// cream sheet that slides up (sheetMotion), the fight's highlights from Godot's record, the pay
// lines popping in 90 ms apart, the XP counting up over rewardCount (600 ms ease-out) with the
// level bar moving from where it was, the LEVEL UP screen as its own moment, the Relic flipping
// in after the count, today's quest progress, and a touch on each beat (prefs.ts honours the
// haptics choice). A loss is calm: DEFEATED in cream on a Berry band, one tip, the buttons at once.
// The beats are features/game/fightReward.ts (tested).
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, Keyframe, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  asFull,
  type DuelOutcomeFull,
  backLabel,
  dropOf,
  extraLines,
  fightersOf,
  fightTimeText,
  HP_CARD_TITLE,
  hpPercentText,
  hpRowName,
  hpShare,
  payIsEmpty,
  payOf,
  resultSubtitle,
  resultTitle,
  verdictAnnouncement,
} from "@/features/game/duelFlow";
import { dailyToShow, fightHighlights, fightRewardTimeline, lossTip } from "@/features/game/fightReward";
import { standingProgress } from "@/features/game/rewardCeremony";
import { gameStore } from "@/features/game/runtime";
import { paidLine, squadPaid } from "@/features/game/squad";
import type { DuelFighterPeek, DuelOutcome, DuelResult as DuelResultData, DuelStart } from "@/features/game/wire";

import { announce, GameButton, MAX_FONT_SCALE } from "./kit";
import { useLook } from "./look";
import { LevelUp, Sunburst } from "./LevelUp";
import { impact, notify, selection } from "./prefs";
import { RaidHPBar } from "./RaidParts";
import { RelicDropExtra } from "./RelicDropCard";
import { playSound } from "./sound";
import { GF, GP, realmColor } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";
import { POP_FADE, SHEET_EASE_OUT, SHEET_OPEN_MS } from "./sheetMotion";

// Art direction tokens (tokens.json ui.light, fight.victory_banner, fight.loss)
const SCREEN = "#F4EEE2";
const SURFACE = "#FFFDF8";
const SURFACE_ALT = "#EDE5D6";
const INK = "#1C2B3A";
const MUTED = "#5A6878";
const GOLD_HI = "#FFE08A";
const GOLD_LO = "#F59E2A";
const BERRY = "#D93840";
const HAIRLINE = "rgba(28,43,58,0.10)";

const SHEET_IN = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 260 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }], easing: SHEET_EASE_OUT },
}).duration(SHEET_OPEN_MS);
const TITLE_IN = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 1.25 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: SHEET_EASE_OUT },
}).duration(220);

export default function DuelResult({
  outcome,
  start,
  onDone,
  again,
  onAgain,
  fight,
}: {
  outcome: DuelOutcome;
  start: DuelStart | null;
  onDone: () => void;
  /** "Next rung" or "Try again" after a trial (DuelResultView onAgain), or null. */
  again?: string | null;
  onAgain?: () => void;
  /** look-fight: the 3D fight's whole result from Godot (Fight3DResult.record), for the highlights. */
  fight?: Record<string, unknown> | null;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  // The page follows the map's day/dusk state (art direction 6.5): its text and cards already do.
  const look = useLook();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const o = asFull(outcome);
  const won = o.status === "won";
  const held = o.status === "held";
  const lost = !won && !held;
  const factionName = (id: string) => gameStore.factionName(id);
  const subtitle = resultSubtitle(o, start, factionName);
  const fighters = start ? fightersOf(start) : null;
  const pay = payOf(o);
  const drop = dropOf(o);
  const extras = extraLines(o);
  // Squadded up in person: what fighting together paid (outcome.squad).
  const together = held ? null : squadPaid(o);
  const highlights = useMemo(() => fightHighlights(fight ?? null), [fight]);
  const before = o.point?.before ?? null;
  const after = o.point?.after ?? null;
  const xp = held ? 0 : Math.max(0, Math.floor(pay?.xp ?? 0));
  const lines = held ? [] : (pay?.lines ?? []).filter((l) => (l.xp ?? 0) > 0 || (l.faction_points ?? 0) > 0);
  const levelsUp = !held && !!after && (!!o.point?.leveled_up || (!!before && after.level > before.level));
  const daily = useMemo(() => (held ? null : dailyToShow(gameStore.get().me?.dailies ?? null)), [held]);
  const tip = useMemo(() => lossTip(Number((start?.seed_text ?? "0").slice(-6)) || 0), [start]);

  const [shownRows, setShownRows] = useState(0);
  const [xpShown, setXpShown] = useState(0);
  const [barLevel, setBarLevel] = useState(before?.level ?? after?.level ?? 1);
  const [dropShown, setDropShown] = useState(false);
  const [levelUp, setLevelUp] = useState(false);
  const bar = useSharedValue(standingProgress(before ?? after));

  useEffect(() => {
    announce(verdictAnnouncement(o, start, factionName));
    // The verdict is announced once, when it appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The beats (fightReward.ts). A loss skips the theatre: everything is there at once.
  useEffect(() => {
    if (lost || held) {
      setShownRows(lines.length);
      setXpShown(xp);
      setDropShown(true);
      bar.value = standingProgress(after ?? before);
      return;
    }
    const t = fightRewardTimeline(lines.length, xp, levelsUp);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    t.rowAt.forEach((ms, i) =>
      at(ms, () => {
        setShownRows(i + 1);
        selection();
      }),
    );
    t.count.forEach((c) => at(c.atMs, () => setXpShown(c.value)));
    at(t.countDone, () => {
      if (xp > 0) {
        playSound("reward");
        impact(Haptics.ImpactFeedbackStyle.Medium);
      }
      if (!t.level) bar.value = withTiming(standingProgress(after), { duration: 500, easing: Easing.out(Easing.quad) });
    });
    if (t.level && after) {
      at(t.level.fillAt, () => {
        bar.value = withTiming(1, { duration: 450, easing: Easing.in(Easing.quad) });
      });
      at(t.level.popAt, () => {
        setBarLevel(after.level);
        bar.value = 0;
        playSound("fanfare");
        notify(Haptics.NotificationFeedbackType.Success);
        setLevelUp(true);
        bar.value = withTiming(standingProgress(after), { duration: 600, easing: Easing.out(Easing.quad) });
      });
    }
    at(t.dropAt, () => setDropShown(true));
    return () => timers.forEach(clearTimeout);
    // The outcome is fixed for the life of the screen.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const barStyle = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, bar.value)) * 100}%` }));

  return (
    <Animated.View entering={POP_FADE} style={[StyleSheet.absoluteFill, { backgroundColor: look.screen }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}>
        {/* The title: VICTORY in gold over a slow sun, or DEFEATED on a Berry band. */}
        {won ? (
          <View style={styles.hero}>
            <View style={styles.sun} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              <Sunburst color={GOLD_HI} spin={!reduce} />
            </View>
            <Animated.Text entering={reduce ? undefined : TITLE_IN} accessibilityRole="header" style={styles.victory} maxFontSizeMultiplier={1.2}>
              {resultTitle(o.status)}
            </Animated.Text>
          </View>
        ) : lost ? (
          <View style={styles.lossBand}>
            <Text accessibilityRole="header" style={styles.defeated} maxFontSizeMultiplier={1.2}>
              DEFEATED
            </Text>
          </View>
        ) : (
          <Text accessibilityRole="header" style={styles.checking} maxFontSizeMultiplier={1.2}>
            {resultTitle(o.status)}
          </Text>
        )}
        {subtitle ? (
          <Text style={styles.subtitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {subtitle}
          </Text>
        ) : null}
        {lost ? (
          <View style={styles.tip} accessible accessibilityLabel={`Tip: ${tip}`}>
            <Ionicons name="bulb" size={18} color={GOLD_LO} />
            <Text style={styles.tipText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {tip}
            </Text>
          </View>
        ) : null}

        {highlights.length ? (
          <View style={styles.chips}>
            {highlights.map((h) => (
              <View key={h.id} style={styles.chip} accessible accessibilityLabel={`${h.label}, ${h.value}`} testID={`result-${h.id}`}>
                <Text style={styles.chipValue} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  {h.value}
                </Text>
                <Text style={styles.chipLabel} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  {h.label.toUpperCase()}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <Animated.View entering={reduce ? POP_FADE : SHEET_IN} style={styles.sheet}>
          {/* XP: counted up, the level bar moving from where it was */}
          {!held && (xp > 0 || after) ? (
            <View style={{ gap: 8 }} accessible accessibilityLabel={`Plus ${xp} XP${after ? `. Level ${after.level}, ${after.rank}` : ""}`}>
              <View style={styles.levelRow}>
                {after ? (
                  <Text style={styles.level} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    Level {barLevel}
                  </Text>
                ) : null}
                {after ? <Text style={styles.rank}>{after.rank}</Text> : null}
                <View style={{ flex: 1 }} />
                <Text style={styles.xp} maxFontSizeMultiplier={MAX_FONT_SCALE} testID="result-xp">
                  {`+${xpShown} XP`}
                </Text>
              </View>
              {after ? (
                <View style={styles.track} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                  <Animated.View style={[styles.fill, barStyle]} />
                </View>
              ) : null}
            </View>
          ) : null}

          {lines.map((l, i) => (
            <PayLine key={`${l.label}-${i}`} label={l.label} xp={l.xp ?? 0} fp={l.faction_points ?? 0} shown={i < shownRows} />
          ))}
          {pay && !held && !payIsEmpty(pay) && (pay.faction_points ?? 0) > 0 ? (
            <View style={styles.row} accessible accessibilityLabel={`${pay.faction_points} faction points`}>
              <Ionicons name="flag" size={16} color={MUTED} />
              <Text style={styles.rowLabel} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                Faction points
              </Text>
              <Text style={styles.rowValue} maxFontSizeMultiplier={MAX_FONT_SCALE}>{`+${pay.faction_points}`}</Text>
            </View>
          ) : null}

          {o.result && fighters ? <HpCard r={o.result} p1={fighters.p1} p2={fighters.p2} /> : null}
          {o.run && !held ? <RunPanel run={o.run} /> : null}
          {o.raid && !held ? <RaidPanel raid={o.raid} bossMax={start ? raidMax(start) : null} /> : null}

          {together ? (
            <View style={styles.row} accessible accessibilityLabel={paidLine(together)}>
              <Ionicons name="people" size={16} color={GOLD_LO} />
              <Text style={styles.rowLabel} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {paidLine(together)}
              </Text>
            </View>
          ) : null}

          {extras.map((line) => (
            <View key={line} style={styles.row} accessible accessibilityLabel={line}>
              <Ionicons name="ribbon" size={16} color={GOLD_LO} />
              <Text style={styles.rowLabel} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {line}
              </Text>
            </View>
          ))}

          {daily ? (
            <View style={{ gap: 6 }} accessible accessibilityLabel={`Today's quest: ${daily.title}, ${daily.progress} of ${daily.target}`}>
              <View style={styles.row}>
                <Ionicons name="today" size={16} color={GP.mint} />
                <Text style={styles.rowLabel} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  {daily.title}
                </Text>
                <Text style={styles.rowValue} maxFontSizeMultiplier={MAX_FONT_SCALE}>{`${daily.progress}/${daily.target}`}</Text>
              </View>
              <View style={styles.trackThin}>
                <View style={{ width: `${Math.min(1, daily.progress / Math.max(1, daily.target)) * 100}%`, height: 6, borderRadius: 3, backgroundColor: GP.mint }} />
              </View>
            </View>
          ) : null}

          {/* The Relic lands after the XP has counted: its own moment (RelicDropCard flips in, rarity glow) */}
          {drop?.relic && dropShown ? <RelicDropExtra extra={drop} /> : null}

          {again && onAgain ? <GameButton title={again} color={GP.sun} onPress={onAgain} style={styles.back} /> : null}
          <GameButton title={backLabel(o)} color={again && onAgain ? GP.skyDeep : GP.sun} onPress={onDone} style={styles.back} />
        </Animated.View>
      </ScrollView>
      {levelUp && after ? (
        <Animated.View entering={POP_FADE} style={StyleSheet.absoluteFill}>
          <LevelUp level={after.level} rank={after.rank} rankUp={!!before && after.rank !== before.rank} onDone={() => setLevelUp(false)} />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/** One pay line, sliding in from the left when its turn comes (90 ms apart). */
function PayLine({ label, xp, fp, shown }: { label: string; xp: number; fp: number; shown: boolean }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const t = useSharedValue(shown ? 1 : 0);
  useEffect(() => {
    if (shown) t.value = withTiming(1, { duration: 240, easing: SHEET_EASE_OUT });
  }, [shown, t]);
  const style = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ translateX: (1 - t.value) * -40 }] }));
  const amount = xp > 0 ? `+${xp} XP` : `+${fp}`;
  return (
    <Animated.View style={[styles.row, style]} accessible={shown} accessibilityLabel={`${label}, ${amount.replace("+", "plus ")}`}>
      <Ionicons name="star" size={14} color={GOLD_LO} />
      <Text style={styles.rowLabel} numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {label}
      </Text>
      <Text style={styles.rowValue} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {amount}
      </Text>
    </Animated.View>
  );
}

function raidMax(start: DuelStart): number | null {
  const top = (start as unknown as { raid?: { hp_max?: number | null } | null }).raid;
  const inner = (start.setup as { raid?: { hp_max?: number | null } | null }).raid;
  return top?.hp_max ?? inner?.hp_max ?? null;
}

function HpCard({ r, p1, p2 }: { r: DuelResultData; p1: DuelFighterPeek; p2: DuelFighterPeek }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.card}>
      {/* Says what the bars measure: "ada 0%" alone read as a score. */}
      <Text style={styles.cardTitle} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {HP_CARD_TITLE.toUpperCase()}
      </Text>
      <HpRow name={hpRowName(p1.name, true)} hp={r.p1_hp} max={p1.max_hp ?? Math.max(1, r.p1_hp)} faction={p1.faction} />
      <HpRow name={p2.name} hp={r.p2_hp} max={p2.max_hp ?? Math.max(1, r.p2_hp)} faction={p2.faction} />
      <Text style={styles.seconds} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {fightTimeText(r.ticks)}
      </Text>
    </View>
  );
}

function HpRow({ name, hp, max, faction }: { name: string; hp: number; max: number; faction?: string | null }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const { share, percent } = hpShare(hp, max);
  return (
    <View style={{ gap: 4 }} accessible accessibilityLabel={`${name}, ${percent} percent health left`}>
      <View style={styles.hpHead}>
        <Text style={styles.hpName} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {name}
        </Text>
        <Text style={styles.hpPct} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {hpPercentText(percent)}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={{ width: `${Math.min(1, share) * 100}%`, height: 10, borderRadius: 5, backgroundColor: realmColor(faction) }} />
      </View>
    </View>
  );
}

function RunPanel({ run }: { run: NonNullable<DuelOutcomeFull["run"]> }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const earned = run.earned ?? 0;
  const s = run.stake_result;
  const label = [`${earned} points`, run.speed_mult && run.speed_mult > 1.01 ? `Speed times ${run.speed_mult.toFixed(2)}` : null, run.surged ? "Surge times 1.5" : null, s ? (s.won ? `Stake won, plus ${s.stake}` : `Stake lost, minus ${s.stake}`) : null]
    .filter(Boolean)
    .join(". ");
  return (
    <View style={{ alignItems: "center", gap: 8 }} accessible accessibilityLabel={label}>
      <Text style={[styles.runPoints, { color: earned > 0 ? GP.mint : INK }]} maxFontSizeMultiplier={1.2}>{`+${earned}`}</Text>
      <Text style={styles.runUnit} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        POINTS
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {run.speed_mult && run.speed_mult > 1.01 ? <MiniChip text={`Speed ×${run.speed_mult.toFixed(2)}`} /> : null}
        {run.surged ? <MiniChip text="Surge ×1.5" /> : null}
      </View>
      {s ? (
        <Text style={[styles.stake, { color: s.won ? GOLD_LO : GP.berry }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {s.won ? `Stake won: +${s.stake}` : `Stake lost: −${s.stake}`}
        </Text>
      ) : null}
    </View>
  );
}

function MiniChip({ text }: { text: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <Text style={styles.miniChip} maxFontSizeMultiplier={MAX_FONT_SCALE}>
      {text}
    </Text>
  );
}

function RaidPanel({ raid, bossMax }: { raid: NonNullable<DuelOutcomeFull["raid"]>; bossMax: number | null }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const left = raid.hp_left ?? 0;
  const max = raid.hp_max ?? bossMax ?? Math.max(1, left);
  return (
    <View style={styles.raid} accessible accessibilityLabel={`You dealt ${raid.damage ?? 0} damage. Boss ${Math.max(0, left)} of ${max} health left.${raid.defeated ? " Boss defeated." : ""}`}>
      <Text style={styles.raidDamage} maxFontSizeMultiplier={MAX_FONT_SCALE}>{`You dealt ${raid.damage ?? 0} damage`}</Text>
      <RaidHPBar hp={left} maxHp={max} />
      {raid.defeated ? (
        <View style={styles.defeatedRow}>
          <Ionicons name="trophy" size={18} color={GP.sun} />
          <Text style={styles.defeatedText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            Boss defeated
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const STYLE_PAIR = themedStyles({
  content: { alignItems: "center", gap: 14, paddingHorizontal: 16 },
  hero: { alignItems: "center", justifyContent: "center", height: 130, width: "100%" },
  sun: { position: "absolute", width: 300, height: 300, alignItems: "center", justifyContent: "center", opacity: 0.55 },
  victory: {
    fontFamily: GF.display,
    fontSize: 56,
    lineHeight: 64,
    color: GOLD_LO,
    textShadowColor: INK,
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 0.1,
  },
  lossBand: { alignSelf: "stretch", marginHorizontal: -16, paddingVertical: 18, alignItems: "center", backgroundColor: BERRY },
  defeated: { fontFamily: GF.display, fontSize: 52, lineHeight: 60, color: SURFACE },
  checking: { fontFamily: GF.display, fontSize: 44, color: INK },
  subtitle: { fontFamily: GF.body, fontSize: 16, color: MUTED, textAlign: "center" },
  tip: { flexDirection: "row", alignItems: "center", gap: 8, maxWidth: 460, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: SURFACE },
  tipText: { flex: 1, fontFamily: GF.body, fontSize: 15, color: INK },
  chips: { flexDirection: "row", gap: 6, width: "100%", maxWidth: 480 },
  chip: { flex: 1, alignItems: "center", paddingHorizontal: 4, paddingVertical: 8, borderRadius: 14, backgroundColor: SURFACE, borderWidth: 1, borderColor: HAIRLINE },
  chipValue: { fontFamily: GF.display, fontSize: 20, color: INK, fontVariant: ["tabular-nums"] },
  chipLabel: { fontFamily: GF.body, fontSize: 10, letterSpacing: 0.4, color: MUTED },
  sheet: { width: "100%", maxWidth: 480, gap: 12, padding: 18, borderRadius: 28, backgroundColor: SURFACE, shadowColor: "#101828", shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  levelRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  level: { fontFamily: GF.display, fontSize: 22, color: INK },
  rank: { fontFamily: GF.body, fontSize: 14, color: MUTED },
  xp: { fontFamily: GF.display, fontSize: 26, color: GOLD_LO, fontVariant: ["tabular-nums"] },
  track: { height: 14, borderRadius: 7, backgroundColor: SURFACE_ALT, overflow: "hidden" },
  fill: { height: 14, minWidth: 10, borderRadius: 7, backgroundColor: GOLD_LO },
  trackThin: { height: 6, borderRadius: 3, backgroundColor: SURFACE_ALT, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowLabel: { flex: 1, fontFamily: GF.body, fontSize: 15, color: INK },
  rowValue: { fontFamily: GF.display, fontSize: 18, color: INK, fontVariant: ["tabular-nums"] },
  card: { width: "100%", gap: 10, padding: 14, borderRadius: 20, backgroundColor: SCREEN },
  cardTitle: { fontFamily: GF.display, fontSize: 12, letterSpacing: 1.2, color: MUTED },
  hpHead: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  hpName: { flex: 1, fontFamily: GF.display, fontSize: 15, color: INK },
  hpPct: { fontFamily: GF.display, fontSize: 15, color: INK },
  seconds: { alignSelf: "flex-end", fontFamily: GF.bold, fontSize: 12, color: MUTED },
  runPoints: { fontFamily: GF.display, fontSize: 46 },
  runUnit: { fontFamily: GF.bold, fontSize: 12, letterSpacing: 1.2, color: MUTED },
  miniChip: { fontFamily: GF.bold, fontSize: 13, color: INK, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, overflow: "hidden", backgroundColor: SURFACE_ALT },
  stake: { fontFamily: GF.display, fontSize: 18 },
  raid: { width: "100%", gap: 10, padding: 14, borderRadius: 20, backgroundColor: SCREEN },
  raidDamage: { fontFamily: GF.display, fontSize: 22, color: INK },
  defeatedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  defeatedText: { fontFamily: GF.display, fontSize: 18, color: GOLD_LO },
  back: { alignSelf: "stretch", width: "100%" },
});
