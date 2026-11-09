// The CostQuest game, as the shell sees it.
//
// The shared React Native game (components/game), implemented in TypeScript by
// ./rnGame.ts, on every platform. A few parts only the platform can draw are
// native "islands" inside the RN screens (docs/one-codebase.md). The embedded
// SwiftUI game (EXPO_PUBLIC_GAME_UI=native) and Unity's fights were taken out of
// the build on 1 Nov 2026 (battle-3d-only): every fight is the 3D fight.
// Web: no game (the shell shows the "get the app" page), except in test builds (WEB_TEST_GAME).
import { requireNativeView, requireOptionalNativeModule } from "expo";
import type { ComponentType, Ref } from "react";
import { Platform, type ViewProps } from "react-native";

import { resolveIslandsOff } from "@/features/game/config";
import type { BeaconEvent } from "@/features/game/friendsNearby";
import { GAME_UI } from "@/features/game/runtime";
import type { GameTarget } from "@/features/world/deepLink";
import type { GameSharePayload } from "@/features/world/gameInvite";

import { gameStore } from "@/features/game/runtime";

import { createRnGame, currentChatToken } from "./rnGame";

export type GameChatPreview = { chatId: string; title: string; text: string };

export type GameCallPillState = {
  title: string;
  video: boolean;
  /** Epoch ms the call was answered; absent while it rings. */
  answeredAt?: number | null;
};

export type GameEvents = {
  /** The game's world is standing (once per app run). */
  onReady: (event: { playerKey?: string | null }) => void;
  /** One login worked: the account's player is in. */
  onSession: (event: {
    playerKey: string;
    created: boolean;
    handle?: string | null;
    faction?: string | null;
  }) => void;
  /** The game's "invite to a chat" action. */
  onShareToChat: (event: GameSharePayload) => void;
  /** The game wants the chat back (optionally one conversation). */
  onRequestChat: (event: { chatId?: string | null }) => void;
  onError: (event: { code: string; message?: string }) => void;
};

type Subscription = { remove: () => void };

