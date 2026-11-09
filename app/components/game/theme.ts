// The game's look, from costquest-ios UI/GameKit.swift (GamePalette) and
// Roam/RoamStyle.swift, so the React Native game reads as the same game.
import { FONTS } from "@/constants/fonts";
import { RARITY, rarityOf, TYPE } from "@/features/game/lookTokens";
import { C } from "@/theme/tokens";

const rgb = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;

/**
 * The game's palette, from the app's one theme (theme/palettes.ts, the
 * `game*` keys): today's values are GamePalette's, and EXPO_PUBLIC_PALETTE
 * swaps them with the chat's for the unified options.
 */
export const GP = {
  sky: C.gameSky,
  skyDeep: C.gameSkyDeep,
  grass: C.gameGrass,
  sun: C.gameSun,
  sunDeep: C.gameSunDeep,
  navy: C.gameNavy,
  navyEdge: C.gameNavyEdge,
  cream: C.gameCream,
  berry: C.gameBerry,
  mint: C.gameMint,
  ink: C.gameInk,
  ice: C.gameIce,
  slate: C.gameSlate,
  mist: C.gameMist,
  track: C.gameTrack,
  rare: C.gameRare,
  /** CosCoins: gold in every palette. */
  coin: C.coin,
  coinDeep: C.coinDeep,
} as const;

/** The four answer colours: "the blue one" means the same to every player. */
/** Blue, red, orange, green; deep enough that every one carries a white label (AA, 4:1 and up). */
export const CHOICE_COLORS = ["#2366D1", "#D2364A", "#C2650A", "#1F8A57"];

export function realmColor(realm: string | null | undefined): string {
  switch (realm) {
    // The Build Brief's six factions (progression.py ids), on the old realm colours where one maps.
    case "ascendants":
    case "anime":
      return rgb(1, 0.36, 0.6);
    case "icons":
      return rgb(0.89, 0.21, 0.21);
    case "everborns":
      return rgb(0.55, 0.32, 0.86);
    case "celestials":
      return rgb(0.12, 0.62, 0.8);
    case "blockbusters":
      return rgb(0.96, 0.62, 0.13);
    case "controllers":
      return rgb(0.2, 0.78, 0.45);
    case "marvel":
      return rgb(0.89, 0.21, 0.21);
    case "dc":
      return rgb(0.16, 0.45, 0.93);
    case "movies":
      return rgb(0.96, 0.62, 0.13);
    case "gaming":
      return rgb(0.2, 0.78, 0.45);
    default:
      return GP.skyDeep;
  }
}

/** Ionicons for the realm marks (the SF Symbols on iOS). */
export function realmIcon(realm: string | null | undefined): "sparkles" | "shield-half" | "flash" | "film" | "game-controller" | "flag" | "moon" | "planet" {
  switch (realm) {
    case "ascendants":
      return "sparkles";
    case "icons":
      return "shield-half";
    case "everborns":
      return "moon";
    case "celestials":
      return "planet";
    case "blockbusters":
      return "film";
    case "controllers":
      return "game-controller";
    case "anime":
      return "sparkles";
    case "marvel":
      return "shield-half";
    case "dc":
      return "flash";
    case "movies":
      return "film";
    case "gaming":
      return "game-controller";
    default:
      return "flag";
  }
}

/** A tier's rarity colour: the same on a map pin, a card frame and a drop beam (lookTokens.ts RARITY). */
export function tierColor(tier: string): string {
  return RARITY[rarityOf(tier)];
}

/** Roam/RoamStyle.swift challengeName: the native game's words. */
export function challengeName(kind: string): string {
  switch (kind) {
    case "sequence":
      return "Sequence";
    case "rebus":
      return "Rebus";
    case "blitz":
      return "Blitz";
    case "duel":
      return "Duel";
    default:
      return "Trivia";
  }
}

/** Features/DuelFeature.swift (the Guardian's difficulty on the briefing). */
export function difficultyName(tier: string): string {
  return tier === "epic" ? "Hard" : tier === "rare" ? "Even" : "Easy";
}

/**
 * A darker edge for the chunky game buttons (GamePalette.edge(of:)):
 * the same hue, saturation x1.1, brightness x0.68 (HSB).
 * `by` scales the brightness instead (the older flat edges).
 */
export function edgeOf(hex: string, by = 0.68): string {
  const n = parseInt(hex.slice(1, 7), 16);
  if (!Number.isFinite(n)) return hex;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  const s = max === 0 ? 0 : Math.min(1, (d / max) * 1.1);
  const v = max * by;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const [R, G, B] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][((i % 6) + 6) % 6];
  return `#${[R, G, B].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The game's type (GameKit.swift GameFont, loaded from ./fonts.ts):
 * display = Lilita One, the rest Fredoka by weight. `app*` are the chat
 * app's Poppins, for the few places the game shows the app's own words.
 */
/** The type scale (lookTokens.ts TYPE): spread one into a Text style, e.g. `[GT.title, { color }]`. */
export const GT = TYPE;

export const GF = {
  display: "CQ-LilitaOne",
  bold: "CQ-Fredoka-Bold",
  body: "CQ-Fredoka-SemiBold",
  regular: "CQ-Fredoka-Medium",
  appBold: FONTS.bold,
  appRegular: FONTS.regular,
} as const;
