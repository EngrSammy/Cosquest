// The design tokens both halves import: colours (light and dark), the type
// scale, spacing, radius, elevation and motion. The chat's screens use `C`
// and friends directly; the game's GP (components/game/theme.ts) is built
// from the same palette, so one flag changes both.
//
// EXPO_PUBLIC_PALETTE picks the palette at build time (./palettes.ts);
// unset = today's look.
import { Platform } from "react-native";

import { darkSurface, darkText } from "./dark";
import { type Palette, type PaletteName, PALETTES, paletteName } from "./palettes";

export const PALETTE: PaletteName = paletteName(process.env.EXPO_PUBLIC_PALETTE);

/** The active palette's colours (light). Use these instead of hex literals. */
export const C: Palette & { white: string; black: string } = {
  ...PALETTES[PALETTE],
  white: "#FFFFFF",
  black: "#000000",
};

/** Semantic roles, light and dark. Text and surfaces map through theme/dark.ts. */
function roles(p: typeof C) {
  return {
    text: p.ink,
    textMuted: p.muted,
    textSubtle: p.slate,
    placeholder: p.placeholder,
    accent: p.brand,
    accentTint: p.brandTint,
    onAccent: p.white,
    surface: p.white,
    surfaceAlt: p.lilac,
    screen: p.skyPale,
    border: "rgba(36,40,60,0.08)",
    danger: p.danger,
    success: p.gameMint,
    scrim: "rgba(0,0,0,0.45)",
  };
}

export type Roles = ReturnType<typeof roles>;

const LIGHT_ROLES: Roles = roles(C);

const DARK_ROLES: Roles = {
  ...LIGHT_ROLES,
  text: darkText(LIGHT_ROLES.text),
  textMuted: darkText(LIGHT_ROLES.textMuted),
  textSubtle: darkText(LIGHT_ROLES.textSubtle),
  placeholder: darkText(LIGHT_ROLES.placeholder),
  accent: darkText(LIGHT_ROLES.accent),
  accentTint: darkSurface(LIGHT_ROLES.accentTint),
  surface: "#1D1F2C",
  surfaceAlt: darkSurface(LIGHT_ROLES.surfaceAlt),
  screen: "#171823",
  border: "rgba(255,255,255,0.1)",
  scrim: "rgba(0,0,0,0.6)",
};

export const ROLES = { light: LIGHT_ROLES, dark: DARK_ROLES } as const;

/** The type scale (Poppins in the app, the game's own faces in GF). */
export const type = {
  caption: { fontSize: 12, lineHeight: 16 },
  small: { fontSize: 13, lineHeight: 18 },
  body: { fontSize: 15, lineHeight: 21 },
  bodyLarge: { fontSize: 16, lineHeight: 22 },
  title: { fontSize: 18, lineHeight: 24 },
  headline: { fontSize: 22, lineHeight: 28 },
  display: { fontSize: 28, lineHeight: 34 },
} as const;

/** Spacing, on a 4 pt grid. */
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, sheet: 28, pill: 999 } as const;

/** Shadows, the same three levels on both platforms. */
export const elevation = {
  none: {},
  low: Platform.select({
    ios: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    default: { elevation: 2 },
  }),
  mid: Platform.select({
    ios: { shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
    default: { elevation: 6 },
  }),
  high: Platform.select({
    ios: { shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
    default: { elevation: 12 },
  }),
} as const;

/** Motion durations (ms). The game's springs keep their own physics. */
export const motion = { instant: 90, fast: 160, base: 220, slow: 320, skeletonPulse: 900 } as const;
