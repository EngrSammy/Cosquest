// The Godot engine inside the app (cq 061), through @borndotcom/react-native-godot.
// One engine for the whole app (the library has one instance), driven from
// here only, one step at a time:
//
//   openFight(config)  create the instance (or resume the kept one), wait for
//                      the scene tree and its /root/Bridge autoload, hand it
//                      the callback (once per engine), start_fight(config)
//   closeFight()       pause the kept engine (default; the next fight replaces
//                      this one), or with EXPO_PUBLIC_GODOT_KEEP=0 destroy it
//
// Godot talks back through that one callback: {"event": "state", ...} while a
// fight loads and starts, {"event": "haptic", ...} touches during it (haptics.ts),
// then the result. Each message carries the config's
// fight_id, so a message from a fight already replaced is dropped.
//
// Calls into Godot are kept to one per fight: every runOnGodotThread run
// compiles a new worklet in the Godot thread's runtime and that memory never
// came back (~1.7 MB a call on the emulator: 300 calls, +490 MB native heap,
// not freed by a GC). Polling get_status and an end_fight call per close had cost ~7 MB a
// fight.
//
// Steps run in order on one queue, so a double tap, a close while the engine
// is still loading, or an open right after a close cannot create or destroy
// twice. Godot runs on its own thread: everything touching its API is a
// worklet run there (runOnGodotThread), and its answers come back to the JS
// thread through worklets-core's runOnJS.
//
// The module is required lazily: a build without the native module (the web,
// Android 9 and older) never loads it and the 3D fight is simply not offered.
import type { ComponentType } from "react";
import { Platform } from "react-native";

import { ANDROID_MIN_API, type Fight3DConfig } from "./fight3d";
import { routeBridgeMessage } from "./haptics";
import { playFightHaptic, resetFightHaptics } from "./hapticsPlayer";

type GodotModule = {
  createInstance(args: string[]): unknown;
  getInstance(): unknown;
  API(): any;
  pause(): void;
  resume(): void;
  is_paused(): boolean;
  destroyInstance(): void;
};
type GodotLib = {
  RTNGodot: GodotModule;
  runOnGodotThread: <T>(f: () => T) => Promise<T>;
  RTNGodotView: ComponentType<{ style?: unknown; windowName?: string; testID?: string }>;
};
type WorkletsLib = { Worklets: { createRunOnJS: <A extends unknown[], R>(f: (...a: A) => R) => (...a: A) => Promise<R> } };

/**
 * The library installs `RTNGodot` on the global object of both the React
 * runtime and its worklet runtime. Worklets read it as `global.RTNGodot`:
 * worklets-core's babel plugin treats `global` as the runtime's own global
 * (any other free name, `globalThis` included, would be captured from the JS
 * thread when the worklet is created, which for these module-level worklets
 * is before the library is loaded).
 */
// __cqApi / __cqBridge: the API object and the Bridge node, cached in the Godot
// thread's JS runtime for the life of one engine (see bridgeWorklet).
type WithGodot = { RTNGodot?: GodotModule; __cqApi?: any | null; __cqBridge?: any | null; __cqCallback?: boolean };

let lib: GodotLib | null | undefined;
let worklets: WorkletsLib | null = null;

/** The library, when this build and this phone can run it. Never throws. */
export function godotLib(): GodotLib | null {
  if (lib !== undefined) return lib;
  lib = null;
  if (Platform.OS === "web" || (Platform.OS === "android" && Number(Platform.Version) < ANDROID_MIN_API)) return lib;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const l = require("@borndotcom/react-native-godot") as GodotLib;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    worklets = require("react-native-worklets-core") as WorkletsLib;
    if (l?.RTNGodot && typeof l.runOnGodotThread === "function") lib = l;
  } catch (e) {
    console.warn(`[godot] the native module is not in this build: ${(e as Error).message}`);
  }
  return lib;
}

export type EngineState = "none" | "starting" | "running" | "paused" | "stopping";

let state: EngineState = "none";
let queue: Promise<unknown> = Promise.resolve();
/** Bumped by every open and close: a step that sees it move on was overtaken and stops. */
let generation = 0;
let pausedAt = 0;
let listener: ((json: string) => void) | null = null;
let fightStateListener: ((state: string) => void) | null = null;
let deliverOnJs: ((json: string) => Promise<void>) | null = null;
/** The engine has our callback (set by the first startWorklet on it). */
let callbackSet = false;
/** The React runtime's API object (one per engine) and its CQBridge singleton. */
let jsApi: any = null;
let jsBridge: any = null;

/**
 * start_fight without a worklet run: from this (React Native) thread through
 * the library's API object, as Godot's own thread-safe call_deferred on the
 * Bridge's Engine singleton. False when that is not available, and the
 * caller falls back to the worklet.
 */
function startFromJs(g: GodotLib, configJson: string): boolean {
  try {
    if (!jsApi) jsApi = g.RTNGodot.API();
    if (!jsBridge) {
      if (!jsApi.Engine.has_singleton("CQBridge")) return false;
      jsBridge = jsApi.Engine.get_singleton("CQBridge");
    }
    jsBridge.call_deferred("start_fight", configJson);
    return true;
  } catch (e) {
    console.warn(`[godot] start from the JS thread failed, using a worklet: ${String(e)}`);
    jsApi = null;
    jsBridge = null;
    return false;
  }
}
const stateListeners = new Set<(s: EngineState) => void>();

