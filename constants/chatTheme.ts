// ==========================================
// CHAT DARK MODE (Figma M06 · Option D · Dark mode)
// ==========================================
// The chat screens follow the phone's appearance (or the Appearance
// setting when it's set to Light or Dark).
//
// Instead of writing every chat style twice, each stylesheet is written
// once in light colours and `themedStyles` builds the dark copy from it by
// mapping each colour by its role:
//   text colours      dark ink -> near-white, greys -> lighter greys
//   surfaces/borders  white and pale tints -> deep navy surfaces (hue kept)
//   accents           the pinks and teal stay, slightly lifted
// Both copies are built once, when the file loads, so switching costs
// nothing at render time.
import { useMemo } from "react";
import { StyleSheet, useColorScheme } from "react-native";

import { useAppSelector } from "@/store/hooks";

export type ChatScheme = "light" | "dark";

// The chat background in dark mode (M06): a deep navy.
export const DARK_CHAT_BG = "#171823";
export const DARK_CHAT_BG_2 = "#1D1F2C";

export function useChatScheme(): ChatScheme {
  const system = useColorScheme();
  const mode = useAppSelector(
    (state) =>
      (state.settings as any)?.appearance?.themeMode ??
      (state.auth.user as any)?.appearance?.themeMode,
  ) as string | undefined;

  if (mode === "light" || mode === "dark") {
    return mode;
  }

  return system === "dark" ? "dark" : "light";
}

// ---------- colour maths ----------

type RGBA = { r: number; g: number; b: number; a: number };

function parse(color: string): RGBA | null {
  const c = color.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) {
    const [r, g, b] = m[1].split("").map((x) => parseInt(x + x, 16));
    return { r, g, b, a: 1 };
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c);
  if (m) {
    const n = parseInt(m[1], 16);
    return {
      r: (n >> 16) & 255,
      g: (n >> 8) & 255,
      b: n & 255,
      a: m[2] ? parseInt(m[2], 16) / 255 : 1,
    };
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(c);
  if (m) {
    const p = m[1].split(",").map((x) => parseFloat(x));
    if (p.length >= 3 && p.slice(0, 3).every((x) => !Number.isNaN(x))) {
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
  }
  return null;
}

function toHsl({ r, g, b }: RGBA) {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h /= 6;
  }
  return { h, s, l };
}

function fromHsl(h: number, s: number, l: number, a: number) {
  const hue = (p: number, q: number, t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  let r = l;
  let g = l;
  let b = l;
  if (s > 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue(p, q, h + 1 / 3);
    g = hue(p, q, h);
    b = hue(p, q, h - 1 / 3);
  }
  const to = (x: number) => Math.round(Math.min(1, Math.max(0, x)) * 255);
  if (a < 1) {
    return `rgba(${to(r)},${to(g)},${to(b)},${Math.round(a * 1000) / 1000})`;
  }
  return `#${[r, g, b].map((x) => to(x).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// A text / icon colour on a dark background.
export function darkText(color: string): string {
  const c = parse(color);
  if (!c) return color;
  const { h, s, l } = toHsl(c);
  if (l >= 0.8) return color; // already light (e.g. white on a pink button)
  if (l <= 0.35) return fromHsl(h, s * 0.25, 0.93 - l * 0.25, c.a);
  if (s > 0.35) return fromHsl(h, s, clamp(l + 0.14, 0, 0.78), c.a); // accents
  return fromHsl(h, s * 0.6, clamp(0.6 + (0.6 - l) * 0.4, 0.5, 0.75), c.a); // greys
}

// A background / border colour on a dark screen.
export function darkSurface(color: string): string {
  const c = parse(color);
  if (!c) return color;
  const { h, s, l } = toHsl(c);
  if (c.a < 1) {
    if (l <= 0.3 && c.a < 0.3) return `rgba(255,255,255,${Math.round(c.a * 1.2 * 1000) / 1000})`; // hairlines
    if (l <= 0.3) return color; // backdrops stay dark
    if (l >= 0.85) return fromHsl(0.64, 0.2, 0.17, c.a); // frosted white -> frosted navy
    return fromHsl(h, s, clamp(l + 0.1, 0, 0.75), clamp(c.a * 1.6, 0, 1)); // pink washes
  }
  if (l >= 0.8) {
    // White -> card navy; pale tints keep their hue (pink stays pinkish).
    const tinted = s > 0.12 && l < 0.985;
    return fromHsl(tinted ? h : 0.64, tinted ? clamp(s * 0.35, 0.12, 0.4) : 0.2, tinted ? 0.22 : 0.17, 1);
  }
  if (l <= 0.35) return color;
  if (s > 0.35) return color; // pink buttons and the like stay
  return fromHsl(h, s * 0.5, 0.3, 1); // mid greys -> dark grey
}

const TEXT_KEYS = new Set(["color", "tintColor", "textDecorationColor"]);

function mapStyle(style: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [key, value] of Object.entries(style)) {
    if (typeof value === "string" && /color$/i.test(key) && key !== "shadowColor") {
      out[key] = TEXT_KEYS.has(key) ? darkText(value) : darkSurface(value);
    } else if (Array.isArray(value)) {
      out[key] = value.map((v) => (v && typeof v === "object" ? mapStyle(v) : v));
    } else if (value && typeof value === "object") {
      out[key] = mapStyle(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

// Build both stylesheets once. `overrides` patches the dark copy where the
// automatic mapping isn't right.
export function themedStyles<T extends StyleSheet.NamedStyles<T>>(
  light: T,
  overrides: Partial<{ [K in keyof T]: Record<string, any> }> = {},
): { light: T; dark: T } {
  const dark: Record<string, any> = {};
  for (const [name, style] of Object.entries(light)) {
    dark[name] = { ...mapStyle(style as any), ...((overrides as any)[name] || {}) };
  }
  return {
    light: StyleSheet.create(light),
    dark: StyleSheet.create(dark as T),
  };
}

export function useThemedStyles<T>(pair: { light: T; dark: T }): T {
  return useChatScheme() === "dark" ? pair.dark : pair.light;
}

// For colours passed straight to icons and inputs (not in a stylesheet).
export function useInk() {
  const dark = useChatScheme() === "dark";
  return useMemo(
    () => ({
      dark,
      text: (color: string) => (dark ? darkText(color) : color),
      surface: (color: string) => (dark ? darkSurface(color) : color),
    }),
    [dark],
  );
}
