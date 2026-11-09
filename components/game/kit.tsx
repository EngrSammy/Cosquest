// The game's controls ("Sunlit Real Places" UI kit, art direction 6.2 and
// features/game/lookTokens.ts): chunky buttons, a flat fill on a darker 4 px
// edge they sink into, with a label that always passes contrast (ink on Sun
// and coins, never white); round map controls on cream paper; chips, panels,
// headings in Lilita One and Fredoka; a coin and a progress bar.
// Press feedback is on press-DOWN, as on iOS: a light impact the moment the
// finger lands, not when it lifts. Buttons make no sound (game events do).
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import type { ComponentProps, ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { AccessibilityInfo, Platform, Pressable, type StyleProp, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { useInk } from "@/constants/chatTheme";

import { BUTTON, contrast, edgeColor, ELEVATION, labelOn, RADIUS, TYPE, useLook } from "./look";
import { GF, GP } from "./theme";

/** The press-down moment every game control shares (GameButtonStyle.onChange(of: pressed)). */
export function pressFeedback() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Say something to VoiceOver / TalkBack now (iOS has no live regions). */
export function announce(text: string) {
  if (!text) return;
  AccessibilityInfo.announceForAccessibility(text);
}

/** Large text may grow, but not so far that the game's fixed shapes clip it. */
export const MAX_FONT_SCALE = 1.4;

/** The map's HUD (top bar, rail, Nearby tray, banners) sits in fixed slots over the map: it grows less. */
export const HUD_FONT_SCALE = 1.2;

const DISABLED_FACE = "#C9C1B2";

type ButtonSize = "large" | "medium" | "small";

const SIZES: Record<ButtonSize, { font: number; padH: number; padV: number; radius: number }> = {
  large: { font: TYPE.button.fontSize, padH: 22, padV: 14, radius: RADIUS.button },
  medium: { font: 18, padH: 20, padV: 11, radius: RADIUS.button },
  small: { font: 15, padH: 14, padV: 8, radius: 12 },
};

export function GameButton({
  title,
  color = GP.sun,
  onPress,
  disabled,
  small,
  size,
  icon,
  style,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: {
  title: string;
  color?: string;
  onPress: () => void;
  disabled?: boolean;
  /** Same as size="small" (kept for the screens written before sizes). */
  small?: boolean;
  size?: ButtonSize;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** For Maestro / adb drivers (e.g. "fight3d-open"). */
  testID?: string;
}) {
  const s = SIZES[size ?? (small ? "small" : "large")];
  const face = disabled ? DISABLED_FACE : color;
  const edge = edgeColor(face);
  const label = disabled ? "#5A6878" : labelOn(face);
  return (
    <Pressable
      onPressIn={() => {
        if (!disabled) pressFeedback();
      }}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
      style={style}>
      {({ pressed }) => {
        // Pressed: it sinks into its edge (4 px of edge left showing becomes 1).
        const sink = pressed ? BUTTON.pressedTranslate : 0;
        return (
          <View style={{ paddingBottom: BUTTON.edge }}>
            <View style={[StyleSheet.absoluteFill, { top: BUTTON.edge, borderRadius: s.radius, backgroundColor: edge }]} />
            <View
              style={[
                styles.face,
                {
                  backgroundColor: face,
                  borderRadius: s.radius,
                  paddingHorizontal: s.padH,
                  paddingVertical: s.padV,
                  transform: [{ translateY: sink }],
                },
              ]}>
              {icon}
              <Text
                style={[styles.title, { fontSize: s.font, lineHeight: Math.round(s.font * 1.2), color: label }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {title}
              </Text>
            </View>
          </View>
        );
      }}
    </Pressable>
  );
}

/** Whichever of `color`, its darker edge or the ink reads on `surface` as an icon (3:1, WCAG non-text). */
function iconOn(color: string, surface: string, ink: string): string {
  if (contrast(color, surface) >= 3) return color;
  const edge = edgeColor(color);
  if (contrast(edge, surface) >= 3) return edge;
  return ink;
}

/**
 * A round control (map rail, corners, More tiles, close buttons): a cream disc
 * with a hairline and a soft float shadow, its glyph in `color`. `solid` fills
 * the disc with `color` instead, on a darker edge (skills, the big actions).
 * Close and back glyphs are quiet: a well-coloured disc, no shadow.
 */
export function GameIconButton({
  icon,
  color = GP.navy,
  diameter = 46,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  badge,
  solid,
  style,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  color?: string;
  diameter?: number;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** A count in a berry capsule at the top right (dailies left, cards). */
  badge?: number | string | null;
  solid?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const look = useLook();
  const quiet = !solid && (icon === "close" || icon === "arrow-back");
  const face = solid ? color : quiet ? look.surfaceAlt : look.surface;
  const glyph = solid ? labelOn(color) : quiet ? look.text : iconOn(color, face, look.text);
  const edge = solid ? edgeColor(color) : null;
  return (
    <Pressable
      onPressIn={pressFeedback}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${accessibilityLabel}, ${badge}` : accessibilityLabel}
      accessibilityHint={accessibilityHint}
      hitSlop={Math.max(0, (44 - diameter) / 2)}
      style={style}>
      {({ pressed }) => (
        <View style={{ width: diameter, height: diameter + (edge ? 3 : 0), transform: [{ scale: pressed ? 0.94 : 1 }] }}>
          {edge ? <View style={[styles.circle, { width: diameter, height: diameter, borderRadius: diameter / 2, top: 3, backgroundColor: edge }]} /> : null}
          <View
            style={[
              styles.circle,
              styles.iconFace,
              { width: diameter, height: diameter, borderRadius: diameter / 2, top: edge && pressed ? 2 : 0, backgroundColor: face },
              !solid && !quiet && { borderWidth: 1, borderColor: look.hairline },
              !solid && !quiet && !look.dark && ELEVATION.float,
            ]}>
            <Ionicons name={icon} size={Math.round(diameter * (quiet ? 0.42 : 0.46))} color={glyph} />
          </View>
          {badge ? (
            <View style={[styles.badge, { borderColor: look.surface }]} pointerEvents="none">
              <Text style={styles.badgeText} maxFontSizeMultiplier={1.2}>
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

/** A small caps label chip (READY, LIVE, RARE): a flat fill with a label that passes contrast. `light` is the paper variant (the colour as text). */
export function Chip({ text, color = GP.skyDeep, light }: { text: string; color?: string; light?: boolean }) {
  const look = useLook();
  const fg = light ? iconOn(color, look.surface, look.text) : labelOn(color);
  return (
    <View style={[styles.chip, { backgroundColor: light ? look.surface : color }, light && { borderWidth: 1, borderColor: look.hairline }]}>
      <Text style={[styles.chipText, { color: fg }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {text.toUpperCase()}
      </Text>
    </View>
  );
}

export function ProgressBar({ value, color = GP.sun, track = "rgba(28,43,58,0.12)", height = 8 }: { value: number; color?: string; track?: string; height?: number }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: "hidden" }}>
      <View style={{ width: `${v * 100}%`, height, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

/**
 * A big title with a thick outline and a drop shadow (GameTitle): eight
 * offset copies make the outline, as on iOS (neither platform strokes text).
 * Read as one element. `edge` is the outline colour.
 */
export function GameTitle({ text, size = 40, color = "#FFFFFF", edge = GP.ink }: { text: string; size?: number; color?: string; edge?: string }) {
  const r = size * 0.06;
  const font = { fontFamily: GF.display, fontSize: size, lineHeight: size * 1.18, textAlign: "center" as const };
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={text} style={{ alignSelf: "center" }}>
      <View style={{ transform: [{ translateY: size * 0.09 }] }} importantForAccessibility="no-hide-descendants">
        <Text style={[font, { color: "rgba(0,0,0,0.3)" }]} maxFontSizeMultiplier={1.2}>
          {text}
        </Text>
      </View>
      {OUTLINE.map(([dx, dy], i) => (
        <View key={i} style={[StyleSheet.absoluteFill, { transform: [{ translateX: dx * r }, { translateY: dy * r }] }]} importantForAccessibility="no-hide-descendants">
          <Text style={[font, { color: edge }]} maxFontSizeMultiplier={1.2}>
            {text}
          </Text>
        </View>
      ))}
      <View style={StyleSheet.absoluteFill} importantForAccessibility="no-hide-descendants">
        <Text style={[font, { color }]} maxFontSizeMultiplier={1.2}>
          {text}
        </Text>
      </View>
    </View>
  );
}

const OUTLINE = Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)] as const);

/** A heading on a game page: Lilita One in the page's ink, `title` size unless told otherwise. */
export function GameHeading({ text, size = TYPE.title.fontSize, inHeader }: { text: string; size?: number; inHeader?: boolean }) {
  const look = useLook();
  // inHeader: already inside a row that is the header (no <h1> in an <h1> on web).
  return (
    <Text accessibilityRole={inHeader ? undefined : "header"} maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: GF.display, fontSize: size, lineHeight: Math.round(size * 1.15), color: look.text }}>
      {text}
    </Text>
  );
}

/**
 * A card (GamePanel): the paper surface, radius 20. On light paper it sits on
 * a low shadow with no border; on dark paper a hairline replaces the shadow.
 * A custom `face` (a tinted card) keeps its colour by day and darkens by dusk.
 */
export function GamePanel({ children, face: rawFace, padding = 18, style }: { children: ReactNode; face?: string; padding?: number; style?: StyleProp<ViewStyle> }) {
  const look = useLook();
  const ink = useInk();
  const face = !rawFace || rawFace === GP.cream ? look.surface : ink.surface(rawFace);
  return (
    <View style={[styles.panel, { backgroundColor: face, padding }, look.dark ? { borderWidth: 1, borderColor: look.hairline } : ELEVATION.low, style]}>{children}</View>
  );
}

/** A coin, drawn (GameCoin), for CosCoin counts. */
export function GameCoin({ size = 26 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={[StyleSheet.absoluteFill, { top: size * 0.08, borderRadius: size / 2, backgroundColor: GP.coinDeep }]} />
      <LinearGradient colors={["#FFD772", GP.coin]} style={[StyleSheet.absoluteFill, { borderRadius: size / 2, alignItems: "center", justifyContent: "center" }]}>
        <View
          style={{
            position: "absolute",
            top: size * 0.14,
            left: size * 0.14,
            right: size * 0.14,
            bottom: size * 0.14,
            borderRadius: size,
            borderWidth: size * 0.07,
            borderColor: "rgba(255,255,255,0.6)",
          }}
        />
        <Text style={{ fontFamily: GF.display, fontSize: size * 0.55, color: GP.coinDeep, lineHeight: size * 0.7 }} maxFontSizeMultiplier={1}>
          C
        </Text>
      </LinearGradient>
    </View>
  );
}

/** A hard drop edge under a shape (`.shadow(radius: 0, y:)` on iOS). */
export function dropEdge(color: string, y: number): ViewStyle {
  return Platform.OS === "ios"
    ? { shadowColor: color, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 0, height: y } }
    : { borderBottomWidth: y, borderBottomColor: color };
}

/** `#RRGGBB` with an alpha. */
export function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

const styles = StyleSheet.create({
  face: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    overflow: "hidden",
  },
  title: {
    fontFamily: GF.display,
  },
  circle: { position: "absolute", left: 0 },
  iconFace: { alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: GP.berry,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: GF.display, fontSize: 12, lineHeight: 15, color: "#FFFFFF" },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: RADIUS.chip,
    alignSelf: "flex-start",
  },
  chipText: {
    fontFamily: GF.bold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
  },
  panel: {
    borderRadius: RADIUS.card,
  },
});
