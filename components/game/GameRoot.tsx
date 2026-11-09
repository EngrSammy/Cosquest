// The React Native game (gameUi: 'rn'): page 1 of the world on Android, and
// on iOS behind the flag. The home map with its HUD, the point sheet, and
// the screens a point opens (a quiz, a Guardian Duel, the reward), plus the
// journal (dailies, codex, faction war) and first-time onboarding.
// costquest-ios Roam/RoamHomeView.swift is the reference for the loop.
import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, useReducedMotion, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getPref, setPref } from "@/utils/prefsStorage";
import { COACH_DONE_KEY, coachStepFor, type CoachStep, parseIdList, starterKindOf, UNLOCKS_INTRODUCED_KEY, unlockOfStep } from "@/features/game/coach";
import { bearingDeg, distanceM, distanceText } from "@/features/game/geo";
import { hasTrials, type TrialRequest, trialPoint } from "@/features/game/duelFlow";
import { suggestedId } from "@/features/game/guide";
import { progressionAllowed, progressionOn } from "@/features/game/progression";
import { isLive, isPocket, type RunPoint, runOn, runPointOf, runQuestPoints, TRIVIA_DOOR } from "@/features/game/run";
import { gameStore, GAME_SERVER, GAME_SERVER_IS_PRODUCTION, useGame, useLocationPermission, startLocation } from "@/features/game/runtime";
import { useSquad } from "@/features/game/squadRuntime";
import { nearestFirst } from "@/features/game/store";
import { useRoomBeacons, useRooms } from "@/features/game/roomsRuntime";
import { isSiege } from "@/features/game/siege";
import { noteStepsOnPhone } from "@/features/game/stepsDevice";
import { unlocked, visiblePoints } from "@/features/game/unlocks";
import { arriveMoment, legendMoment, nudgeMoment, siteArriveMoment } from "@/features/game/warden";
import { siteArriveLine, siteAttribution, siteIdOf, siteLegend } from "@/features/game/wardenSite";
import { siteFacts } from "./wardenSites";
import { freshLoss, holdsLostOf, type QuestPoint, spinBanner } from "@/features/game/wire";
import { factionVeilColor, world } from "@/features/world/worldState";
import { resultShareText } from "@/features/world/gameInvite";
import { CostQuestShrineView, openVenueEvents, venueEventsAvailable } from "@/modules/costquest-game/src";
import { emitGameEvent } from "@/modules/costquest-game/src/rnGame";
import { useAppSelector } from "@/store/hooks";

import AskWarden from "./AskWarden";
import { GameBannerHost, showBanner } from "./Banner";
import CoachOverlay from "./Coach";
import CoinsSheet from "./CoinsSheet";
import DuelScreen from "./DuelScreen";
import { Fight3DHost } from "./Fight3D";
import Encounter, { encounterGuard } from "./Encounter";
import FriendsButton from "./FriendsButton";
import { AvatarBadge, AvatarFigure, useHasAvatarFigure, usePinPortraits, ForgeClaim, ForgeDropsLayer, useForgeOn, useForgeWorldPolling, useHasForgeAvatar } from "./ForgeWorld";
import { GAME_FONTS } from "./fonts";
import FriendsSheet from "./FriendsSheet";
import SquadSheet from "./SquadSheet";
import { Rail, StagingBadge, TopBar, WardenBubble } from "./Hud";
import { NearbyTray } from "./NearbyTray";
import Journal from "./Journal";
import { GameButton } from "./kit";
import { GameSchemeProvider } from "./look";
import LiveBanner from "./LiveBanner";
import LiveCalendarSheet from "./LiveCalendarSheet";
import MoreSheet, { type MoreTile } from "./MoreSheet";
import ProgressionSheet from "./ProgressionSheet";
import NearbyRadar from "./NearbyRadar";
import Onboarding from "./Onboarding";
import PointSheet from "./PointSheet";
import { AR_SHRINE_DEV } from "./prefs";
import ProfileSheet from "./ProfileSheet";
import RaidBanner from "./RaidBanner";
import RecapSheet from "./RecapSheet";
import { QuestRunButton, RunChallenge, runDistance, RunHUD, runInReach, RunResults, RunStartSheet, RunTray } from "./Run";
import { runModel, useRun } from "./runModel";
import { startLiveTimers } from "./liveTimers";
import RoomScreen from "./RoomScreen";
import RoomSheet from "./RoomSheet";
import RelicsButton from "./RelicsButton";
import CollectionSheet from "./CollectionSheet";
import Reward, { type RewardSummary } from "./Reward";
import TrialsSheet from "./TrialsSheet";
import { GF, GP, realmColor } from "./theme";
import { useOnScreen } from "./useOnScreen";
import { useWardenSaid, wardenVoice } from "./wardenVoice";
import WorldMap, { BackToMe } from "./WorldMap";
import { CompassButton } from "./CompassButton";
import { useHeadingUp } from "./useHeadingUp";
import { useRenderCount } from "@/utils/perfMarks";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";
import { type CollectionOpener, type CollectionTab, collectionOpen, collectionTabFor, collectionTabs } from "@/features/game/collection";
import type { ForgeDrop } from "@/features/game/forgeWorld";
import { type Fight3DRun, rewardFrom3D } from "@/features/game3d/fight3d";
import { FIGHT3D, fight3dAvailable, ROOMS_ON } from "@/features/game3d/flags";
import { takeFight3DRequest, useFight3DRequestSerial } from "@/features/game3d/request";

type Screen =
  | { kind: "home" }
  | { kind: "encounter"; point: QuestPoint }
  | { kind: "duel"; point: QuestPoint; mode: "point" | "raid" | "siege" | "trial"; trial?: TrialRequest }
  | { kind: "room"; gameId: string }
  /** The 3D fight's test run (cq 061: the dev link, EXPO_PUBLIC_GAME3D_AUTOSTART). Real fights open in DuelScreen. */
  | { kind: "fight3d"; point: null; run: Fight3DRun }
  | { kind: "reward"; reward: RewardSummary };

