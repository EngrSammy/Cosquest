// One 3D runtime for Android and iOS (cq 056): any Forge catalogue entry as a
// live model, through react-native-filament (Google Filament: GLB with PBR
// materials, skins and animation clips; OpenGL/Vulkan on Android, Metal on
// iOS; renders off the JS thread). Self-hosted: the engine ships in the app.
//
//   <ForgeModel id={el.id} animation="idle" purpose="closeup" />
//
// What it does, whatever the element is:
// - downloads the GLB for this phone's class and the purpose (LOD 0 for a
//   close-up on a good phone, 1 or 2 elsewhere), once per version, checked
//   against the catalogue's sha256 (forgeWorldDevice.ensureFile);
// - shows the server's thumbnail (or the type's icon) while it loads, and
//   stays on it if anything fails: no Forge entry can crash a screen;
// - plays a named clip (idle / walk / celebrate) when the entry is rigged,
//   with the contract's fallbacks, and turns slowly when asked to.
// EXPO_PUBLIC_GAME_2D=forgeModel (or all) turns the 3D off: thumbnails only.
//
// <ForgeStage> puts several entries in one scene (one engine), laid out in
// metres. Not used by the screens yet: on the emulator a three-model stage
// ran away with memory (cq 056, cause not found), so a point's scene is
// layered single-model views instead (ForgeWorld.ForgePointScene).
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Component, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useReducedMotion } from "react-native-reanimated";

import { resolveIslandsOff } from "@/features/game/config";
import { clipIndex, type ForgeEntry, type ForgePurpose } from "@/features/game/forgeWorld";
import { ensureFile, forgeWorld, glbFor, thumbUrl, useEquipped, useForgeWorld } from "@/features/game/forgeWorldDevice";
import { bundledFile, bundledThumb, useHeldUri } from "@/features/game3d/heldDevice";

import { GP } from "./theme";

type Filament = typeof import("react-native-filament");
type Worklets = typeof import("react-native-worklets-core");
type Float3 = [number, number, number];

/**
 * The engine, when this build has it. A build without the native module (or
 * with the island turned off, or the web) draws thumbnails instead.
 */
const ENGINE: { F: Filament; W: Worklets } | null = (() => {
  if (Platform.OS === "web" || resolveIslandsOff(process.env.EXPO_PUBLIC_GAME_2D).has("forgeModel")) return null;
  try {
    return { F: require("react-native-filament") as Filament, W: require("react-native-worklets-core") as Worklets };
  } catch {
    return null;
  }
})();
const FILAMENT = ENGINE?.F ?? null;

/**
 * The GPU API. Filament's default (OpenGL ES on Android, Metal on iOS) unless
 * the build says otherwise: the Android emulator's software GL reports only
 * 256 vertex uniform vectors and Filament's lit shader does not link there,
 * so emulator runs use ANGLE (e2e/emu.sh EMU_GPU=swangle_indirect); vulkan
 * is there too but SwiftShader Vulkan crashed recreating swapchains (cq 056).
 */
/**
 * Frames per refresh: 2 is 30 fps on a 60 Hz screen, plenty for a turning
 * model or an idle clip and half the GPU work (battery). Test builds on the
 * software-rendered emulator use more (EXPO_PUBLIC_FORGE_FRAME_INTERVAL).
 */
const FRAME_RATE = { interval: Math.max(1, Math.min(6, Number(process.env.EXPO_PUBLIC_FORGE_FRAME_INTERVAL) || 2)) };
const BACKEND = ((v) => (v === "vulkan" || v === "opengl" || v === "metal" ? v : undefined))(process.env.EXPO_PUBLIC_FORGE_BACKEND);

export const FORGE_3D_RUNTIME = FILAMENT !== null;

const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  weapon: "flash",
  character: "person",
  environment: "leaf",
  station: "business",
};

