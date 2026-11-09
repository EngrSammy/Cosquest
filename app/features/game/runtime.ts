// The React Native game's one store, wired to the phone: the secure store for
// the phone's own key, expo-crypto for randomness, expo-location for the fix.
// (store.ts is the pure part; this file is the glue, so it is not unit tested.)
import { requireOptionalNativeModule } from "expo";
import * as Crypto from "expo-crypto";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";

import { type GameUi, isProductionServer, resolveGameServer } from "./config.ts";
import { shouldProbeSimulated } from "./fixInfo.ts";
import { LOCATION_WATCH } from "./locationWatch.ts";
import { createGameStore, type Fix, type GameState, type KeyStorage } from "./store.ts";

/** Metro inlines EXPO_PUBLIC_* at bundle time (direct dotted access only). */
export const GAME_SERVER = resolveGameServer(process.env.EXPO_PUBLIC_GAME_SERVER);
export const GAME_SERVER_IS_PRODUCTION = isProductionServer(GAME_SERVER);
/** The React Native game everywhere (config.ts GameUi): the SwiftUI game is out of the build. */
export const GAME_UI: GameUi = "rn";

/**
 * Test builds only (EXPO_PUBLIC_E2E=1): when the keychain refuses (an unsigned
 * simulator build has no keychain entitlement), keep the key in memory for the
 * app's life, so a recorded walkthrough can play. Store builds never set E2E.
 */
const E2E_MEMORY_KEYS = process.env.EXPO_PUBLIC_E2E === "1";
const memoryKeys = new Map<string, string>();

const secureStorage: KeyStorage = {
  async get(key) {
    if (Platform.OS === "web") return globalThis.localStorage?.getItem(key) ?? null;
    if (E2E_MEMORY_KEYS && memoryKeys.has(key)) return memoryKeys.get(key) ?? null;
    try {
      return await SecureStore.getItemAsync(key);
    } catch (e) {
      if (E2E_MEMORY_KEYS) return null;
      throw e;
    }
  },
  async set(key, value) {
    if (Platform.OS === "web") return void globalThis.localStorage?.setItem(key, value);
    try {
      await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
    } catch (e) {
      if (!E2E_MEMORY_KEYS) throw e;
      memoryKeys.set(key, value);
    }
  },
  async remove(key) {
    if (Platform.OS === "web") return void globalThis.localStorage?.removeItem(key);
    memoryKeys.delete(key);
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (e) {
      if (!E2E_MEMORY_KEYS) throw e;
    }
  },
};

