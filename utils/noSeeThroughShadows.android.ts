// ==========================================
// ANDROID: no grey frames in see-through boxes (for every screen)
// ==========================================
// On Android, a box with a see-through background (like "#0000000D" or
// rgba(..., 0.4)) AND a shadow (`elevation`) shows that shadow THROUGH its
// own background: a grey frame inside the box. This runs once at app start
// (first import in app/_layout.tsx) and, for every StyleSheet.create - so
// every screen and themedStyles, including ones written later - turns off
// `elevation` on styles whose background is see-through. Colours, borders
// and the iPhone/website shadows (shadowColor, shadowOpacity...) are
// untouched; solid boxes keep their Android shadow.
import { StyleSheet } from "react-native";

function seeThrough(color: unknown): boolean {
  if (typeof color !== "string") return false;
  const v = color.trim().toLowerCase();
  if (v === "transparent") return true;
  let m = v.match(/^#([0-9a-f]{8})$/);
  if (m) return parseInt(m[1].slice(6), 16) < 255;
  m = v.match(/^#([0-9a-f]{4})$/);
  if (m) return parseInt(m[1][3], 16) < 15;
  m = v.match(/^(?:rgba|hsla)\(.*,\s*([\d.]+%?)\s*\)$/);
  if (m) return m[1].endsWith("%") ? parseFloat(m[1]) < 100 : parseFloat(m[1]) < 1;
  return false;
}

function fix(style: any) {
  if (style && typeof style === "object" && !Array.isArray(style) && style.elevation && seeThrough(style.backgroundColor)) {
    return { ...style, elevation: 0 };
  }
  return style;
}

const sheet = StyleSheet as any;
if (!sheet.__noSeeThroughShadows) {
  sheet.__noSeeThroughShadows = true;
  const create = sheet.create;
  sheet.create = (styles: Record<string, any>) => {
    const fixed: Record<string, any> = {};
    for (const key of Object.keys(styles || {})) fixed[key] = fix(styles[key]);
    return create(fixed);
  };
}

export {};