/** What is open over the map (one at a time, closed by Android Back). */
type Sheet = "dailies" | "codex" | "war" | "more" | "events" | "friends" | "squad" | "collection" | "battle" | "profile" | "coins" | "recap" | "ask" | "trials" | "runStart" | "ranks";

const NUDGE_EVERY_MS = 150000;
const LOSS_SEEN_KEY = "cq.holdsLost.seen";
/** The first nudge waits for the map to settle (RoamHomeView.nudgeLoop: 25 s). */
const FIRST_NUDGE_MS = 25000;
/** A nudge is put away after 12 s if nothing else has spoken since. */
const NUDGE_SHOWN_MS = 12000;


/** EXPO_PUBLIC_PROGRESSION=0 hides Ranks whatever the server says (inlined by Metro). */
const PROGRESSION_ALLOWED = progressionAllowed(process.env.EXPO_PUBLIC_PROGRESSION);

/** The map's ground tiles, from the game server (WorldMap GroundTiles). */
const loadGround = (lat: number, lng: number, radiusM: number) => gameStore.client.ground(lat, lng, radiusM);

/** The game, drawn light over the day map and dark over the dusk map (look.ts). */
export default function GameRoot(props: { parked: boolean }) {
  return (
    <GameSchemeProvider>
      <GameRootInner {...props} />
    </GameSchemeProvider>
  );
}

