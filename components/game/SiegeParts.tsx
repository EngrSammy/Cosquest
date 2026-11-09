// The Siege's pieces (costquest-ios Features/SiegeFeature.swift): the Guardian
// crystal (bob, hit flash, lunge, cracks, shards), the ring timer, the two bars,
// the damage pop, the swinging Relic, the red strike vignette, the answer
// buttons and the sunburst behind TAKEN!. Drawn in react-native-svg and
// Reanimated; every loop and flourish stops under Reduce Motion.
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient as SvgGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { crackLevel } from "@/features/game/siegeFlow";
import { settle } from "@/features/game/spring";

import { GameTitle, MAX_FONT_SCALE, pressFeedback } from "./kit";
import { RelicArt } from "./RelicArt";
import { ACCENT, BUTTON, edgeColor, HUD_GLASS, labelOn, RADIUS } from "./look";
import { CHOICE_COLORS, edgeOf, GF, GP } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

const SPRING_PHASE = settle(0.45);
const SPRING_HP = settle(0.3);
const SPRING_FOCUS = settle(0.4);
const SPRING_CHOICE = settle(0.35);
const SPRING_POP = settle(0.35);

// ---------- the crystal ----------

/** CrystalFrame: a pointy-topped hexagon with softened corners, in (x, y, w, h). */
export function crystalPath(x: number, y: number, w: number, h: number): string {
  const pts: [number, number][] = [
    [x + w / 2, y],
    [x + w, y + h * 0.25],
    [x + w, y + h * 0.75],
    [x + w / 2, y + h],
    [x, y + h * 0.75],
    [x, y + h * 0.25],
  ];
  const k = Math.min(w, h) * 0.1;
  const toward = (p: [number, number], q: [number, number]): [number, number] => {
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = Math.max(0.001, Math.hypot(dx, dy));
    return [p[0] + (dx / len) * k, p[1] + (dy / len) * k];
  };
  const f = (n: number) => n.toFixed(2);
  let d = "";
  pts.forEach((b, i) => {
    const a = pts[(i + pts.length - 1) % pts.length];
    const c = pts[(i + 1) % pts.length];
    const from = toward(b, a);
    const to = toward(b, c);
    d += `${i === 0 ? "M" : "L"}${f(from[0])} ${f(from[1])} Q${f(b[0])} ${f(b[1])} ${f(to[0])} ${f(to[1])} `;
  });
  return `${d}Z`;
}

/** Cracks across the crystal, more of them as its HP goes (Cracks shape). */
function cracksPath(level: number, w: number, h: number): string {
  const p = (x: number, y: number) => `${(x * w).toFixed(1)} ${(y * h).toFixed(1)}`;
  let d = "";
  if (level >= 1) {
    d += `M${p(0.78, 0.22)} L${p(0.66, 0.36)} L${p(0.72, 0.46)} L${p(0.62, 0.58)} M${p(0.66, 0.36)} L${p(0.84, 0.4)} `;
  }
  if (level >= 2) {
    d += `M${p(0.2, 0.66)} L${p(0.34, 0.6)} L${p(0.3, 0.74)} L${p(0.44, 0.84)} M${p(0.34, 0.6)} L${p(0.4, 0.5)} M${p(0.52, 0.06)} L${p(0.48, 0.18)} L${p(0.56, 0.24)} `;
  }
  return d;
}

const W = 150;
const H = 170;

/**
 * The hold's Guardian: a crystal in the holder's colour with a scowl. It bobs
 * while it waits, flinches white when hit, lunges when it strikes, cracks as
 * its HP goes, and shatters when it falls.
 */
