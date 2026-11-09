// The app's colours, one place for both halves (chat and game).
//
// `current` is the look the app ships today: the chat's pink on navy and the
// game's sky and sun (costquest-ios GamePalette). A, B and C are the unified
// options for docs/polish/PALETTE.md. Which one the build uses is one flag,
// EXPO_PUBLIC_PALETTE (current | A | B | C), read in ./tokens.ts. The default
// stays `current` until Subomi and Mark choose; nothing here picks for them.
//
// Every palette has the same keys. Chat roles first, then the game's
// (the `game*` keys are GP in components/game/theme.ts).

export type PaletteName = "current" | "A" | "B" | "C";

export type Palette = {
  // --- brand -----------------------------------------------------------
  /** The brand accent: buttons, links, selected tabs, unread dots. */
  brand: string;
  /** Was #B63D91: now the brand pink in every palette. */
  brandDeep: string;
  /** Was #C34D9C: now the brand pink in every palette. */
  brandSoft: string;
  /** A pale brand wash behind brand icons and chips. */
  brandTint: string;
  /** The loud brand (badges, live dots). */
  brandVivid: string;
  /** Deep plum: dark brand surfaces and their text. */
  plum: string;
  plumDark: string;
  plumInk: string;
  /** The pale lilac card. */
  lilac: string;

  // --- ink (text and icons) --------------------------------------------
  /** Headings and body text. */
  ink: string;
  /** Navy ink for chat bubbles and the call UI. */
  inkNavy: string;
  inkSoft: string;
  ink2: string;
  /** Secondary text. */
  muted: string;
  /** Labels and captions on cards. */
  slate: string;
  grey1: string;
  grey2: string;
  grey3: string;
  grey4: string;
  grey5: string;
  /** Placeholder text in inputs. */
  placeholder: string;

  // --- states ----------------------------------------------------------
  danger: string;
  dangerDeep: string;
  dangerInk: string;
  teal: string;

  // --- pale screens ----------------------------------------------------
  skyPale: string;
  skyPale2: string;
  skyWash: string;

  // --- the game (GP) ---------------------------------------------------
  gameSky: string;
  gameSkyDeep: string;
  gameGrass: string;
  gameSun: string;
  gameSunDeep: string;
  gameNavy: string;
  gameNavyEdge: string;
  gameCream: string;
  gameBerry: string;
  gameMint: string;
  gameInk: string;
  gameIce: string;
  gameSlate: string;
  gameMist: string;
  gameTrack: string;
  gameRare: string;
  /** CosCoins stay gold in every option. */
  coin: string;
  coinDeep: string;
};

/** Today's look, value for value (the token migration changes nothing). */
const current: Palette = {
  brand: "#C5399A",
  // Near-duplicates of the brand pink, collapsed into it (audit C): were
  // #B63D91 (41 uses) and #C34D9C (29 uses).
  brandDeep: "#C5399A",
  brandSoft: "#C5399A",
  brandTint: "#F3DDED",
  brandVivid: "#DC179F",
  plum: "#7D356D",
  plumDark: "#2A1030",
  plumInk: "#1D1020",
  lilac: "#F0EDF9",

  ink: "#191922",
  inkNavy: "#24283C",
  inkSoft: "#2B2B2C",
  ink2: "#3B3B42",
  muted: "#9C9CAA",
  slate: "#66738A",
  grey1: "#8A8A90",
  // #8A8A93 (17 uses) collapsed into #8A8A90, #777780 (9) into #7A7A84.
  grey2: "#8A8A90",
  grey3: "#6B6B72",
  grey4: "#7A7A84",
  grey5: "#7A7A84",
  placeholder: "#9AA3B5",

  danger: "#D64545",
  dangerDeep: "#C0394B",
  dangerInk: "#B42318",
  teal: "#2A8A92",

  skyPale: "#F6F9FE",
  skyPale2: "#E3F0FC",
  skyWash: "#E1F3FF",

  // "Sunlit Real Places" (cosquest-review/art-direction ART-DIRECTION.md 2.5,
  // 2.6, tokens.json ui): warm cream paper, one ink, the Sun/Mint/Sky/Berry
  // accents and gold coins. The game's UI kit is components/game/look.ts.
  gameSky: "#86AEE0",
  gameSkyDeep: "#1F7FC2",
  gameGrass: "#7FB356",
  gameSun: "#F59E2A",
  gameSunDeep: "#B8650A",
  gameNavy: "#1C2B3A",
  gameNavyEdge: "#121A26",
  gameCream: "#FFFDF8",
  gameBerry: "#D93840",
  gameMint: "#2FA36B",
  gameInk: "#1C2B3A",
  gameIce: "#EDE5D6",
  gameSlate: "#8FA3B5",
  gameMist: "#5A6878",
  gameTrack: "#E4DBCB",
  gameRare: "#9961F7",
  coin: "#F5B82E",
  coinDeep: "#B8860B",
};