function GameRootInner({ parked }: { parked: boolean }) {
  const styles = useThemedStyles(STYLE_PAIR);
  useRenderCount("GameRoot");
  const insets = useSafeAreaInsets();
  // The game's own type (Lilita One, Fredoka); bundled, so this is one frame or two.
  const [fontsReady, fontsError] = useFonts(GAME_FONTS);
  // One selector per field, so a change elsewhere in the store (the war, the
  // leaders) does not re-render the map (audit B8).
  const session = useGame((s) => s.session);
  const allPoints = useGame((s) => s.points);
  const me = useGame((s) => s.me);
  const fix = useGame((s) => s.fix);
  const focus = useGame((s) => s.focus);
  const profile = useGame((s) => s.profile);
  const codex = useGame((s) => s.codex);
  const ground = useGame((s) => s.ground);
  const centre = useGame((s) => s.centre);
  const problem = useGame((s) => s.problem);
  const permission = useLocationPermission();
  const said = useWardenSaid();
  const chatName = useAppSelector((s) => s.auth.user?.profile?.username || s.auth.user?.profile?.firstName || "");
  const chatFaction = useAppSelector((s) => s.auth.user?.faction ?? null);
  const [screen, setScreen] = useState<Screen>({ kind: "home" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The Quest Run: while one is live the map shows its points and the tray is the route.
  const runState = useRun();
  const runLive = isLive(runState.run);
  const pocketRun = runLive && !!runState.run && isPocket(runState.run);
  const [runPoint, setRunPoint] = useState<RunPoint | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  // Squad up in person: a squad link (cosquest://squad/<code>) opens the sheet, which joins it.
  const squad = useSquad();
  useEffect(() => {
    if (squad.pendingCode) setSheet("squad");
  }, [squad.pendingCode]);
  const [bagCount, setBagCount] = useState<number | null>(null);
  // Forge in the world (cq 056): finds on the map, the bag, the avatar. Off unless the server says so.
  useForgeWorldPolling(!parked && !!session);
  const forgeOn = useForgeOn();
  const forgeAvatar = useHasForgeAvatar();
  const forgeFigure = useHasAvatarFigure();
  const pinPortrait = usePinPortraits();
  const [forgeDrop, setForgeDrop] = useState<ForgeDrop | null>(null);
  // Relics and the Forge share one sheet, the Collection (features/game/collection.ts routes each opener to its tab).
  const [collectionTab, setCollectionTab] = useState<CollectionTab>("relics");
  const collectionAccess = { relicsOn: unlocked(me, "relics"), forgeOn };
  const openCollection = (opener: CollectionOpener) => {
    const tab = collectionTabFor(opener, collectionAccess);
    if (!tab) return;
    setCollectionTab(tab);
    setSheet("collection");
  };
  const onScreen = useOnScreen();
  /** A Room beacon tapped on the map: the Battle sheet opens on that room. */
  const [roomFocus, setRoomFocus] = useState<string | null>(null);
  // The rail's Centre on me and the map's "Back to me" fly the map's camera home.
  const [recentreTick, recentre] = useState(0);
  const [mapFollowing, setMapFollowing] = useState(true);
  const [onboarding, setOnboarding] = useState(false);
  const needsOnboarding = !!session && gameStore.needsOnboarding;
  if (needsOnboarding && !onboarding) setOnboarding(true);
  const [legendOf, setLegendOf] = useState<{ id: string; text: string; credit?: string | null } | null>(null);
  const greeted = useRef(new Set<string>());
  // What the coach has said (cq.coach.done, cq.unlocks.introduced), read once.
  const [coachDone, setCoachDone] = useState<Set<string> | null>(null);
  const [introduced, setIntroduced] = useState<Set<string>>(() => new Set());
  // Losses already told (cq.holdsLost.seen), read once.
  const lossSeen = useRef<Set<string> | null>(null);
  const [lossLoaded, setLossLoaded] = useState(false);

  // Bosses wait for level 5 (RoamGuide.swift visiblePoints).
  const points = useMemo(() => visiblePoints(allPoints, me), [allPoints, me]);
  const color = factionVeilColor(me?.faction, chatFaction);
  const ctx = useCallback(() => ({ me: gameStore.get().me, playerName: gameStore.playerName() }), []);
  // Computed from the points and the fix themselves: the React Compiler
  // memoises on what the callback reads, so reading the store here would
  // freeze the list at its first (empty) value.
  const nearby = useMemo(() => nearestFirst(points, fix), [points, fix]);
  // Rooms (the 2D overhead shooter) is hidden until a 3D Rooms exists (battle-3d-only, 1 Nov 2026):
  // no tile, no beacons, no coach unlock. EXPO_PUBLIC_ROOMS=1 brings it back; the code stays.
  const battleOpen = ROOMS_ON && unlocked(me, "battle");
  const rooms = useRooms();
  useRoomBeacons(!parked && battleOpen && screen.kind !== "room");
  const openBattle = (focus: string | null) => {
    // A point sheet left open under the Room would take its first Back.
    setSelectedId(null);
    gameStore.setFocus(null);
    setRoomFocus(focus);
    setSheet("battle");
  };
  // An invite or a link asked for a spot: it is selected once its point is here.
  // Any invite target (shrine, duel or raid) is a point id, as on iOS
  // (GameHostOpenHook.resolve): open that point's sheet once it is loaded.
  const focusId = focus ? focus.pointId ?? focus.duelId ?? focus.raidId ?? null : null;
  const focusPoint = focusId ? points.find((p) => p.id === focusId) ?? null : null;
  // A new link or invite wins over a point tapped earlier: the tapped one
  // used to stay selected and its sheet showed instead of the linked point.
  useEffect(() => {
    if (focusId) setSelectedId(null);
  }, [focusId]);
  const selected = points.find((p) => p.id === selectedId) ?? (screen.kind === "home" ? focusPoint : null);
  const closeSheet = () => {
    setSelectedId(null);
    gameStore.setFocus(null);
  };

  // The compass, only while the tray is up (the arrows on its cards).
  // The map's turn and whether a finger is moving it, shared with the Nearby
  // tray on the UI thread; and where the tray last asked the map to fly.
  const mapRot = useSharedValue(0);
  const mapBusy = useSharedValue(false);
  // Heading up (the rail's compass): the map turns as the phone turns, only while the map is in front.
  const reduceMotion = useReducedMotion();
  const headingUp = useHeadingUp(mapRot, !parked && onScreen && screen.kind === "home" && fix !== null, reduceMotion);
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; n: number } | null>(null);
  const suggested = useMemo(
    () => suggestedId({ points, me, distanceOf: (p) => (fix ? distanceM(fix, p) : null) }),
    [points, me, fix],
  );

  useEffect(() => {
    let alive = true;
    void Promise.all([getPref(COACH_DONE_KEY), getPref(UNLOCKS_INTRODUCED_KEY), getPref(LOSS_SEEN_KEY)]).then(([done, intro, lostSeen]) => {
      if (!alive) return;
      lossSeen.current = new Set(parseIdList(lostSeen));
      setLossLoaded(true);
      setCoachDone(new Set(parseIdList(done)));
      setIntroduced(new Set(parseIdList(intro)));
    });
    return () => {
      alive = false;
    };
  }, []);

  // One unlock introduction per return to the map: a first quiz can pay two or
  // three levels at once, and the Warden then queued Codex, Relics, walking and
  // friends back to back, a wall of tutorials between the player and the map.
  // The next one waits until the player has played something else.
  const [unlockTurn, setUnlockTurn] = useState(true);
  const wasHome = useRef(true);
  useEffect(() => {
    const home = screen.kind === "home";
    if (home && !wasHome.current) setUnlockTurn(true);
    wasHome.current = home;
  }, [screen.kind]);

  // What the Warden has to show next. Nothing while a card, a sheet or a
  // challenge is up: one voice at a time (RoamHomeView.coachStep).
  const nextCoach: CoachStep | null =
    coachDone && !parked && screen.kind === "home" && !selected && sheet === null && fix && !runLive && !runPoint
      ? coachStepFor({
          me,
          playerName: gameStore.playerName(),
          hasStarter: points.some((p) => p.source === "starter"),
          starterKind: starterKindOf(points.find((p) => p.source === "starter"), me),
          hasSiege: points.some((p) => isSiege(p, me)),
          done: coachDone,
          // Rooms hidden: its unlock is never announced.
          introduced: ROOMS_ON ? introduced : new Set([...introduced, "battle"]),
        })
      : null;
  const coachStep: CoachStep | null = nextCoach && unlockOfStep(nextCoach.id) && !unlockTurn ? null : nextCoach;
  const markCoach = (step: CoachStep) => {
    const u = unlockOfStep(step.id);
    if (u) {
      setUnlockTurn(false);
      const next = new Set(introduced).add(u);
      setIntroduced(next);
      void setPref(UNLOCKS_INTRODUCED_KEY, JSON.stringify([...next]));
    }
    const done = new Set(coachDone ?? []).add(step.id);
    setCoachDone(done);
    void setPref(COACH_DONE_KEY, JSON.stringify([...done]));
  };
  const coachAct = (step: CoachStep) => {
    if (step.id === "first-shrine") {
      const starter = points.find((p) => p.source === "starter");
      if (starter) setSelectedId(starter.id);
      return;
    }
    markCoach(step);
    const u = unlockOfStep(step.id);
    if (u === "war") setSheet("war");
    else if (u === "relics") openCollection("coach-relics");
    else if (u === "battle") openBattle(null);
  };

  // The Warden greets a point the first time it comes into reach (and starts
  // writing the greeting while the player walks up, when the model is on).
  useEffect(() => {
    if (__DEV__ || process.env.EXPO_PUBLIC_WORLD_TIMING === "1") {
      console.log(`[warden] effect: parked=${parked} screen=${screen.kind} faction=${me?.faction ?? "-"} points=${nearby.length}`);
    }
    if (parked || screen.kind !== "home" || !me?.faction) return;
    const approaching = nearby.find((x) => !gameStore.isCooling(x) && (gameStore.distanceTo(x) ?? 1e9) < gameStore.reach() + 60);
    if (approaching) wardenVoice.prepare(arriveMoment(ctx(), approaching));
    const p = nearby.find((x) => gameStore.inReach(x) && !gameStore.isCooling(x));
    if (__DEV__ || process.env.EXPO_PUBLIC_WORLD_TIMING === "1") {
      console.log(`[warden] check: ${nearby.length} nearby, in reach ${p ? p.name : "none"}${p && greeted.current.has(p.id) ? " (greeted)" : ""}`);
    }
    if (p && !greeted.current.has(p.id)) {
      greeted.current.add(p.id);
      // At a Game Warden site the welcome is the site's own line, from its checked facts.
      if (siteIdOf(p)) {
        void siteFacts(p).then((f) => {
          const line = siteArriveLine(f);
          wardenVoice.speak(line ? siteArriveMoment(ctx(), p, line) : arriveMoment(ctx(), p)).catch(() => {});
        });
      } else wardenVoice.speak(arriveMoment(ctx(), p)).catch(() => {});
    }
  }, [nearby, parked, screen.kind, me?.faction, ctx]);

  // The legend is written while they read the card (RoamHomeView .onChange(of: selected)).
  const selectedKey = selected?.id ?? null;
  useEffect(() => {
    if (!selected) return;
    let alive = true;
    const id = selected.id;
    // A Game Warden site's card tells its checked facts (and credits them), never invented lore.
    if (siteIdOf(selected)) {
      void siteFacts(selected).then((f) => {
        if (alive) setLegendOf({ id, text: siteLegend(f) ?? "", credit: siteAttribution(f) });
      });
      return () => {
        alive = false;
      };
    }
    void wardenVoice.line(legendMoment(ctx(), selected), 8000).then((text) => {
      if (alive) setLegendOf({ id, text });
    });
    return () => {
      alive = false;
    };
  }, [selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // A rival took back a point this player had taken: say so once, with the way to answer it.
  const lossesKey = holdsLostOf(me)
    .map((l) => l.point_id + (l.at ?? ""))
    .join("|");
  useEffect(() => {
    const seen = lossSeen.current;
    const lost = seen ? freshLoss(holdsLostOf(gameStore.get().me), seen) : null;
    if (!seen || !lost) return;
    seen.add(lost.point_id + (lost.at ?? ""));
    void setPref(LOSS_SEEN_KEY, JSON.stringify([...seen]));
    const by = lost.by_faction_name ?? gameStore.factionName(lost.by_faction ?? "");
    showBanner(`${by} took it back`, { subtitle: `${lost.point_name ?? "Your point"}: go take it back`, color: realmColor(lost.by_faction), sound: "hit" });
  }, [lossesKey, lossLoaded]);

  // A quiet step-counter reading each time the game comes to the front (no
  // prompt, no network), so the week's walking is split between weeks well.
  useEffect(() => {
    if (!parked) void noteStepsOnPhone();
  }, [parked]);

  // Cooldowns run out and the war moves while the phone sits still: a map
  // that only updates on a step goes stale on a bench (every 60 s).
  useEffect(() => {
    if (parked) return;
    const t = setInterval(() => void gameStore.refreshPoints(true), 60000);
    return () => clearInterval(t);
  }, [parked]);

  // Now and then, the best next move: shown, and put away after 12 s.
  const quietNudge = !parked && screen.kind === "home" && !selected && !coachStep && !runLive && me?.tutorial_done === true;

  // The run as the server has it: on the way in, and back from the background
  // (it may have ended, or a lost one be found again).
  const sessionKey = session?.playerKey ?? null;
  // The run and raid clocks on the lock screen / Dynamic Island (liveTimers.ts). Once; app-wide.
  useEffect(() => startLiveTimers(), []);
  useEffect(() => {
    if (!sessionKey || parked) return;
    void runModel.resume();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void runModel.resume();
    });
    return () => sub.remove();
  }, [sessionKey, parked]);
  useEffect(() => {
    if (!quietNudge) return;
    let hide: ReturnType<typeof setTimeout> | null = null;
    const nudge = () => {
      if (wardenVoice.get()) return;
      const s = gameStore.get();
      const m = nudgeMoment(ctx(), s.fix, s.points, gameStore.reach(), s.war);
      if (!m) return;
      wardenVoice
        .speak(m, NUDGE_SHOWN_MS)
        .then(() => {
          hide = setTimeout(() => {
            if (wardenVoice.get()?.moment === "nudge") wardenVoice.quiet();
          }, NUDGE_SHOWN_MS);
        })
        .catch(() => {});
    };
    const first = setTimeout(nudge, FIRST_NUDGE_MS);
    const t = setInterval(nudge, NUDGE_EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      if (hide) clearTimeout(hide);
    };
  }, [quietNudge, ctx]);

  // Android Back inside the game: close what is open first; on the map, the
  // pager's own handler takes it (back to the chat).
  useEffect(() => {
    // Only while the game is the page showing: the game stays mounted (warm)
    // behind the chat, and Back there is the chat's. RoomScreen takes Back
    // itself (it asks before leaving a fight); a sheet's own card or editor
    // takes it before this (the last handler added runs first).
    if (parked || !onScreen || screen.kind === "room" || screen.kind === "fight3d") return;
    const open = screen.kind !== "home" || sheet !== null || selected !== null || runPoint !== null || runState.finished !== null || forgeDrop !== null;
    if (!open) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (forgeDrop) setForgeDrop(null);
      else if (runPoint) setRunPoint(null);
      else if (runState.finished) runModel.close();
      else if (sheet) setSheet(null);
      // A challenge in progress asks before it is left.
      else if (screen.kind === "encounter" && encounterGuard.current) return encounterGuard.current();
      else if (screen.kind !== "home") setScreen({ kind: "home" });
      else closeSheet();
      return true;
    });
    return () => sub.remove();
  }, [parked, onScreen, screen.kind, sheet, selectedId, runPoint, runState.finished, forgeDrop]); // eslint-disable-line react-hooks/exhaustive-deps

  // A full-screen game screen (not the map): the Chats bubble tucks in so it
  // does not cover answers, titles or rewards (F-38, features/world/bubbleZone.ts).
  // The 3D sheets count too: the Forge bag, the game profile and a claim.
  const fullScreen = gameStore.needsOnboarding || onboarding || screen.kind !== "home" || runPoint !== null || runState.finished !== null
    || sheet === "collection" || sheet === "profile" || forgeDrop !== null;
  useEffect(() => {
    world.setGameFocus(fullScreen);
  }, [fullScreen]);
  useEffect(() => () => world.setGameFocus(false), []);

  const home = () => {
    setSelectedId(null);
    setScreen({ kind: "home" });
  };

  // The 3D fight's test run (cq 061): test builds may open it as soon as the game is up
  // (EXPO_PUBLIC_GAME3D_AUTOSTART=<mode>, with EXPO_PUBLIC_GAME3D_CYCLE=N for the leak test), or the
  // dev link. Every real fight opens in DuelScreen, judged by the server.
  const fight3d = (point: null, run?: Partial<Fight3DRun>) =>
    setScreen({
      kind: "fight3d",
      point,
      run: { mode: "full", cycle: 0, cycleMs: FIGHT3D.cycleMs, autoplay: FIGHT3D.autoplay, ...run },
    });
  const autostarted = useRef(false);
  const autostartReady = !!session && (fontsReady || !!fontsError) && !gameStore.needsOnboarding && !onboarding && screen.kind === "home";
  useEffect(() => {
    if (!autostartReady || autostarted.current || !FIGHT3D.autostart || !fight3dAvailable()) return;
    autostarted.current = true;
    fight3d(null, { mode: FIGHT3D.autostart, cycle: FIGHT3D.cycle, autoplay: FIGHT3D.autoplay || FIGHT3D.cycle > 0 });
  }, [autostartReady]);
  // The test link (cosquest://fight3d?..., app/fight3d.tsx): opened once the game is up.
  const fight3dAsked = useFight3DRequestSerial();
  useEffect(() => {
    if (!autostartReady || !fight3dAsked) return;
    const run = takeFight3DRequest();
    if (run && fight3dAvailable()) fight3d(null, run);
  }, [autostartReady, fight3dAsked]);

  const play = (p: QuestPoint) => {
    setSelectedId(null);
    gameStore.setFocus(null);
    // battle-3d-only: every fight is the 3D fight (DuelScreen opens it directly). A boss is always
    // fought (Boss Trivia is retired), and so is a rival's hold (the quiz Siege is retired). A Quest
    // Point that plays as a quiz stays a quiz: a challenge, not a battle.
    if (p.source === "raid") setScreen({ kind: "duel", point: p, mode: "raid" });
    else if (isSiege(p, me)) setScreen({ kind: "duel", point: p, mode: "siege" });
    else setScreen(gameStore.playsAsDuel(p) ? { kind: "duel", point: p, mode: "point" } : { kind: "encounter", point: p });
  };

  // Spin: the one-second verb. Items fly into the bag (RoamHomeView.spin).
  const spin = async (p: QuestPoint) => {
    try {
      const r = await gameStore.spin(p);
      const b = spinBanner(r);
      showBanner(b.title, { subtitle: b.subtitle, color: GP.sky, sound: "coin" });
    } catch (e) {
      showBanner("Can't spin", { subtitle: e instanceof Error ? e.message : null, color: GP.berry, sound: "hit" });
    }
  };

  const share = (p: QuestPoint) => {
    emitGameEvent("onShareToChat", {
      type: p.source === "raid" ? "raid" : gameStore.playsAsDuel(p) ? "duel" : "shrine",
      targetId: p.id,
      place: p.name,
      lat: p.lat,
      lng: p.lng,
    });
  };

  // Stable across GPS fixes, so the memoised pins skip those renders (audit B8).
  const run = runState.run;
  const onSelectPoint = useCallback(
    (p: QuestPoint) => {
      const rp = runPointOf(run, p.id);
      if (rp) {
        if (!rp.done) setRunPoint(rp);
        return;
      }
      if (!runLive) setSelectedId(p.id);
    },
    [run, runLive],
  );

  if (!session || (!fontsReady && !fontsError)) {
    return <View style={styles.root} />;
  }
  // Opened by the server's answer and closed only by onboarding itself:
  // choosing a house clears needsOnboarding halfway through, and following it
  // would close the welcome before the gift and the location question.
  if (gameStore.needsOnboarding || onboarding) {
    // Not while parked: the game is warmed up behind the chat at sign-in, and
    // the Warden would talk (and the narrative beats move on by themselves)
    // over the chat app. The first run starts when the player swipes in.
    if (parked) return <View style={styles.root} />;
    return <Onboarding suggestedName={chatName} onDone={() => setOnboarding(false)} />;
  }

  const dailiesLeft = me?.dailies.filter((d) => !d.done).length ?? 0;
  const codexOpen = unlocked(me, "codex");
  const codexCount = codex?.counts.total ?? null;
  // The rest of the game, under More (RoamHomeView.swift moreTiles), as levels unlock it.
  const moreTiles: MoreTile[] = [];
  if (unlocked(me, "war")) {
    moreTiles.push({ id: "war", icon: "flag", color, title: "Faction war", onPress: () => setSheet("war") });
  }
  const trialsOn = hasTrials(me);
  if (battleOpen) {
    moreTiles.push({ id: "battle", icon: "people-circle", color: GP.berry, title: "Rooms", badge: rooms.nearby.length || null, onPress: () => openBattle(null) });
  }
  if (trialsOn && codexOpen) {
    moreTiles.push({ id: "codex", icon: "albums", color: GP.sun, title: "Codex", badge: codexCount || null, onPress: () => setSheet("codex") });
  }
  if (unlocked(me, "friends")) {
    moreTiles.push({
      id: "friends",
      icon: "people",
      color: GP.berry,
      title: "Friends",
      onPress: () => setSheet("friends"),
      custom: (press) => <FriendsButton size={58} onPress={press} />,
    });
    moreTiles.push({
      id: "squad",
      icon: "people-circle",
      color: GP.mint,
      title: squad.squad ? `Squad: ${squad.squad.ally.handle}` : "Squad up",
      badge: squad.squad ? 1 : null,
      onPress: () => setSheet("squad"),
    });
  }
  // The Build Brief's ranks, tests and weapon ladder: only when the server has `progression` on
  // (and this build has not turned it off with EXPO_PUBLIC_PROGRESSION=0).
  if (PROGRESSION_ALLOWED && progressionOn(me)) {
    moreTiles.push({ id: "ranks", icon: "ribbon", color: GP.sunDeep, title: "Ranks", onPress: () => setSheet("ranks") });
  }
  // What is in the bag, as a number only (RoamHomeView moreTiles "bag": not a button).
  if (bagCount && bagCount > 0) {
    moreTiles.push({ id: "bag", icon: "bag-handle", color: GP.sky, title: "Bag", badge: bagCount });
  }
  moreTiles.push({ id: "live", icon: "calendar", color: GP.navy, title: "Quest Hours", onPress: () => setSheet("events") });
  // The paid venue games in AR stay native on iOS (VenueEventsIsland.swift).
  if (venueEventsAvailable) {
    moreTiles.push({ id: "events", icon: "ticket", color: GP.navy, title: "Events", onPress: () => void openVenueEvents({ handle: gameStore.playerName() }) });
  }
  if (me?.tutorial_done) moreTiles.push({ id: "recap", icon: "book", color: GP.skyDeep, title: "Your day", onPress: () => setSheet("recap") });
  // Always there, so More is never a sheet with one button in it.
  moreTiles.push({ id: "warden", icon: "chatbubble-ellipses", color, title: "Ask the Warden", onPress: () => setSheet("ask") });
  moreTiles.push({ id: "profile", icon: "person-circle", color: GP.skyDeep, title: "Profile", onPress: () => setSheet("profile") });
  // Test builds only (AR_SHRINE_DEV): the AR shrine on its own, to prove the iOS AR island on a phone.
  if (AR_SHRINE_DEV && CostQuestShrineView) {
    moreTiles.push({ id: "ar-shrine", icon: "camera", color: GP.berry, title: "AR shrine", onPress: () => router.push("/dev/ar-shrine") });
  }
  const focusAway = focus && !focusId && focus.lat !== undefined && focus.lng !== undefined ? focus : null;
  const focusMissing = focus && focusId && !focusPoint ? focus : null;
  // The pocket board is full width; the rail would sit on its tiles.
  const showsRail = fix !== null && !selected && screen.kind === "home" && !pocketRun;
  const showBubble = said !== null && !coachStep && screen.kind === "home";

  return (
    <View style={styles.root}>
      <WorldMap
        ground={ground}
        centre={centre}
        fix={fix}
        points={runLive ? runQuestPoints(runState.run) : points}
        reachM={gameStore.reach()}
        selectedId={selected?.id ?? null}
        inReach={gameStore.inReach}
        cooling={gameStore.isCooling}
        factionColor={color}
        onSelect={onSelectPoint}
        rooms={battleOpen && screen.kind === "home" && !runLive ? rooms.nearby : []}
        onRoom={(r) => openBattle(r.game_id)}
        overlay={forgeOn && screen.kind === "home" && !runLive ? (place) => <ForgeDropsLayer place={place} onOpen={setForgeDrop} /> : undefined}
        playerBadge={forgeAvatar ? <AvatarBadge size={34} /> : undefined}
        playerFigure={forgeFigure ? <AvatarFigure /> : undefined}
        pinPortrait={pinPortrait}
        recentreSignal={recentreTick}
        onFollowChange={setMapFollowing}
        loadGround={loadGround}
        camRot={mapRot}
        mapBusy={mapBusy}
        flyTo={flyTo}
        headingUp={headingUp.mode === "heading"}
        onTwist={headingUp.twisted}
      />

      <TopBar me={me} profile={profile} name={gameStore.playerName()} color={color} onProfile={() => setSheet("profile")} onCoins={() => setSheet("coins")} onAskWarden={() => setSheet("ask")} />
      {!GAME_SERVER_IS_PRODUCTION ? <StagingBadge label={GAME_SERVER.includes("staging") ? "STAGING" : "TEST SERVER"} /> : null}
      {showsRail ? (
        <Rail
          dailiesLeft={dailiesLeft}
          codexCount={codexCount}
          showCodex={codexOpen}
          relics={collectionOpen(collectionAccess) ? <RelicsButton relicsOn={collectionAccess.relicsOn} onPress={() => openCollection("rail")} /> : undefined}
          onDailies={() => setSheet("dailies")}
          onCodex={() => setSheet("codex")}
          onTrials={trialsOn ? () => setSheet("trials") : undefined}
          onMore={() => {
            setSheet("more");
            // The Bag tile's count, fresh each time More opens (RoamStore.bag).
            gameStore.client
              .bag()
              .then((b) => setBagCount(Object.values(b.bag).reduce((n, v) => n + (v > 0 ? v : 0), 0)))
              .catch(() => {});
          }}
          compass={headingUp.available ? <CompassButton rot={mapRot} mode={headingUp.mode} calibrate={headingUp.calibrate} onPress={headingUp.toggle} /> : undefined}
          onRecentre={() => {
            recentre((n) => n + 1);
            void gameStore.refreshPoints(true);
          }}
        />
      ) : null}

      {/* Under the top bar, left of the rail: one column, as iOS's worldBanners. */}
      <View style={[styles.banners, { top: insets.top + 72, right: showsRail ? 84 : 14 }]} pointerEvents="box-none">
        {runLive ? <RunHUD /> : null}
        {permission === "denied" ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{"Location is off, so Quest Points can't find you. Turn it on in Settings to play, or play trivia, which needs no location."}</Text>
            <GameButton title="Try again" small color={GP.skyDeep} onPress={() => startLocation(true)} />
            {TRIVIA_DOOR && !runLive ? <GameButton title="Play trivia" small color={GP.sun} onPress={() => router.push("/trivia")} testID="game-trivia" /> : null}
          </View>
        ) : !fix ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>Finding you…</Text>
            {TRIVIA_DOOR && !runLive ? <GameButton title="Play trivia meanwhile" small color={GP.sun} onPress={() => router.push("/trivia")} testID="game-trivia" /> : null}
          </View>
        ) : problem ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{problem}</Text>
            <GameButton title="Try again" small color={GP.skyDeep} onPress={() => gameStore.loadBasics()} />
          </View>
        ) : null}

        {screen.kind === "home" ? <LiveBanner parked={parked} onOpen={() => setSheet("events")} /> : null}
        {fix && screen.kind === "home" && unlocked(me, "raids") ? <RaidBanner points={nearby} fix={fix} onFight={(boss) => setSelectedId(boss.id)} /> : null}

        {focusAway || focusMissing ? (
          <FocusBanner
            place={(focusAway ?? focusMissing)?.place ?? "the invited spot"}
            lat={(focusAway ?? focusMissing)?.lat}
            lng={(focusAway ?? focusMissing)?.lng}
            onClose={() => gameStore.setFocus(null)}
          />
        ) : null}
      </View>

      {/* The lower half: the Warden's line, the radar and the Nearby tray (RoamHomeView.bottom). */}
      {!selected && screen.kind === "home" ? (
        <View style={[styles.bottom, { bottom: insets.bottom + 10 }]} pointerEvents="box-none">
          {fix && !mapFollowing ? <BackToMe onPress={() => recentre((n) => n + 1)} /> : null}
          {showBubble ? <WardenBubble text={said.text} color={color} onClose={() => wardenVoice.quiet()} /> : null}
          {runLive ? (
            <RunTray onPick={setRunPoint} onEnd={() => void runModel.finish()} distanceOf={runDistance} inReach={runInReach} />
          ) : me?.tutorial_done ? (
            <>
              {runOn(me) ? (
                <View style={{ paddingLeft: 14, paddingRight: 76 }}>
                  <QuestRunButton onPress={() => setSheet("runStart")} />
                </View>
              ) : null}
              {fix ? (
                <View style={{ paddingRight: 62 }}>
                  <NearbyRadar points={nearby} fix={fix} inReach={gameStore.inReach} />
                </View>
              ) : null}
            </>
          ) : null}
          {runLive ? null : <NearbyTray
            points={nearby}
            suggested={suggested}
            distanceOf={(p) => gameStore.distanceTo(p)}
            bearingOf={(p) => (fix ? bearingDeg(fix, p) : null)}
            inReach={gameStore.inReach}
            cooling={gameStore.isCooling}
            newCard={(p) => codexOpen && p.extra?.codex !== "owned"}
            onSelect={(p) => {
              // Fly the map to it (its pin lights as selected) and open it.
              setFlyTo((f) => ({ lat: p.lat, lng: p.lng, n: (f?.n ?? 0) + 1 }));
              setSelectedId(p.id);
            }}
            mapRot={mapRot}
            mapBusy={mapBusy}
          />}
        </View>
      ) : null}

      {selected ? (
        <PointSheet
          point={selected}
          distance={gameStore.distanceTo(selected)}
          inReach={gameStore.inReach(selected)}
          cooling={gameStore.isCooling(selected)}
          factionName={gameStore.factionName}
          legend={legendOf?.id === selected.id ? legendOf.text || null : null}
          credit={legendOf?.id === selected.id ? legendOf.credit ?? null : null}
          onPlay={() => play(selected)}
          onSpin={() => void spin(selected)}
          onShare={() => share(selected)}
          onClose={closeSheet}
        />
      ) : null}

      {coachStep ? <CoachOverlay key={coachStep.id} step={coachStep} tint={color} onAction={() => coachAct(coachStep)} onLater={() => markCoach(coachStep)} /> : null}

      {sheet === "dailies" || sheet === "codex" || sheet === "war" ? (
        <Journal initial={sheet === "dailies" ? "today" : sheet} onClose={() => setSheet(null)} onRecap={() => setSheet("recap")} />
      ) : null}
      {sheet === "more" ? <MoreSheet tiles={moreTiles} onClose={() => setSheet(null)} /> : null}
      {sheet === "events" ? <LiveCalendarSheet onClose={() => setSheet(null)} /> : null}
      {sheet === "friends" ? <FriendsSheet onClose={() => setSheet(null)} /> : null}
      {sheet === "squad" ? <SquadSheet onClose={() => setSheet(null)} /> : null}
      {sheet === "collection" ? <CollectionSheet initial={collectionTab} tabs={collectionTabs(collectionAccess)} onClose={() => setSheet(null)} /> : null}
      {sheet === "coins" ? <CoinsSheet onClose={() => setSheet(null)} /> : null}
      {sheet === "ranks" ? <ProgressionSheet onClose={() => setSheet(null)} /> : null}
      {sheet === "recap" ? <RecapSheet onClose={() => setSheet(null)} /> : null}
      {sheet === "ask" ? <AskWarden onClose={() => setSheet(null)} /> : null}
      {sheet === "trials" ? (
        <TrialsSheet
          onClose={() => setSheet(null)}
          onFight={(t) => {
            const ladder = gameStore.get().me?.features?.duel?.trials?.[t.faction];
            setScreen({ kind: "duel", mode: "trial", trial: t, point: trialPoint(t, gameStore.factionName(t.faction), ladder) });
          }}
        />
      ) : null}
      {sheet === "profile" ? <ProfileSheet onClose={() => setSheet(null)} onCoins={() => setSheet("coins")} /> : null}
      {sheet === "battle" ? (
        <RoomSheet
          focusGameId={roomFocus}
          onClose={() => setSheet(null)}
          onEnter={(gameId) => {
            setSheet(null);
            setScreen({ kind: "room", gameId });
          }}
        />
      ) : null}

      {screen.kind === "encounter" ? (
        <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={StyleSheet.absoluteFill}>
          <Encounter point={screen.point} onReward={(reward) => setScreen({ kind: "reward", reward })} onClose={home} />
        </Animated.View>
      ) : null}
      {screen.kind === "duel" ? (
        <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={StyleSheet.absoluteFill}>
          <DuelScreen
            point={screen.point}
            mode={screen.mode}
            trial={screen.trial}
            parked={parked}
            onClose={home}
          />
        </Animated.View>
      ) : null}
      {screen.kind === "room" ? (
        <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={StyleSheet.absoluteFill}>
          <RoomScreen gameId={screen.gameId} onClose={home} />
        </Animated.View>
      ) : null}
      {screen.kind === "fight3d" ? (
        <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={StyleSheet.absoluteFill}>
          <Fight3DHost
            point={screen.point}
            run={screen.run}
            parked={parked}
            onResult={(r) =>
              setScreen({ kind: "reward", reward: rewardFrom3D(r, { name: "Test arena", realm: me?.faction ?? "" }, gameStore.get().me?.standing ?? null) })
            }
            onClose={home}
          />
        </Animated.View>
      ) : null}
      {screen.kind === "reward" ? (
        <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={StyleSheet.absoluteFill}>
          <Reward
            reward={screen.reward}
            onDone={home}
            onShare={() =>
              emitGameEvent("onShareToChat", {
                type: "result",
                text: resultShareText(screen.reward),
                // Task 059: the card, where the chat server draws one.
                result: {
                  headline: screen.reward.headline,
                  pointName: screen.reward.pointName,
                  realm: screen.reward.realm,
                  win: screen.reward.win,
                  xp: screen.reward.xp,
                  coins: screen.reward.coins,
                  level: screen.reward.after?.level ?? null,
                  rank: screen.reward.after?.rank ?? "",
                },
              })
            }
          />
        </Animated.View>
      ) : null}

      {sheet === "runStart" ? <RunStartSheet onClose={() => setSheet(null)} /> : null}
      {runPoint ? (
        <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={StyleSheet.absoluteFill}>
          <RunChallenge key={runPoint.idx} point={runPoint} onDone={() => setRunPoint(null)} />
        </Animated.View>
      ) : runState.finished ? (
        <Animated.View entering={FadeIn.duration(220)} style={StyleSheet.absoluteFill}>
          <RunResults result={runState.finished} board={runState.board} onClose={() => runModel.close()} />
        </Animated.View>
      ) : null}

      {forgeDrop ? <ForgeClaim drop={forgeDrop} onClose={() => setForgeDrop(null)} onOpenBag={() => openCollection("forge-claim")} /> : null}

      {/* The big moments ("Guardian beaten!", "Quest done!"), over everything. */}
      <GameBannerHost top={insets.top + 150} />
    </View>
  );
}

