// The 3D fight's switches for this build (cq 061). EXPO_PUBLIC_* values are
// inlined at bundle time, so each is read by its literal name here.
// See fight3d.ts (Fight3DFlags) for what each one does.
import { Platform } from "react-native";

import { godotLib } from "./engine";
import { fight3dFlags } from "./fight3d";

export const FIGHT3D = fight3dFlags(
  {
    EXPO_PUBLIC_GAME3D: process.env.EXPO_PUBLIC_GAME3D,
    EXPO_PUBLIC_GODOT_KEEP: process.env.EXPO_PUBLIC_GODOT_KEEP,
    EXPO_PUBLIC_GAME3D_AUTOSTART: process.env.EXPO_PUBLIC_GAME3D_AUTOSTART,
    EXPO_PUBLIC_GAME3D_CYCLE: process.env.EXPO_PUBLIC_GAME3D_CYCLE,
    EXPO_PUBLIC_GAME3D_CYCLE_MS: process.env.EXPO_PUBLIC_GAME3D_CYCLE_MS,
    EXPO_PUBLIC_GAME3D_AUTOPLAY: process.env.EXPO_PUBLIC_GAME3D_AUTOPLAY,
    EXPO_PUBLIC_GAME3D_TILES_URL: process.env.EXPO_PUBLIC_GAME3D_TILES_URL,
    EXPO_PUBLIC_GAME3D_LOD: process.env.EXPO_PUBLIC_GAME3D_LOD,
    EXPO_PUBLIC_GAME3D_PLACE: process.env.EXPO_PUBLIC_GAME3D_PLACE,
  },
  { os: Platform.OS, version: Platform.Version },
);

/** The 3D fight is offered: the flag is on and this build has the engine. With the flag off nothing loads it. */
export function fight3dAvailable(): boolean {
  return FIGHT3D.on && godotLib() !== null;
}

/**
 * Rooms (the 2D overhead shooter) is hidden until a 3D Rooms exists (battle-3d-only, 1 Nov 2026):
 * no More tile, no map beacons, no coach unlock. EXPO_PUBLIC_ROOMS=1 shows it again; the code and the
 * server routes are kept.
 */
export const ROOMS_ON = process.env.EXPO_PUBLIC_ROOMS === "1";