export type CostQuestGameModule = {
  /** False on the Android placeholder. */
  available?: boolean;
  /** Bytes of RAM, for the prewarm policy (iOS). */
  physicalMemory?: number;
  prewarm(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  open(target: GameTarget): Promise<void>;
  setSession(token: string | null): Promise<void>;
  setUnread(count: number, previews: GameChatPreview[]): Promise<void>;
  setCallPill(state: GameCallPillState | null): Promise<void>;
  handleURL(url: string): Promise<void>;
  reset(): Promise<void>;
  /** iOS: bytes used now (phys_footprint) and still available, for measuring the prewarm. */
  memoryReport?(): { physical: number; footprint: number; available: number };
  addListener<K extends keyof GameEvents>(event: K, listener: GameEvents[K]): Subscription;
};

/** The platform's module: the native helpers (RAM, gestures, NFC, speech, the islands). */
const nativeGame =
  Platform.OS === "web" ? null : requireOptionalNativeModule<CostQuestGameModule & NativeOnly>("CostQuestGame");

/**
 * The platform helpers on the native module: the same names on both platforms
 * (android/src/.../CostQuestGameModule.kt, ios/Embed/GameHelpers.swift), so
 * the shared screens call one interface. Optional: an older native build, or
 * a platform without the feature, simply lacks the function.
 */
export type NativeOnly = {
  /** Keep the system back gesture off a strip of the screen edge (dp). */
  setGestureExclusion?(rects: { x: number; y: number; width: number; height: number }[]): Promise<void>;
  nfcAvailable?: boolean;
  uwbAvailable?: boolean;
  /** One spoken utterance (SpeechListener.kt); results arrive as onSpeechResult / onSpeechError. */
  startListening?(options: { prompt?: string; locale?: string; choices?: string[]; onDeviceOnly?: boolean }): Promise<{ onDevice: boolean }>;
  stopListening?(): Promise<void>;
  /** Stops and drops the utterance: no event follows. */
  cancelListening?(): Promise<void>;
  /** iOS: CMPedometer can report walking distance (GameHelpers.swift). */
  pedometerAvailable?: boolean;
  /**
   * iOS: walking distance and steps since `fromMs` (CMPedometer keeps a week of history).
   * `ask`: may show the Motion & Fitness prompt. Android has readStepCounter instead.
   */
  queryPedometer?(query: { fromMs: number; toMs?: number; ask: boolean }): Promise<{
    status: "ok" | "unavailable" | "denied" | "notDetermined" | "error";
    meters: number;
    steps: number;
  }>;
  /** NFC checkpoint tags (NfcReader.kt / GameHelpers.swift NfcHelper); a tag arrives as onNfcTag. */
  startNfcScan?(): Promise<void>;
  stopNfcScan?(): Promise<void>;
  /** The phone has a hardware step counter (StepCounter.kt). */
  stepCounterAvailable?: boolean;
  /** One read of the step counter: steps since boot, with the clocks it was read at. */
  readStepCounter?(): Promise<{ steps: number | null; elapsedRealtimeMs: number; wallClockMs: number; available: boolean }>;
  addListener?(event: "onSpeechResult", listener: (e: { text: string; final: boolean }) => void): Subscription;
  addListener?(event: "onSpeechError", listener: (e: { code: string; message: string }) => void): Subscription;
  addListener?(event: "onNfcTag", listener: (e: { id: string; ndefText?: string | null }) => void): Subscription;
  /** iOS: the NFC sheet closed without a tag (cancelled, timed out, not entitled). Android's reader never ends by itself. */
  addListener?(event: "onNfcEnd", listener: (e: { code: string; message: string }) => void): Subscription;

  // Hold phones together (iOS: ios/Embed/FriendBeaconIsland.swift). Absent on Android.
  friendBeaconAvailable?: boolean;
  /** The phone can measure the distance to the other iPhone (Nearby Interaction). */
  friendBeaconUWB?: boolean;
  startFriendBeacon?(key: string, handle: string): Promise<void>;
  stopFriendBeacon?(): Promise<void>;
  addListener?(event: "onFriendBeacon", listener: (e: FriendBeaconEvent) => void): Subscription;

  // Run and raid clocks on the lock screen: iOS Live Activity (ios/Embed/LiveTimers.swift and the
  // CosQuestLiveActivity widget extension), Android an ongoing chronometer notification (LiveTimers.kt).
  // features/game/liveTimer.ts decides what they show.
  liveTimerSupported?(): boolean;
  /** The clock's id (one per kind: an older one of the same kind ends), or null when it can't be shown. */
  liveTimerStart?(kind: "run" | "raid", title: string, subtitle: string, link: string, endsAtMs: number, state: LiveTimerNativeState): Promise<string | null>;
  liveTimerUpdate?(id: string, state: LiveTimerNativeState, endsAtMs: number | null): Promise<boolean>;
  /** By id, kind or "all"; with a final state the result stays a couple of minutes. */
  liveTimerEnd?(id: string, final: LiveTimerNativeState | null): Promise<void>;

  // Venue Events (iOS: ios/Embed/VenueEventsIsland.swift), the native ARKit flow.
  venueEventsAvailable?: boolean;
  /** The SwiftUI game's anonymous key (iOS), for features/game/store.ts to adopt once. */
  readLegacyDeviceKey?(): Promise<string | null>;
  /** The native game's own sign-in (iOS GameHost.setSession): its client signs as the same player. */
  setSession?(token: string | null): Promise<void>;
  openVenueEvents?(options: { gameId?: string | null; side?: string[]; handle?: string | null }): Promise<void>;
  closeVenueEvents?(): Promise<void>;
  addListener?(event: "onVenueEventsClosed", listener: () => void): Subscription;
};


/** A lock-screen clock's words besides the time (LiveTimerStateRecord / LiveTimers.kt). */
export type LiveTimerNativeState = {
  line: string;
  hpPercent?: number | null;
  fighters?: number | null;
  finished?: boolean;
  headline?: string | null;
};

/** The hold-phones beacon (FriendBeaconIsland.swift), as features/game/friendsNearby.ts reads it. */
export type FriendBeaconEvent = BeaconEvent;

export { GAME_UI };

/**
 * Test builds only (EXPO_PUBLIC_E2E=1): the web build plays the RN game too,
 * so the whole path (sign in, swipe into the game, back to chat) can be played
 * and recorded in a browser. A release web build still has no game.
 */
const WEB_TEST_GAME = Platform.OS === "web" && process.env.EXPO_PUBLIC_E2E === "1";

export const CostQuestGame: CostQuestGameModule | null =
  Platform.OS === "web" && !WEB_TEST_GAME ? null : createRnGame(nativeGame);

// Web test builds: the store, for screenshot and replay scripts (as dev/game-preview does).
if (WEB_TEST_GAME) (globalThis as { __cqGame?: unknown }).__cqGame = gameStore;

/** The native module's own helpers (null on web and Expo Go). */
export const nativeHelpers: NativeOnly | null = Platform.OS === "web" ? null : nativeGame;

/** Native islands turned off for this build (EXPO_PUBLIC_GAME_2D, features/game/config.ts). */
export const ISLANDS_OFF = resolveIslandsOff(process.env.EXPO_PUBLIC_GAME_2D);

/** Venue Events (paid games at a venue, in AR): native on iOS, absent elsewhere. */
export const venueEventsAvailable =
  Platform.OS === "ios" && nativeGame?.venueEventsAvailable === true && !ISLANDS_OFF.has("venueEvents");

/**
 * Opens the native venue Events over the RN game (iOS). The native client is
 * signed in first with the same chat session, so a game joined there belongs
 * to the same player. `onClosed` runs when the player comes back.
 */
export async function openVenueEvents(
  options: { gameId?: string | null; side?: string[]; handle?: string | null } = {},
  onClosed?: () => void,
): Promise<boolean> {
  if (!venueEventsAvailable || !nativeGame?.openVenueEvents) return false;
  const token = currentChatToken();
  if (token) await nativeGame.setSession?.(token).catch(() => {});
  if (onClosed && nativeGame.addListener) {
    const sub = nativeGame.addListener("onVenueEventsClosed", () => {
      sub.remove();
      onClosed();
    });
  }
  await nativeGame.openVenueEvents(options);
  return true;
}

/** Is there a game to swipe into? */
export const gameInstalled = CostQuestGame != null;

/** Is it a playable game (not a placeholder)? */
export const gamePlayable = CostQuestGame != null && CostQuestGame.available !== false;

export type CostQuestGameViewProps = ViewProps & {
  accessibilityLabel?: string;
  /** Off the window but kept warm (the chat has been showing for a while). */
  parked?: boolean;
};

export type CostQuestModelViewProps = ViewProps & {
  /** A downloaded .glb or .usdz on this phone (file:// URI). */
  uri: string;
  /** The weapon's colour (#RRGGBB), for parts without their own. */
  tint?: string;
  /** Turn slowly by itself (off under Reduce Motion). */
  spin?: boolean;
  accessibilityLabel?: string;
};

/**
 * iOS only: a Forge model turning on a small stage (RealityKit, Game/Net/GLBMesh
 * for .glb), the native game's ForgeModelView. Null elsewhere: draw the 2D art.
 */
export const CostQuestModelView: ComponentType<CostQuestModelViewProps> | null =
  Platform.OS === "ios" && nativeGame && (nativeGame as { modelViewAvailable?: boolean }).modelViewAvailable === true
    ? requireNativeView<CostQuestModelViewProps>("CostQuestGame", "CostQuestModelView")
    : null;

export type CostQuestShrineViewProps = ViewProps & {
  /** The shrine's colour (the point's tier), #RRGGBB. */
  tint: string;
  /** The Warden's colour (the player's faction), #RRGGBB. */
  wardenTint?: string;
  /** Through the camera (ARKit), where the phone can; otherwise the rendered stage. */
  useAR?: boolean;
  /** The shrine is standing: the approach can say "Tap the shrine". `ar`: it is in the room. */
  onPlaced?: (e: { nativeEvent: { ar: boolean } }) => void;
  ref?: Ref<CostQuestShrineViewHandle | null>;
};

/** The view's functions (ShrineScene): the Strike's beats, the break, a second chance, a photo. */
export type CostQuestShrineViewHandle = {
  pulse(i: number): Promise<void>;
  resolve(correct: boolean): Promise<void>;
  reset(): Promise<void>;
  /** A JPEG of the shrine in the player's street (file:// URI); null on the rendered stage. */
  photo(): Promise<string | null>;
};

/**
 * iOS only: the native game's shrine (Game/Roam/ShrineStage.swift) on its
 * RealityKit stage or through the camera (ios/Embed/ShrineIsland.swift).
 * Null elsewhere: draw the 2D crystal (components/game/ShrineCrystal.tsx).
 */
export const CostQuestShrineView: ComponentType<CostQuestShrineViewProps> | null =
  Platform.OS === "ios" && nativeGame && (nativeGame as { shrineViewAvailable?: boolean }).shrineViewAvailable === true
    ? requireNativeView<CostQuestShrineViewProps>("CostQuestGame", "CostQuestShrineView")
    : null;

/** The phone can put the shrine in the room (ARWorldTrackingConfiguration.isSupported). */
export const shrineARSupported = (nativeGame as { shrineARSupported?: boolean } | null)?.shrineARSupported === true;

export type CostQuestSummonViewProps = ViewProps & {
  /** The downloaded .usdz on this phone (file:// URI). */
  uri: string;
  kind: "character" | "weapon" | "object";
  /** For the photo's small mark. */
  name: string;
  /** Height to stand at, metres (true scale); 0: the model's own. */
  heightM?: number;
  minScale?: number;
  maxScale?: number;
  /** The celebrate sparkle's colour, #RRGGBB. */
  tint?: string;
  /**
   * The Guardian reveal before a fight (components/game/FightReveal.tsx): no
   * coaching or gestures, ~3 m ahead, it rises out of the ground; a tap on it
   * is onSummonTap. No native haptic (the screen buzzes on "placed").
   */
  reveal?: boolean;
  /** reveal: the player tapped the Guardian. */
  onSummonTap?: () => void;
  onSummonState?: (e: {
    nativeEvent: {
      phase: "looking" | "placed" | "denied" | "failed";
      ar: boolean;
      /** The model plays its own idle clip (else a procedural sway). */
      animated: boolean;
      lidar: boolean;
      people: boolean;
      reason?: string;
    };
  }) => void;
  ref?: Ref<CostQuestSummonViewHandle | null>;
};

/** The summon view's functions (SummonIsland.swift). */
export type CostQuestSummonViewHandle = {
  /** The AR render with a small mark, a JPEG with no metadata (file:// URI); null without a camera. */
  photo(): Promise<string | null>;
  /** Starts a clip of the AR render (no audio): "recording", or null when it can't. */
  startVideo(): Promise<string | null>;
  /** Ends it: an MP4 with no metadata (file:// URI), or null. */
  stopVideo(): Promise<string | null>;
  celebrate(): Promise<void>;
  /** Stand it in front of the player again. */
  recenter(): Promise<void>;
  /** Pause the camera (the last frame stays): the fight is taking over. */
  hold(): Promise<void>;
};

/**
 * iOS only: a Forge model in the room through the camera
 * (ios/Embed/SummonIsland.swift). Null elsewhere: no "See it here" button
 * (Android: ARCore + SceneView is Phase 2 step 3).
 */
export const CostQuestSummonView: ComponentType<CostQuestSummonViewProps> | null =
  Platform.OS === "ios" && nativeGame && (nativeGame as { summonViewAvailable?: boolean }).summonViewAvailable === true
    ? requireNativeView<CostQuestSummonViewProps>("CostQuestGame", "CostQuestSummonView")
    : null;

/** The phone can do world-tracking AR (else the summon screen is a 3D turntable). */
export const summonARSupported = (nativeGame as { summonARSupported?: boolean } | null)?.summonARSupported === true;

/** Fire and forget: a game call never throws into the shell. */
export function callGame<K extends keyof CostQuestGameModule>(
  name: K,
  ...args: CostQuestGameModule[K] extends (...a: infer A) => unknown ? A : never
) {
  const fn = CostQuestGame?.[name];
  if (typeof fn !== "function") return;
  try {
    const result = (fn as (...a: unknown[]) => unknown).apply(CostQuestGame, args);
    if (result && typeof (result as Promise<unknown>).catch === "function") {
      (result as Promise<unknown>).catch((error) => console.warn(`[game] ${String(name)} failed`, error));
    }
  } catch (error) {
    console.warn(`[game] ${String(name)} failed`, error);
  }
}