export function GuardianView({
  color,
  share,
  hitTick,
  strikeTick,
  defeated,
  idle,
}: {
  color: string;
  /** 0...1 of its HP left. */
  share: number;
  hitTick: number;
  strikeTick: number;
  defeated: boolean;
  /** Whether it may bob (false while the screen is parked). */
  idle: boolean;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const reduce = useReducedMotion();
  const bob = useSharedValue(0);
  const jolt = useSharedValue(0);
  const sx = useSharedValue(1);
  const sy = useSharedValue(1);
  const flash = useSharedValue(0);
  const lunge = useSharedValue(1);
  const gone = useSharedValue(0);

  // Bobbing: a sine, 2.2 rad/s, 8 pt (TimelineView), still under Reduce Motion.
  useEffect(() => {
    if (reduce || defeated || !idle) {
      cancelAnimation(bob);
      bob.value = 0;
      return;
    }
    bob.value = withRepeat(withTiming(1, { duration: (Math.PI / 2.2) * 1000, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(bob);
  }, [reduce, defeated, idle, bob]);

  // Hit: a white flash, a squash and a jolt (the keyframes of GuardianView.figure).
  useEffect(() => {
    if (hitTick === 0) return;
    flash.value = withSequence(withTiming(0.9, { duration: 50 }), withTiming(0, { duration: 300 }));
    if (reduce) return;
    const bounce = settle(0.4);
    sx.value = withSequence(withTiming(1.18, { duration: 100 }), withSpring(1, bounce));
    sy.value = withSequence(withTiming(0.82, { duration: 100 }), withSpring(1, bounce));
    jolt.value = withSequence(withTiming(14, { duration: 50 }), withTiming(-10, { duration: 70 }), withTiming(6, { duration: 70 }), withTiming(0, { duration: 100 }));
  }, [hitTick, reduce, flash, sx, sy, jolt]);

  // Strike: it draws back and lunges at you.
  useEffect(() => {
    if (strikeTick === 0 || reduce) return;
    lunge.value = withSequence(
      withTiming(0.9, { duration: 120 }),
      withTiming(1.45, { duration: 140, easing: Easing.out(Easing.back(2)) }),
      withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) }),
    );
  }, [strikeTick, reduce, lunge]);

  useEffect(() => {
    gone.value = withTiming(defeated ? 1 : 0, { duration: 350, easing: Easing.in(Easing.quad) });
  }, [defeated, gone]);

  const outer = useAnimatedStyle(() => ({
    opacity: 1 - gone.value,
    transform: [{ translateY: (bob.value * 2 - 1) * 8 }, { scale: lunge.value * (1 - gone.value * 0.99) }],
  }));
  const inner = useAnimatedStyle(() => ({
    transform: [{ translateX: jolt.value }, { scaleX: sx.value }, { scaleY: sy.value }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const shadow = useAnimatedStyle(() => ({ opacity: 1 - gone.value }));

  const cracks = cracksPath(crackLevel(share), W, H);
  const frame = crystalPath(0, 0, W, H);
  return (
    <View style={styles.guardian} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Animated.View style={[styles.shadow, shadow]} />
      <Animated.View style={[styles.figure, outer]}>
        <Animated.View style={[{ width: W, height: H, transformOrigin: "50% 100%" }, inner]}>
          <Svg width={W} height={H + 10} viewBox={`0 0 ${W} ${H + 10}`} style={{ overflow: "visible" }}>
            <Defs>
              <SvgGradient id="g-body" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.8} />
                <Stop offset="0.5" stopColor={color} />
                <Stop offset="1" stopColor={edgeOf(color)} />
              </SvgGradient>
              <ClipPath id="g-lit">
                <Rect x={0} y={0} width={75} height={H} />
              </ClipPath>
            </Defs>
            <G y={9}>
              <Path d={frame} fill={edgeOf(color)} />
            </G>
            <Path d={frame} fill="url(#g-body)" />
            <Path d={frame} fill="#FFF" fillOpacity={0.18} clipPath="url(#g-lit)" />
            <G x={9} y={9}>
              <Path d={crystalPath(0, 0, W - 18, H - 18)} fill="none" stroke="#FFF" strokeOpacity={0.6} strokeWidth={3} />
            </G>
            {cracks ? <Path d={cracks} fill="none" stroke={GP.ink} strokeOpacity={0.75} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" /> : null}
            <Eye cx={49} cy={71} tilt={16} />
            <Eye cx={101} cy={71} tilt={-16} />
            <Path d={`M55 ${H / 2 + 30 + 7} Q75 ${H / 2 + 30 - 7 - 8.4} 95 ${H / 2 + 30 + 7}`} fill="none" stroke={GP.ink} strokeWidth={5} strokeLinecap="round" />
            <Path d={frame} fill="none" stroke={GP.ink} strokeWidth={5} />
          </Svg>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, flashStyle]}>
            <Svg width={W} height={H}>
              <Path d={frame} fill="#FFF" />
            </Svg>
          </Animated.View>
        </Animated.View>
      </Animated.View>
      {defeated ? <Shards color={color} /> : null}
    </View>
  );
}

/** Two eyes under hard brows: not scary, just not having it. */
function Eye({ cx, cy, tilt }: { cx: number; cy: number; tilt: number }) {
  return (
    <G>
      <Ellipse cx={cx} cy={cy} rx={15} ry={17} fill="#FFF" stroke={GP.ink} strokeWidth={3} />
      <Circle cx={cx + (tilt > 0 ? 4 : -4)} cy={cy + 4} r={7} fill={GP.ink} />
      <G rotation={tilt} origin={`${cx}, ${cy - 19}`}>
        <Rect x={cx - 19} y={cy - 23} width={38} height={8} rx={4} fill={GP.ink} />
      </G>
    </G>
  );
}

/** The Guardian breaking: its crystal flies apart in pieces (Shards). */
function Shards({ color }: { color: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const reduce = useReducedMotion();
  const out = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (!reduce) out.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) });
  }, [reduce, out]);
  return (
    <View style={styles.shards} pointerEvents="none">
      {Array.from({ length: 12 }, (_, i) => (
        <Shard key={i} i={i} color={color} out={out} />
      ))}
    </View>
  );
}