function randomSeedHex(): string {
  return Array.from(Crypto.getRandomBytes(32), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** iOS: the SwiftUI game's Keychain key, for players moving to this game (CostQuestGameModule.swift). */
async function legacySeedHex(): Promise<string | null> {
  if (Platform.OS !== "ios") return null;
  const native = requireOptionalNativeModule<{ readLegacyDeviceKey?: () => Promise<string | null> }>("CostQuestGame");
  return (await native?.readLegacyDeviceKey?.()) ?? null;
}

export const gameStore = createGameStore({
  baseUrl: GAME_SERVER,
  storage: secureStorage,
  randomSeedHex,
  legacySeedHex,
  log: (message) => {
    if (__DEV__) console.log(message);
  },
});

/**
 * The game store in a component. Pass a selector (`useGame((s) => s.me)`) so
 * the component re-renders only when what it reads changes, not on every GPS
 * fix (audit B8); with none it gets the whole state and re-renders on any change.
 */
export function useGame(): GameState;
export function useGame<T>(select: (state: GameState) => T): T;
export function useGame<T>(select?: (state: GameState) => T): GameState | T {
  const get: () => GameState | T = select ? () => select(gameStore.get()) : gameStore.get;
  return useSyncExternalStore<GameState | T>(gameStore.subscribe, get, get);
}

// ---------- location ----------

export type LocationPermission = "unknown" | "granted" | "denied";

let watch: Location.LocationSubscription | null = null;
let starting = false;
let permission: LocationPermission = "unknown";
const permissionListeners = new Set<() => void>();

function setPermission(next: LocationPermission) {
  if (permission === next) return;
  permission = next;
  permissionListeners.forEach((l) => l());
}

export function useLocationPermission(): LocationPermission {
  return useSyncExternalStore(
    (l) => {
      permissionListeners.add(l);
      return () => permissionListeners.delete(l);
    },
    () => permission,
    () => permission,
  );
}

// What the server is told about each fix (fixInfo.ts): Android says whether a
// fix is mocked (expo-location `mocked`); iOS says whether the location is
// simulated by software only through the game module (LocationSourceProbe),
// asked at most once a minute. Evidence for the server, never a refusal: a
// phone whose location Xcode simulates plays as before.
let simulated: boolean | null = null;
let simulatedAskedAt: number | null = null;

function probeSimulated() {
  if (Platform.OS !== "ios") return;
  const now = Date.now();
  if (!shouldProbeSimulated(simulatedAskedAt, now)) return;
  simulatedAskedAt = now;
  const native = requireOptionalNativeModule<{ locationSimulated?: () => Promise<boolean | null> }>("CostQuestGame");
  native
    ?.locationSimulated?.()
    .then((v) => {
      const next = typeof v === "boolean" ? v : null;
      if (next === simulated) return;
      simulated = next;
      const fix = gameStore.get().fix;
      if (fix) gameStore.setFix({ ...fix, simulated: next });
    })
    .catch(() => {});
}

function fixOf(pos: Location.LocationObject, fallbackAccuracy: number): Fix {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? fallbackAccuracy,
    at: pos.timestamp,
    mocked: typeof pos.mocked === "boolean" ? pos.mocked : null,
    simulated,
  };
}

let refreshing: Promise<Fix | null> | null = null;

/**
 * A fresh fix now, for an action the server judges by where it happens: the
 * watch sends nothing while the phone stands still (5 m filter), so a fix can
 * be minutes old (and a Room refuses one older than 30 s). Up to 8 s; shared
 * by callers asking at once; null when there is none (no permission, no signal).
 */
export function refreshFix(): Promise<Fix | null> {
  if (refreshing) return refreshing;
  const work = (async (): Promise<Fix | null> => {
    try {
      if (permission !== "granted") return null;
      const timeout = new Promise<null>((r) => setTimeout(() => r(null), 8000));
      const pos = await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), timeout]);
      if (!pos) return null;
      const fix = fixOf(pos, 30);
      gameStore.setFix(fix);
      probeSimulated();
      return fix;
    } catch {
      return null;
    }
  })();
  refreshing = work;
  void work.finally(() => {
    if (refreshing === work) refreshing = null;
  });
  return work;
}

/** Start following the phone. `ask`: show the system prompt if never asked. */
export async function startLocation(ask: boolean): Promise<LocationPermission> {
  if (watch || starting) return permission;
  starting = true;
  try {
    let status = (await Location.getForegroundPermissionsAsync()).status;
    if (status !== "granted" && ask) status = (await Location.requestForegroundPermissionsAsync()).status;
    setPermission(status === "granted" ? "granted" : status === "denied" ? "denied" : "unknown");
    if (status !== "granted") return permission;
    // A last-known fix draws the world at once; the watch refines it.
    const last = await Location.getLastKnownPositionAsync().catch(() => null);
    if (last) gameStore.setFix(fixOf(last, 50));
    probeSimulated();
    watch = await Location.watchPositionAsync(
      // High (not BestForNavigation), 5 s / 5 m: accurate enough for the 40 m
      // reach (locationWatch.test.ts), less battery and fewer map renders (audit B8).
      { accuracy: Location.Accuracy.High, distanceInterval: LOCATION_WATCH.distanceIntervalM, timeInterval: LOCATION_WATCH.timeIntervalMs },
      (pos) => {
        gameStore.setFix(fixOf(pos, 30));
        probeSimulated();
      },
    );
    return permission;
  } catch (error) {
    if (__DEV__) console.warn("[game] location failed", error);
    return permission;
  } finally {
    starting = false;
  }
}

/** Off screen: no location (the battery is the chat's too). */
export function stopLocation() {
  watch?.remove();
  watch = null;
}