function setState(s: EngineState) {
  state = s;
  if (__DEV__ || process.env.EXPO_PUBLIC_WORLD_TIMING === "1") console.log(`[godot] engine ${s}`);
  stateListeners.forEach((l) => l(s));
}

export function engineState(): EngineState {
  return state;
}
export function onEngineState(l: (s: EngineState) => void): () => void {
  stateListeners.add(l);
  return () => {
    stateListeners.delete(l);
  };
}

function serial<T>(step: () => Promise<T>): Promise<T> {
  const run = queue.then(step, step);
  queue = run.catch(() => undefined);
  return run;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Godot's callback lands here (on the JS thread): a state push or the result.
 * Only the fight that is still open takes it (fight_id = its generation).
 */
function deliver(json: string) {
  const r = routeBridgeMessage(json, generation);
  if (r.to === "state") fightStateListener?.(r.state);
  else if (r.to === "haptic") playFightHaptic(r.haptic);
  else if (r.to === "result") listener?.(json);
}

/** The open fight's state pushes from Godot ("loading", "fighting"). */
export function onFightState(l: ((state: string) => void) | null) {
  fightStateListener = l;
}

// ---------- worklets (run on the Godot thread) ----------

function createWorklet(args: string[]): boolean {
  "worklet";
  const G = (global as unknown as WithGodot).RTNGodot;
  if (!G) return false;
  if (G.getInstance()) return true;
  (global as unknown as WithGodot).__cqApi = null;
  (global as unknown as WithGodot).__cqBridge = null;
  (global as unknown as WithGodot).__cqCallback = false;
  return !!G.createInstance(args);
}

/**
 * The Bridge node, looked up once per engine and kept in the Godot thread's
 * runtime (one API walk per engine; the runs that need it are rare anyway,
 * see the header on what each run costs).
 */
function bridgeWorklet(): any | null {
  "worklet";
  const g = global as unknown as WithGodot;
  const G = g.RTNGodot;
  if (!G || !G.getInstance()) {
    g.__cqApi = null;
    g.__cqBridge = null;
    return null;
  }
  if (g.__cqBridge) return g.__cqBridge;
  if (!g.__cqApi) g.__cqApi = G.API();
  const tree = g.__cqApi.Engine.get_main_loop();
  if (!tree) return null;
  const root = tree.get_root();
  if (!root || !root.has_node("Bridge")) return null;
  g.__cqBridge = root.get_node("Bridge");
  return g.__cqBridge;
}

/**
 * One run per fight: false while the Bridge is not up yet; else the callback
 * (first time on this engine) and start_fight. `toJs` forwards to deliver().
 */
function startWorklet(configJson: string, toJs: (json: string) => Promise<void>): boolean {
  "worklet";
  const bridge = bridgeWorklet();
  if (!bridge) return false;
  const g = global as unknown as WithGodot;
  if (!g.__cqCallback) {
    bridge.set_result_callback((json: string) => {
      void toJs(String(json));
    });
    g.__cqCallback = true;
  }
  bridge.start_fight(configJson);
  return true;
}

function destroyWorklet(): boolean {
  "worklet";
  const g = global as unknown as WithGodot;
  const G = g.RTNGodot;
  g.__cqApi = null;
  g.__cqBridge = null;
  g.__cqCallback = false;
  if (G && G.getInstance()) G.destroyInstance();
  return true;
}

// ---------- the steps ----------

export class FightOpenError extends Error {}

/**
 * Open a fight: the engine up (created, or resumed when kept), the result
 * callback set, start_fight(config). Resolves once Godot has the fight;
 * `onResult` gets Godot's result JSON (once, on the JS thread). Rejects when
 * the engine cannot start or the Bridge never shows (FightOpenError), or
 * when a close overtook it (a FightOpenError with `cancelled`).
 */
export function openFight(opts: { args: string[]; config: Fight3DConfig; keep: boolean; onResult: (json: string) => void; bridgeTimeoutMs?: number }): Promise<void> {
  const g = godotLib();
  if (!g || !worklets) return Promise.reject(new FightOpenError("Godot is not in this build."));
  const mine = ++generation;
  resetFightHaptics();
  const run = g.runOnGodotThread;
  listener = opts.onResult;
  if (!deliverOnJs) deliverOnJs = worklets.Worklets.createRunOnJS(deliver);
  const toJs = deliverOnJs;
  const configJson = JSON.stringify({ ...opts.config, fight_id: mine });
  const args = opts.args;
  const cancelled = () => {
    const e = new FightOpenError("cancelled");
    (e as FightOpenError & { cancelled?: boolean }).cancelled = true;
    return e;
  };
  return serial(async () => {
    if (mine !== generation) throw cancelled();
    if (state === "paused") {
      // The kept engine: resume it. The library re-arms its frame loop on resume,
      // so give the last paused frame time to land first (two loops otherwise).
      const wait = 120 - (Date.now() - pausedAt);
      if (wait > 0) await sleep(wait);
      g.RTNGodot.resume();
      setState("running");
    } else if (state === "none") {
      setState("starting");
      callbackSet = false;
      jsApi = null;
      jsBridge = null;
      const ok = await run(() => {
        "worklet";
        return createWorklet(args);
      });
      if (!ok) {
        setState("none");
        throw new FightOpenError("Godot would not start (are the game files in this build?).");
      }
    }
    // A kept engine with our callback: no worklet run at all.
    if (callbackSet && startFromJs(g, configJson)) {
      if (__DEV__ || process.env.EXPO_PUBLIC_WORLD_TIMING === "1") console.log("[godot] start_fight from the JS thread");
      setState("running");
      return;
    }
    // The scene tree and its autoloads come up on the first frames of a new
    // engine (a few tries); a kept engine takes it at once.
    const until = Date.now() + (opts.bridgeTimeoutMs ?? 30000);
    for (;;) {
      if (mine !== generation) throw cancelled();
      const started = await run(() => {
        "worklet";
        return startWorklet(configJson, toJs);
      }).catch(() => false);
      if (started) {
        callbackSet = true;
        break;
      }
      if (Date.now() > until) throw new FightOpenError("The 3D fight did not load (no Bridge in the scene).");
      await sleep(150);
    }
    setState("running");
  });
}

/**
 * Warm the engine before a fight is started (the AR reveal plays over it,
 * components/game/FightReveal.tsx): the engine created and its scene tree up
 * (the Bridge there), then paused, so openFight only has to resume it and
 * call start_fight. Nothing else changes: the fight itself is openFight's,
 * on the same config. A kept or running engine is left as it is. Never
 * throws; a warm that fails just leaves openFight to do it all, as before.
 */
export function warmFight(opts: { args: string[]; readyTimeoutMs?: number }): Promise<void> {
  const g = godotLib();
  if (!g || !worklets) return Promise.resolve();
  const mine = generation;
  const run = g.runOnGodotThread;
  return serial(async () => {
    if (state !== "none" || mine !== generation) return;
    setState("starting");
    callbackSet = false;
    jsApi = null;
    jsBridge = null;
    const ok = await run(() => {
      "worklet";
      return createWorklet(opts.args);
    }).catch(() => false);
    if (!ok) {
      setState("none");
      return;
    }
    // The scene tree and its autoloads come up on the first frames.
    const until = Date.now() + (opts.readyTimeoutMs ?? 6000);
    while (Date.now() < until && mine === generation) {
      const up = await run(() => {
        "worklet";
        return bridgeWorklet() !== null;
      }).catch(() => false);
      if (up) break;
      await sleep(150);
    }
    g.RTNGodot.pause();
    pausedAt = Date.now();
    setState("paused");
    if (__DEV__ || process.env.EXPO_PUBLIC_WORLD_TIMING === "1") console.log("[godot] warmed and paused for the reveal");
  }).catch((e) => {
    console.warn(`[godot] warm: ${String(e)}`);
  });
}

/**
 * bridge.get_status() as JSON text, or null while there is no engine or Bridge.
 * Tests only (the leak probe): each call is a worklet run, see the header.
 */
export function fightStatus(): Promise<string | null> {
  const g = godotLib();
  if (!g || state === "none" || state === "stopping") return Promise.resolve(null);
  return g
    .runOnGodotThread(() => {
      "worklet";
      const bridge = bridgeWorklet();
      if (!bridge) return null;
      const s = bridge.get_status();
      return s == null ? null : String(s);
    })
    .catch(() => null);
}

/**
 * Close the fight: (keep) pause the engine, no call into Godot (the next
 * start_fight replaces the paused fight, and its late messages are dropped by
 * fight_id); else destroy it. Safe to call at any time, any number of times;
 * an open still loading is cancelled first.
 */
export function closeFight(opts: { keep: boolean }): Promise<void> {
  const g = godotLib();
  ++generation;
  listener = null;
  fightStateListener = null;
  if (!g) return Promise.resolve();
  const run = g.runOnGodotThread;
  return serial(async () => {
    if (state === "none" || (opts.keep && state === "paused")) return;
    if (opts.keep) {
      g.RTNGodot.pause();
      pausedAt = Date.now();
      setState("paused");
      return;
    }
    setState("stopping");
    callbackSet = false;
    jsApi = null;
    jsBridge = null;
    await run(() => {
      "worklet";
      return destroyWorklet();
    }).catch((e) => console.warn(`[godot] destroy: ${String(e)}`));
    setState("none");
  });
}

/** The app went to the background (or the game behind the chat): stop drawing; resume after. */
let heldBy = false;
export function holdForBackground(hold: boolean) {
  const g = godotLib();
  if (!g || state !== "running") {
    heldBy = false;
    return;
  }
  if (hold && !heldBy && !g.RTNGodot.is_paused()) {
    g.RTNGodot.pause();
    heldBy = true;
  } else if (!hold && heldBy) {
    heldBy = false;
    g.RTNGodot.resume();
  }
}