function FocusBanner({ place, lat, lng, onClose }: { place: string; lat?: number; lng?: number; onClose: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const fix = useGame((s) => s.fix);
  const there = lat !== undefined && lng !== undefined ? { lat, lng } : null;
  const d = there ? gameStore.distanceTo(there) : null;
  const heading = fix && there ? bearingDeg(fix, there) : null;
  return (
    <Animated.View entering={FadeIn} style={styles.focus} accessibilityLiveRegion="polite">
      {heading !== null ? (
        <Ionicons name="navigate" size={22} color={GP.sun} style={{ transform: [{ rotate: `${heading - 45}deg` }] }} />
      ) : (
        <Ionicons name="flag" size={22} color={GP.sun} />
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.focusTitle} numberOfLines={1}>
          Head to {place}
        </Text>
        <Text style={styles.focusSub}>
          {d === null
            ? "It opens when you're close."
            : d <= gameStore.reach()
              ? "You're here. It opens as soon as it wakes."
              : `${distanceText(d)} away. It opens when you're close.`}
        </Text>
      </View>
      <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss">
        <Ionicons name="close" size={20} color="#FFF" />
      </Pressable>
    </Animated.View>
  );
}

const STYLE_PAIR = themedStyles({
  root: { flex: 1, backgroundColor: "#E6EFDF" },
  banners: { position: "absolute", left: 14, gap: 6, maxWidth: 560 },
  bottom: { position: "absolute", left: 0, right: 0, gap: 8 },
  notice: {
    padding: 12,
    gap: 8,
    borderRadius: 16,
    backgroundColor: "rgba(30,58,76,0.92)",
  },
  noticeText: { fontFamily: GF.body, fontSize: 14, color: "#FFF" },
  focus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: GP.navy,
    elevation: 6,
  },
  focusTitle: { fontFamily: GF.display, fontSize: 15, color: "#FFF" },
  focusSub: { fontFamily: GF.regular, fontSize: 12, color: "rgba(255,255,255,0.8)" },
});
