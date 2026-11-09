// The Quest Run's screens (costquest-ios Features/RunFeature.swift):
// QuestRunButton on the home, RunStartSheet (Daily or Pocket, then 3-2-1),
// RunHUD (the clock, the score, Radar and Surge) under the top bar, RunTray
// (the route, best value per metre first, or the Pocket board), RunChallenge
// (one point: quick, no shrine ceremony; a Forbidden Zone asks for a stake),
// RunResults with the day's Bounty Board. State: runModel.ts; words: run.ts.
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { runPlaysAsDuel } from "@/features/game/duelFlow";
import {
  boardPlaceText,
  cardLabel,
  cardSubline,
  clock,
  clockLabel,
  dailyBlock,
  dailySub,
  doneCount,
  endRunMessage,
  isPocket,
  isTrivia,
  isWorldBoard,
  orderPoints,
  pocketSub,
  resetTime,
  resultChips,
  resultHeadline,
  RUN_FORBIDDEN,
  RUN_GOLD,
  type RunAnswerResult,
  type RunBoard,
  type RunFinish,
  type RunPoint,
  runReveal,
  type RunState,
  sequenceLine,
  signed,
  stakeLine,
  stakeOf,
  stakeText,
  tierOfValue,
} from "@/features/game/run";
import { gameStore, useGame } from "@/features/game/runtime";
import type { QuestPoint, RoamAnswer, RoamAttempt } from "@/features/game/wire";
import { distanceText } from "@/features/game/geo";

import DuelScreen from "./DuelScreen";
import { BlitzCard, DeadlineBar, SequenceCard, TriviaCard } from "./Encounter";
import { announce, GameButton, MAX_FONT_SCALE, pressFeedback, withAlpha } from "./kit";
import { impact, notify } from "./prefs";
import { runModel, useRun } from "./runModel";
import { SheetHost } from "./Sheet";
import { SheetFrame } from "./SheetFrame";
import { GameBackdrop } from "./GameBackdrop";
import { playSound } from "./sound";
import { ACCENT, edgeColor, ELEVATION, labelOn, RADIUS, SURFACES, TEXT_ON_DARK, TEXT_ON_LIGHT, useLook } from "./look";
import { challengeName, GF, GP, realmColor, tierColor } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";
import { POP_FADE, POP_IN_COUNT, POP_IN_SOFT, usePopIn } from "./sheetMotion";
import { SPRING_PRESS } from "@/features/game/spring";

const L = SURFACES.light;
const D = SURFACES.dark;
/** Gold on paper: the run's gold darkened until it reads as text (AA). */
const GOLD_TEXT = TEXT_ON_LIGHT.warning;
const timeOfDay = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
/** 00:00 UTC on this phone's clock (RunLook.resetTime). */
const resetAt = () => resetTime(Date.now(), timeOfDay);

// ---------- the button on the home ----------

/** The headline button on the home screen. */
export function QuestRunButton({ onPress }: { onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const face = GP.sun;
  return (
    <Pressable onPressIn={pressFeedback} onPress={onPress} accessibilityRole="button" accessibilityLabel="Start a Quest Run">
      {({ pressed }) => (
        <View style={{ paddingBottom: 4 }}>
          {/* Flat Sun on its 4 px edge (the kit's chunky button), ink on Sun. */}
          <View style={[StyleSheet.absoluteFill, { top: 4, borderRadius: RADIUS.card, backgroundColor: edgeColor(face) }]} />
          <View style={[styles.runButton, { backgroundColor: face, transform: [{ translateY: pressed ? 3 : 0 }] }]}>
            <Ionicons name="flag" size={20} color={labelOn(face)} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.runButtonTitle, { color: labelOn(face) }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                Quest Run
              </Text>
              <Text style={[styles.runButtonSub, { color: labelOn(face) }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                15 minutes. Ten points. Your route.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={labelOn(face)} />
          </View>
        </View>
      )}
    </Pressable>
  );
}

// ---------- start ----------

/** Daily or Pocket, then the countdown. */
export function RunStartSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <SheetHost band={{ top: insets.top + 120, height: 90 }} scrimLabel="Close" onClose={onClose}>
      {(close) => <RunStartBody close={close} />}
    </SheetHost>
  );
}

function RunStartBody({ close }: { close: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();
  const s = useRun();
  // 3-2-1: each number grows in and stops dead (sheetMotion.ts); a fade under Reduce Motion.
  const countIn = usePopIn(POP_IN_COUNT);
  const fix = useGame((s) => s.fix);
  const [counting, setCounting] = useState<number | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    runModel.clearProblem();
    void runModel.loadAllowance();
    return () => {
      alive.current = false;
    };
  }, []);

  const block = dailyBlock(fix);
  const dailyOut = s.dailyLeft === 0;
  const pocketOut = s.pocketLeft === 0;

  const go = async (mode: "daily" | "pocket") => {
    if (!(await runModel.start(mode, mode === "daily" ? block : null))) return;
    for (const n of [3, 2, 1]) {
      if (!alive.current) return;
      setCounting(n);
      announce(String(n));
      playSound("tap");
      impact(Haptics.ImpactFeedbackStyle.Heavy);
      await new Promise((r) => setTimeout(r, 650));
    }
    setCounting(0);
    announce("Go!");
    await new Promise((r) => setTimeout(r, 450));
    close();
  };

  return (
    <SheetFrame top={insets.top + 120}>
      {counting !== null ? (
        <View style={styles.countdown}>
          <Animated.Text key={counting} entering={countIn} exiting={FadeOut} style={[styles.countText, counting === 0 && { color: ACCENT.mint.fill }]}>
            {counting === 0 ? "GO!" : counting}
          </Animated.Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.startBody, { paddingBottom: insets.bottom + 24 }]}>
          <Text style={styles.startTitle} accessibilityRole="header">
            Quest Run
          </Text>
          <Text style={styles.startLead} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            Ten Quest Points drop around you, each showing what it pays. Near ones are quick, far ones pay more. 15 minutes on the clock.
          </Text>
          <ModeButton
            title="Daily Run"
            icon="walk"
            sub={dailySub(block, s.dailyLeft)}
            color={GP.sun}
            disabled={dailyOut || block !== null || s.busy}
            onPress={() => void go("daily")}
          />
          <ModeButton title="Pocket Run" icon="cafe" sub={pocketSub(s.pocketLeft)} color={GP.skyDeep} disabled={pocketOut || s.busy} onPress={() => void go("pocket")} />
          {s.problem ? <Text style={styles.problem}>{s.problem}</Text> : null}
          <Text style={styles.reset}>Days reset at {resetAt()} your time.</Text>
        </ScrollView>
      )}
    </SheetFrame>
  );
}

