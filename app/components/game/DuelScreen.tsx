// Every fight in the React Native game: a Quest Point's Guardian, a Trials
// rung, a Siege, a raid boss, a Quest Run point. Then the verdict
// (Features/DuelFeature.swift DuelView: starting, fighting, judging, result).
//
// battle-3d-only (1 Nov 2026): the fight is the 3D fight (Godot, Fight3D.tsx),
// opened directly: no briefing, no versus card. The duel is started with the
// server (fight3d: true), Godot fights on the server's seed, round and this
// mode's modifiers, the record goes back to /v1/duel/finish and the server
// judges it and pays through the mode's own payer.
//
// A phone that cannot run the 3D fight (no engine in the build, Android below
// 10) says so to the server (fallback2d: true) and plays the 2D duel instead,
// judged and paid as before: the briefing, the VS card, then the TypeScript
// port of costquest-duel (features/game/duel) drawn side-on, with the pause
// page (BattlePauseView.swift) over it.
//   2D: tap: strike · hold: block (keep holding to charge, let go to throw the heavy)
//       flick toward: dash · flick away: dodge · drag: walk · the two buttons: specials
//
// The AR reveal (phone-hardware design 2.5, FightReveal.tsx, features/game/
// reveal.ts): on an AR iPhone with the setting on, the 3D fight opens with a
// few seconds of the Guardian rising out of the ground through the camera.
// The duel is started with the server exactly as without it, Fight3D prepares
// the fight underneath (hold) and starts it when the reveal hands over.
//
// The 2D sim steps at a fixed 60 Hz from real time (DuelRunner); this screen
// draws its state every frame. The phone only reports what happened; the
// server decides what it pays (POST /v1/duel/finish). Leaving a fight reports
// it as it stands, and the server judges that as a loss.
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { type RefObject, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  type GestureResponderEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  ReduceMotion,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  type DuelEvent,
  DuelEventType,
  type DuelPresentation,
  DuelRunner,
  EndReason,
  FighterAction,
  type FighterState,
  GestureRecognizer,
  presentationFromServer,
  setupFromServer,
} from "@/features/game/duel";
import {
  asFull,
  bannerAfter,
  type DuelCue,
  type DuelMode,
  DUEL_CONTROLS_2D,
  duelDifficulty,
  duelModeOf,
  guardianName,
  pausePlace,
  pauseTitle,
  siegeDuelStart,
  trialAgainLabel,
  type TrialRequest,
  trialTarget,
  type RunDuelRequest,
  runDuelTarget,
  cueForSimEvent,
  verdictCue,
  versusTitle,
  VERSUS_MS,
} from "@/features/game/duelFlow";
import { distanceText } from "@/features/game/geo";
import { RAID_COLOR, raidDuelStart } from "@/features/game/raids";
import { gameStore } from "@/features/game/runtime";
import { siegeMoment } from "@/features/game/siegeFlow";
import { levelMoment, reactionMoment } from "@/features/game/warden";
import type { DuelFinished, DuelOutcome, DuelStart, QuestPoint, RoamStanding } from "@/features/game/wire";
import { revealHoldsFight, revealStep, revealWanted } from "@/features/game/reveal";
import { finishFrom3D } from "@/features/game3d/fight3d";
import { FIGHT3D, fight3dAvailable } from "@/features/game3d/flags";

import { showBanner } from "./Banner";
import BattlePause from "./BattlePause";
import DuelResult from "./DuelResult";
import { runModel } from "./runModel";
import DuelVersus from "./DuelVersus";
import Fight3D from "./Fight3D";
import FightReveal, { REVEAL_ISLAND_OFF } from "./FightReveal";
import { useGuardianFigure, useGuardianPortrait } from "./ForgeWorld";
import { fightRevealOn } from "./prefs";
import { CostQuestSummonView, summonARSupported } from "@/modules/costquest-game/src";
import { GameBackdrop } from "./GameBackdrop";
import { announce, GameButton, GameIconButton, MAX_FONT_SCALE, ProgressBar } from "./kit";
import { ACCENT, contrast, edgeColor, ELEVATION, HUD_GLASS, labelOn, RADIUS, SURFACES, TEXT_ON_DARK, TEXT_ON_LIGHT, useLook } from "./look";
import { RaidDuelBriefing } from "./RaidDuel";
import type { RewardSummary } from "./Reward";
import { playSound } from "./sound";
import { edgeOf, GF, GP, realmColor, tierColor } from "./theme";
import { wardenVoice } from "./wardenVoice";
import { useRenderCount } from "@/utils/perfMarks";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";
import { POP_FADE, POP_IN, POP_IN_COUNT } from "./sheetMotion";

type Phase =
  | { kind: "briefing" }
  | { kind: "starting" }
  | { kind: "versus"; start: DuelStart }
  | { kind: "countdown"; start: DuelStart; n: number }
  | { kind: "fighting"; start: DuelStart }
  /** The 3D fight (Godot) on the server's setup. */
  | { kind: "fight3d"; start: DuelStart }
  | { kind: "judging"; start: DuelStart; end: { won: boolean; reason: string } | null }
  | { kind: "result"; start: DuelStart; outcome: DuelOutcome }
  | { kind: "failed"; message: string; afterStart: boolean };

/** The sound and the haptic of one cue (DuelSFX.play). */
function playCue(c: DuelCue) {
  if (c.sound) playSound(c.sound);
  switch (c.haptic) {
    case "success":
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      break;
    case "error":
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      break;
    case "heavy":
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
      break;
    case "medium":
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      break;
    case "light":
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      break;
    default:
      break;
  }
}

