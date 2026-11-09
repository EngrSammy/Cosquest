// The game's UI kit as numbers: "Sunlit Real Places" (cosquest-review/
// art-direction/ART-DIRECTION.md sections 2.5 to 2.7 and 6, tokens.json `ui`).
// One light model for the map, the 3D world and the screens: warm cream paper
// by day, deep ink by dusk, the Sun / Mint / Sky / Berry accents, rarity and
// faction colours that mean the same thing on the map, in the bag and in the
// fight, and one type system (Lilita One + Fredoka).
//
// Pure (no React Native): features/game/__tests__/lookTokens.test.ts checks
// every text pairing against WCAG AA. components/game/look.ts is the hook side.

export type Scheme = "light" | "dark";

export type Surfaces = {
  /** The page behind a full-screen game screen. */
  screen: string;
  /** Cards and sheets. */
  surface: string;
  /** A well: segmented-control tracks, inset rows. */
  surfaceAlt: string;
  text: string;
  textMuted: string;
  hairline: string;
  scrim: string;
};

export const SURFACES: Record<Scheme, Surfaces> = {
  light: {
    screen: "#F4EEE2",
    surface: "#FFFDF8",
    surfaceAlt: "#EDE5D6",
    text: "#1C2B3A",
    textMuted: "#5A6878",
    hairline: "rgba(28,43,58,0.10)",
    scrim: "rgba(18,26,38,0.45)",
  },
  dark: {
    screen: "#121A26",
    surface: "#1B2536",
    surfaceAlt: "#243149",
    text: "#F3F0E8",
    textMuted: "#A3AFBE",
    hairline: "rgba(255,255,255,0.10)",
    scrim: "rgba(0,0,0,0.60)",
  },
};

/** Over the 3D fight: ink glass with a faint white rim. */
export const HUD_GLASS = { fill: "rgba(18,26,38,0.62)", border: "rgba(255,255,255,0.14)" } as const;

export type Accent = { fill: string; edge: string; label: string };

/** Buttons and chips: a flat fill, a darker 4 px bottom edge, a label that passes contrast. */
export const ACCENT = {
  /** Primary action. Ink label: white on orange fails AA. */
  sun: { fill: "#F59E2A", edge: "#B8650A", label: "#2A1600" },
  /** Go / confirm. White label at 18 px bold and up only (3.2:1). */
  mint: { fill: "#2FA36B", edge: "#1E6E48", label: "#FFFFFF" },
  /** Info and links. */
  sky: { fill: "#1F7FC2", edge: "#155A8A", label: "#FFFFFF" },
  /** Danger and leaving. */
  berry: { fill: "#D93840", edge: "#9A2228", label: "#FFFFFF" },
  /** Coins. */
  coin: { fill: "#F5B82E", edge: "#B8860B", label: "#2A1600" },
  /** The quiet one: ink on cream. */
  ink: { fill: "#1C2B3A", edge: "#0B131C", label: "#FFFDF8" },
} as const satisfies Record<string, Accent>;

/** Status words on light paper (AA as body text). */
export const TEXT_ON_LIGHT = { success: "#1E7A52", danger: "#B42830", info: "#1F6FB0", warning: "#8A5200" } as const;
/** And on dark paper. */
export const TEXT_ON_DARK = { success: "#6BD39E", danger: "#FF8A8F", info: "#7DBDF0", warning: "#F5C063" } as const;

export type Rarity = "common" | "rare" | "epic" | "legendary";

/** Pin rings, card frames and drop beams: one colour per rarity, everywhere. */
export const RARITY: Record<Rarity, string> = {
  common: "#8FA3B5",
  rare: "#3D8EF0",
  epic: "#9961F7",
  legendary: "#F5B82E",
};

/** A server tier ("common" | "rare" | "epic" | "legendary" | anything) as a rarity. */
export function rarityOf(tier: string | null | undefined): Rarity {
  return tier === "rare" || tier === "epic" || tier === "legendary" ? tier : "common";
}

export type FactionLook = { fill: string; text: string; label: string };

/** Mark's deck: the six factions, one set for the reach ring, the puck, territory, badges and the fight ring. */
export const FACTION: Record<string, FactionLook> = {
  controllers: { fill: "#2D6ED2", text: "#2D6ED2", label: "#FFFFFF" },
  celestials: { fill: "#35B9E6", text: "#1B7FA8", label: "#1C2B3A" },
  icons: { fill: "#7C5CF0", text: "#6A48E0", label: "#FFFFFF" },
  blockbusters: { fill: "#C8D800", text: "#5E6A00", label: "#1C2B3A" },
  everborn: { fill: "#F03A5F", text: "#C8213F", label: "#FFFFFF" },
  everborns: { fill: "#F03A5F", text: "#C8213F", label: "#FFFFFF" },
  ascendants: { fill: "#D633A8", text: "#B0228A", label: "#FFFFFF" },
};