function ModeButton({ title, icon, sub, color, disabled, onPress }: { title: string; icon: "walk" | "cafe"; sub: string; color: string; disabled: boolean; onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const face = disabled ? "#C9C1B2" : color;
  return (
    <Pressable onPressIn={() => !disabled && pressFeedback()} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}`} accessibilityState={{ disabled }}>
      {({ pressed }) => (
        <View style={{ paddingBottom: 4 }}>
          <View style={[StyleSheet.absoluteFill, { top: 4, borderRadius: RADIUS.card, backgroundColor: edgeColor(face) }]} />
          <View style={[styles.mode, { backgroundColor: face, transform: [{ translateY: pressed ? 3 : 0 }] }]}>
            <Ionicons name={icon} size={22} color={labelOn(face)} style={{ width: 30 }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.modeTitle, { color: labelOn(face) }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{title}</Text>
              <Text style={[styles.modeSub, { color: labelOn(face) }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {sub}
              </Text>
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}

// ---------- in a run ----------

/** The clock, the score and the two powers, under the top bar. */
export function RunHUD() {
  const styles = useThemedStyles(STYLE_PAIR);
  const s = useRun();
  const run = s.run;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  // The run's end, level-triggered, for as long as this run is on.
  const runId = run?.run_id ?? null;
  useEffect(() => {
    if (!runId) return;
    return runModel.watchEnd();
  }, [runId]);
  if (!run) return null;
  const left = s.localEnd !== null ? (s.localEnd - now) / 1000 : run.remaining_s;
  return (
    <View style={styles.hud}>
      <View style={styles.hudRow}>
        <View style={styles.hudStats}>
          <View style={styles.hudClock} accessible accessibilityRole="timer" accessibilityLabel={clockLabel(left)}>
            <Ionicons name="timer" size={18} color={left < 60 ? GP.berry : GP.ink} />
            <Text style={[styles.hudClockText, { color: left < 60 ? GP.berry : GP.ink }]} maxFontSizeMultiplier={1.2}>
              {left > 0 ? clock(left) : "Time!"}
            </Text>
          </View>
          <View style={styles.divider} />
          <Text style={styles.hudScore} accessibilityLabel={`Score ${run.score}`} maxFontSizeMultiplier={1.2}>
            {run.score}
          </Text>
          <Text style={styles.hudDone} accessibilityLabel={`${doneCount(run)} of ${run.points.length} points played`}>
            {doneCount(run)}/{run.points.length}
          </Text>
        </View>
        <View style={styles.hudPowers}>
          <Power icon="radio" label="Radar" left={run.powers.radar} lit={false} busy={s.busy} hint="Reveals the hidden bonus point" onPress={() => void runModel.use("radar")} />
          <Power
            icon="flash"
            label={run.surge_armed ? "Armed" : "Surge"}
            left={run.powers.surge}
            lit={run.surge_armed}
            busy={s.busy}
            hint="Your next answer counts one and a half times"
            onPress={() => void runModel.use("surge")}
          />
        </View>
      </View>
      {s.notice ? (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.notice} accessibilityLiveRegion="polite">
          <Ionicons name="warning" size={14} color={GP.berry} />
          <Text style={styles.noticeText}>{s.notice}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

function Power({ icon, label, left, lit, busy, hint, onPress }: { icon: "radio" | "flash"; label: string; left: number; lit: boolean; busy: boolean; hint: string; onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const off = left === 0 || busy;
  const tint = lit ? ACCENT.coin.label : left > 0 ? GP.ink : withAlpha(GP.mist, 0.6);
  return (
    <Pressable
      onPressIn={() => !off && pressFeedback()}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityValue={{ text: lit ? "armed" : left > 0 ? "1 left" : "used" }}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.power, { backgroundColor: lit ? RUN_GOLD : withAlpha(GP.ice, left > 0 ? 1 : 0.5), transform: [{ scale: pressed ? 0.95 : 1 }] }]}>
      <Ionicons name={icon} size={14} color={tint} />
      <Text style={[styles.powerText, { color: tint }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {label}
      </Text>
    </Pressable>
  );
}

/** The run's points as cards, best value per metre first, so the route decision is always in front of the player. */
export function RunTray({
  onPick,
  onEnd,
  distanceOf,
  inReach,
  fill = false,
}: {
  onPick: (p: RunPoint) => void;
  onEnd: () => void;
  distanceOf: (p: RunPoint) => number | null;
  inReach: (p: RunPoint) => boolean;
  /** The board takes the screen's height (the trivia screen), not a tray's over the map. */
  fill?: boolean;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const s = useRun();
  const run = s.run;
  if (!run) return null;
  const pocket = isPocket(run);
  const ordered = orderPoints(run.points, (p) => (pocket ? null : distanceOf(p)));
  const end = () =>
    // One stray tap used to end a daily run, and a daily run is one of three a day.
    Alert.alert("End this run now?", endRunMessage(run), [
      { text: "Keep running", style: "cancel" },
      { text: "End run", style: "destructive", onPress: onEnd },
    ]);
  const card = (p: RunPoint, width: number | null) => (
    <RunCardButton key={p.idx} point={p} distance={pocket ? null : distanceOf(p)} inReach={pocket || inReach(p)} pocket={pocket} width={width} onPress={() => onPick(p)} />
  );
  return (
    <View style={[{ gap: 8 }, fill && { flex: 1 }]}>
      <View style={styles.trayHead}>
        <Text style={styles.trayTitle}>{isTrivia(run) ? "TRIVIA RUN" : pocket ? "POCKET RUN" : "YOUR ROUTE"}</Text>
        <Pressable onPress={end} hitSlop={8} accessibilityRole="button">
          <Text style={styles.trayEnd}>End run</Text>
        </Pressable>
      </View>
      {pocket ? (
        // A Pocket Run is a board of ten tiles, not a route: no map, nothing to walk to.
        <View style={[styles.board, fill && { flex: 1, maxHeight: undefined }]}>
          <ScrollView contentContainerStyle={styles.boardGrid}>{ordered.map((p) => card(p, null))}</ScrollView>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trayRow}>
          {ordered.map((p) => card(p, 150))}
        </ScrollView>
      )}
    </View>
  );
}

const PRESS = SPRING_PRESS;

function RunCardButton({ point, distance, inReach, pocket, width, onPress }: { point: RunPoint; distance: number | null; inReach: boolean; pocket: boolean; width: number | null; onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const down = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.05 * down.get() }] }));
  const off = point.done || point.hidden;
  return (
    <Pressable
      disabled={off}
      onPressIn={() => {
        pressFeedback();
        down.set(withSpring(1, PRESS));
      }}
      onPressOut={() => down.set(withSpring(0, PRESS))}
      onPress={onPress}
      style={width === null ? styles.gridCell : undefined}
      accessibilityRole="button"
      accessibilityLabel={cardLabel(point, { inReach, pocket, distance, challengeName })}
      accessibilityState={{ disabled: off }}>
      <Animated.View style={style}>
        <RunCard point={point} distance={distance} inReach={inReach} width={width} />
      </Animated.View>
    </Pressable>
  );
}

function RunCard({ point, distance, inReach, width }: { point: RunPoint; distance: number | null; inReach: boolean; width: number | null }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const tint = point.forbidden ? RUN_FORBIDDEN : tierColor(tierOfValue(point.value));
  return (
    <View style={[{ paddingBottom: 4, opacity: point.done ? 0.6 : 1 }, width !== null ? { width } : null]} importantForAccessibility="no-hide-descendants">
      <View style={[styles.cardEdge, { backgroundColor: inReach && !point.done ? GP.mint : GP.slate }]} />
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Text style={[styles.cardValue, { color: point.done ? (point.earned < 0 ? GP.berry : GP.mint) : tint }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {point.done ? signed(point.earned) : point.value}
          </Text>
          {point.hidden ? (
            <Ionicons name="help-circle" size={18} color={GP.mist} />
          ) : !point.done ? (
            <Text style={[styles.cardWhere, { color: inReach ? GP.mint : GP.mist }]}>{inReach ? "HERE" : distanceText(distance)}</Text>
          ) : null}
        </View>
        <Text style={styles.cardName} numberOfLines={2}>
          {point.hidden ? "Hidden bonus" : point.name}
          {"\n"}
        </Text>
        <Text style={[styles.cardSub, { color: point.forbidden ? RUN_FORBIDDEN : withAlpha(GP.ink, 0.5) }]} numberOfLines={1}>
          {cardSubline(point, challengeName).toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

// ---------- one point ----------

type Phase = "stake" | "opening" | "playing" | "submitting" | "result" | { failed: string };

/** A run's challenge: quick, no shrine ceremony, because the clock is running. */
export function RunChallenge({ point, onDone }: { point: RunPoint; onDone: () => void }) {
  const me = useGame((s) => s.me);
  const s = useRun();
  const asDuel = runPlaysAsDuel(point.kind, me, isTrivia(s.run));
  const held = s.openedStakes[point.idx];
  // Re-entering a Forbidden Zone already open: the server holds its stake, so there is nothing to choose.
  const [stakeChosen, setStakeChosen] = useState<boolean | null>(held !== undefined ? held > 0 : point.forbidden ? null : false);
  if (stakeChosen === null) {
    return <StakeChoice point={point} duel={asDuel} score={s.run?.score ?? 0} onChoose={setStakeChosen} onClose={onDone} />;
  }
  if (asDuel && s.run) {
    const stand: QuestPoint = {
      id: `run:${point.idx}`,
      name: point.name,
      lat: point.lat ?? 0,
      lng: point.lng ?? 0,
      source: "run",
      place_kind: "",
      tier: tierOfValue(point.value),
      realm: point.realm ?? "",
      challenge: "duel",
    };
    return (
      <DuelScreen
        point={stand}
        mode="run"
        run={{ runId: s.run.run_id, idx: point.idx, stake: stakeChosen, name: point.name, value: point.value }}
        parked={false}
        onClose={onDone}
      />
    );
  }
  return <RunQuiz point={point} staked={stakeChosen} onDone={onDone} />;
}

function Stage({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      {/* The run's challenges on the game's paper (it was a navy void). */}
      <GameBackdrop tint={RUN_GOLD} />
      <View style={{ flex: 1, paddingTop: insets.top + 8, paddingHorizontal: 18, paddingBottom: insets.bottom }}>{children}</View>
    </View>
  );
}

function Header({ point, line, close, closeIcon }: { point: RunPoint; line: string; close: (() => void) | null; closeIcon: "close" | "checkmark" }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const look = useLook();
  return (
    <View style={styles.qHeader}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.qName} numberOfLines={2} accessibilityRole="header">
          {point.name}
        </Text>
        <Text style={styles.qLine}>{line}</Text>
      </View>
      {close ? (
        <Pressable onPress={close} style={styles.qClose} accessibilityRole="button" accessibilityLabel={closeIcon === "checkmark" ? "Back to the run" : "Leave"}>
          <Ionicons name={closeIcon} size={18} color={look.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

function StakeChoice({ point, duel, score, onChoose, onClose }: { point: RunPoint; duel: boolean; score: number; onChoose: (stake: boolean) => void; onClose: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const stake = stakeOf(score);
  return (
    <Stage>
      <Header point={point} line={`${challengeName(duel ? "duel" : (point.kind ?? "trivia"))} · ${point.value} points`} close={onClose} closeIcon="close" />
      <View style={styles.stake}>
        <Text style={styles.stakeTitle}>Forbidden Zone</Text>
        <Text style={styles.stakeText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {stakeText(stake, duel)}
        </Text>
        {stake > 0 ? <GameButton title={`Stake ${stake}`} color={RUN_FORBIDDEN} onPress={() => onChoose(true)} /> : null}
        <GameButton title="Play it safe" color={GP.skyDeep} onPress={() => onChoose(false)} />
      </View>
    </Stage>
  );
}

function RunQuiz({ point, staked: stakedAsked, onDone }: { point: RunPoint; staked: boolean; onDone: () => void }) {
  const tone = useLook().dark ? TEXT_ON_DARK : TEXT_ON_LIGHT;
  const styles = useThemedStyles(STYLE_PAIR);
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("opening");
  const [attempt, setAttempt] = useState<RoamAttempt | null>(null);
  const [result, setResult] = useState<RunAnswerResult | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [blitz, setBlitz] = useState<number[]>([]);
  const [showing, setShowing] = useState(0);
  const [staked, setStaked] = useState(stakedAsked);
  const phaseRef = useRef<Phase>("opening");
  const answers = useRef<{ picked: number | null; order: string[]; blitz: number[] }>({ picked: null, order: [], blitz: [] });
  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  useEffect(() => {
    let alive = true;
    runModel
      .open(point, stakedAsked)
      .then((o) => {
        if (!alive) return;
        const a = o.attempt;
        setStaked(o.stake > 0);
        setAttempt(a);
        setDeadline(Date.now() + (a.remaining_s ?? a.seconds) * 1000);
        const blank = Array.from({ length: a.challenge.questions?.length ?? 0 }, () => -1);
        setBlitz(blank);
        answers.current = { picked: null, order: [], blitz: blank };
        go("playing");
      })
      .catch((e: unknown) => alive && go({ failed: e instanceof Error ? e.message : "That point couldn't open." }));
    return () => {
      alive = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    if (phaseRef.current !== "playing" || !attempt) return;
    go("submitting");
    const a = answers.current;
    const out: RoamAnswer[] = attempt.kind === "sequence" ? a.order : attempt.kind === "blitz" ? a.blitz : [a.picked ?? -1];
    runModel
      .answer(attempt, out)
      .then((r) => {
        setResult(r);
        go("result");
        announce(`${resultHeadline(r)}. ${resultChips(r).join(", ")}`);
        if (r.earned > 0) {
          playSound("fanfare");
          notify(Haptics.NotificationFeedbackType.Success);
        } else {
          notify(Haptics.NotificationFeedbackType.Error);
        }
      })
      .catch((e: unknown) => go({ failed: e instanceof Error ? e.message : "Your answer didn't reach the server." }));
  };

  // The clock: submits whatever is chosen when it runs out; the server marks a late answer as lapsed.
  useEffect(() => {
    if (phase !== "playing" || !deadline) return;
    const t = setTimeout(submit, Math.max(0, deadline - Date.now()));
    return () => clearTimeout(t);
  }, [phase, deadline]); // eslint-disable-line react-hooks/exhaustive-deps

  const kind = attempt?.kind ?? point.kind ?? "trivia";
  const line = `${challengeName(kind)} · ${point.value} points${staked ? " · STAKED" : ""}`;
  const reveal = phase === "result" && result && attempt ? runReveal(attempt.kind, result, picked, blitz) : null;

  return (
    <Stage>
      <Header point={point} line={line} close={phase === "submitting" ? null : onDone} closeIcon={phase === "result" ? "checkmark" : "close"} />
      {phase === "opening" ? (
        <View style={styles.center}>
          <ActivityIndicator color={GP.mist} size="large" />
        </View>
      ) : typeof phase === "object" ? (
        <View style={[styles.center, { gap: 16 }]}>
          <Text style={styles.failed}>{phase.failed}</Text>
          <GameButton title="Back to the run" color={GP.sun} onPress={onDone} />
        </View>
      ) : attempt ? (
        <ScrollView contentContainerStyle={{ gap: 14, paddingTop: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {phase === "result" && result ? (
            <Animated.View entering={reduce ? POP_FADE : POP_IN_SOFT} style={{ gap: 6 }} accessible>
              <Text style={[styles.headline, { color: result.earned > 0 ? tone.success : undefined }]}>{resultHeadline(result)}</Text>
              <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
                {resultChips(result).map((c) => (
                  <Text key={c} style={styles.chip}>
                    {c}
                  </Text>
                ))}
              </View>
              {result.stake_result ? <Text style={[styles.stakeResult, { color: result.stake_result.won ? tone.warning : tone.danger }]}>{stakeLine(result.stake_result)}</Text> : null}
            </Animated.View>
          ) : (
            <DeadlineBar deadline={deadline} total={attempt.seconds} />
          )}
          {attempt.kind === "sequence" && phase === "result" ? (
            <Text style={[styles.sequenceLine, { color: (result?.reveal.positions_right ?? 0) === (attempt.challenge.beats?.length ?? 4) ? tone.success : undefined }]}>
              {sequenceLine(result?.reveal.positions_right ?? 0, attempt.challenge.beats?.length ?? 4)}
            </Text>
          ) : attempt.kind === "sequence" ? (
            <>
              <SequenceCard
                prompt={attempt.challenge.prompt ?? ""}
                beats={attempt.challenge.beats ?? []}
                order={order}
                reveal={null}
                onTap={(id) => {
                  if (phaseRef.current !== "playing") return;
                  pressFeedback();
                  const next = order.includes(id) ? order.slice(0, order.indexOf(id)) : [...order, id];
                  setOrder(next);
                  answers.current = { ...answers.current, order: next };
                }}
              />
              {phase === "playing" ? (
                <GameButton title="Lock it in" color={GP.mint} disabled={order.length < (attempt.challenge.beats?.length ?? 4)} onPress={submit} />
              ) : null}
            </>
          ) : attempt.kind === "blitz" ? (
            <BlitzCard
              questions={attempt.challenge.questions ?? []}
              showing={showing}
              answers={blitz}
              removed={{}}
              marks={reveal?.marks ?? null}
              correct={reveal?.correct ?? null}
              voice={phase === "playing"}
              onPick={(i) => {
                if (phaseRef.current !== "playing") return;
                const next = [...blitz];
                next[showing] = i;
                setBlitz(next);
                answers.current = { ...answers.current, blitz: next };
                if (showing + 1 < (attempt.challenge.questions?.length ?? 0)) setShowing(showing + 1);
                else submit();
              }}
            />
          ) : attempt.challenge.questions?.[0] ? (
            <>
              {attempt.kind === "quote" ? <Text style={styles.quoteKicker}>{(attempt.challenge.prompt ?? "Who said it?").toUpperCase()}</Text> : null}
              <TriviaCard
                question={attempt.kind === "quote" ? { ...attempt.challenge.questions[0], q: `“${attempt.challenge.questions[0].q}”` } : attempt.challenge.questions[0]}
                picked={picked}
                removed={[]}
                correct={reveal ? (reveal.correct[0] ?? -1) : null}
                voice={phase === "playing"}
                onPick={(i) => {
                  if (phaseRef.current !== "playing" || picked !== null) return;
                  setPicked(i);
                  answers.current = { ...answers.current, picked: i };
                  submit();
                }}
              />
            </>
          ) : null}
          {phase === "submitting" ? <ActivityIndicator color={GP.mist} /> : null}
          {phase === "result" ? <GameButton title="Next point" color={GP.sun} onPress={onDone} /> : null}
        </ScrollView>
      ) : null}
    </Stage>
  );
}

// ---------- the end ----------

/** The final score, what it paid, and where it put you on today's board. */
export function RunResults({ result, board, onClose }: { result: RunFinish; board: RunBoard | null; onClose: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const s = useRun();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const target = result.run.score;
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setShown(Math.round((target * i) / 30));
      if (i >= 30) {
        clearInterval(t);
        notify(Haptics.NotificationFeedbackType.Success);
      }
    }, 28);
    announce(`Run complete. ${target} points.`);
    return () => clearInterval(t);
  }, [result.run.score]);
  const run = result.run;
  const pocket = isPocket(run);
  const trivia = isTrivia(run);
  return (
    <Stage>
      <ScrollView contentContainerStyle={styles.results} showsVerticalScrollIndicator={false}>
        <Text style={styles.resultsKicker}>{trivia ? "TRIVIA RUN" : pocket ? "POCKET RUN" : "RUN COMPLETE"}</Text>
        <Text style={styles.resultsScore} accessibilityLabel={`${run.score} points`}>
          {shown}
        </Text>
        <Text style={styles.resultsDone}>
          {doneCount(run)} of {run.points.length} points
        </Text>
        {result.board_place != null ? (
          <Text style={styles.place}>{boardPlaceText(result.board_place, { approx: board?.you?.approx, world: (board ? isWorldBoard(board) : false) || run.region === "world" })}</Text>
        ) : null}
        <View style={styles.rewards}>
          <Stat n={result.reward.xp} label="XP" />
          {result.reward.faction_points > 0 ? <Stat n={result.reward.faction_points} label="Faction" /> : null}
        </View>
        {result.leveled_up ? <Text style={styles.levelUp}>Level {result.after.level}!</Text> : null}
        {trivia ? (
          <>
            {/* Post the score: the server makes a card (a page with a picture), the phone's share sheet posts it. */}
            <GameButton
              title={s.share ? "Share again" : "Share your score"}
              color={GP.sun}
              disabled={s.busy}
              icon={<Ionicons name="share-social" size={20} color={labelOn(GP.sun)} />}
              onPress={() => void runModel.share()}
              style={{ alignSelf: "stretch", marginTop: 6 }}
              testID="trivia-share"
            />
            {s.share ? (
              <Text style={styles.shareLink} selectable accessibilityLabel={`Your link: ${s.share.url}`}>
                {s.share.url}
              </Text>
            ) : null}
            {s.notice ? <Text style={styles.problem}>{s.notice}</Text> : null}
            {board ? <BountyBoard board={board} title="TODAY'S TOP PLAYERS" /> : null}
            <GameButton title="Done" color={GP.skyDeep} onPress={onClose} style={{ alignSelf: "stretch" }} />
          </>
        ) : (
          <>
            {!pocket && board ? <BountyBoard board={board} /> : null}
            <GameButton title="Done" color={GP.sun} onPress={onClose} style={{ alignSelf: "stretch", marginTop: 6 }} />
          </>
        )}
      </ScrollView>
    </Stage>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={{ alignItems: "center", gap: 2 }} accessible accessibilityLabel={`${n} ${label}`}>
      <Text style={styles.statN}>{n}</Text>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

/** Today's Bounty Board: the day's best runs in this city (or, for trivia, everyone's). */
export function BountyBoard({ board, title = "BOUNTY BOARD" }: { board: RunBoard; title?: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const global = board.region === "global";
  return (
    <View style={styles.bounty}>
      <Text style={styles.bountyTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.bountyFoot}>
        {global ? "Everyone plays this board. " : isWorldBoard(board) ? "Everyone outside a mapped city shares this board. " : ""}Resets at {resetAt()} your time.
      </Text>
      {board.entries.length === 0 ? <Text style={styles.bountyEmpty}>{global ? "No one on the board yet today. Be the first." : "No runs on the board yet today."}</Text> : null}
      {board.entries.slice(0, 10).map((e) => (
        <View key={e.place} style={styles.bountyRow} accessible accessibilityLabel={`${e.place}. ${e.handle}${e.you ? ", you" : ""}, ${e.score}`}>
          <Text style={[styles.bountyPlace, { color: e.place <= 3 ? GOLD_TEXT : GP.mist }]}>{e.place}</Text>
          {global && !e.faction ? null : <View style={[styles.dot, { backgroundColor: realmColor(e.faction) }]} />}
          <Text style={[styles.bountyHandle, e.you && { fontFamily: GF.display }]} numberOfLines={1}>
            {e.you ? `${e.handle} (you)` : e.handle}
          </Text>
          <Text style={styles.bountyScore}>{e.score}</Text>
        </View>
      ))}
      {/* The faction war is a city's; the global trivia board is people, not sides. */}
      {board.factions.length && !global ? (
        <>
          <View style={styles.rule} />
          <View style={{ flexDirection: "row", gap: 12 }}>
            {board.factions.slice(0, 5).map((f) => (
              <View key={f.faction} style={{ flex: 1, alignItems: "center", gap: 2 }} accessible accessibilityLabel={`${f.name} ${f.total}`}>
                <View style={[styles.dot, { width: 12, height: 12, backgroundColor: realmColor(f.faction) }]} />
                <Text style={styles.factionTotal}>{f.total}</Text>
                <Text style={styles.factionName} numberOfLines={1}>
                  {f.name}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

/** The map and the tray read a run point's distance and reach through the game's own fix. */
export function runDistance(p: RunPoint): number | null {
  if (p.lat == null || p.lng == null) return null;
  return gameStore.distanceTo({ lat: p.lat, lng: p.lng });
}

export function runInReach(p: RunPoint): boolean {
  const d = runDistance(p);
  return d !== null && d <= gameStore.reach();
}

export type { RunState };

const HALO = { textShadowColor: L.surface, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3 } as const;

const STYLE_PAIR = themedStyles(
  {
    runButton: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, paddingVertical: 12, borderRadius: RADIUS.card, overflow: "hidden" },
    runButtonTitle: { fontFamily: GF.display, fontSize: 20, lineHeight: 24 },
    runButtonSub: { fontFamily: GF.body, fontSize: 13, lineHeight: 17 },
    countdown: { flex: 1, alignItems: "center", justifyContent: "center" },
    countText: { fontFamily: GF.display, fontSize: 120, lineHeight: 132, color: L.text },
    startBody: { padding: 22, gap: 16 },
    startTitle: { fontFamily: GF.display, fontSize: 28, lineHeight: 32, color: L.text },
    startLead: { fontFamily: GF.regular, fontSize: 15, lineHeight: 21, color: L.textMuted },
    mode: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderRadius: RADIUS.card, overflow: "hidden" },
    modeTitle: { fontFamily: GF.display, fontSize: 20, lineHeight: 24 },
    modeSub: { fontFamily: GF.body, fontSize: 13, lineHeight: 17 },
    problem: { fontFamily: GF.body, fontSize: 14, lineHeight: 19, color: TEXT_ON_LIGHT.danger },
    reset: { fontFamily: GF.regular, fontSize: 12, lineHeight: 16, color: L.textMuted },
    hud: { gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADIUS.button, backgroundColor: L.surface, borderWidth: 1, borderColor: L.hairline, ...ELEVATION.float },
    hudRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
    hudStats: { flexDirection: "row", alignItems: "center", gap: 10 },
    hudClock: { flexDirection: "row", alignItems: "center", gap: 4 },
    hudClockText: { fontFamily: GF.display, fontSize: 20, lineHeight: 24, fontVariant: ["tabular-nums"] },
    divider: { width: 1, height: 22, backgroundColor: L.hairline },
    hudScore: { fontFamily: GF.display, fontSize: 22, lineHeight: 26, color: L.text, fontVariant: ["tabular-nums"] },
    hudDone: { fontFamily: GF.regular, fontSize: 12, lineHeight: 16, color: L.textMuted },
    hudPowers: { flexDirection: "row", gap: 8 },
    power: { minWidth: 54, minHeight: 40, paddingHorizontal: 6, borderRadius: RADIUS.chip, alignItems: "center", justifyContent: "center", gap: 1 },
    powerText: { fontFamily: GF.bold, fontSize: 12, lineHeight: 15 },
    notice: { flexDirection: "row", alignItems: "center", gap: 6 },
    noticeText: { flex: 1, fontFamily: GF.body, fontSize: 13, lineHeight: 17, color: TEXT_ON_LIGHT.danger },
    trayHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18 },
    trayTitle: { fontFamily: GF.bold, fontSize: 13, lineHeight: 17, letterSpacing: 1, color: L.text, ...HALO },
    trayEnd: { fontFamily: GF.bold, fontSize: 13, lineHeight: 17, color: L.text, ...HALO },
    trayRow: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, gap: 12 },
    board: { maxHeight: 460, marginHorizontal: 8, borderRadius: RADIUS.card, backgroundColor: L.surfaceAlt, borderWidth: 1, borderColor: L.hairline },
    boardGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 },
    gridCell: { width: "48%" },
    cardEdge: { position: "absolute", left: 0, right: 0, top: 4, bottom: 0, borderRadius: RADIUS.button },
    card: { gap: 8, padding: 12, borderRadius: RADIUS.button, backgroundColor: L.surface, ...ELEVATION.low },
    cardTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 4 },
    cardValue: { flexShrink: 1, fontFamily: GF.display, fontSize: 26, lineHeight: 30, fontVariant: ["tabular-nums"] },
    cardWhere: { fontFamily: GF.display, fontSize: 13, lineHeight: 17, fontVariant: ["tabular-nums"] },
    cardName: { fontFamily: GF.bold, fontSize: 15, lineHeight: 19, color: L.text },
    cardSub: { fontFamily: GF.body, fontSize: 12, lineHeight: 15, letterSpacing: 0.3 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    qHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    qName: { fontFamily: GF.display, fontSize: 24, lineHeight: 28, color: L.text },
    qLine: { fontFamily: GF.body, fontSize: 13, lineHeight: 17, color: L.textMuted },
    qClose: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: L.surfaceAlt },
    stake: { flex: 1, justifyContent: "center", gap: 14 },
    stakeTitle: { fontFamily: GF.display, fontSize: 34, lineHeight: 38, color: L.text },
    stakeText: { fontFamily: GF.body, fontSize: 17, lineHeight: 23, color: L.textMuted },
    failed: { fontFamily: GF.display, fontSize: 22, lineHeight: 26, color: L.text, textAlign: "center" },
    headline: { fontFamily: GF.display, fontSize: 44, lineHeight: 48, color: L.text, fontVariant: ["tabular-nums"] },
    chip: { fontFamily: GF.bold, fontSize: 13, lineHeight: 17, color: L.text, paddingHorizontal: 9, paddingVertical: 4, borderRadius: RADIUS.chip, overflow: "hidden", backgroundColor: L.surfaceAlt },
    stakeResult: { fontFamily: GF.display, fontSize: 20, lineHeight: 24 },
    sequenceLine: { fontFamily: GF.display, fontSize: 22, lineHeight: 26, color: L.text },
    quoteKicker: { fontFamily: GF.bold, fontSize: 13, lineHeight: 17, letterSpacing: 1, color: GOLD_TEXT },
    results: { alignItems: "center", gap: 18, paddingBottom: 40 },
    resultsKicker: { paddingTop: 30, fontFamily: GF.bold, fontSize: 15, lineHeight: 19, letterSpacing: 1.2, color: L.textMuted },
    resultsScore: { fontFamily: GF.display, fontSize: 84, lineHeight: 90, color: L.text, fontVariant: ["tabular-nums"] },
    resultsDone: { fontFamily: GF.body, fontSize: 15, lineHeight: 20, color: L.textMuted },
    place: { fontFamily: GF.display, fontSize: 22, lineHeight: 26, color: GOLD_TEXT },
    rewards: { flexDirection: "row", gap: 18, paddingVertical: 12, paddingHorizontal: 20, borderRadius: RADIUS.card, backgroundColor: L.surface, ...ELEVATION.low },
    statN: { fontFamily: GF.display, fontSize: 24, lineHeight: 28, color: L.text, fontVariant: ["tabular-nums"] },
    statLabel: { fontFamily: GF.body, fontSize: 12, lineHeight: 16, color: L.textMuted },
    levelUp: { fontFamily: GF.display, fontSize: 28, lineHeight: 32, color: GOLD_TEXT },
    shareLink: { fontFamily: GF.body, fontSize: 13, lineHeight: 17, color: L.textMuted, textAlign: "center" },
    bounty: { alignSelf: "stretch", gap: 10, padding: 16, borderRadius: RADIUS.card, backgroundColor: L.surface, ...ELEVATION.low },
    bountyTitle: { fontFamily: GF.bold, fontSize: 15, lineHeight: 19, letterSpacing: 1, color: L.text },
    bountyFoot: { fontFamily: GF.regular, fontSize: 12, lineHeight: 16, color: L.textMuted },
    bountyEmpty: { fontFamily: GF.regular, fontSize: 14, lineHeight: 19, color: L.textMuted },
    bountyRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    bountyPlace: { width: 26, fontFamily: GF.display, fontSize: 16, lineHeight: 20, fontVariant: ["tabular-nums"] },
    dot: { width: 10, height: 10, borderRadius: 6 },
    bountyHandle: { flex: 1, fontFamily: GF.body, fontSize: 15, lineHeight: 20, color: L.text },
    bountyScore: { fontFamily: GF.display, fontSize: 16, lineHeight: 20, color: L.text, fontVariant: ["tabular-nums"] },
    rule: { height: 1, backgroundColor: L.hairline },
    factionTotal: { fontFamily: GF.display, fontSize: 13, lineHeight: 17, color: L.text },
    factionName: { fontFamily: GF.bold, fontSize: 12, lineHeight: 15, color: L.text },
  },
  {
    countText: { color: D.text },
    startTitle: { color: D.text },
    startLead: { color: D.textMuted },
    problem: { color: TEXT_ON_DARK.danger },
    reset: { color: D.textMuted },
    hud: { backgroundColor: D.surface, borderColor: D.hairline, shadowOpacity: 0, elevation: 0, boxShadow: "none" },
    divider: { backgroundColor: D.hairline },
    hudScore: { color: D.text },
    hudDone: { color: D.textMuted },
    noticeText: { color: TEXT_ON_DARK.danger },
    trayTitle: { color: D.text, textShadowColor: D.screen },
    trayEnd: { color: D.text, textShadowColor: D.screen },
    board: { backgroundColor: D.surfaceAlt, borderColor: D.hairline },
    card: { backgroundColor: D.surface, borderWidth: 1, borderColor: D.hairline, shadowOpacity: 0, elevation: 0, boxShadow: "none" },
    cardName: { color: D.text },
    qName: { color: D.text },
    qLine: { color: D.textMuted },
    qClose: { backgroundColor: D.surfaceAlt },
    stakeTitle: { color: D.text },
    stakeText: { color: D.textMuted },
    failed: { color: D.text },
    headline: { color: D.text },
    chip: { color: D.text, backgroundColor: D.surfaceAlt },
    sequenceLine: { color: D.text },
    quoteKicker: { color: TEXT_ON_DARK.warning },
    resultsKicker: { color: D.textMuted },
    resultsScore: { color: D.text },
    resultsDone: { color: D.textMuted },
    place: { color: TEXT_ON_DARK.warning },
    rewards: { backgroundColor: D.surface, shadowOpacity: 0, elevation: 0, boxShadow: "none" },
    statN: { color: D.text },
    statLabel: { color: D.textMuted },
    levelUp: { color: TEXT_ON_DARK.warning },
    shareLink: { color: D.textMuted },
    bounty: { backgroundColor: D.surface, shadowOpacity: 0, elevation: 0, boxShadow: "none" },
    bountyTitle: { color: D.text },
    bountyFoot: { color: D.textMuted },
    bountyEmpty: { color: D.textMuted },
    bountyHandle: { color: D.text },
    bountyScore: { color: D.text },
    rule: { backgroundColor: D.hairline },
    factionTotal: { color: D.text },
    factionName: { color: D.text },
  },
);
