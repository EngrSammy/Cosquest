// The Warden showing the player round the game: the rest of the screen dims,
// the button in question is lit (a rounded hole and a pulsing ring), and the
// Warden's bubble says what it is and offers "Show me" / "Later". "Tap Battle"
// never means hunting for Battle. costquest-ios Warden/WardenCoach.swift
// (WardenCoachOverlay) with Roam/RoamGuide.swift's railAnchor, here the
// <CoachAnchor> a button is wrapped in. The step to show is features/game/coach.ts.
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import type { CoachStep } from "@/features/game/coach";

import { announce, GameButton } from "./kit";
import { ACCENT, contrast, edgeColor, ELEVATION, RADIUS, SURFACES, useLook } from "./look";
import { GF } from "./theme";
import WardenBadge from "./WardenBadge";
import { wardenVoice } from "./wardenVoice";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

// ---------- anchors ----------

const anchors = new Map<string, { current: View | null }>();

/** Marks a button for the coach to light (railAnchor / railAnchors: one button can stand in for several ids). */
export function CoachAnchor({ ids, children, style }: { ids: readonly string[]; children: ReactNode; style?: ViewStyle }) {
  const ref = useRef<View>(null);
  const key = ids.join("|");
  useEffect(() => {
    const mine = key.split("|");
    for (const id of mine) anchors.set(id, ref);
    return () => {
      for (const id of mine) if (anchors.get(id) === ref) anchors.delete(id);
    };
  }, [key]);
  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}

type Rect = { x: number; y: number; w: number; h: number };

/** The overlay's whole screen with a rounded hole (Spotlight), as an even-odd path. */
function spotlightPath(width: number, height: number, hole: Rect): string {
  const r = Math.min(22, hole.w / 2, hole.h / 2);
  const { x, y, w, h } = hole;
  return (
    `M-2000 -2000H${width + 2000}V${height + 2000}H-2000Z` +
    `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
    `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  );
}

// ---------- the overlay ----------

export default function CoachOverlay({
  step,
  tint,
  onAction,
  onLater,
}: {
  step: CoachStep;
  tint: string;
  onAction: () => void;
  onLater: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const look = useLook();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const root = useRef<View>(null);
  const [hole, setHole] = useState<Rect | null>(null);
  const shown = useSharedValue(0);
  const ring = useSharedValue(0);

  // Where the lit button is, now and once the rail has finished sliding in.
  useEffect(() => {
    let alive = true;
    const measure = () => {
      const target = step.target ? anchors.get(step.target)?.current : null;
      const me = root.current;
      if (!target || !me) {
        if (alive) setHole(null);
        return;
      }
      target.measureInWindow((x, y, w, h) => {
        me.measureInWindow((ox, oy) => {
          if (alive && w > 0 && h > 0) setHole({ x: x - ox - 8, y: y - oy - 8, w: w + 16, h: h + 16 });
        });
      });
    };
    measure();
    const t = setTimeout(measure, 500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [step.target, width, height]);

  // The bubble: .smooth(0.5).delay(0.4), 30 pt up. The ring: easeOut 1.4 s, forever.
  useEffect(() => {
    shown.set(withDelay(400, withTiming(1, { duration: 500, easing: Easing.inOut(Easing.cubic) })));
    if (!reduce) ring.set(withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) }), -1, false));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
    announce(`The Warden: ${step.line}`);
    wardenVoice.say(step.line, { moment: "coach" });
    return () => {
      cancelAnimation(shown);
      cancelAnimation(ring);
      wardenVoice.hush();
    };
  }, [step.line, reduce, shown, ring]);

  const bubbleStyle = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateY: 30 * (1 - shown.get()) }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: reduce ? 1 : 1 - ring.get(), transform: [{ scale: 1 + 0.12 * ring.get() }] }));

  // Clear of the rail column, so a lit rail button is never under the bubble.
  const rightPad = hole ? (hole.x > width * 0.6 ? width - hole.x + 6 : 14) : 62;

  return (
    <View ref={root} style={StyleSheet.absoluteFill} pointerEvents="box-none" accessibilityViewIsModal>
      {hole ? (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={onLater} accessibilityRole="button" accessibilityLabel={step.later || "Close"} />
          <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Path d={spotlightPath(width, height, hole)} fill="rgba(18,26,38,0.55)" fillRule="evenodd" />
          </Svg>
          <Animated.View
            pointerEvents="none"
            style={[{ position: "absolute", left: hole.x, top: hole.y, width: hole.w, height: hole.h, borderRadius: 22, borderWidth: 3, borderColor: tint }, ringStyle]}
          />
          {/* The lit button itself does what the Warden asked. */}
          <Pressable
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={step.action}
            style={{ position: "absolute", left: hole.x, top: hole.y, width: hole.w, height: hole.h }}
          />
        </>
      ) : null}
      <Animated.View style={[styles.bubble, { bottom: insets.bottom + 236, right: rightPad }, bubbleStyle]}>
        <View style={styles.head} accessible accessibilityLabel={`The Warden: ${step.line}`}>
          <WardenBadge tint={tint} size={38} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.label, { color: readableOn(tint, look.surface, look.text) }]}>THE WARDEN</Text>
            <Text style={styles.line}>{step.line}</Text>
          </View>
        </View>
        <Pressable onPress={onLater} hitSlop={9} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={14} color={look.textMuted} />
        </Pressable>
        <View style={styles.buttons}>
          {step.later ? (
            <Pressable onPress={onLater} style={styles.later} accessibilityRole="button" accessibilityLabel={step.later}>
              <Text style={styles.laterText}>{step.later}</Text>
            </Pressable>
          ) : null}
          <GameButton title={step.action} size="small" color={ACCENT.sun.fill} onPress={onAction} />
        </View>
      </Animated.View>
    </View>
  );
}

/** The faction colour for words on paper if it reads (AA), else its darker edge, else the ink. */
function readableOn(color: string, plate: string, ink: string): string {
  if (contrast(color, plate) >= 4.5) return color;
  const edge = edgeColor(color, 0.6);
  return contrast(edge, plate) >= 4.5 ? edge : ink;
}

const L = SURFACES.light;
const D = SURFACES.dark;

// The Warden's bubble is a paper card like the one on the map (Hud.tsx WardenBubble).
const STYLE_PAIR = themedStyles(
  {
    bubble: {
      position: "absolute",
      left: 14,
      maxWidth: 420,
      gap: 10,
      padding: 14,
      borderRadius: RADIUS.card,
      borderWidth: 1,
      borderColor: L.hairline,
      backgroundColor: L.surface,
      ...ELEVATION.float,
    },
    head: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingRight: 22 },
    label: { fontFamily: GF.bold, fontSize: 12, lineHeight: 16, letterSpacing: 1 },
    line: { fontFamily: GF.body, fontSize: 16, lineHeight: 21, color: L.text },
    close: {
      position: "absolute",
      top: 12,
      right: 12,
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: L.surfaceAlt,
      alignItems: "center",
      justifyContent: "center",
    },
    buttons: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10 },
    later: { height: 40, paddingHorizontal: 12, justifyContent: "center" },
    laterText: { fontFamily: GF.bold, fontSize: 15, lineHeight: 19, color: L.textMuted },
  },
  {
    bubble: { backgroundColor: D.surface, borderColor: D.hairline, shadowOpacity: 0, elevation: 0, boxShadow: "none" },
    line: { color: D.text },
    close: { backgroundColor: D.surfaceAlt },
    laterText: { color: D.textMuted },
  },
);