/**
 * Option A: the chat's pink and navy everywhere. The game's sun (its main
 * buttons and highlights) becomes the brand pink, its sky and ice become the
 * chat's lilac and pale blue, its ink the chat's navy.
 */
const A: Palette = {
  ...current,
  gameSky: "#B9A7E0",
  gameSkyDeep: "#6B4FB8",
  gameSun: "#C5399A",
  gameSunDeep: "#8E2470",
  gameNavy: "#24283C",
  gameNavyEdge: "#191922",
  gameCream: "#FFFFFF",
  gameInk: "#191922",
  gameIce: "#E9E1F5",
  gameSlate: "#A99BC4",
  gameMist: "#66738A",
  gameTrack: "#E4DDF0",
  coin: "#F2992E",
  coinDeep: "#D1780F",
};

/**
 * Option B: the game's sky and sun everywhere. The chat's brand pink becomes
 * the game's deep sky blue, its warm accents the sun, its ink the game's navy.
 */
const B: Palette = {
  ...current,
  brand: "#2B99D6",
  brandDeep: "#2B99D6",
  brandSoft: "#2B99D6",
  brandTint: "#D6ECF7",
  brandVivid: "#F2992E",
  plum: "#1F3B4D",
  plumDark: "#122633",
  plumInk: "#122633",
  lilac: "#E6F1F6",
  ink: "#1F3B4D",
  inkNavy: "#1F3B4D",
  inkSoft: "#1F3B4D",
  ink2: "#35505F",
  muted: "#8CA2AE",
  slate: "#5C7A8C",
  placeholder: "#8CB3C4",
  skyPale: "#F2F7FA",
  skyPale2: "#DCEEF6",
  skyWash: "#D6ECF7",
};

/**
 * Option C: a blend. The brand pink stays the one accent for actions in both
 * halves (the game's main buttons turn pink, coins stay gold), the game keeps
 * its sky, and both halves share one navy ink.
 */
const C: Palette = {
  ...current,
  ink: "#1C2333",
  inkNavy: "#1C2333",
  gameNavy: "#1C2333",
  gameNavyEdge: "#121722",
  gameInk: "#1C2333",
  gameSun: "#C5399A",
  gameSunDeep: "#8E2470",
  skyWash: "#DDEFF8",
  coin: "#F2992E",
  coinDeep: "#D1780F",
};

export const PALETTES: Record<PaletteName, Palette> = { current, A, B, C };

/** The palette names, with the one-line pitch PALETTE.md and the dev screen show. */
export const PALETTE_NOTES: Record<PaletteName, string> = {
  current: "Today: chat pink on navy, game sky and sun.",
  A: "Chat pink and navy everywhere (the game turns pink and lilac).",
  B: "Game sky and sun everywhere (the chat turns sky blue).",
  C: "Blend: pink for actions in both halves, game keeps its sky, one navy ink.",
};

export function paletteName(raw: string | undefined | null): PaletteName {
  return raw === "A" || raw === "B" || raw === "C" ? raw : "current";
}