/** The game's realms on quiz and codex chips only: they never tint the map or the fight. */
export const REALM_CHIP: Record<string, string> = {
  anime: "#FF5C99",
  marvel: "#E33636",
  dc: "#2973ED",
  movies: "#F59E21",
  gaming: "#33C773",
};

/** The two faces, as loaded by components/game/fonts.ts. */
export const FACE = {
  display: "CQ-LilitaOne",
  bold: "CQ-Fredoka-Bold",
  semibold: "CQ-Fredoka-SemiBold",
  medium: "CQ-Fredoka-Medium",
} as const;

export type TypeToken = { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing?: number };

/** The type scale (6.1). Nothing smaller than `caption` anywhere. */
export const TYPE = {
  hero: { fontFamily: FACE.display, fontSize: 56, lineHeight: 60 },
  display: { fontFamily: FACE.display, fontSize: 40, lineHeight: 44 },
  title: { fontFamily: FACE.display, fontSize: 28, lineHeight: 32 },
  headline: { fontFamily: FACE.bold, fontSize: 22, lineHeight: 26 },
  bodyL: { fontFamily: FACE.semibold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: FACE.medium, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: FACE.semibold, fontSize: 13, lineHeight: 16, letterSpacing: 0.2 },
  caption: { fontFamily: FACE.medium, fontSize: 12, lineHeight: 16 },
  button: { fontFamily: FACE.display, fontSize: 20, lineHeight: 24 },
  /** Timers, coins, XP: Lilita, sized by the layout. */
  number: { fontFamily: FACE.display, fontSize: 17, lineHeight: 22 },
} as const satisfies Record<string, TypeToken>;

export const MIN_TEXT_PX = 12;

/** Corner radii (6.2). */
export const RADIUS = { chip: 10, button: 16, card: 20, sheet: 28, pill: 999 } as const;

/** Spacing steps, in points. */
export const SPACE = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 28 } as const;

/** Chunky buttons: the edge they sit on, and how far they sink when pressed. */
export const BUTTON = { edge: 4, pressedEdge: 1, pressedTranslate: 3, edgeBrightness: 0.68 } as const;

// ---------- colour maths ----------

function channels(color: string): [number, number, number, number] | null {
  const c = color.trim();
  let m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) / 255 : 1];
  }
  m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) {
    const [r, g, b] = m[1].split("").map((x) => parseInt(x + x, 16));
    return [r, g, b, 1];
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(c);
  if (m) {
    const p = m[1].split(",").map((x) => parseFloat(x));
    if (p.length >= 3) return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  return null;
}

/** A colour (with alpha) laid over an opaque background, as #RRGGBB. */
export function over(color: string, background: string): string {
  const f = channels(color);
  const b = channels(background);
  if (!f || !b) return color;
  const a = f[3];
  const mix = [0, 1, 2].map((i) => Math.round(f[i] * a + b[i] * (1 - a)));
  return `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** WCAG relative luminance of an opaque colour. */
export function luminance(color: string): number {
  const c = channels(color);
  if (!c) return 0;
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

/** WCAG contrast ratio between two colours (the foreground composited over the background when it has alpha). */
export function contrast(foreground: string, background: string): number {
  const a = luminance(over(foreground, background));
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const INK = "#1C2B3A";
const PAPER = "#FFFFFF";

/**
 * The label colour for text on a fill: the accent's own label when the fill
 * is one of ours, otherwise whichever of ink or white reads better (so a
 * white label never sits on Sun, coin or Celestials).
 */
export function labelOn(fill: string): string {
  const key = fill.toUpperCase();
  for (const a of Object.values(ACCENT)) if (a.fill.toUpperCase() === key) return a.label;
  for (const f of Object.values(FACTION)) if (f.fill.toUpperCase() === key) return f.label;
  return contrast(INK, fill) >= contrast(PAPER, fill) ? INK : PAPER;
}

/** The darker edge of a chunky shape: the same hue, brightness x`by`. */
export function edgeColor(fill: string, by: number = BUTTON.edgeBrightness): string {
  const key = fill.toUpperCase();
  for (const a of Object.values(ACCENT)) if (a.fill.toUpperCase() === key) return a.edge;
  const c = channels(fill);
  if (!c) return fill;
  return `#${[c[0], c[1], c[2]].map((v) => Math.round(v * by).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** A deck faction's look, or null when the faction is unknown. */
export function factionLook(chatFaction: string | null | undefined): FactionLook | null {
  return chatFaction ? FACTION[chatFaction.toLowerCase()] ?? null : null;
}