export default function DuelScreen({
  point,
  parked,
  raid,
  mode: modeProp,
  trial,
  run,
  onClose,
}: {
  point: QuestPoint;
  parked: boolean;
  /** A boss fought as a duel: mode "raid", its damage goes into the crew's shared pool. (Same as mode="raid".) */
  raid?: boolean;
  /**
   * Which /v1/duel/start mode: "point" (default), "raid", or "siege" (a rival's
   * hold fought as a duel, when me.features.duel.siege_mode is "duel": no briefing).
   */
  mode?: DuelMode;
  /** A Guardian Trials rung (mode "trial"): the faction's next, or one to replay. Fought anywhere, no briefing. */
  trial?: TrialRequest;
  /** A Quest Run point (mode "run"): fought for its value, no briefing; the run comes back with the verdict. */
  run?: RunDuelRequest;
  /** Unused since the verdict is DuelResult now (Swift goes back to the map); kept so callers still compile. */
  onReward?: (r: RewardSummary) => void;
  onClose: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  useRenderCount("DuelScreen");
  const mode = duelModeOf(modeProp, raid);
  // The 3D fight opens directly in every mode. The 2D fallback keeps the briefing for points and raids.
  const use3D = useMemo(() => fight3dAvailable(), []);
  const direct = use3D || mode === "siege" || mode === "trial" || mode === "run";
  const [phase, setPhase] = useState<Phase>(direct ? { kind: "starting" } : { kind: "briefing" });
  // The AR reveal before the 3D fight: decided once, when the screen opens.
  const revealOn = useMemo(
    () =>
      revealWanted({
        platform: Platform.OS,
        nativeView: CostQuestSummonView !== null,
        arSupported: summonARSupported,
        islandOff: REVEAL_ISLAND_OFF,
        pref: fightRevealOn(),
        fight3d: use3D,
      }),
    [use3D],
  );
  const [reveal, sendReveal] = useReducer(revealStep, revealOn ? "coming" : "done");
  const revealRef = useRef(reveal);
  revealRef.current = reveal;
  const phaseRef = useRef<Phase>(phase);
  const [paused, setPaused] = useState(false);
  const before = useRef<RoamStanding | null>(null);
  // look-fight: the 3D fight's whole result, for the result screen's highlights (crits, combo, time)
  const fightRecord = useRef<Record<string, unknown> | null>(null);
  const alive = useRef(true);
  const startedOnce = useRef(false);
  const runnerRef = useRef<DuelRunner | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const ctx = () => ({ me: gameStore.get().me, playerName: gameStore.playerName() });

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        timers.current.delete(t);
        resolve();
      }, ms);
      timers.current.add(t);
    });

  useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    return () => {
      alive.current = false;
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const go = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
    // Pause is only for a fight under way (DuelView: .onChange(of: phase)).
    if (p.kind !== "versus" && p.kind !== "countdown" && p.kind !== "fighting") setPaused(false);
  }, []);

  // Coming back from another app, or a call, lands on the pause page, not
  // mid-blow (DuelView: scenePhase != .active). Inactive counts, as on iOS.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") return;
      const k = phaseRef.current.kind;
      if (k === "versus" || k === "countdown" || k === "fighting") setPaused(true);
    });
    return () => sub.remove();
  }, []);

  // The game going behind the chat (parked) pauses too, and it is still
  // paused when you come back: the adjust-state-on-a-changed-prop pattern.
  const [wasParked, setWasParked] = useState(parked);
  if (parked !== wasParked) {
    setWasParked(parked);
    if (parked && (phase.kind === "versus" || phase.kind === "countdown" || phase.kind === "fighting")) setPaused(true);
  }

  // The verdict: sounds and haptics from the SERVER's word, then the Warden.
  const report = useCallback(
    async (start: DuelStart, f: DuelFinished, end: { won: boolean; reason: string } | null) => {
      const k = phaseRef.current.kind;
      if (k !== "fighting" && k !== "countdown" && k !== "fight3d") return;
      go({ kind: "judging", start, end });
      announce(end ? `${end.reason} Counting the blows` : "Counting the blows");
      try {
        const outcome = await gameStore.duelFinish(start, f);
        if (!alive.current) return;
        go({ kind: "result", start, outcome });
        playCue(verdictCue(outcome.status));
        const won = outcome.status === "won";
        if (outcome.status !== "held") {
          const c = ctx();
          const moment =
            mode === "siege"
              ? siegeMoment(c, won, point.name, siegeHolderName(start, point), null)
              : reactionMoment(c, won, point, "duel");
          wardenVoice.speak(moment, 5000).catch(() => {});
        }
        void gameStore.refreshMe().then(() => {
          const after = gameStore.get().me?.standing ?? null;
          const was = before.current;
          if (after && ((was && after.level > was.level) || outcome.point?.leveled_up)) {
            wardenVoice.speak(levelMoment(ctx(), after, !!was && after.rank !== was.rank), 5000).catch(() => {});
          }
        });
      } catch (error) {
        if (!alive.current) return;
        go({ kind: "failed", message: `Couldn't send the fight: ${(error as Error).message}`, afterStart: true });
      }
    },
    [go, mode, point],
  );

  // The 2D arena's loop, or the Leave button, hands the fight over.
  const finished = useCallback(
    (start: DuelStart, runner: DuelRunner, how: "over" | "left") => {
      const st = runner.sim.state;
      const end = how === "over" ? { won: st.winner === 1, reason: st.endReason === EndReason.KO ? "K.O.!" : "Time!" } : null;
      void report(start, runner.finishPayload(), end);
    },
    [report],
  );

  // Leaving reports the fight as it stands; the server judges it a loss.
  const leave = () => {
    const cur = phaseRef.current;
    if (cur.kind !== "fighting" && cur.kind !== "countdown") return onClose();
    setPaused(false);
    const r = runnerRef.current;
    if (!r) return onClose();
    finished(cur.start, r, "left");
  };

  /** The 2D fight: a short 3-2-1, announced. */
  const countdownThenFight = async (start: DuelStart) => {
    for (let n = 3; n >= 1; n--) {
      go({ kind: "countdown", start, n });
      announce(String(n));
      await wait(650);
      if (!alive.current) return;
    }
    announce("Fight!");
    go({ kind: "fighting", start });
  };

  const fight = async () => {
    go({ kind: "starting" });
    announce("Finding your opponent");
    before.current = gameStore.get().me?.standing ?? null;
    // Ask for the 3D fight; a phone that cannot run it says so and keeps the 2D duel.
    const how = use3D ? { fight3d: true } : { fallback2d: true };
    try {
      const fix = gameStore.get().fix;
      const start =
        mode === "raid"
          ? await raidDuelStart(gameStore.client, point, fix, how)
          : mode === "siege"
            ? await siegeDuelStart(gameStore.client, point, fix, how)
            : mode === "trial" && trial
              ? await gameStore.client.duelStart({ mode: "trial", target: trialTarget(trial), ...how })
              : mode === "run" && run
                ? // A pocket run has no location; a daily run is judged for reach.
                  await gameStore.client.duelStart({ mode: "run", target: runDuelTarget(run), lat: fix?.lat, lng: fix?.lng, accuracy_m: fix?.accuracy, stake: run.stake, ...how })
                : await gameStore.duelStart(point, how);
      if (!alive.current) return;
      if (use3D && start.setup.kind === "fight3d") {
        // The 3D fight: straight in. Its loading card says who and what it is worth.
        // Under the AR reveal: no sound over the camera.
        if (revealRef.current === "done") playSound("whoosh");
        announce(`${versusTitle(start, (id) => gameStore.factionName(id))}. Loading the fight`);
        go({ kind: "fight3d", start });
        return;
      }
      // The 2D duel: this phone's fallback, or a server that hands out the 2D fight for this mode.
      go({ kind: "versus", start });
      playSound("whoosh");
      announce(versusTitle(start, (id) => gameStore.factionName(id)));
      await wait(VERSUS_MS);
      if (!alive.current) return;
      await countdownThenFight(start);
    } catch (error) {
      if (alive.current) go({ kind: "failed", message: (error as Error).message, afterStart: false });
    }
  };

  // The 3D fight (and a 2D siege, trial or run point) goes straight to the opponent: no briefing.
  useEffect(() => {
    if (!direct || startedOnce.current) return;
    startedOnce.current = true;
    void fight();
    // fight() reads the current props once; this is the screen's one start.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmLeave = () =>
    Alert.alert("Leave the fight?", undefined, [
      { text: "Keep fighting", style: "cancel" },
      { text: "Leave (counts as a loss)", style: "destructive", onPress: leave },
    ]);

  // Android Back. Registered when a fight phase begins, which is after the
  // game's own listener, so this one is asked first.
  const k = phase.kind;
  useEffect(() => {
    if (k !== "versus" && k !== "countdown" && k !== "fighting" && k !== "judging") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (k === "fighting") setPaused((p) => !p);
      else if (k === "countdown") confirmLeave();
      return true;
    });
    return () => sub.remove();
  });

  const done = (outcome: DuelOutcome) => {
    const me = gameStore.get().me;
    const after = asFull(outcome).run?.run;
    if (after) runModel.adopt(after);
    const b = bannerAfter(asFull(outcome), mode, point.name);
    if (b) showBanner(b.title, { subtitle: b.subtitle, color: mode === "raid" ? RAID_COLOR : realmColor(me?.faction), sound: "fanfare" });
    onClose();
  };


  if (phase.kind === "briefing" || (phase.kind === "starting" && !direct) || (phase.kind === "failed" && !phase.afterStart && !direct)) {
    const Brief = mode === "raid" ? RaidDuelBriefing : Briefing;
    // PointDuelView.statusBarHidden()
    return (
      <>
        <StatusBar hidden animated />
        <Brief point={point} busy={phase.kind === "starting"} problem={phase.kind === "failed" ? phase.message : null} onFight={fight} onClose={onClose} />
      </>
    );
  }

  const inFight = phase.kind === "countdown" || phase.kind === "fighting" || phase.kind === "judging";
  const pauseProps =
    phase.kind === "fighting"
      ? {
          title: (() => {
            const t = pauseTitle(phase.start);
            return t === "The fight" ? point.name : t;
          })(),
          place: pausePlace(phase.start) ?? point.name,
          tint: realmColor(phase.start.point?.realm ?? point.realm),
        }
      : null;

  return (
    <View style={styles.stage}>
      {/* DuelView.statusBarHidden(phase == .fighting) */}
      {phase.kind === "fighting" ? <StatusBar hidden animated /> : null}
      <LinearGradient colors={[GP.navy, GP.navyEdge]} style={StyleSheet.absoluteFill} />

      {phase.kind === "starting" ? (
        <View style={styles.centerCol} accessible accessibilityLabel="Finding your opponent">
          <ActivityIndicator color="#FFF" />
          <Text style={styles.statusText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            Finding your opponent…
          </Text>
        </View>
      ) : null}

      {phase.kind === "versus" ? (
        <View style={styles.centerCol}>
          <DuelVersus start={phase.start} />
        </View>
      ) : null}

      {phase.kind === "fight3d" ? (
        <Fight3D
          key={phase.start.duel_id}
          point={point}
          mode="full"
          autoplay={FIGHT3D.autoplay}
          start={phase.start}
          parked={parked}
          hold={revealHoldsFight(reveal)}
          onFighting={() => sendReveal("fightShown")}
          onFailed={() => sendReveal("fightShown")}
          onResult={(r, s) => {
            const st = s ?? phase.start;
            const end = r.outcome === "quit" ? null : { won: r.outcome === "win", reason: r.outcome === "timeout" ? "Time!" : r.outcome === "win" ? "K.O.!" : "Down!" };
            fightRecord.current = r.record;
            void report(st, finishFrom3D(r), end);
          }}
          // Left before the end (the X, Android Back): the server counts it as a loss when it runs
          // out of time, as it does any fight walked away from.
          onClose={onClose}
        />
      ) : null}

      {inFight ? (
        <Arena
          key={phase.start.duel_id}
          point={point}
          start={phase.start}
          countdown={phase.kind === "countdown" ? phase.n : 0}
          over={phase.kind === "judging"}
          end={phase.kind === "judging" ? phase.end : null}
          paused={paused || parked}
          runnerRef={runnerRef}
          onOver={finished}
          onPause={() => setPaused(true)}
        />
      ) : null}

      {phase.kind === "judging" ? (
        <View style={styles.centerCol} pointerEvents="none">
          <View style={styles.judging} accessible accessibilityLabel="Counting the blows">
            <ActivityIndicator color="#FFF" />
            <Text style={styles.statusText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              Counting the blows…
            </Text>
          </View>
        </View>
      ) : null}

      {phase.kind === "result" ? (
        <DuelResult
          outcome={phase.outcome}
          start={phase.start}
          fight={fightRecord.current}
          onDone={() => done(phase.outcome)}
          again={trialAgainLabel(phase.outcome, trial ? gameStore.get().me?.features?.duel?.trials?.[trial.faction] : null)}
          onAgain={() => {
            // The ladder's next rung (or the same one again): a fresh start, no briefing.
            void fight();
          }}
        />
      ) : null}

      {phase.kind === "failed" ? (
        <View style={styles.centerCol}>
          <Text style={styles.failed} maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityLiveRegion="polite">
            {phase.message}
          </Text>
          <GameButton title="Back" color={GP.sun} onPress={onClose} style={{ alignSelf: "stretch" }} />
        </View>
      ) : null}

      {reveal !== "done" && (phase.kind === "starting" || phase.kind === "fight3d") ? (
        <FightReveal point={point} mode={mode} start={phase.kind === "fight3d" ? phase.start : null} state={reveal} send={sendReveal} />
      ) : null}

      {pauseProps && paused ? (
        <BattlePause
          {...pauseProps}
          controls={DUEL_CONTROLS_2D}
          onResume={() => setPaused(false)}
          onLeave={leave}
        />
      ) : null}
    </View>
  );
}

/** The Hold's holder, for the Warden (the siege block of the start, else the point's own facts). */
function siegeHolderName(start: DuelStart, point: QuestPoint): string {
  const siege = (start as unknown as { siege?: { faction_attacked_name?: string | null; faction_attacked?: string | null } | null }).siege;
  return siege?.faction_attacked_name ?? point.extra?.holder_name ?? gameStore.factionName(siege?.faction_attacked ?? point.extra?.holder ?? point.realm);
}

function PauseButton({ top, onPress }: { top: number; onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pause, { top }]}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Pause"
      accessibilityHint="Pauses the fight. You can resume, see how to play, or leave.">
      <Ionicons name="pause" size={18} color="#FFFFFF" />
    </Pressable>
  );
}

