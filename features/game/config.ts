// Where the game points, and which game UI this build shows.
// Pure: no React Native imports (tested in features/game/__tests__).
//
// One place, like costquest-ios Net/CQConfig.swift: the map's ground and the
// API must come from the same server or the app draws one venue's world
// around another's points.

/** The live game (costquest-ios CQConfig.productionURLString). */
export const PRODUCTION_GAME_SERVER = "https://costquest.204.168.162.79.sslip.io";
/** Staging (costquest-ios scripts/demo-install.sh --staging). Test builds point here. */
export const STAGING_GAME_SERVER = "https://costquest-staging.204.168.162.79.sslip.io";

/**
 * The server for this build. `EXPO_PUBLIC_GAME_SERVER` is inlined by Metro at
 * bundle time: "staging", "production", or an https URL. Unset: production,
 * as on iOS. Anything that is not https is refused (falls back to production),
 * except a game server on this machine for local test runs: plain http to
 * localhost, 127.0.0.1 or 10.0.2.2 (the Android emulator's name for the host).
 */
export function resolveGameServer(raw: string | undefined | null): string {
  const value = (raw ?? "").trim();
  if (!value || value === "production") return PRODUCTION_GAME_SERVER;
  if (value === "staging") return STAGING_GAME_SERVER;
  if (/^https:\/\/[^\s/?#]+(\/[^\s?#]*)?$/i.test(value)) return value.replace(/\/+$/, "");
  if (/^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d{1,5})?\/?$/i.test(value)) return value.replace(/\/+$/, "");
  return PRODUCTION_GAME_SERVER;
}

/**
 * The public trivia web page (EXPO_PUBLIC_TRIVIA_WEB=1, a web build served at
 * <game server>/play): trivia is the whole site, so the root opens trivia and
 * the trivia screen has nowhere to close to. Native builds ignore it.
 */
export function triviaOnlyWeb(raw: string | undefined | null, platform: string): boolean {
  return platform === "web" && (raw ?? "").trim() === "1";
}

/** Anything but production wears a badge, so a test build is never mistaken for the game. */
export function isProductionServer(url: string): boolean {
  return url === PRODUCTION_GAME_SERVER;
}

/**
 * The game's UI: the shared React Native game in components/game, on every
 * platform (docs/one-codebase.md). The embedded SwiftUI game
 * (EXPO_PUBLIC_GAME_UI=native, its own copies of the 2D duel, Siege, raids and
 * quizzes) was taken out of the build on 1 Nov 2026 (battle-3d-only): its
 * native islands (Venue Events, the AR shrine, the Forge model view, the
 * hold-phones beacon) are still drawn inside the RN screens.
 */
export type GameUi = "rn";

/**
 * The game's screens, one id each, for the parity table (docs/one-codebase.md)
 * and the per-screen native fallback below. The shared RN game draws all of
 * them; a few are drawn by a thin native view inside the RN screen where only
 * the platform can draw them (3D model, AR, Unity), see NATIVE_ISLANDS.
 */
export const GAME_SCREENS = [
  "map",
  "hud",
  "pointSheet",
  "encounter",
  "duel",
  "reward",
  "onboarding",
  "journal",
  "warden",
  "raids",
  "live",
  "steps",
  "relics",
  "forge",
  "friends",
  "rooms",
  "more",
] as const;
export type GameScreen = (typeof GAME_SCREENS)[number];

/**
 * Native views the shared RN screens embed on iOS (ios/Embed/NativeIslands.swift,
 * VenueEventsIsland.swift, ShrineIsland.swift, SummonIsland.swift),
 * each with a 2D fallback the same screen draws when the island is off or absent:
 *   forgeModel  the Forge weapon's turning 3D model (RealityKit + GLBMesh)   -> 2D art
 *   unityDuel   the Guardian Duel drawn by Unity (DuelBridge)                -> 2D arena (same sim)
 *   venueEvents the paid venue games in AR (ARKit, VenueEventsIsland.swift)  -> no Events tile
 *   unityBattle the fantasy battle scene (BattleBridge)                       -> point fights stay duels
 *   arShrine    the shrine on its RealityKit stage or through the camera
 *               (ShrineIsland.swift)                                         -> 2D crystal
 *   arSummon    "See it here": a Forge model in the room (SummonIsland.swift) -> no button
 *   (FriendBeaconIsland.swift has no 2D twin: where it is missing the hold-phones card is not shown.)
 */
export const NATIVE_ISLANDS = ["forgeModel", "venueEvents", "arShrine", "arSummon", "arReveal"] as const;
export type NativeIsland = (typeof NATIVE_ISLANDS)[number];

/**
 * Which islands this build turns OFF: `EXPO_PUBLIC_GAME_2D=forgeModel,arShrine`
 * (or `all`) draws those parts in 2D even where the native view exists, as a
 * fallback if one misbehaves on a phone. Unknown names are ignored.
 */
export function resolveIslandsOff(raw: string | undefined | null): ReadonlySet<NativeIsland> {
  const names = (raw ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  if (names.includes("all")) return new Set(NATIVE_ISLANDS);
  return new Set(NATIVE_ISLANDS.filter((n) => names.includes(n)));
}

/**
 * Test builds only: the iOS shrine through the camera (ShrineIsland.swift,
 * ARKit) on by default and one tap away, so the AR island can be proved on a
 * real phone (phone-hardware design, Phase 2 step 0, 1 Nov 2026). With it on:
 * the shrine opens through the camera at a quiz point unless the player chose
 * the 3D stage, the camera switch shows at a Forge-station point too, and More
 * has an "AR shrine" tile (app/dev/ar-shrine.tsx, cosquest://dev/ar-shrine).
 *
 * `EXPO_PUBLIC_AR_SHRINE=1` turns it on, `0` off; unset follows the test-build
 * flag `EXPO_PUBLIC_E2E=1`. A store build sets neither, so it is off there.
 */
export function arShrineDevFor(flag: string | undefined | null, e2e: string | undefined | null): boolean {
  if (flag === "1") return true;
  if (flag === "0") return false;
  return e2e === "1";
}


