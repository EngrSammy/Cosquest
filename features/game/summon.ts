// "See it here" (phone-hardware design 2.3, Phase 2 step 1): a Forge character
// or weapon in the player's room through the camera, on iOS
// (modules/costquest-game/ios/Embed/SummonIsland.swift, the screen
// components/game/SummonAR.tsx). Pure: which file, which LOD, whether the
// button shows, the scale limits and the words (tested in
// features/game/__tests__/summon.test.ts).
//
// Android: no button yet. ARCore + SceneView is Phase 2 step 3 (it needs an
// ARCore-certified phone and the Filament clash check), so the button is
// hidden there rather than opening something half-made.
import type { DeviceClass, ForgeEntry, ForgeFileRef } from "./forgeWorld.ts";

/**
 * The USDZ level of detail for AR on this phone class. The model is seen at
 * arm's length, so the full mesh (LOD 0, ~27k tris, 2048 textures, ~3 MB) on
 * a good phone; LOD 1 (~11k, 1024) elsewhere, comfortable for RealityKit.
 */
export function arLod(cls: DeviceClass): number {
  return cls === "high" ? 0 : 1;
}

/** The USDZ to load: the wanted LOD, else the nearest lighter one, else the nearest heavier one. Null when none. */
export function pickUsdz(entry: Pick<ForgeEntry, "lods">, lod: number): (ForgeFileRef & { lod: number }) | null {
  const withUsdz = entry.lods.filter((l) => l.usdz);
  if (!withUsdz.length) return null;
  const lighter = withUsdz.filter((l) => l.lod >= lod).sort((a, b) => a.lod - b.lod)[0];
  const pick = lighter ?? [...withUsdz].sort((a, b) => b.lod - a.lod)[0];
  return { ...(pick.usdz as ForgeFileRef), lod: pick.lod };
}

export type SummonKind = "character" | "weapon" | "object";

export function summonKind(entry: Pick<ForgeEntry, "type">): SummonKind {
  return entry.type === "character" ? "character" : entry.type === "weapon" ? "weapon" : "object";
}

/**
 * The height to stand at (metres): the catalogue's bounds for a character
 * (true scale, ~1.8 m for the cast), 0 to let the phone use the model's own.
 * Out-of-range bounds (a pack in centimetres) are ignored.
 */
export function summonHeight(entry: Pick<ForgeEntry, "type" | "bounds_m" | "height_m">): number {
  if (entry.type !== "character") return 0;
  const h = entry.height_m ?? (entry.bounds_m ? entry.bounds_m[1] : null);
  return h !== null && Number.isFinite(h) && h > 0.3 && h < 4 ? h : 0;
}

/** How far a pinch may shrink or grow it: a character to tabletop (~18 cm) and a little over life size. */
export function summonScaleLimits(kind: SummonKind): { min: number; max: number } {
  return kind === "character" ? { min: 0.1, max: 1.5 } : { min: 0.2, max: 3 };
}

export type SummonSupport = {
  platform: string;
  /** The native view is in this build (CostQuestSummonView). */
  nativeView: boolean;
  /** EXPO_PUBLIC_GAME_2D turned the island off. */
  islandOff: boolean;
};

/**
 * Whether "See it here" shows for an entry: iOS with the native view, and a
 * USDZ to show. A phone without world tracking still gets the button and a
 * full-screen 3D turntable (summonMode).
 */
export function summonShown(entry: Pick<ForgeEntry, "lods"> | null | undefined, s: SummonSupport): boolean {
  if (!entry || s.platform !== "ios" || !s.nativeView || s.islandOff) return false;
  return entry.lods.some((l) => l.usdz);
}

export type SummonMode = "ar" | "turntable";

/** Through the camera, or the 3D turntable: no world tracking, camera refused, or the AR view failed. */
export function summonMode(arSupported: boolean, phase: SummonPhase | null): SummonMode {
  if (!arSupported) return "turntable";
  return phase === "denied" || phase === "failed" ? "turntable" : "ar";
}

/** What the native view says (SummonIsland.swift onSummonState). */
export type SummonPhase = "looking" | "placed" | "denied" | "failed";

/** The one line of help on the screen, for each moment. */
export function summonHint(kind: SummonKind, phase: SummonPhase | null, recording: boolean): string {
  if (recording) return "Recording. Let go to stop.";
  switch (phase) {
    case "placed":
      return kind === "character"
        ? "Drag to move, twist to turn, pinch to resize. Double tap to celebrate."
        : "Drag to move, twist to turn, pinch to resize.";
    case "denied":
      return "Camera is off for CosQuest. Turn it on in Settings to see it in your room.";
    case "failed":
      return "Can't open the camera view here. Here it is in 3D.";
    default:
      return "Point your phone at the floor.";
  }
}

/** VoiceOver's name for the button and the screen. */
export function summonLabel(name: string): string {
  return `See ${name} in your room`;
}

/** The longest clip, seconds (the native recorder stops a hair later). */
export const SUMMON_CLIP_S = 10;

/** The message beside a shared photo or clip: the name, no place (nothing about where the player is). */
export function summonShareText(name: string): string {
  return `${name}, summoned with CosQuest`;
}