// ---------- the briefing ----------

function Briefing({
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
  // The Guardian's rarity (art direction 6.5: the page with a faint rarity light at the top; realm colours never tint the fight).
  const color = tierColor(point.tier);
  const tintText = readableTint(color, look.screen, look.text);
  const me = gameStore.get().me;
  const holder = point.extra?.holder_name ?? (point.extra?.holder ? gameStore.factionName(point.extra.holder) : null);
  // The Guardian you are about to fight, as its map pin showed it (art direction 5: one render everywhere).
  const portrait = useGuardianPortrait(point, 512);
  // Better still, the Guardian standing (its full-body render on a clear page): it fills the
  // top of the page like a versus card, and never puts a cream square on the dusk page.
  const figure = useGuardianFigure(point);
  return (
    <View style={styles.root}>
      <GameBackdrop tint={color} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {portrait ? null : <Ionicons name="shield" size={300} color={`${color}24`} style={styles.emblem} />}
        <View style={styles.topBar}>
          <GameIconButton icon="close" diameter={42} onPress={onClose} accessibilityLabel={`Leave ${point.name}`} />
          <Text style={styles.placeChip} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {point.name.toUpperCase()}
          </Text>
        </View>
        {figure ? (
          <Animated.View entering={FadeIn.duration(400)} style={styles.figureStage} pointerEvents="none">
            <View style={[styles.figureGlow, { backgroundColor: `${color}2E` }]} />
            <Image source={{ uri: figure.url }} style={styles.figureImage} contentFit="contain" contentPosition="bottom" accessibilityLabel={figure.name} />
            <View style={[styles.figureGround, { backgroundColor: `${color}55` }]} />
          </Animated.View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        {portrait && !figure ? (
          <Animated.View entering={FadeIn.duration(400)} style={[styles.portraitCard, { backgroundColor: color }]}>
            <Image source={{ uri: portrait.url }} style={styles.portraitImage} contentFit="cover" accessibilityLabel={portrait.name} />
          </Animated.View>
        ) : null}
        <Animated.View entering={FadeIn.duration(400)} accessible accessibilityLabel={`${gameStore.factionName(point.realm)} Guardian. ${guardianName(point)}`}>
          <Text style={[styles.kicker, { color: tintText }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{`${gameStore.factionName(point.realm)} Guardian`.toUpperCase()}</Text>
          <Text style={styles.guardian} numberOfLines={3} adjustsFontSizeToFit maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {guardianName(point)}
          </Text>
        </Animated.View>
      </View>
      <View style={[styles.lower, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.facts} accessible accessibilityLabel={`Difficulty ${duelDifficulty(point.tier)}. You ${me ? `level ${me.standing.level}` : "unknown level"}. Distance ${distanceText(gameStore.distanceTo(point))}.`}>
          <Fact label="DIFFICULTY" value={duelDifficulty(point.tier)} color={readableTint(color, look.surface, look.text)} />
          <View style={styles.divider} />
          <Fact label="YOU" value={me ? `Lv ${me.standing.level}` : "-"} color={look.text} />
          <View style={styles.divider} />
          <Fact label="DISTANCE" value={distanceText(gameStore.distanceTo(point))} color={look.text} />
        </View>
        <Text style={styles.blurb} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {point.extra?.holder && point.extra.holder === gameStore.get().me?.faction
            ? `Held by your faction. Beat its Guardian to defend ${point.name}.`
            : holder
              ? `${holder} holds ${point.name}. Beat its Guardian to take it for your faction.`
              : `Beat it to take ${point.name} for your faction.`}
        </Text>
        <Text style={styles.howto} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          Tap to strike · Hold to block, keep holding to charge · Flick toward to dash, away to dodge · Drag to walk
        </Text>
        {problem ? (
          <Text style={styles.problem} accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {problem}
          </Text>
        ) : null}
        {busy ? (
          <ActivityIndicator color={look.textMuted} accessibilityLabel="Finding your opponent" />
        ) : (
          <GameButton title="Fight" color={ACCENT.sun.fill} onPress={onFight} icon={<Ionicons name="flash" size={20} color={labelOn(ACCENT.sun.fill)} />} testID="duel-fight" />
        )}
      </View>
    </View>
  );
}

function Fact({ label, value, color }: { label: string; value: string; color: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel} maxFontSizeMultiplier={MAX_FONT_SCALE}>{label}</Text>
      <Text style={[styles.factValue, { color }]} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {value}
      </Text>
    </View>
  );
}

// ---------- the arena (2D) ----------
//
// The sim runs in JS at a fixed 60 Hz (DuelRunner). Each frame's drawing (the
// fighters' positions and poses, the shake) goes to Reanimated shared values,
// which move the views on the UI thread without a React render; React state
// changes only when something discrete does (health, meter, the clock's
// second, a hit flash, a floating number). It used to set state every frame
// and re-render the whole arena 60 times a second (audit B1).

type Floater = { id: number; x: number; text: string; color: string };

/** The continuous part of a fighter: written to a shared value every frame. */
type Pose = { left: number; top: number; opacity: number; rotate: number; translateY: number; scaleY: number; scaleX: number; arm: number; leg: number };

/** The discrete part of a fighter: React state, changes a few times a second at most. */
type FighterLook = {
  hpPct: number;
  hp: number;
  maxHp: number;
  meter: number;
  guardPct: number;
  glow: boolean;
  hit: boolean;
  blocking: boolean;
  cls: number;
};
type ArenaLook = { seconds: number; p1: FighterLook; p2: FighterLook; floaters: Floater[] };

const NO_POSE: Pose = { left: -200, top: 0, opacity: 1, rotate: 0, translateY: 0, scaleY: 1, scaleX: 1, arm: 20, leg: 6 };

/** The pose of the current action (FighterAction) at its normalised time. */
function poseOf(f: FighterState, x: number, now: number, toScreenX: (mm: number) => number, groundY: number): Pose {
  const A = FighterAction;
  const t = f.actionLength > 0 ? Math.min(1, f.actionTick / f.actionLength) : 0;
  const arm =
    f.action === A.Light1 || f.action === A.Light2 || f.action === A.Light3
      ? Math.sin(t * Math.PI) * 95
      : f.action === A.HeavyRelease || f.action === A.DashStrike
        ? Math.sin(t * Math.PI) * 120
        : f.action === A.Special1 || f.action === A.Special2
          ? 140 * Math.sin(t * Math.PI)
          : f.action === A.Block || f.action === A.BlockStun || f.action === A.HeavyCharge
            ? 60
            : f.action === A.Victory
              ? 150
              : 20;
  const lean =
    f.action === A.DashIn || f.action === A.DashStrike
      ? 18
      : f.action === A.HitLight || f.action === A.HitHeavy || f.action === A.GuardBreak
        ? -16
        : f.action === A.DodgeBack
          ? -22
          : f.action === A.WalkFwd
            ? 6
            : f.action === A.WalkBack
              ? -6
              : 0;
  const down = f.action === A.Knockdown ? 1 : f.action === A.GetUp ? 1 - t : 0;
  const defeated = f.action === A.Defeat;
  const bob = f.action === A.Idle ? Math.sin(now / 260) * 2 : 0;
  const walking = f.action === A.WalkFwd || f.action === A.WalkBack;
  return {
    left: toScreenX(x) - 40,
    top: groundY - FIGHTER_H + bob + (defeated ? 30 : 0),
    opacity: f.invulnerable && f.action === A.DodgeBack ? 0.55 : 1,
    rotate: down ? 80 * down : lean,
    translateY: down * 40,
    scaleY: defeated ? 0.75 : 1,
    scaleX: f.facing,
    arm: -arm,
    leg: walking ? Math.sin(now / 90) * 18 : 6,
  };
}

function lookOf(f: FighterState, glow: boolean): FighterLook {
  const A = FighterAction;
  return {
    hpPct: Math.round((f.hp / Math.max(1, f.stats.maxHp)) * 100),
    hp: f.hp,
    maxHp: f.stats.maxHp,
    meter: Math.floor(f.meter),
    guardPct: Math.round(f.guard / 5) * 5,
    glow: glow || f.action === A.HeavyCharge || (f.holding && f.chargeTicks > 0),
    hit: f.action === A.HitLight || f.action === A.HitHeavy,
    blocking: f.action === A.Block || f.action === A.BlockStun || f.holding,
    cls: f.class,
  };
}

function sameFighterLook(a: FighterLook, b: FighterLook): boolean {
  return (
    a.hpPct === b.hpPct &&
    a.hp === b.hp &&
    a.meter === b.meter &&
    a.guardPct === b.guardPct &&
    a.glow === b.glow &&
    a.hit === b.hit &&
    a.blocking === b.blocking &&
    a.cls === b.cls
  );
}

function arenaLook(runner: DuelRunner, now: number, floaters: Floater[], glowAt: [number, number]): ArenaLook {
  const st = runner.sim.state;
  return {
    seconds: Math.ceil(st.ticksLeft / 60),
    p1: lookOf(st.p1, now - glowAt[0] < 400),
    p2: lookOf(st.p2, now - glowAt[1] < 400),
    floaters,
  };
}

const FIGHTER_H = 150;

function Arena({
  point,
  start,
  countdown,
  over,
  end,
  paused,
  runnerRef,
  onOver,
  onPause,
}: {
  point: QuestPoint;
  start: DuelStart;
  countdown: number;
  /** The fight is over and being judged: no more input, no more loop. */
  over: boolean;
  end: { won: boolean; reason: string } | null;
  paused: boolean;
  /** The runner, for the screen to report a fight the player leaves. */
  runnerRef: RefObject<DuelRunner | null>;
  onOver: (start: DuelStart, runner: DuelRunner, how: "over" | "left") => void;
  onPause: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  useRenderCount("DuelArena");
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const setup = useMemo(() => setupFromServer(start.setup, start.seed_text), [start]);
  const view: DuelPresentation = useMemo(() => presentationFromServer(start.setup), [start]);
  const gestures = useMemo(() => new GestureRecognizer({ width, height }), [width, height]);
  const runner = useMemo(() => new DuelRunner(setup, { input: gestures }), [setup, gestures]);
  const live = countdown === 0 && !over;
  const halfWidth = setup.arenaHalfWidthMm;
  const groundY = height * 0.68;
  const toScreenX = useCallback((mm: number) => width / 2 + (mm / halfWidth) * (width * 0.46), [width, halfWidth]);

  // Per frame (UI thread): the two fighters' poses and the shake.
  const p1Pose = useSharedValue<Pose>(NO_POSE);
  const p2Pose = useSharedValue<Pose>(NO_POSE);
  const shake = useSharedValue(0);
  // Discrete (React): health, meter, the clock, hit flashes, floating numbers.
  const [look, setLook] = useState<ArenaLook>(() => arenaLook(runner, 0, [], [-1e9, -1e9]));

  // The fighters stand in place before the fight starts (the countdown).
  useEffect(() => {
    const st = runner.sim.state;
    p1Pose.set(poseOf(st.p1, runner.drawX(0), 0, toScreenX, groundY));
    p2Pose.set(poseOf(st.p2, runner.drawX(1), 0, toScreenX, groundY));
    setLook(arenaLook(runner, 0, [], [-1e9, -1e9]));
  }, [runner, toScreenX, groundY, p1Pose, p2Pose]);

  useEffect(() => {
    runnerRef.current = runner;
    return () => {
      if (runnerRef.current === runner) runnerRef.current = null;
    };
  }, [runner, runnerRef]);

  // The loop: real time in, fixed 60 Hz ticks out; poses to shared values every
  // frame, React state only when the discrete look changes.
  useEffect(() => {
    if (!live || paused) return;
    let floaters: (Floater & { born: number })[] = [];
    let floaterId = 0;
    const glowAt: [number, number] = [-1e9, -1e9];
    let raf = 0;
    let done = false;
    let last = performance.now();
    let shown = arenaLook(runner, last, [], glowAt);
    gestures.setEnabled(true, last);
    const shakeNow = () => {
      if (reduceMotion) return;
      shake.set(withSequence(...[6, -6, 5, -5, 3, -3, 0].map((v) => withTiming(v, { duration: 30 }))));
    };
    const onEvent = (e: DuelEvent, now: number) => {
      // DuelSFX at the sim's own moments: a hit Medium, a block Light, a heavy or a break Heavy, a special Heavy, the K.O. Success.
      playCue(cueForSimEvent(e.type, e.hitStop));
      if (e.type === DuelEventType.Hit || e.type === DuelEventType.Blocked) {
        const heavy = (e.hitStop ?? 0) > 6;
        floaters.push({
          id: ++floaterId,
          x: toScreenX(e.x ?? 0),
          text: e.type === DuelEventType.Blocked ? `${e.damage}` : `-${e.damage}`,
          color: e.type === DuelEventType.Blocked ? GP.ice : e.target === 1 ? GP.berry : GP.sun,
          born: now,
        });
        if (heavy) shakeNow();
      } else if (e.type === DuelEventType.GuardBreak) {
        floaters.push({ id: ++floaterId, x: toScreenX(e.x ?? 0), text: "BREAK!", color: GP.sun, born: now });
        shakeNow();
      } else if (e.type === DuelEventType.Telegraph) {
        glowAt[(e.source ?? 1) - 1] = now;
      } else if (e.type === DuelEventType.KO) {
        shakeNow();
      }
    };
    const loop = (now: number) => {
      gestures.poll(now);
      const r = runner.advance(now - last);
      last = now;
      for (const e of r.events) onEvent(e, now);
      const before = floaters.length;
      floaters = floaters.filter((f) => now - f.born < 900);
      const st = runner.sim.state;
      const t = reduceMotion ? 0 : now;
      p1Pose.set(poseOf(st.p1, runner.drawX(0), t, toScreenX, groundY));
      p2Pose.set(poseOf(st.p2, runner.drawX(1), t, toScreenX, groundY));
      const next = arenaLook(runner, now, floaters, glowAt);
      if (
        next.seconds !== shown.seconds ||
        r.events.length > 0 ||
        floaters.length !== before ||
        !sameFighterLook(next.p1, shown.p1) ||
        !sameFighterLook(next.p2, shown.p2)
      ) {
        shown = { ...next, floaters: floaters.map(({ id, x, text, color }) => ({ id, x, text, color })) };
        setLook(shown);
      }
      if (runner.over) {
        if (!done) {
          done = true;
          onOver(start, runner, "over");
        }
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      gestures.setEnabled(false, performance.now());
    };
  }, [live, paused, runner, gestures, start, onOver, toScreenX, groundY, reduceMotion, p1Pose, p2Pose, shake]);

  const p1Color = realmColor(view.p1Faction || gameStore.get().me?.faction);
  const p2Color = realmColor(view.p2Faction || point.realm);
  // One clock for touches and the loop's poll (a touch event's own timestamp
  // is on another clock on Android), or a still thumb never becomes a block.
  const touch = (fn: (t: number, x: number, y: number, id: number) => void) => (e: GestureResponderEvent) => {
    const t = performance.now();
    for (const p of e.nativeEvent.changedTouches) fn(t, p.pageX, p.pageY, Number(p.identifier));
  };
  const hearsTouch = live && !paused;
  const seconds = look.seconds;
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() }] }));

  return (
    <View
      style={[styles.arena, { backgroundColor: edgeOf(p2Color, 0.35) }]}
      onStartShouldSetResponder={() => hearsTouch}
      onMoveShouldSetResponder={() => hearsTouch}
      onResponderTerminationRequest={() => false}
      onResponderGrant={touch((t, x, y, id) => gestures.press(t, x, y, id))}
      onResponderMove={touch((t, x, y, id) => gestures.move(t, x, y, id))}
      onResponderRelease={touch((t, x, y, id) => gestures.release(t, x, y, id))}
      onResponderTerminate={() => gestures.cancel(performance.now())}>
      <View style={[styles.sky, { backgroundColor: edgeOf(p2Color, 0.55) }]} />
      <View style={[styles.ground, { top: groundY, backgroundColor: edgeOf(p2Color, 0.22) }]} />
      <View style={[styles.groundLine, { top: groundY }]} />

      <Animated.View style={[StyleSheet.absoluteFill, shakeStyle]} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Fighter pose={p2Pose} look={look.p2} color={p2Color} guardian />
        <Fighter pose={p1Pose} look={look.p1} color={p1Color} />
        {look.floaters.map((fl) => (
          <FloatingNumber key={fl.id} floater={fl} top={groundY - FIGHTER_H - 30} />
        ))}
      </Animated.View>

      <View style={[styles.hud, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Bars name={view.p1Name || gameStore.playerName()} level={view.p1Level} f={look.p1} color={p1Color} align="left" />
        <View style={styles.clock} accessible accessibilityLabel={`${seconds} seconds left`}>
          <Text style={styles.clockText} maxFontSizeMultiplier={1.2}>{seconds}</Text>
        </View>
        <Bars name={view.p2Name || "Guardian"} level={view.p2Level} f={look.p2} color={p2Color} align="right" />
      </View>

      <View style={[styles.specials, { bottom: insets.bottom + 18 }]}>
        <SpecialButton n={1} label="Special" ready={look.p1.meter >= 100} onPress={() => gestures.special(1)} disabled={!hearsTouch} />
        <SpecialButton n={2} label="Ultimate" ready={look.p1.meter >= 300} onPress={() => gestures.special(2)} disabled={!hearsTouch} />
      </View>
      {over || countdown > 0 ? null : <PauseButton top={insets.top + 8 + 76} onPress={onPause} />}

      {countdown > 0 ? (
        <View style={styles.center} pointerEvents="none">
          <Animated.Text key={countdown} entering={reduceMotion ? POP_FADE : POP_IN_COUNT} style={styles.countdown} importantForAccessibility="no">
            {countdown}
          </Animated.Text>
          <Text style={styles.versus} importantForAccessibility="no">
            {view.p1Name || "You"} vs {view.p2Name}
          </Text>
        </View>
      ) : null}
      {end ? (
        <View style={[styles.center, { justifyContent: "flex-start", paddingTop: height * 0.22 }]} pointerEvents="none">
          <Animated.Text entering={reduceMotion ? POP_FADE : POP_IN} style={[styles.countdown, { color: end.won ? GP.sun : "#FFF" }]} importantForAccessibility="no">
            {end.reason}
          </Animated.Text>
        </View>
      ) : null}
    </View>
  );
}

/** "-12" rising and fading over 0.9 s, animated on the UI thread. */
function FloatingNumber({ floater, top }: { floater: Floater; top: number }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const age = useSharedValue(0);
  useEffect(() => {
    // Damage shows with "reduce motion" on too (it only rises and fades).
    age.set(withTiming(1, { duration: 900, easing: Easing.linear, reduceMotion: ReduceMotion.Never }));
  }, [age]);
  const style = useAnimatedStyle(() => ({ opacity: 1 - age.get(), transform: [{ translateY: -age.get() * 50 }] }));
  return <Animated.Text style={[styles.floater, { left: floater.x - 40, top, color: floater.color }, style]}>{floater.text}</Animated.Text>;
}

function Bars({ name, level, f, color, align }: { name: string; level: number; f: FighterLook; color: string; align: "left" | "right" }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const hp = f.hpPct / 100;
  return (
    <View style={[styles.bars, { alignItems: align === "left" ? "flex-start" : "flex-end" }]} accessible accessibilityLabel={`${name}, level ${level}, ${f.hp} of ${f.maxHp} health`}>
      <Text style={styles.barName} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {name} · Lv {level}
      </Text>
      <View style={{ width: "100%", transform: [{ scaleX: align === "right" ? -1 : 1 }] }}>
        <ProgressBar value={hp} color={hp > 0.3 ? GP.mint : GP.berry} track="rgba(0,0,0,0.35)" height={14} />
      </View>
      <View style={[styles.meterRow, { flexDirection: align === "left" ? "row" : "row-reverse" }]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.meterCell}>
            <View style={{ width: `${Math.max(0, Math.min(1, (f.meter - i * 100) / 100)) * 100}%`, height: "100%", backgroundColor: color }} />
          </View>
        ))}
      </View>
      <View style={{ width: "60%", transform: [{ scaleX: align === "right" ? -1 : 1 }] }}>
        <ProgressBar value={f.guardPct / 100} color={GP.ice} track="rgba(0,0,0,0.3)" height={4} />
      </View>
    </View>
  );
}

function SpecialButton({ n, label, ready, onPress, disabled }: { n: number; label: string; ready: boolean; onPress: () => void; disabled: boolean }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.special, { backgroundColor: ready ? GP.sun : "rgba(255,255,255,0.18)" }]}
      accessibilityRole="button"
      accessibilityLabel={`${label}${ready ? ", ready" : ", charging"}`}>
      <Ionicons name={n === 1 ? "flash" : "nuclear"} size={22} color={ready ? GP.navy : "rgba(255,255,255,0.7)"} />
      <Text style={[styles.specialText, { color: ready ? GP.navy : "rgba(255,255,255,0.7)" }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * One fighter: a body, a head, a weapon arm and legs. Where it stands and its
 * pose come from a shared value (every frame, no render); its colours and
 * the shield / glow from the discrete look.
 */
function Fighter({ pose, look, color, guardian }: { pose: SharedValue<Pose>; look: FighterLook; color: string; guardian?: boolean }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const bodyStyle = useAnimatedStyle(() => {
    const p = pose.get();
    return {
      left: p.left,
      top: p.top,
      opacity: p.opacity,
      transform: [{ scaleX: p.scaleX }, { rotate: `${p.rotate}deg` }, { translateY: p.translateY }, { scaleY: p.scaleY }],
    };
  });
  const armStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${pose.get().arm}deg` }] }));
  const leg1Style = useAnimatedStyle(() => ({ transform: [{ rotate: `${pose.get().leg}deg` }] }));
  const leg2Style = useAnimatedStyle(() => ({ transform: [{ rotate: `${-pose.get().leg}deg` }] }));
  return (
    <Animated.View style={[styles.fighter, bodyStyle]}>
      {look.glow ? <View style={[styles.glow, { borderColor: guardian ? GP.berry : GP.sun }]} /> : null}
      <View style={[styles.head, { backgroundColor: look.hit ? "#FFFFFF" : color }]}>
        {guardian ? <Ionicons name="skull" size={20} color="rgba(0,0,0,0.35)" /> : <View style={styles.eye} />}
      </View>
      <View style={[styles.body, { backgroundColor: look.hit ? "#FFFFFF" : edgeOf(color, 0.85) }]} />
      <Animated.View style={[styles.arm, armStyle]}>
        <View style={[styles.forearm, { backgroundColor: edgeOf(color, 0.7) }]} />
        {look.cls === 0 ? <View style={styles.blade} /> : <View style={[styles.fist, { backgroundColor: edgeOf(color, 0.6) }]} />}
      </Animated.View>
      {look.blocking ? <View style={[styles.shield, { borderColor: look.guardPct < 30 ? GP.berry : GP.ice }]} /> : null}
      <View style={styles.legs}>
        <Animated.View style={[styles.leg, { backgroundColor: edgeOf(color, 0.55) }, leg1Style]} />
        <Animated.View style={[styles.leg, { backgroundColor: edgeOf(color, 0.55) }, leg2Style]} />
      </View>
    </Animated.View>
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
  // The Guardian's 3/4 portrait on the cream page in a ring of its rarity (card radius 20 + the ring).
  portraitCard: { alignSelf: "flex-start", padding: 4, borderRadius: 24, marginBottom: 18, ...ELEVATION.low },
  portraitImage: { width: 168, height: 168, borderRadius: 20, backgroundColor: "#F4EEE2" },
  // The standing Guardian: centred, feet on a soft rarity ellipse, a faint rarity glow behind.
  figureStage: { flex: 1, minHeight: 200, alignItems: "center", justifyContent: "flex-end", marginTop: 8, marginBottom: 14 },
  figureGlow: { position: "absolute", bottom: 24, width: 260, height: 260, borderRadius: 130, opacity: 0.9 },
  figureImage: { width: "100%", height: "100%", maxHeight: 380 },
  figureGround: { position: "absolute", bottom: 0, width: 150, height: 22, borderRadius: 75, transform: [{ scaleY: 0.6 }] },
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
  arena: { ...StyleSheet.absoluteFill, overflow: "hidden" },
  sky: { ...StyleSheet.absoluteFill, bottom: "40%" },
  ground: { position: "absolute", left: 0, right: 0, bottom: 0 },
  groundLine: { position: "absolute", left: 0, right: 0, height: 3, backgroundColor: "rgba(255,255,255,0.35)" },
  hud: { position: "absolute", left: 12, right: 12, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bars: { flex: 1, gap: 4 },
  barName: { fontFamily: GF.display, fontSize: 13, color: "#FFF" },
  meterRow: { gap: 3, width: "70%" },
  meterCell: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: "rgba(0,0,0,0.35)" },
  clock: { width: 48, height: 48, borderRadius: 24, backgroundColor: HUD_GLASS.fill, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: HUD_GLASS.border },
  clockText: { fontFamily: GF.display, fontSize: 20, color: "#FFF" },
  specials: { position: "absolute", right: 14, flexDirection: "row", gap: 10 },
  special: { width: 74, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", gap: 2 },
  specialText: { fontFamily: GF.bold, fontSize: 12, lineHeight: 15 },
  pause: { position: "absolute", right: 14, width: 40, height: 40, borderRadius: 20, backgroundColor: HUD_GLASS.fill, borderWidth: 1, borderColor: HUD_GLASS.border, alignItems: "center", justifyContent: "center" },
  stage: { ...StyleSheet.absoluteFill, backgroundColor: GP.navy },
  centerCol: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  statusText: { fontFamily: GF.display, fontSize: 20, color: "#FFF", textAlign: "center" },
  judging: { alignItems: "center", gap: 12, padding: 24, borderRadius: RADIUS.card, backgroundColor: HUD_GLASS.fill, borderWidth: 1, borderColor: HUD_GLASS.border },
  failed: { fontFamily: GF.display, fontSize: 22, color: "#FFF", textAlign: "center" },
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  countdown: { fontFamily: GF.display, fontSize: 84, color: "#FFF", textShadowColor: "rgba(0,0,0,0.4)", textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 0.1 },
  versus: { fontFamily: GF.display, fontSize: 20, color: "#FFF" },
  floater: { position: "absolute", width: 80, textAlign: "center", fontFamily: GF.display, fontSize: 22 },
  fighter: { position: "absolute", width: 80, height: FIGHTER_H, alignItems: "center" },
  glow: { position: "absolute", top: -10, left: -6, width: 92, height: FIGHTER_H + 16, borderRadius: 46, borderWidth: 4, opacity: 0.8 },
  head: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(0,0,0,0.25)" },
  eye: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#FFF", marginLeft: 14 },
  body: { width: 44, height: 58, borderRadius: 16, marginTop: 2 },
  arm: { position: "absolute", top: 50, left: 40, width: 70, height: 12, transformOrigin: "0% 50%", flexDirection: "row", alignItems: "center" },
  forearm: { width: 30, height: 10, borderRadius: 5 },
  blade: { width: 44, height: 5, borderRadius: 2, backgroundColor: "#E8EEF2" },
  fist: { width: 16, height: 16, borderRadius: 8 },
  shield: { position: "absolute", top: 20, left: 54, width: 26, height: 84, borderRadius: 14, borderWidth: 5, borderLeftWidth: 0 },
  legs: { flexDirection: "row", gap: 6, marginTop: 0 },
  leg: { width: 14, height: 42, borderRadius: 7, transformOrigin: "50% 0%" },
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