/** A rendering problem stays inside the model's box. */
class Boundary extends Component<{ fallback: ReactNode; children: ReactNode; onError?: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError?.();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** The thumbnail as an image source: the server's, or the app's own for a starter weapon ("bundle:<slug>"). */
export function thumbSource(entry: ForgeEntry | null | undefined, width: 128 | 256 | 512 = 256): number | { uri: string } | null {
  const u = entry?.thumbnail?.url;
  if (u?.startsWith("bundle:")) return bundledThumb(u.slice(7));
  const url = thumbUrl(entry, width);
  return url ? { uri: url } : null;
}

function Thumb({ entry, size, loading }: { entry: ForgeEntry | null; size: number; loading: boolean }) {
  const src = thumbSource(entry, size > 200 ? 512 : 256);
  return (
    <View style={styles.fill} pointerEvents="none">
      {src ? (
        <Image source={src} style={styles.fill} contentFit="contain" transition={150} accessibilityIgnoresInvertColors />
      ) : (
        <View style={[styles.fill, styles.centre]}>
          <Ionicons name={TYPE_ICON[entry?.type ?? ""] ?? "cube"} size={Math.max(24, size * 0.35)} color="rgba(255,255,255,0.75)" />
        </View>
      )}
      {loading ? (
        <View style={[styles.fill, styles.centre]}>
          <ActivityIndicator color={GP.sun} />
        </View>
      ) : null}
    </View>
  );
}

/** The file:// uri of an entry's GLB for this purpose, once it is on the phone. `attempt` refetches after a failure. */
export function useForgeGlb(entry: ForgeEntry | null, purpose: ForgePurpose, lod?: number, attempt = 0): { uri: string | null; failed: boolean } {
  const file = entry ? glbFor(entry, purpose, lod) : null;
  const key = entry && file ? `${entry.id}@${entry.version}/${file.file}#${attempt}` : null;
  const [got, setGot] = useState<{ key: string | null; uri: string | null; failed: boolean }>({ key: null, uri: null, failed: false });
  useEffect(() => {
    if (!entry || !file || !key) return;
    let alive = true;
    void (file.url.startsWith("bundle:") ? bundledFile(file.url.slice(7)) : ensureFile(entry, file)).then((uri) => {
      if (alive) setGot({ key, uri, failed: uri === null });
    });
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!entry || !file) return { uri: null, failed: !!entry };
  return got.key === key ? { uri: got.uri, failed: got.failed } : { uri: null, failed: false };
}

export type ForgeModelProps = {
  /** The catalogue id (the entry is looked up in the store), or the entry itself. */
  id?: string | null;
  entry?: ForgeEntry | null;
  /** Shown only if the catalogue has this version (an older one falls back to the newest). */
  version?: number | null;
  /** Force a LOD (0 best, 2 lightest); else chosen by the phone and the purpose. */
  lod?: number;
  purpose?: ForgePurpose;
  /** idle | walk | celebrate (rigged entries); one-shot clips return to idle. */
  animation?: string | null;
  onAnimationEnd?: () => void;
  /**
   * The model is the thing being looked at (the claim moment): a short intro
   * turn that settles facing the camera, then drag to turn it and pinch to
   * zoom, with a gentle sway when left alone. A failed load says so, with a
   * retry, instead of a spinner.
   */
  spin?: boolean;
  /** The camera's distance in unit-cube terms (the model is fitted into a 1 m cube). */
  distance?: number;
  style?: StyleProp<ViewStyle>;
  /** For the box's size hint (thumbnail resolution). */
  size?: number;
  accessibilityLabel?: string;
  /**
   * A character holds its weapon (cq 234): the player's equipped one on their
   * own avatar, else its own (features/game3d/held.ts). false: empty-handed.
   */
  held?: boolean;
};

export function useForgeEntry(id: string | null | undefined, given?: ForgeEntry | null): ForgeEntry | null {
  const fromStore = useForgeWorld((s) => (id ? (s.entries.find((e) => e.id === id) ?? null) : null));
  return given ?? fromStore;
}

/**
 * How long a model may take to be on screen (download, the held-weapon merge,
 * Filament's parse) before the box gives up and says so. The file download has
 * its own, shorter limit (forgeWorldDevice.DOWNLOAD_TIMEOUT_MS).
 */
const LOAD_TIMEOUT_MS = 30_000;

export default function ForgeModel(props: ForgeModelProps) {
  const entry = useForgeEntry(props.id, props.entry);
  const size = props.size ?? 220;
  // A retry bumps this: a new download attempt and a fresh engine view.
  const [attempt, setAttempt] = useState(0);
  const { uri: bare, failed } = useForgeGlb(FILAMENT ? entry : null, props.purpose ?? "closeup", props.lod, attempt);
  // A character with its weapon in hand: the weapon is merged into its GLB
  // under the hand bone, so its clips carry it (features/game3d/heldDevice).
  const worn = useEquipped().avatar;
  const isCharacter = entry?.type === "character";
  const held = useHeldUri(isCharacter ? entry : null, bare, !!entry && worn === entry.id, props.held !== false && isCharacter);
  const uri = isCharacter ? held : bare;
  const [broken, setBroken] = useState(false);
  // The model is drawn (Filament loaded it), not only on the phone: the
  // thumbnail stays until then, so there is never an empty box.
  const [drawn, setDrawn] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const label = props.accessibilityLabel ?? (entry ? `${entry.name}, 3D model` : "Forge model");
  // The engine stays up while the model changes (one engine per view, not
  // per model: creating engines and swapchains is the expensive, fragile
  // part); the thumbnail covers it until the new model is on the phone.
  const [engineUp, setEngineUp] = useState(false);
  if (!engineUp && FILAMENT && uri && !broken) setEngineUp(true);
  const show3d = !!FILAMENT && engineUp && !broken;
  const ready = show3d && !!uri && !failed;
  const shown = ready && drawn === uri;
  const trying = !!FILAMENT && !!entry && !failed && !broken && !timedOut;
  // Never an endless spinner: whatever stalls (a download that never ends,
  // a model Filament never finishes), the box gives up after a while.
  useEffect(() => {
    if (!trying || shown) return;
    const t = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [trying, shown, attempt]);
  const gaveUp = !!FILAMENT && !!entry && (failed || broken || timedOut) && !shown;
  const retry = () => {
    setBroken(false);
    setTimedOut(false);
    setDrawn(null);
    setAttempt((n) => n + 1);
  };
  const interactive = !!props.spin;
  const control = useTurnControl(interactive);
  const model = (
    <View style={[styles.box, props.style]} accessible accessibilityRole="image" accessibilityLabel={label} accessibilityHint={interactive && shown ? "Drag to turn it, pinch to zoom" : undefined}>
      {show3d && FILAMENT && entry ? (
        <Boundary key={attempt} fallback={null} onError={() => setBroken(true)}>
          <FilamentModel
            F={FILAMENT}
            uri={ready ? uri : null}
            entry={entry}
            animation={props.animation ?? null}
            onAnimationEnd={props.onAnimationEnd}
            control={control}
            distance={props.distance ?? 2.7}
            onDrawn={setDrawn}
          />
        </Boundary>
      ) : null}
      {!shown ? <Thumb entry={entry} size={size} loading={trying && !uri && !gaveUp} /> : null}
      {gaveUp && interactive ? (
        <View style={styles.failBox} pointerEvents="box-none">
          <Pressable onPress={retry} style={styles.failPill} accessibilityRole="button" accessibilityLabel="The 3D model did not load. Try again">
            <Ionicons name="refresh" size={16} color="#FFF" />
            <Text style={styles.failText}>{"3D model didn't load · Retry"}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
  // Always wrapped when it can be turned (wrapping later would remount the 3D view); live once the model is drawn.
  return control ? <TurnGestures control={control} enabled={shown}>{model}</TurnGestures> : model;
}

// ---------- turning a model by hand ----------

type Shared<T> = { value: T };
/** What the gestures (JS) tell the render loop (Filament's worklet thread). */
type TurnControl = {
  /** The yaw the hand has put on the model, radians. */
  yaw: Shared<number>;
  /** A flick's spin, radians per second, slowed by friction in the loop. */
  velocity: Shared<number>;
  /** A finger is on it: no inertia, no sway. */
  holding: Shared<boolean>;
  /** Pinch zoom, 1 = as framed. */
  zoom: Shared<number>;
  /** Reduce Motion: no intro turn, no sway. */
  still: boolean;
};

/** Zoom limits for the pinch. */
const ZOOM_MIN = 0.75;
const ZOOM_MAX = 1.9;
/** Radians per point dragged: a drag across the stage is about one turn. */
const DRAG_RAD_PER_PT = (2 * Math.PI) / 360;

function useTurnControl(on: boolean): TurnControl | null {
  const still = useReducedMotion();
  return useMemo(() => {
    if (!on || !ENGINE) return null;
    const { Worklets } = ENGINE.W;
    return {
      yaw: Worklets.createSharedValue(0),
      velocity: Worklets.createSharedValue(0),
      holding: Worklets.createSharedValue(false),
      zoom: Worklets.createSharedValue(1),
      still,
    };
  }, [on, still]);
}

/** Drag to turn (with a flick's momentum), pinch to zoom, double tap to put it back. */
function TurnGestures({ control, enabled, children }: { control: TurnControl; enabled: boolean; children: ReactNode }) {
  const gesture = useMemo(() => {
    let startYaw = 0;
    let startZoom = 1;
    const pan = Gesture.Pan()
      .enabled(enabled)
      .runOnJS(true)
      .maxPointers(1)
      .minDistance(4)
      .onBegin(() => {
        control.holding.value = true;
        control.velocity.value = 0;
        startYaw = control.yaw.value;
      })
      .onUpdate((e) => {
        control.yaw.value = startYaw + e.translationX * DRAG_RAD_PER_PT;
      })
      .onEnd((e) => {
        control.velocity.value = Math.max(-12, Math.min(12, e.velocityX * DRAG_RAD_PER_PT));
      })
      .onFinalize(() => {
        control.holding.value = false;
      });
    const pinch = Gesture.Pinch()
      .enabled(enabled)
      .runOnJS(true)
      .onBegin(() => {
        control.holding.value = true;
        startZoom = control.zoom.value;
      })
      .onUpdate((e) => {
        control.zoom.value = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, startZoom * e.scale));
      })
      .onFinalize(() => {
        control.holding.value = false;
      });
    const reset = Gesture.Tap()
      .enabled(enabled)
      .runOnJS(true)
      .numberOfTaps(2)
      .onEnd(() => {
        control.velocity.value = 0;
        // Back to facing the camera: the nearest whole turn.
        control.yaw.value = Math.round(control.yaw.value / (2 * Math.PI)) * 2 * Math.PI;
        control.zoom.value = 1;
      });
    return Gesture.Simultaneous(pan, pinch, reset);
  }, [control, enabled]);
  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}

/** The intro turn: half a turn, easing to a stop facing the camera. */
const INTRO_S = 1.3;
const INTRO_RAD = -Math.PI;
/** A flick's spin dies away at this rate (per second, exponential). */
const FRICTION = 3.2;
/** Left alone this long (s), the model starts to sway, this far (rad) and this fast. */
const SWAY_AFTER_S = 2.5;
const SWAY_RAD = 0.16;
const SWAY_RATE = 0.9;

/**
 * Drives the model's root transform from the render loop. Filament's own
 * `rotate` prop multiplies onto the current transform every time it changes
 * (multiplyWithCurrentTransform), so the old turntable, which wrote an
 * absolute angle every frame, compounded it: the turn sped up without end
 * (that was the runaway spin). Here every frame sets the whole transform from
 * scratch: fitted into the unit cube, then turned, then zoomed.
 */
function Turntable({ F, root, aabb, control }: { F: Filament; root: unknown; aabb: unknown; control: TurnControl }) {
  const W = (ENGINE as { W: Worklets }).W;
  const { transformManager } = F.useFilamentContext();
  const state = W.useSharedValue({ t: 0, zoom: 1, idle: 0, sway: 0, swayW: 0 });
  const still = control.still;
  F.RenderCallbackContext.useRenderCallback(
    ({ timeSinceLastFrame }) => {
      "worklet";
      const s = state.value;
      const dt = Math.min(0.1, Math.max(0, timeSinceLastFrame));
      const t = s.t + dt;
      // The intro: eased out (cubic), so it lands softly facing the camera.
      const p = still ? 1 : Math.min(1, t / INTRO_S);
      const intro = INTRO_RAD * Math.pow(1 - p, 3);
      // A flick carries on and slows to a stop.
      const holding = control.holding.value;
      let v = control.velocity.value;
      if (!holding && v !== 0) {
        control.yaw.value = control.yaw.value + v * dt;
        v = v * Math.exp(-FRICTION * dt);
        control.velocity.value = Math.abs(v) < 0.01 ? 0 : v;
      }
      // Sway only once it has been left alone a while; it fades in and out.
      const idle = holding || Math.abs(v) > 0.01 || p < 1 ? 0 : s.idle + dt;
      const swayTarget = still || idle < SWAY_AFTER_S ? 0 : 1;
      const swayW = s.swayW + (swayTarget - s.swayW) * Math.min(1, dt * (swayTarget ? 0.8 : 6));
      const sway = s.sway + dt * SWAY_RATE;
      const yaw = intro + control.yaw.value + SWAY_RAD * swayW * Math.sin(sway);
      // The pinch, eased so it follows the fingers smoothly.
      const zoom = s.zoom + (control.zoom.value - s.zoom) * Math.min(1, dt * 14);
      transformManager.transformToUnitCube(root as never, aabb as never);
      transformManager.setEntityRotation(root as never, yaw, [0, 1, 0], true);
      transformManager.setEntityScale(root as never, [zoom, zoom, zoom], true);
      state.value = { t, zoom, idle, sway, swayW };
    },
    [transformManager, root, aabb, control, state, still],
  );
  return null;
}

function FilamentModel({
  F,
  uri,
  entry,
  animation,
  onAnimationEnd,
  control,
  distance,
  onDrawn,
}: {
  F: Filament;
  uri: string | null;
  entry: ForgeEntry;
  animation: string | null;
  onAnimationEnd?: () => void;
  control: TurnControl | null;
  distance: number;
  onDrawn?: (uri: string) => void;
}) {
  // A weapon stands on its grip and is long in +Y: look at it from a little
  // above; everything else from chest height.
  const eye: Float3 = entry.type === "weapon" ? [0, 0.15, distance] : [0, 0.12, distance];
  return (
    // A model the person turns by hand runs at the screen's rate; the rest at half.
    <F.FilamentScene backend={BACKEND} frameRateOptions={control ? HAND_RATE : FRAME_RATE}>
      <F.FilamentView style={styles.fill} enableTransparentRendering>
        <F.Camera cameraPosition={eye} cameraTarget={[0, 0, 0]} near={0.05} far={50} />
        <F.DefaultLight />
        {uri ? <Rigged key={uri} F={F} uri={uri} entry={entry} animation={animation} onAnimationEnd={onAnimationEnd} control={control} onLoaded={onDrawn} unitCube /> : null}
        {FPS_LOG ? <FrameMeter F={F} label={`model:${entry.name}`} /> : null}
      </F.FilamentView>
    </F.FilamentScene>
  );
}

const HAND_RATE = { interval: 1 };

/** One model (and its clip) inside a scene. Fitted into a unit cube, or placed in metres. */
function Rigged({
  F,
  uri,
  entry,
  animation,
  onAnimationEnd,
  control,
  onLoaded,
  unitCube,
  translate,
  scale,
  rotateY,
}: {
  F: Filament;
  uri: string;
  entry: ForgeEntry;
  animation: string | null;
  onAnimationEnd?: () => void;
  control?: TurnControl | null;
  onLoaded?: (uri: string) => void;
  unitCube?: boolean;
  translate?: Float3;
  scale?: number;
  rotateY?: number;
}) {
  const [clips, setClips] = useState<string[]>([]);
  const [playing, setPlaying] = useState<string | null>(animation);
  useEffect(() => setPlaying(animation), [animation]);
  // A one-shot clip (celebrate) plays once, then back to idle.
  const clip = entry.animations.find((a) => a.name === playing);
  const endRef = useRef(onAnimationEnd);
  endRef.current = onAnimationEnd;
  useEffect(() => {
    if (!playing || !clip || clip.loop || !clip.duration_s) return;
    const t = setTimeout(() => {
      setPlaying("idle");
      endRef.current?.();
    }, clip.duration_s * 1000);
    return () => clearTimeout(t);
  }, [playing, clip]);
  const index = clipIndex(clips, playing);
  // Stable arrays for the transforms (Filament compares them by value, but
  // there is no reason to hand it new ones on every render).
  const tx = translate?.join(",") ?? "";
  const translateArr = useMemo<Float3 | undefined>(() => (translate ? [translate[0], translate[1], translate[2]] : undefined), [tx]); // eslint-disable-line react-hooks/exhaustive-deps
  const scaleArr = useMemo<Float3 | undefined>(() => (scale ? [scale, scale, scale] : undefined), [scale]);
  const rotateArr = useMemo<Float3 | undefined>(() => (rotateY ? [0, rotateY, 0] : undefined), [rotateY]);
  const model = F.useModel({ uri });
  const loaded = model.state === "loaded";
  const loadedRef = useRef(onLoaded);
  loadedRef.current = onLoaded;
  useEffect(() => {
    if (loaded) loadedRef.current?.(uri);
  }, [loaded, uri]);
  return (
    <F.ModelRenderer model={model} transformToUnitCube={unitCube} translate={translateArr} scale={scaleArr} rotate={rotateArr} castShadow receiveShadow>
      {entry.rigged ? <F.Animator animationIndex={Math.max(0, index)} transitionDuration={0.25} onAnimationsLoaded={(a) => setClips(a.map((x) => x.name))} /> : null}
      {control && unitCube && model.state === "loaded" ? <Turntable F={F} root={model.rootEntity} aabb={model.boundingBox} control={control} /> : null}
    </F.ModelRenderer>
  );
}

/**
 * Frames drawn by this 3D view, logged every 5 s as `[forge-fps] <label> <fps>`
 * when EXPO_PUBLIC_WORLD_TIMING=1 (test builds): how the measurements in
 * docs/forge/DROP-IN.md were taken.
 */
const FPS_LOG = process.env.EXPO_PUBLIC_WORLD_TIMING === "1";
function FrameMeter({ F, label }: { F: Filament; label: string }) {
  const frames = (ENGINE as { W: Worklets }).W.useSharedValue(0);
  F.RenderCallbackContext.useRenderCallback(
    () => {
      "worklet";
      frames.value = frames.value + 1;
    },
    [frames],
  );
  useEffect(() => {
    let last = frames.value;
    const t = setInterval(() => {
      const now = frames.value;
      console.log(`[forge-fps] ${label} ${((now - last) / 5).toFixed(1)}`);
      last = now;
    }, 5000);
    return () => clearInterval(t);
  }, [frames, label]);
  return null;
}

// ---------- several entries in one scene ----------

export type StageItem = {
  entry: ForgeEntry;
  /** Where its pivot (base centre) stands, metres. */
  at?: Float3;
  /** Its height on stage in metres; else its own size. */
  height?: number;
  rotateY?: number;
  animation?: string | null;
  purpose?: ForgePurpose;
};

function StageModel({ F, item }: { F: Filament; item: StageItem }) {
  const { uri } = useForgeGlb(item.entry, item.purpose ?? "scene");
  if (!uri) return null;
  const own = item.entry.height_m ?? 1;
  const scale = item.height && own > 0 ? item.height / own : 1;
  return (
    <Boundary fallback={null}>
      <Rigged F={F} uri={uri} entry={item.entry} animation={item.animation ?? null} translate={item.at} scale={scale} rotateY={item.rotateY} />
    </Boundary>
  );
}

/**
 * A small scene: a ground or backdrop environment, a station, a character.
 * The camera looks at `target` from `eye` (metres). Items that fail to load
 * are left out; with no 3D at all, `fallback` shows (the screen's own 2D art).
 */
export function ForgeStage({
  items,
  eye = [0, 1.6, 6],
  target = [0, 1, 0],
  style,
  fallback = null,
}: {
  items: StageItem[];
  eye?: Float3;
  target?: Float3;
  style?: StyleProp<ViewStyle>;
  fallback?: ReactNode;
}) {
  const key = useMemo(() => items.map((i) => `${i.entry.id}@${i.entry.version}`).join("|"), [items]);
  if (!FILAMENT || !items.length) return <View style={style}>{fallback}</View>;
  const F = FILAMENT;
  return (
    <View style={style}>
      <Boundary fallback={fallback} key={key}>
        <F.FilamentScene backend={BACKEND} frameRateOptions={FRAME_RATE}>
          <F.FilamentView style={styles.fill} enableTransparentRendering>
            <F.Camera cameraPosition={eye} cameraTarget={target} near={0.1} far={200} />
            <F.DefaultLight />
            {items.map((item, i) => (
              <StageModel key={`${item.entry.id}-${i}`} F={F} item={item} />
            ))}
            {FPS_LOG ? <FrameMeter F={F} label={`stage:${items.length}`} /> : null}
          </F.FilamentView>
        </F.FilamentScene>
      </Boundary>
    </View>
  );
}

/** The entry for an id from the store, without subscribing (for one-off reads). */
export const forgeEntry = (id: string | null | undefined) => forgeWorld.entry(id);

const styles = StyleSheet.create({
  box: { overflow: "hidden" },
  fill: { ...StyleSheet.absoluteFill },
  centre: { alignItems: "center", justifyContent: "center" },
  failBox: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "flex-end", paddingBottom: 12 },
  failPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: "rgba(16,30,40,0.82)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  failText: { color: "#FFF", fontSize: 13, fontWeight: "600" },
});
