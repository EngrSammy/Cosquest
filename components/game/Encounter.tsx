// A quiz point, played: trivia, an emoji rebus, a sequence or a blitz,
// against the server's deadline (not a local timer, so a slow network or a
// backgrounded app cannot buy time). The answers go to the server, which
// marks them; the reveal shows its key. costquest-ios Roam/EncounterView.swift
// and Roam/ChallengeViews.swift.
//
// Beats: the shrine's crystal stands in front of you; you answer and the
// Strike runs (three rising pulses, sound and haptics, while the server marks
// it); the crystal breaks and the answers are shown; then the reward counts up
// (Reward.tsx). First the approach: the shrine rises (or is placed on the
// floor through the camera) and the challenge opens when you tap it. On iOS
// the shrine is the native game's own (ShrineIsland.swift: RealityKit, or
// ARKit when AR is on), with a photo of the moment after an AR reveal;
// elsewhere, or with the island "arShrine" off, it is the 2D crystal.
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { type ReactNode, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  ReduceMotion,
  SlideInRight,
  SlideOutLeft,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { resolveIslandsOff } from "@/features/game/config";
import { challengeBlurb } from "@/features/game/guide";
import { gameStore } from "@/features/game/runtime";
import {
  challengeLabel,
  choiceLook,
  choiceState,
  type ChoiceState,
  deadlineView,
  gradeColorKey,
  hintDisabled,
  isWin,
  resultTitle,
  scrimOpacity,
  secondChanceLabel,
  tierName,
} from "@/features/game/strike";
import { arriveMoment, hintMoment, lateMoment, levelMoment, reactionMoment, siteArriveMoment } from "@/features/game/warden";
import { siteArriveLine, siteIdOf } from "@/features/game/wardenSite";
import type { AttemptQuestion, QuestPoint, RoamAnswer, RoamAttempt, RoamVerdict } from "@/features/game/wire";
import { parseServerDate } from "@/features/game/wire";

import { announce, Chip, GameButton, GameCoin, GameIconButton, GamePanel, GameTitle, MAX_FONT_SCALE, pressFeedback } from "./kit";
import { Pop } from "./Pop";
import { type RewardSummary, celebrate, rewardFromVerdict } from "./Reward";
import SayItButton from "./SayItButton";
import { ShrineCrystal, type CrystalHandle } from "./ShrineCrystal";
import { ForgePointScene, usePointForge } from "./ForgeWorld";
import { playSound } from "./sound";
import { playResolve, startStrike } from "./strike";
import { ACCENT, BUTTON, edgeColor, ELEVATION, labelOn, RADIUS, SURFACES, TEXT_ON_DARK, TEXT_ON_LIGHT, useLook, useMapLook } from "./look";
import { CHOICE_COLORS, GF, realmColor, tierColor } from "./theme";
import { useWardenSaid, wardenVoice } from "./wardenVoice";
import { siteFacts } from "./wardenSites";
import { CostQuestShrineView, type CostQuestShrineViewHandle, shrineARSupported } from "@/modules/costquest-game/src";

import { AR_SHRINE_DEV, setShrineAR, useShrineAR } from "./prefs";
import { useRenderCount } from "@/utils/perfMarks";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";
import { SHEET_EASE_OUT, SHEET_OPEN_MS } from "./sheetMotion";
import { settle } from "@/features/game/spring";

type Phase = "approach" | "opening" | "playing" | "submitting" | "reveal" | { failed: string };

/** The native shrine stage on iOS, unless this build turned the island off (EXPO_PUBLIC_GAME_2D). */
const NativeShrine = CostQuestShrineView && !resolveIslandsOff(process.env.EXPO_PUBLIC_GAME_2D).has("arShrine") ? CostQuestShrineView : null;

/** Second chance and the hint buttons are this purple in Swift (Color(0.55, 0.36, 0.95)). */
/** A second chance: the Sky accent (one accent family, no stray purple). */
const PURPLE = ACCENT.sky.fill;
const GREY = "#B3B9C0";

/**
 * Android's hardware Back, for GameRoot to ask first: while the clock runs it
 * shows the leave confirmation and returns true (handled); otherwise it leaves
 * and returns true as well. Null when no encounter is open.
 */
export const encounterGuard: { current: (() => boolean) | null } = { current: null };

export default function Encounter({
  point,
  onReward,
  onClose,
}: {
  point: QuestPoint;
  onReward: (reward: RewardSummary) => void;
  onClose: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  useRenderCount("Encounter");
  const insets = useSafeAreaInsets();
  const [phase, setPhaseState] = useState<Phase>("approach");
  const phaseRef = useRef<Phase>("approach");
  /** The shrine is standing: "Tap the shrine". */
  const [placed, setPlaced] = useState(false);
  /** It stands in the player's street (the camera was used): a photo can be taken. */
  const [inRoom, setInRoom] = useState(false);
  const arPref = useShrineAR();
  const useAR = arPref && shrineARSupported;
  const nativeShrine = useRef<CostQuestShrineViewHandle | null>(null);
  const [attempt, setAttempt] = useState<RoamAttempt | null>(null);
  const [verdict, setVerdict] = useState<RoamVerdict | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [blitz, setBlitz] = useState<number[]>([]);
  const [showing, setShowing] = useState(0);
  const [removed, setRemoved] = useState<Record<number, number[]>>({});
  const [deadline, setDeadline] = useState<number>(0);
  const [boughtTime, setBoughtTime] = useState(false);
  const [hintProblem, setHintProblem] = useState<string | null>(null);
  const [hinting, setHinting] = useState(false);
  const [bag, setBag] = useState<Record<string, number>>({});
  const mounted = useRef(true);
  const crystal2d = useRef<CrystalHandle>(null);
  // A point with a Forge station (or environment) shows it instead of the built-in shrine (cq 056).
  const forgeScene = usePointForge(point);
  const hasForge = !!(forgeScene.station || forgeScene.environment);
  // A test build (AR_SHRINE_DEV) may still put the shrine through the camera at a Forge point, so
  // the AR island can be tried anywhere; with AR off there it keeps the Forge scene.
  const Native = hasForge && !(AR_SHRINE_DEV && useAR) ? null : NativeShrine;
  const arSwitch = !!NativeShrine && shrineARSupported && (!!Native || AR_SHRINE_DEV);
  // One handle for the Strike, whichever shrine is drawn (looked up when called).
  const [crystal] = useState<{ current: CrystalHandle }>(() => ({
    current: {
      pulse: (i) => (NativeShrine ? void nativeShrine.current?.pulse(i).catch(() => {}) : crystal2d.current?.pulse(i)),
      resolve: (win) => (NativeShrine ? void nativeShrine.current?.resolve(win).catch(() => {}) : crystal2d.current?.resolve(win)),
      reset: () => (NativeShrine ? void nativeShrine.current?.reset().catch(() => {}) : crystal2d.current?.reset()),
    },
  }));
  const said = useWardenSaid();
  const coins = useSyncExternalStore(gameStore.subscribe, () => gameStore.get().me?.coins ?? 0);
  const prices = useSyncExternalStore(gameStore.subscribe, () => gameStore.get().config?.hints ?? null);
  // What the player has answered so far, for the clock's own submit.
  const answersRef = useRef<{ picked: number | null; order: string[]; blitz: number[] }>({ picked: null, order: [], blitz: [] });

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);
  const ctx = () => ({ me: gameStore.get().me, playerName: gameStore.playerName() });
  // The scene behind the shrine is the world's own sky (Golden by day, Dusk after), not a realm colour:
  // realm colours stay on chips (art direction 2.7).
  const map = useMapLook();
  const look = useLook();
  const color = map.skyUpper;

  const refreshBag = useCallback(() => {
    gameStore.client
      .bag()
      .then((b) => {
        if (mounted.current) setBag(b.bag);
      })
      .catch(() => {});
  }, []);

  /** The clock sent the answer with nothing given (the verdict then reads "Time's up!"). */
  const timedOut = useRef(false);
  const startWith = useCallback(
    (a: RoamAttempt) => {
      timedOut.current = false;
      answersRef.current = { picked: null, order: [], blitz: Array(a.challenge.questions?.length ?? 0).fill(-1) };
      setAttempt(a);
      setVerdict(null);
      setPicked(null);
      setOrder([]);
      setBlitz(Array(a.challenge.questions?.length ?? 0).fill(-1));
      setShowing(0);
      setRemoved({});
      setBoughtTime(false);
      setDeadline(Date.now() + 1000 * (a.remaining_s ?? a.seconds));
      setPhase("playing");
    },
    [setPhase],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Arriving: the bag for the hints, and the Warden's welcome once the shrine stands.
  useEffect(() => {
    refreshBag();
    // Once per point.
  }, [point.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPlaced = useCallback(
    (ar: boolean) => {
      setPlaced(true);
      setInRoom(ar);
      if (phaseRef.current !== "approach") return;
      // At a Game Warden site, the site's own line (written from its checked facts).
      if (siteIdOf(point)) {
        void siteFacts(point).then((f) => {
          const line = siteArriveLine(f);
          if (phaseRef.current === "approach") wardenVoice.speak(line ? siteArriveMoment(ctx(), point, line) : arriveMoment(ctx(), point), 1500).catch(() => {});
        });
      } else wardenVoice.speak(arriveMoment(ctx(), point), 1500).catch(() => {});
    },
    [point],
  );

  // The 2D crystal rises in place, then stands (SimulatedStage: 500 ms).
  useEffect(() => {
    if (Native) return;
    const t = setTimeout(() => onPlaced(false), 500);
    return () => clearTimeout(t);
  }, [onPlaced, Native]);

  // Tapping the shrine opens the point: the server judges reach and hands out the challenge.
  const begin = useCallback(() => {
    if (phaseRef.current !== "approach") return;
    setPhase("opening");
    playSound("whoosh");
    gameStore
      .open(point)
      .then((a) => {
        if (!mounted.current) return;
        startWith(a);
        // Both reactions, written while the question is read (blitz waits for its score).
        if (a.kind !== "blitz") {
          wardenVoice.prepare(reactionMoment(ctx(), true, point, a.kind));
          wardenVoice.prepare(reactionMoment(ctx(), false, point, a.kind));
        }
      })
      .catch((error: Error) => {
        if (mounted.current) setPhase({ failed: error.message });
      });
  }, [point, setPhase, startWith]);

  /** EncounterView's AR/3D switch: the stage is built again, and placed again. */
  const switchStage = () => {
    setPlaced(false);
    setInRoom(false);
    setShrineAR(!arPref);
  };

  /** The moment, as a photo: the shrine and the Warden standing in the player's own street. */
  const photo = async () => {
    const uri = await nativeShrine.current?.photo().catch(() => null);
    if (uri) Share.share({ url: uri, message: `CosQuest at ${point.name}` }).catch(() => {});
  };

  const submit = useCallback(async () => {
    if (!attempt || phaseRef.current !== "playing") return;
    setPhase("submitting");
    const { picked: pk, order: od, blitz: bz } = answersRef.current;
    const answers: RoamAnswer[] = attempt.kind === "sequence" ? od : attempt.kind === "blitz" ? bz : [pk ?? -1];
    // The Strike: three rising pulses start the moment the answer is given and
    // run while the server marks it, so the wait is the suspense.
    const strike = startStrike({ pulse: (i) => crystal.current?.pulse(i) });
    try {
      const v = await gameStore.submit(attempt, answers);
      await strike.done;
      if (!mounted.current) return;
      const win = isWin(v);
      crystal.current?.resolve(win);
      playResolve(win);
      setVerdict(v);
      setPhase("reveal");
      const line = resultTitle(v, timedOut.current);
      announce(v.grade ? `${line.text} ${v.grade}.` : line.text);
      if (v.can_retry) refreshBag();
      if (v.leveled_up) wardenVoice.prepare(levelMoment(ctx(), v.after, v.rank_up));
      const m = v.late || (timedOut.current && !win) ? lateMoment(ctx(), point) : reactionMoment(ctx(), win, point, attempt.kind, attempt.kind === "blitz" ? v : null);
      wardenVoice.speak(m, 5000).catch(() => {});
    } catch (error) {
      // The answer is safe to send again; say so rather than dropping the player's work.
      strike.cancel();
      if (mounted.current) setPhase({ failed: `Couldn't send your answer: ${(error as Error).message}. Open the point again to retry.` });
    }
  }, [attempt, point, setPhase, refreshBag, crystal]);

  // The server's clock: when it runs out, send whatever was answered.
  useEffect(() => {
    if (phase !== "playing" || !deadline) return;
    const timer = setTimeout(() => {
      const a = answersRef.current;
      timedOut.current = a.picked === null && a.order.length === 0 && a.blitz.every((x) => x < 0);
      submit();
    }, Math.max(0, deadline - Date.now()));
    return () => clearTimeout(timer);
  }, [phase, deadline, submit]);

  const question = attempt?.kind === "blitz" ? showing : 0;

  const buy = async (kind: "fifty" | "time") => {
    if (!attempt) return;
    setHinting(true);
    setHintProblem(null);
    try {
      const h = await gameStore.hint(attempt, kind, question);
      playSound("coin");
      if (h.bag) setBag(h.bag);
      wardenVoice.speak(hintMoment(ctx(), kind), 3000).catch(() => {});
      if (h.removed) setRemoved((r) => ({ ...r, [question]: h.removed ?? [] }));
      if (kind === "time") {
        setBoughtTime(true);
        const until = h.remaining_s != null ? Date.now() + h.remaining_s * 1000 : parseServerDate(h.deadline);
        if (until) setDeadline(until);
      }
    } catch (error) {
      setHintProblem((error as Error).message);
    } finally {
      setHinting(false);
    }
  };

  const retry = async () => {
    if (!attempt) return;
    const here = gameStore.get().fix;
    if (!here) return;
    try {
      const next = await gameStore.client.retry(attempt.attempt_id, here.lat, here.lng, here.accuracy);
      setBag((b) => ({ ...b, retry: (b.retry ?? 1) - 1 }));
      crystal.current?.reset();
      startWith(next);
    } catch (error) {
      setHintProblem((error as Error).message);
    }
  };

  const collect = () => {
    if (!verdict) return;
    const reward = rewardFromVerdict(verdict, point, gameStore.get().me);
    // The level line is the Warden's, said 2.4 s into the ceremony.
    if (verdict.leveled_up) reward.speakLevel = () => wardenVoice.speak(levelMoment(ctx(), verdict.after, verdict.rank_up), 5000).catch(() => {});
    onReward(reward);
  };

  const leave = () => {
    if (phaseRef.current === "playing") {
      // react-native-web's Alert.alert does nothing: on the web the browser's own confirm asks instead.
      if (Platform.OS === "web") {
        if (globalThis.confirm?.("Leave this challenge? The clock keeps running. You can come back while it does.") ?? true) {
          wardenVoice.quiet();
          onClose();
        }
        return;
      }
      Alert.alert("Leave this challenge?", "The clock keeps running. You can come back while it does.", [
        {
          text: "Leave",
          style: "destructive",
          onPress: () => {
            wardenVoice.quiet();
            onClose();
          },
        },
        { text: "Keep playing", style: "cancel" },
      ]);
      return;
    }
    // On the reveal the answer is already in: leaving still counts the day's quests.
    if (verdict) celebrate(rewardFromVerdict(verdict, point, gameStore.get().me));
    wardenVoice.quiet();
    onClose();
  };
  const leaveRef = useRef(leave);
  useEffect(() => {
    leaveRef.current = leave;
  });
  useEffect(() => {
    encounterGuard.current = () => {
      leaveRef.current();
      return true;
    };
    return () => {
      encounterGuard.current = null;
    };
  }, []);

  const total = (attempt?.seconds ?? 20) + (boughtTime ? prices?.time_s ?? 10 : 0);
  const reveal = phase === "reveal" ? verdict?.reveal ?? null : null;
  const phaseName = typeof phase === "object" ? "failed" : phase;
  const actions = !!attempt && (phase === "reveal" || (phase === "playing" && attempt.kind === "sequence"));

  // The scrim under the question: lighter while the shrine is shown, darker once you play.
  const scrim = useSharedValue(scrimOpacity("opening") / 0.7);
  useEffect(() => {
    scrim.value = withTiming(scrimOpacity(phaseName) / 0.7, { duration: 300, easing: Easing.inOut(Easing.cubic) });
  }, [phaseName, scrim]);
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));

  return (
    <View style={[styles.root, { backgroundColor: color }]}>
      {/* EncounterView.statusBarHidden() */}
      <StatusBar hidden animated />
      {Native ? (
        <Native
          ref={nativeShrine}
          style={StyleSheet.absoluteFill}
          tint={tierColor(point.tier)}
          wardenTint={ACCENT.sky.fill}
          useAR={useAR}
          onPlaced={(e) => onPlaced(e.nativeEvent.ar)}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : (
        <LinearGradient colors={[map.skyUpper, map.skyHorizon, map.land]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      )}
      <Animated.View style={[StyleSheet.absoluteFill, scrimStyle]} pointerEvents="none">
        <LinearGradient colors={["rgba(18,26,38,0)", "rgba(18,26,38,0.45)"]} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <GameIconButton icon="close" diameter={42} onPress={leave} accessibilityLabel={`Leave ${point.name}`} />
        {phase === "approach" && arSwitch ? (
          <GameIconButton
            icon={arPref ? "cube" : "camera"}
            color={ACCENT.sky.fill}
            diameter={42}
            onPress={switchStage}
            accessibilityLabel={arPref ? "Switch to 3D view" : "Switch to camera view"}
          />
        ) : null}
        <View style={styles.headRight}>
          <Text style={styles.place} numberOfLines={1} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {point.name}
          </Text>
          <View style={styles.chips}>
            <Chip text={tierName(point.tier)} color={tierColor(point.tier)} />
            {/* A Game Warden site asks about the place itself, not a realm. */}
            {siteIdOf(point) ? (
              <Chip text="Warden site" color={ACCENT.sky.fill} />
            ) : (
              <Chip text={attempt?.realm_name ?? challengeLabel(point.challenge)} color={realmColor(attempt?.realm ?? point.realm)} />
            )}
          </View>
        </View>
      </View>

      {/* The Warden's line keeps its room once the question is up: lines come and go (quiet on submit, the
          reaction after), and the question must not jump up and back under the player's thumb. */}
      <View style={attempt ? styles.bubbleSlot : null}>
        {said ? <WardenLine key={said.id} text={said.text} compact={phase === "playing" || phase === "submitting"} tint={ACCENT.sky.fill} /> : null}
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: actions ? 8 : insets.bottom + 12 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Once the question is up the shrine steps back (a smaller stage), so the whole question and all its
            answers fit on a phone without scrolling; the actions sit in the footer below. */}
        <View style={[styles.stage, attempt && typeof phase !== "object" ? styles.stageCompact : null]} pointerEvents="box-none">
          {Native ? null : hasForge ? (
            <ForgePointScene point={point} style={attempt ? styles.forgeStageCompact : styles.forgeStage} />
          ) : (
            <StageScale small={!!attempt && typeof phase !== "object"}>
              <ShrineCrystal tint={tierColor(point.tier)} ref={crystal2d} />
            </StageScale>
          )}
          {phase === "approach" ? (
            <View style={styles.opening} pointerEvents="none">
              {placed ? (
                <Animated.View entering={FadeIn.duration(250)} style={styles.approach} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Bounce>
                    <Ionicons name="hand-left" size={30} color={look.text} />
                  </Bounce>
                  <Text style={styles.approachTitle} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    Tap the shrine
                  </Text>
                  <Text style={styles.approachBlurb} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    {challengeBlurb(point.challenge)}
                  </Text>
                </Animated.View>
              ) : (
                <>
                  <ActivityIndicator color={look.text} />
                  <Text style={styles.openingText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    {useAR && Native ? "Point your camera at the ground" : "The shrine is rising…"}
                  </Text>
                </>
              )}
            </View>
          ) : null}
          {phase === "opening" ? (
            <View style={styles.opening} accessible accessibilityLabel="The shrine is waking" accessibilityLiveRegion="polite">
              <ActivityIndicator color={look.text} size="large" />
              <Text style={styles.openingText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                The shrine is waking…
              </Text>
            </View>
          ) : null}
        </View>

        {typeof phase === "object" ? (
          <GamePanel>
            <View style={{ gap: 12 }}>
              <Text style={styles.failTitle}>Not this time</Text>
              <Text style={styles.failText}>{phase.failed}</Text>
              <GameButton title="Back to the map" color={ACCENT.sun.fill} onPress={onClose} />
            </View>
          </GamePanel>
        ) : attempt ? (
          <Animated.View entering={FadeInDown.duration(SHEET_OPEN_MS).easing(SHEET_EASE_OUT)} style={styles.quiz}>
            {phase !== "reveal" ? (
              <>
                <DeadlineBar deadline={deadline} total={total} />
                {phase === "playing" && prices ? (
                  <HintBar
                    coins={coins}
                    prices={prices}
                    bag={bag}
                    canFifty={attempt.kind !== "sequence" && !removed[question]}
                    canTime={!boughtTime}
                    busy={hinting}
                    onFifty={() => buy("fifty")}
                    onTime={() => buy("time")}
                    onBroke={(what) => setHintProblem(`No ${what} in your bag. Spin Quest Points to find hints.`)}
                  />
                ) : null}
                {hintProblem ? <Text style={styles.hintProblem}>{hintProblem}</Text> : null}
              </>
            ) : verdict ? (
              <ResultLine verdict={verdict} timedOut={timedOut.current} />
            ) : null}

            {attempt.kind === "sequence" ? (
              <SequenceCard
                prompt={attempt.challenge.prompt ?? ""}
                beats={attempt.challenge.beats ?? []}
                order={order}
                reveal={reveal?.correct_order ?? null}
                onTap={(id) => {
                  if (phase !== "playing") return;
                  // Sequence tap: the tap sound and a light impact (not a selection tick).
                  pressFeedback();
                  const next = order.includes(id) ? order.slice(0, order.indexOf(id)) : [...order, id];
                  setOrder(next);
                  answersRef.current = { ...answersRef.current, order: next };
                }}
              />
            ) : attempt.kind === "blitz" ? (
              <BlitzCard
                questions={attempt.challenge.questions ?? []}
                showing={showing}
                answers={blitz}
                removed={removed}
                marks={reveal?.marks ?? null}
                correct={reveal?.correct ?? null}
                voice={phase === "playing"}
                onPick={(i) => {
                  if (phase !== "playing") return;
                  const next = [...blitz];
                  next[showing] = i;
                  setBlitz(next);
                  answersRef.current = { ...answersRef.current, blitz: next };
                  if (showing + 1 < (attempt.challenge.questions?.length ?? 0)) setShowing(showing + 1);
                  else submit();
                }}
              />
            ) : attempt.challenge.questions?.[0] ? (
              <TriviaCard
                question={attempt.challenge.questions[0]}
                picked={picked}
                removed={removed[0] ?? []}
                correct={reveal?.correct?.[0] ?? null}
                voice={phase === "playing"}
                onPick={(i) => {
                  if (phase !== "playing" || picked !== null) return;
                  setPicked(i);
                  answersRef.current = { ...answersRef.current, picked: i };
                  submit();
                }}
              />
            ) : null}

            {phase === "submitting" ? <ActivityIndicator color={look.textMuted} accessibilityLabel="Marking your answer" /> : null}
            {phase === "reveal" && inRoom ? (
              <GameButton title="Photo" size="small" color={ACCENT.sky.fill} icon={<Ionicons name="camera" size={16} color={labelOn(ACCENT.sky.fill)} />} onPress={() => void photo()} style={{ alignSelf: "flex-start" }} />
            ) : null}
          </Animated.View>
        ) : null}
      </ScrollView>

      {/* The one next step, always on screen (never below the fold): lock in a sequence, or take the reward. */}
      {actions && attempt ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          {phase === "playing" && attempt.kind === "sequence" ? (
            <GameButton title="Lock it in" color={ACCENT.sun.fill} disabled={order.length < (attempt.challenge.beats?.length ?? 4)} onPress={submit} />
          ) : null}
          {phase === "reveal" ? (
            <Animated.View entering={FadeIn.duration(300)} style={{ gap: 10 }}>
              {/* Stacked, so "Second chance (1 left)" is never cut to "Second ch...". */}
              {verdict?.can_retry ? (
                <GameButton
                  title={secondChanceLabel(bag.retry ?? 0)}
                  color={PURPLE}
                  onPress={retry}
                  icon={<Ionicons name="refresh" size={18} color={labelOn(PURPLE)} />}
                />
              ) : null}
              <GameButton title="Collect" color={ACCENT.sun.fill} onPress={collect} />
            </Animated.View>
          ) : null}
        </View>
      ) : null}

      {/* Over the stage, under the header (Leave and the AR switch stay reachable). */}
      {phase === "approach" && placed ? (
        <Pressable
          style={[StyleSheet.absoluteFill, { top: insets.top + 64 }]}
          onPress={begin}
          accessibilityRole="button"
          accessibilityLabel={`Tap the shrine. ${challengeBlurb(point.challenge)}`}
        />
      ) : null}
    </View>
  );
}

/** The Warden's line under the header (WardenBubble); compact while the clock runs. */
function WardenLine({ text, compact, tint }: { text: string; compact: boolean; tint: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOut.duration(160)} style={styles.bubbleRow} accessibilityLiveRegion="polite">
      <View style={[styles.wardenBadge, { backgroundColor: tint }]} importantForAccessibility="no-hide-descendants">
        <Ionicons name="eye" size={compact ? 14 : 18} color={labelOn(tint)} />
      </View>
      <Pressable
        style={styles.bubble}
        onPress={() => wardenVoice.quiet()}
        accessibilityRole="button"
        accessibilityLabel={`The Warden says: ${text}`}
        accessibilityHint="Double tap to dismiss">
        <Text style={[styles.bubbleText, compact && { fontSize: 13, lineHeight: 17 }]} numberOfLines={compact ? 2 : 4}>
          {text}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function ResultLine({ verdict, timedOut }: { verdict: RoamVerdict; timedOut: boolean }) {
  const line = resultTitle(verdict, timedOut);
  const chip = verdict.grade ? { sun: ACCENT.sun.fill, mint: ACCENT.mint.fill, sky: ACCENT.sky.fill }[gradeColorKey(verdict.grade)] : null;
  return (
    <Pop from={0.5} response={0.45} style={{ gap: 4, alignItems: "center" }}>
      <GameTitle text={line.text} size={line.size} edge={line.win ? ACCENT.mint.edge : ACCENT.berry.edge} />
      {/* The throw grade: speed as skill. */}
      {verdict.grade && chip ? (
        <Pop from={0.3} response={0.4} delayMs={120}>
          <View accessible accessibilityLabel={`Grade: ${verdict.grade}`}>
            <Chip text={verdict.grade} color={chip} />
          </View>
        </Pop>
      ) : null}
    </Pop>
  );
}

/**
 * The countdown every challenge runs against: the server's deadline; the whole
 * row turns berry under 6 s. The bar drains on the UI thread and the number
 * re-renders only when its second changes (it used to re-render every 0.1 s,
 * audit B9).
 */
export function DeadlineBar({ deadline, total }: { deadline: number; total: number }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const leftAt = useCallback((t: number) => (deadline ? Math.max(0, (deadline - t) / 1000) : total), [deadline, total]);
  const [seconds, setSeconds] = useState(() => deadlineView(leftAt(Date.now())).seconds);
  const [hot, setHot] = useState(() => deadlineView(leftAt(Date.now())).hot);
  const frac = useSharedValue(1);
  useEffect(() => {
    const left = leftAt(Date.now());
    frac.set(total > 0 ? Math.min(1, left / total) : 0);
    // A clock, not decoration: it drains with "reduce motion" on too.
    if (deadline && left > 0) frac.set(withTiming(0, { duration: left * 1000, easing: Easing.linear, reduceMotion: ReduceMotion.Never }));
    const tick = () => {
      const v = deadlineView(leftAt(Date.now()));
      setSeconds(v.seconds);
      setHot(v.hot);
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [deadline, total, leftAt, frac]);
  useEffect(() => {
    if (hot) announce("Under six seconds left.");
  }, [hot]);
  const fill = useAnimatedStyle(() => ({ width: `${frac.get() * 100}%` }));
  const look = useLook();
  const tint = hot ? (look.dark ? TEXT_ON_DARK.danger : TEXT_ON_LIGHT.danger) : look.text;
  return (
    <View style={styles.deadline} accessible accessibilityRole="timer" accessibilityLabel={`${seconds} seconds left`}>
      <Ionicons name="timer" size={18} color={tint} />
      <View style={styles.deadlineTrack}>
        <Animated.View style={[{ height: 12, borderRadius: 6, backgroundColor: hot ? ACCENT.berry.fill : ACCENT.sun.fill }, fill]} />
      </View>
      <Text style={[styles.deadlineText, { color: tint }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {seconds}
      </Text>
    </View>
  );
}

/** Help, for coins or bag items. Shown only while a question is open. */
function HintBar({
  coins,
  prices,
  bag,
  canFifty,
  canTime,
  busy,
  onFifty,
  onTime,
  onBroke,
}: {
  coins: number;
  prices: { fifty: number; time: number; time_s: number };
  bag: Record<string, number>;
  canFifty: boolean;
  canTime: boolean;
  busy: boolean;
  onFifty: () => void;
  onTime: () => void;
  /** A hint the player has neither an item nor the coins for: say how to get one rather than a dead button. */
  onBroke: (what: string) => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={[styles.hints, busy && { opacity: 0.6 }]}>
      <HintButton label="50/50" spoken="Fifty fifty" item={bag.fifty ?? 0} cost={prices.fifty} coins={coins} allowed={canFifty} busy={busy} onPress={onFifty} onBroke={() => onBroke("50/50s")} />
      <HintButton label={`+${prices.time_s}s`} spoken={`Plus ${prices.time_s} seconds`} item={bag.time ?? 0} cost={prices.time} coins={coins} allowed={canTime} busy={busy} onPress={onTime} onBroke={() => onBroke("extra time")} />
      <View style={{ flex: 1 }} />
      <View style={styles.balance} accessible accessibilityLabel={`${coins} coins`}>
        <GameCoin size={18} />
        <Text style={styles.balanceText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {coins}
        </Text>
      </View>
    </View>
  );
}

/** A small purple game button: the label, then "bag ×n" when the bag has one (spent first), else a coin and its price. */
function HintButton({
  label,
  spoken,
  item,
  cost,
  coins,
  allowed,
  busy,
  onPress,
  onBroke,
}: {
  label: string;
  spoken: string;
  item: number;
  cost: number;
  coins: number;
  allowed: boolean;
  busy: boolean;
  onPress: () => void;
  onBroke: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const disabled = hintDisabled({ allowed, item, coins, cost, busy });
  // Can't pay for it: still tappable, and the tap says where hints come from.
  const broke = disabled && allowed && !busy && item <= 0 && coins < cost;
  const look = useLook();
  // Help is the quiet button: the well colour with ink words, so it never competes with the answers.
  const face = look.surfaceAlt;
  return (
    <Pressable
      onPressIn={() => {
        if (!disabled) pressFeedback();
      }}
      onPress={broke ? onBroke : onPress}
      disabled={disabled && !broke}
      accessibilityRole="button"
      accessibilityLabel={`Hint: ${spoken}, ${item > 0 ? `${item} in your bag` : `${cost} coins`}`}
      accessibilityState={{ disabled }}>
      {({ pressed }) => (
        <View style={{ paddingBottom: BUTTON.edge, opacity: disabled ? 0.5 : 1 }}>
          <View style={[StyleSheet.absoluteFill, { top: BUTTON.edge, borderRadius: 12, backgroundColor: edgeColor(face, 0.85) }]} />
          <View style={[styles.hintFace, { backgroundColor: face, transform: [{ translateY: pressed ? BUTTON.pressedTranslate : 0 }] }]}>
            <Text style={styles.hintText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {label}
            </Text>
            {item > 0 ? (
              <>
                <Ionicons name="bag" size={12} color={look.text} />
                <Text style={styles.hintText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  ×{item}
                </Text>
              </>
            ) : (
              <>
                <GameCoin size={16} />
                <Text style={styles.hintText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  {cost}
                </Text>
              </>
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
}

const CHOICE_SPRING = settle(0.35);

/** One answer button in one of four fixed colours, so "the blue one" means the same to every player (ChoiceButton). */
function ChoiceButton({ text, index, state, onPress }: { text: string; index: number; state: ChoiceState; onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const look = choiceLook(state);
  const face = look.face === "mint" ? ACCENT.mint.fill : look.face === "berry" ? ACCENT.berry.fill : look.face === "grey" ? GREY : CHOICE_COLORS[index % CHOICE_COLORS.length];
  // Each answer's words in its own face's ink: never white on the orange one.
  const ink = labelOn(face);
  const scale = useSharedValue(look.scale);
  const opacity = useSharedValue(look.opacity);
  useEffect(() => {
    scale.value = withSpring(look.scale, CHOICE_SPRING);
    opacity.value = withTiming(look.opacity, { duration: 300, easing: Easing.inOut(Easing.cubic) });
  }, [look.scale, look.opacity, scale, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  const locked = state !== "idle";
  const spoken = state === "right" ? `${text}, correct answer` : state === "wrong" ? `${text}, your answer, wrong` : state === "picked" ? `${text}, selected` : text;
  return (
    <Animated.View style={animated}>
      <Pressable
        onPressIn={() => {
          if (!locked) pressFeedback();
        }}
        onPress={onPress}
        disabled={locked}
        accessibilityRole="button"
        accessibilityLabel={spoken}
        accessibilityState={{ selected: state === "picked" || state === "right", disabled: state === "removed" }}>
        {({ pressed }) => (
          <View style={{ paddingBottom: BUTTON.edge }}>
            <View style={[StyleSheet.absoluteFill, { top: BUTTON.edge, borderRadius: RADIUS.button, backgroundColor: edgeColor(face) }]} />
            <View style={[styles.choiceFace, { backgroundColor: face, transform: [{ translateY: pressed ? BUTTON.pressedTranslate : 0 }] }]}>
              <Text style={[styles.choiceText, { color: ink }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {text}
              </Text>
              {state === "right" ? <Ionicons name="checkmark-circle" size={22} color={ink} /> : null}
              {state === "wrong" ? <Ionicons name="close-circle" size={22} color={ink} /> : null}
              {state === "dim" ? <Ionicons name="ellipse" size={22} color={ink} style={{ opacity: 0 }} /> : null}
              {state === "picked" ? <Ionicons name="checkmark" size={18} color={ink} /> : null}
            </View>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

export function TriviaCard({
  question,
  picked,
  removed,
  correct,
  voice,
  onPick,
}: {
  question: AttemptQuestion;
  picked: number | null;
  removed: number[];
  correct: number | null;
  /** Offer the spoken answer (only while the clock runs). */
  voice: boolean;
  onPick: (i: number) => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={{ gap: 10 }}>
      {question.clue ? (
        <View style={styles.clue} accessible accessibilityLabel={`Emoji clue: ${question.clue}`}>
          <Text style={styles.clueText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {question.clue}
          </Text>
        </View>
      ) : null}
      <Text style={styles.question}>{question.q}</Text>
      {voice && correct === null && picked === null ? <SayItButton key={question.id} choices={question.choices} removed={removed} onPick={onPick} /> : null}
      {question.choices.map((choice, i) => (
        <ChoiceButton key={`${question.id}-${i}`} text={choice} index={i} state={choiceState(i, picked, removed, correct)} onPress={() => onPick(i)} />
      ))}
    </View>
  );
}

/** Beats making room for a new one: the sheets' settle, no bounce. */
const REORDER = LinearTransition.duration(SHEET_OPEN_MS).easing(SHEET_EASE_OUT);

/**
 * Tap the moments in the order they happened. Tapping is more reliable than
 * dragging on a phone held up in the street, and tapping a numbered one again
 * takes it back. After the verdict the beats rearrange themselves.
 */
export function SequenceCard({
  prompt,
  beats,
  order,
  reveal,
  onTap,
}: {
  prompt: string;
  beats: { id: string; text: string }[];
  order: string[];
  reveal: string[] | null;
  onTap: (id: string) => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const look = useLook();
  const shown = reveal ? reveal.map((id) => beats.find((b) => b.id === id)).filter((b): b is { id: string; text: string } => !!b) : beats;
  return (
    <View style={{ gap: 12 }}>
      <Text style={[styles.question, { fontSize: 24, lineHeight: 30 }]}>{prompt}</Text>
      <Text style={styles.sub}>{reveal ? "The right order:" : "Tap them in order, first to last."}</Text>
      {shown.map((beat) => {
        const n = order.indexOf(beat.id) + 1;
        const right = reveal ? reveal.indexOf(beat.id) + 1 : 0;
        const wasRight = !!reveal && n === right;
        const badge = reveal ? (wasRight ? ACCENT.mint.fill : ACCENT.sun.fill) : n ? ACCENT.sky.fill : look.surface;
        const spoken = reveal ? `${beat.text}, number ${right}, ${wasRight ? "you had it right" : "you had it in the wrong place"}` : `${beat.text}${n ? `, number ${n}` : ""}`;
        return (
          <Animated.View key={beat.id} layout={REORDER}>
            <Pressable onPress={() => onTap(beat.id)} accessibilityRole="button" accessibilityLabel={spoken} style={styles.beat}>
              <View style={[styles.beatBadge, { backgroundColor: badge }]}>
                <Text style={[styles.beatBadgeText, { color: n || reveal ? labelOn(badge) : look.textMuted }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  {reveal ? right : n || ""}
                </Text>
              </View>
              <Text style={styles.beatText}>{beat.text}</Text>
              {reveal ? (
                <Ionicons name={wasRight ? "checkmark-circle" : "arrow-redo-circle"} size={22} color={wasRight ? (look.dark ? TEXT_ON_DARK.success : TEXT_ON_LIGHT.success) : ACCENT.sun.edge} />
              ) : null}
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

/** Five questions, one clock. The answers go to the server together at the end, so the key is never on the phone. */
export function BlitzCard({
  questions,
  showing,
  answers,
  removed,
  marks,
  correct,
  voice,
  onPick,
}: {
  questions: AttemptQuestion[];
  showing: number;
  answers: number[];
  removed: Record<number, number[]>;
  marks: boolean[] | null;
  correct: number[] | null;
  voice: boolean;
  onPick: (i: number) => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const look = useLook();
  const good = look.dark ? TEXT_ON_DARK.success : TEXT_ON_LIGHT.success;
  const bad = look.dark ? TEXT_ON_DARK.danger : TEXT_ON_LIGHT.danger;
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.pips} accessible accessibilityLabel={marks ? `${marks.filter(Boolean).length} of ${questions.length} right` : `Question ${Math.min(showing + 1, questions.length)} of ${questions.length}`}>
        {questions.map((q, i) => (
          <View
            key={q.id}
            style={[
              styles.pip,
              {
                backgroundColor: marks ? (marks[i] ? ACCENT.mint.fill : ACCENT.berry.fill) : i < showing || answers[i] >= 0 ? ACCENT.sun.fill : i === showing ? look.textMuted : look.hairline,
              },
            ]}
          />
        ))}
      </View>
      {marks ? (
        <View style={styles.summary}>
          {questions.map((q, i) => {
            const ok = !!marks[i];
            const right = correct && correct[i] >= 0 && correct[i] < q.choices.length ? q.choices[correct[i]] : null;
            return (
              <View key={q.id} style={styles.summaryRow} accessible accessibilityLabel={`${q.q}${right ? `, answer ${right}` : ""}, ${ok ? "right" : "wrong"}`}>
                <Ionicons name={ok ? "checkmark-circle" : "close-circle"} size={20} color={ok ? good : bad} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.summaryQ}>{q.q}</Text>
                  {right ? <Text style={[styles.summaryA, { color: ok ? good : look.text }]}>{right}</Text> : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : questions[showing] ? (
        <Animated.View key={showing} entering={SlideInRight.duration(250)} exiting={SlideOutLeft.duration(250)}>
          <TriviaCard question={questions[showing]} picked={null} removed={removed[showing] ?? []} correct={null} voice={voice} onPick={onPick} />
        </Animated.View>
      ) : null}
    </View>
  );
}

const L = SURFACES.light;
const D = SURFACES.dark;

// The scene (the world's sky, the shrine) on top; the question and its answers on a paper sheet below
// (art direction 6.5: cream by day, ink by dusk). Words over the scene sit on paper plates, so they
// read on the 3D and AR stages too.
const STYLE_PAIR = themedStyles(
  {
    root: { ...StyleSheet.absoluteFill },
    header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10, paddingHorizontal: 16, paddingBottom: 4 },
    headRight: { flex: 1, alignItems: "flex-end", gap: 6 },
    place: {
      maxWidth: "100%",
      fontFamily: GF.display,
      fontSize: 20,
      lineHeight: 24,
      color: L.text,
      textAlign: "right",
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: RADIUS.chip,
      overflow: "hidden",
      backgroundColor: L.surface,
    },
    chips: { flexDirection: "row", gap: 6 },
    bubbleSlot: { minHeight: 60 },
    bubbleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 10, paddingHorizontal: 16 },
    wardenBadge: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF" },
    bubble: { flex: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: L.surface, ...ELEVATION.low },
    bubbleText: { fontFamily: GF.body, fontSize: 15, lineHeight: 20, color: L.text },
    content: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 8, gap: 14 },
    stage: { flex: 1, minHeight: 130, alignItems: "center", justifyContent: "center" },
    stageCompact: { flex: 0, minHeight: 0, height: 92 },
    forgeStage: { width: "100%", height: 300 },
    forgeStageCompact: { width: "100%", height: 92 },
    footer: { paddingHorizontal: 16, paddingTop: 10, gap: 10 },
    opening: { position: "absolute", bottom: 0, alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.card, backgroundColor: L.surface, ...ELEVATION.low },
    approach: { alignItems: "center", gap: 4 },
    approachTitle: { fontFamily: GF.display, fontSize: 28, lineHeight: 32, color: L.text },
    approachBlurb: { fontFamily: GF.body, fontSize: 15, lineHeight: 21, color: L.textMuted, textAlign: "center" },
    openingText: { fontFamily: GF.bold, fontSize: 17, lineHeight: 22, color: L.text },
    failTitle: { fontFamily: GF.display, fontSize: 28, lineHeight: 32, color: L.text },
    failText: { fontFamily: GF.regular, fontSize: 16, lineHeight: 22, color: L.text },
    quiz: { gap: 12, padding: 14, borderRadius: RADIUS.sheet, backgroundColor: L.surface, ...ELEVATION.low },
    deadline: { flexDirection: "row", alignItems: "center", gap: 8 },
    deadlineTrack: { flex: 1, height: 12, borderRadius: 6, backgroundColor: L.surfaceAlt, overflow: "hidden" },
    deadlineText: { fontFamily: GF.display, fontSize: 18, lineHeight: 22, width: 30, textAlign: "right", fontVariant: ["tabular-nums"] },
    hints: { flexDirection: "row", alignItems: "center", gap: 10 },
    hintFace: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, overflow: "hidden" },
    hintText: { fontFamily: GF.display, fontSize: 16, lineHeight: 20, color: L.text },
    balance: { flexDirection: "row", alignItems: "center", gap: 4 },
    balanceText: { fontFamily: GF.display, fontSize: 16, lineHeight: 20, color: L.text, fontVariant: ["tabular-nums"] },
    hintProblem: { fontFamily: GF.body, fontSize: 13, lineHeight: 17, color: TEXT_ON_LIGHT.danger },
    clue: { alignItems: "center", paddingVertical: 8, borderRadius: RADIUS.card, backgroundColor: L.surfaceAlt },
    clueText: { fontSize: 54, lineHeight: 66 },
    question: { fontFamily: GF.display, fontSize: 24, lineHeight: 30, color: L.text },
    sub: { fontFamily: GF.body, fontSize: 15, lineHeight: 21, color: L.textMuted },
    choiceFace: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48, paddingHorizontal: 20, paddingVertical: 11, borderRadius: RADIUS.button, overflow: "hidden" },
    choiceText: { flex: 1, fontFamily: GF.display, fontSize: 20, lineHeight: 24, textAlign: "left" },
    beat: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, marginBottom: 4, borderRadius: RADIUS.card, backgroundColor: L.surfaceAlt },
    beatBadge: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#FFFFFF" },
    beatBadgeText: { fontFamily: GF.display, fontSize: 20, lineHeight: 24 },
    beatText: { flex: 1, fontFamily: GF.body, fontSize: 17, lineHeight: 22, color: L.text },
    pips: { flexDirection: "row", gap: 6 },
    pip: { flex: 1, height: 8, borderRadius: 4 },
    summary: { gap: 8, padding: 12, borderRadius: RADIUS.card, backgroundColor: L.surfaceAlt },
    summaryRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    summaryQ: { fontFamily: GF.body, fontSize: 14, lineHeight: 19, color: L.text },
    summaryA: { fontFamily: GF.display, fontSize: 15, lineHeight: 19 },
  },
  {
    place: { color: D.text, backgroundColor: D.surface },
    bubble: { backgroundColor: D.surface, shadowOpacity: 0, elevation: 0, boxShadow: "none" },
    bubbleText: { color: D.text },
    opening: { backgroundColor: D.surface, shadowOpacity: 0, elevation: 0, boxShadow: "none" },
    approachTitle: { color: D.text },
    approachBlurb: { color: D.textMuted },
    openingText: { color: D.text },
    failTitle: { color: D.text },
    failText: { color: D.text },
    quiz: { backgroundColor: D.surface, borderWidth: 1, borderColor: D.hairline, shadowOpacity: 0, elevation: 0, boxShadow: "none" },
    deadlineTrack: { backgroundColor: D.surfaceAlt },
    hintText: { color: D.text },
    balanceText: { color: D.text },
    hintProblem: { color: TEXT_ON_DARK.danger },
    clue: { backgroundColor: D.surfaceAlt },
    question: { color: D.text },
    sub: { color: D.textMuted },
    beat: { backgroundColor: D.surfaceAlt },
    beatText: { color: D.text },
    summary: { backgroundColor: D.surfaceAlt },
    summaryQ: { color: D.text },
  },
);

/** The shrine steps back once the question is up: 1.0 -> 0.6 over the sheet's open curve (a fade-free scale; Reduce Motion: at once). */
function StageScale({ small, children }: { small: boolean; children: ReactNode }) {
  const reduce = useReducedMotion();
  const k = useSharedValue(small ? STAGE_SMALL : 1);
  useEffect(() => {
    const to = small ? STAGE_SMALL : 1;
    k.value = reduce ? to : withTiming(to, { duration: SHEET_OPEN_MS, easing: SHEET_EASE_OUT });
  }, [small, reduce, k]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: k.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
const STAGE_SMALL = 0.6;

/** The tap hand's bounce (.symbolEffect(.bounce, options: .repeating)); still under Reduce Motion. */
function Bounce({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const y = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    y.value = withRepeat(withSequence(withTiming(-8, { duration: 260, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) }), withDelay(500, withTiming(0, { duration: 1 }))), -1);
  }, [reduce, y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