function Shard({ i, color, out }: { i: number; color: string; out: { value: number } }) {
  const a = (i / 12) * 2 * Math.PI;
  const w = 22 + (i % 3) * 8;
  const h = 26 + (i % 3) * 8;
  const style = useAnimatedStyle(() => ({
    opacity: 1 - out.value,
    transform: [{ translateX: Math.cos(a) * 170 * out.value }, { translateY: (Math.sin(a) * 150 + 60) * out.value }, { rotate: `${i * 70 * out.value}deg` }],
  }));
  return (
    <Animated.View style={[{ position: "absolute", width: w, height: h }, style]}>
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <Path d={crystalPath(2, 2, w - 4, h - 4)} fill={i % 3 === 0 ? "#FFF" : color} stroke={GP.ink} strokeWidth={2} />
      </Svg>
    </Animated.View>
  );
}

// ---------- the bars ----------

/**
 * The Guardian's HP bar: the white part lingers a moment (0.9 s ease-out after
 * 0.35 s) behind the coloured bar that springs, the way fighting games show
 * the hit you just landed.
 */
export function HpBar({ share, color }: { share: number; color: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const [width, setWidth] = useState(0);
  const target = (w: number) => Math.max(share > 0 ? 18 : 0, w * share);
  const main = useSharedValue(0);
  const ghost = useSharedValue(0);
  useEffect(() => {
    if (width === 0) return;
    const t = target(width);
    // The first measure lands without animating.
    if (main.value === 0 && ghost.value === 0) {
      main.value = t;
      ghost.value = t;
      return;
    }
    main.value = withSpring(t, SPRING_HP);
    ghost.value = withDelay(350, withTiming(t, { duration: 900, easing: Easing.out(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [share, width]);
  const mainStyle = useAnimatedStyle(() => ({ width: main.value }));
  const ghostStyle = useAnimatedStyle(() => ({ width: ghost.value }));
  return (
    <View style={styles.hpTrack} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.hpGhost, ghostStyle]} />
      <Animated.View style={[styles.hpMain, { backgroundColor: color }, mainStyle]}>
      </Animated.View>
      <View pointerEvents="none" style={styles.hpRim} />
    </View>
  );
}

/** The player's focus: mint when full, going to berry as it drains (FocusBar). */
export function FocusBar({ value }: { value: number }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const [width, setWidth] = useState(0);
  const v = Math.min(1, Math.max(0, value));
  const w = useSharedValue(0);
  const first = useSharedValue(true);
  useEffect(() => {
    if (width === 0) return;
    const t = Math.max(v > 0 ? 12 : 0, width * v);
    if (first.value) {
      w.value = t;
      first.value = false;
    } else w.value = withSpring(t, SPRING_FOCUS);
  }, [v, width, w, first]);
  const style = useAnimatedStyle(() => ({ width: w.value }));
  // One flat colour by how much is left (no gradient): Mint, then Sun, then Berry.
  const fill = v > 0.5 ? ACCENT.mint.fill : v > 0.25 ? ACCENT.sun.fill : ACCENT.berry.fill;
  return (
    <View style={styles.focusTrack} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.focusFill, { backgroundColor: fill }, style]} />
      <View pointerEvents="none" style={styles.focusRim} />
    </View>
  );
}

// ---------- the ring timer ----------

const RING = 58;
const STROKE = 6;

/** A countdown ring with the seconds in the middle, red for the last five (RingTimer). */
export function RingTimer({ deadline, total, paused }: { deadline: number; total: number; paused: boolean }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(t);
  }, [paused, deadline]);
  const left = Math.max(0, (deadline - now) / 1000);
  const frac = total > 0 ? Math.min(1, left / total) : 0;
  const hot = left < 5;
  const shown = Math.ceil(left);
  const r = (RING - 8 - STROKE) / 2 + STROKE / 2;
  const c = 2 * Math.PI * r;
  const pulse = hot && Math.floor(left * 2) % 2 === 0;
  return (
    <View
      style={styles.ring}
      accessible
      accessibilityLabel="Time left"
      accessibilityValue={{ text: `${shown} ${shown === 1 ? "second" : "seconds"}` }}>
      <Svg width={RING} height={RING} style={StyleSheet.absoluteFill}>
        <Circle cx={RING / 2} cy={RING / 2} r={RING / 2 - 1.25} fill={HUD_GLASS.fill} />
        <Circle cx={RING / 2} cy={RING / 2} r={r} fill="none" stroke="#FFF" strokeOpacity={0.18} strokeWidth={STROKE} />
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={r}
          fill="none"
          stroke={hot ? ACCENT.berry.fill : ACCENT.sun.fill}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`}
          rotation={-90}
          origin={`${RING / 2}, ${RING / 2}`}
        />
        <Circle cx={RING / 2} cy={RING / 2} r={RING / 2 - 1.25} fill="none" stroke={HUD_GLASS.border} strokeWidth={1} />
      </Svg>
      <Text style={[styles.ringText, { color: hot ? "#FF8A8F" : "#FFFFFF", transform: [{ scale: pulse ? 1.12 : 1 }] }]} maxFontSizeMultiplier={1.1}>
        {shown}
      </Text>
    </View>
  );
}

// ---------- staging ----------

/** A damage number: pops, rises and fades (DamageText). */
export function DamageText({ text, color, x }: { text: string; color: string; x: number }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const reduce = useReducedMotion();
  const up = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) {
      up.value = withDelay(1000, withTiming(0, { duration: 400 }));
      return;
    }
    up.value = withSpring(1, SPRING_POP);
    const t = setTimeout(() => {
      up.value = withTiming(0, { duration: 400, easing: Easing.in(Easing.quad) });
    }, 900);
    return () => clearTimeout(t);
  }, [reduce, up]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, up.value),
    transform: [{ translateX: x }, { translateY: 20 - 60 * up.value }, { scale: 0.3 + 0.7 * up.value }],
  }));
  const sun = color === GP.sun;
  return (
    <Animated.View style={[styles.pop, style]} pointerEvents="none">
      <GameTitle text={text} size={40} color={sun ? GP.sun : "#FFF"} edge={edgeOf(color)} />
    </Animated.View>
  );
}

/** The Relic, swung at the Guardian on a hit: up from the bottom corner, a turn through the air, and back. */
export function SwingingRelic({ kind, rarity, swing, width, height }: { kind: string; rarity: string; swing: number; width: number; height: number }) {
  const o = useSharedValue(0);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const angle = useSharedValue(0);
  const scale = useSharedValue(1);
  useEffect(() => {
    if (swing === 0) return;
    o.value = withSequence(withTiming(1, { duration: 50 }), withTiming(1, { duration: 550 }), withTiming(0, { duration: 200 }));
    y.value = withSequence(
      withTiming(-height * 0.42, { duration: 300, easing: Easing.out(Easing.cubic) }),
      withTiming(-height * 0.4, { duration: 300 }),
      withTiming(0, { duration: 200 }),
    );
    x.value = withSequence(
      withTiming(-width * 0.3, { duration: 300, easing: Easing.out(Easing.cubic) }),
      withTiming(-width * 0.34, { duration: 300 }),
      withTiming(0, { duration: 200 }),
    );
    angle.value = withSequence(withTiming(-70, { duration: 300 }), withTiming(60, { duration: 180, easing: Easing.out(Easing.back(2)) }), withTiming(20, { duration: 320 }));
    scale.value = withSequence(withTiming(1.5, { duration: 300, easing: Easing.out(Easing.cubic) }), withTiming(1.8, { duration: 150 }), withTiming(1, { duration: 350 }));
  }, [swing, width, height, o, x, y, angle, scale]);
  const style = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ translateX: x.value }, { translateY: y.value }, { rotate: `${angle.value}deg` }, { scale: scale.value }],
  }));
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Animated.View style={[{ position: "absolute", left: width * 0.82 - 55, top: height * 0.9 - 55 }, style]}>
        <RelicArt kind={kind} rarity={rarity} size={110} />
      </Animated.View>
    </View>
  );
}

/** The Guardian's strike: red at the edges of the screen (the radial vignette; the screen animates its opacity). */
export function StrikeVignette({ opacity }: { opacity: { value: number } }) {
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="vig" cx="50%" cy="50%" rx="75%" ry="75%" fx="50%" fy="50%">
            <Stop offset="0.3" stopColor={GP.berry} stopOpacity={0} />
            <Stop offset="1" stopColor={GP.berry} stopOpacity={0.85} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#vig)" />
      </Svg>
    </Animated.View>
  );
}

/** The sunburst behind TAKEN! (Sunburst): fourteen rays that fade out, turning slowly. */
export function Sunburst({ color, size = 420 }: { color: string; size?: number }) {
  const reduce = useReducedMotion();
  const spin = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    spin.value = withRepeat(withTiming(360, { duration: 24000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [reduce, spin]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const rays = 14;
  const c = size / 2;
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", width: size, height: size, opacity: 0.55 }, style]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="ray" cx={c} cy={c} rx={c} ry={c} fx={c} fy={c} gradientUnits="userSpaceOnUse">
            <Stop offset={40 / c} stopColor={color} stopOpacity={0.55} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {Array.from({ length: rays }, (_, i) => {
          const a0 = (i / rays) * 2 * Math.PI;
          const a1 = a0 + Math.PI / rays;
          return <Path key={i} d={`M${c} ${c} L${c + c * Math.cos(a0)} ${c + c * Math.sin(a0)} L${c + c * Math.cos(a1)} ${c + c * Math.sin(a1)} Z`} fill="url(#ray)" />;
        })}
      </Svg>
    </Animated.View>
  );
}

// ---------- answers ----------

export type SiegeChoiceState = "idle" | "right" | "wrong" | "dim" | "removed";

const GREY = "#8C8C8C";

/** One answer, in one of four fixed colours (ChoiceButton), green or red once the server shows the answer. */
export function SiegeChoice({
  text,
  index,
  state,
  picked,
  active,
  label,
  onPress,
}: {
  text: string;
  index: number;
  state: SiegeChoiceState;
  /** This is the answer given (a tick before the reveal). */
  picked: boolean;
  /** The question is open for answers. */
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const face = state === "right" ? ACCENT.mint.fill : state === "wrong" ? ACCENT.berry.fill : state === "dim" ? GREY : CHOICE_COLORS[index % CHOICE_COLORS.length];
  // The label in the face's own ink: never white on the orange answer.
  const ink = labelOn(face);
  const opacityTo = state === "removed" ? 0.22 : state === "dim" ? 0.45 : 1;
  const scaleTo = state === "right" ? 1.03 : 1;
  const opacity = useSharedValue(opacityTo);
  const scale = useSharedValue(scaleTo);
  useEffect(() => {
    opacity.value = withTiming(opacityTo, { duration: 300, easing: Easing.inOut(Easing.cubic) });
    scale.value = withSpring(scaleTo, SPRING_CHOICE);
  }, [opacityTo, scaleTo, opacity, scale]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  const live = active && state === "idle";
  return (
    <Animated.View style={style}>
      <Pressable
        onPressIn={() => {
          if (live) pressFeedback();
        }}
        onPress={onPress}
        disabled={!live}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: state === "removed", selected: picked || state === "right" }}>
        {({ pressed }) => (
          <View style={{ paddingBottom: BUTTON.edge }}>
            <View style={[StyleSheet.absoluteFill, { top: BUTTON.edge, borderRadius: RADIUS.button, backgroundColor: edgeColor(face) }]} />
            <View style={[styles.choiceFace, { backgroundColor: face, transform: [{ translateY: pressed ? BUTTON.pressedTranslate : 0 }] }]}>
              <Text style={[styles.choiceText, { color: ink }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {text}
              </Text>
              {state === "right" ? <Ionicons name="checkmark-circle" size={22} color={ink} /> : null}
              {state === "wrong" ? <Ionicons name="close-circle" size={22} color={ink} /> : null}
              {state === "idle" && picked ? <Ionicons name="checkmark" size={18} color={ink} /> : null}
            </View>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

export const SIEGE_PHASE_SPRING = SPRING_PHASE;

const STYLE_PAIR = themedStyles({
  guardian: { width: W + 60, height: 260, alignItems: "center", justifyContent: "center", alignSelf: "center" },
  shadow: { position: "absolute", top: 235, left: 30 , width: 150, height: 26, borderRadius: 13, backgroundColor: "rgba(0,0,0,0.25)" },
  figure: { position: "absolute", top: 45, left: 30, width: W, height: H },
  shards: { position: "absolute", left: 30 + W / 2, top: 130, width: 0, height: 0 },
  hpTrack: { height: 26, borderRadius: 13, backgroundColor: HUD_GLASS.fill, overflow: "hidden", justifyContent: "center" },
  hpGhost: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.85)" },
  hpMain: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 13, overflow: "hidden" },
  hpRim: { ...StyleSheet.absoluteFill, borderRadius: 13, borderWidth: 1, borderColor: HUD_GLASS.border },
  focusTrack: { height: 16, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden" },
  focusFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 8, overflow: "hidden" },
  focusRim: { ...StyleSheet.absoluteFill, borderRadius: 8, borderWidth: 1, borderColor: HUD_GLASS.border },
  ring: { width: RING, height: RING, alignItems: "center", justifyContent: "center" },
  ringText: { fontFamily: GF.display, fontSize: 22 },
  pop: { position: "absolute", alignSelf: "center" },
  choiceFace: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingHorizontal: 22, paddingVertical: 12, borderRadius: RADIUS.button, overflow: "hidden" },
  choiceText: { flex: 1, fontFamily: GF.display, fontSize: 20, lineHeight: 24 },
});
