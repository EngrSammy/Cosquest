// A Relic, drawn: each kind (blade, axe, bow, staff, hammer, gauntlet) as a
// chunky silhouette in a crystal the colour of its rarity, and the ten level
// pips. costquest-ios Features/RelicsFeature.swift (WeaponShape, WeaponShine,
// WeaponGlyph, RelicArt, CrystalFrame, CrystalFacet, RelicPips).
//
// Relics have no 3D models on iOS either: this is the same drawing, in SVG.
// Forge weapons (which do have GLB models on iOS) use it too, with the kind
// read from the name. The legendary rim turns once every 4 s (paused under
// Reduce Motion): iOS's angular gradient is a band of white and berry on sun
// travelling round the outline, drawn here with dashes that slide along it.
import { useEffect, useId } from "react";
import { Platform, Text, View } from "react-native";
import Animated, { cancelAnimation, Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, G, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { bandOffset, crystalPath, crystalPerimeter } from "@/features/game/crystal";
import { RELIC_MAX_LEVEL } from "@/features/game/relics";

import { contrast, edgeColor, RARITY, rarityOf, SURFACES, useLook } from "./look";
import { edgeOf, GF, GP } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

/** A rarity's colour: the art direction's one set (lookTokens.ts RARITY), the same on the map, the bag and the drop beam. */
export function rarityColor(rarity: string | null | undefined): string {
  return RARITY[rarityOf(rarity)];
}

/** The rarity's colour for text on cream (the sun is too light there). */
export function rarityInk(rarity: string | null | undefined): string {
  // The rarity's colour, darkened until it reads as text on cream paper (AA).
  const c = rarityColor(rarity);
  for (let by = 1; by > 0.3; by -= 0.06) {
    const ink = by === 1 ? c : edgeColor(c, by);
    if (contrast(ink, SURFACES.light.surface) >= 4.5) return ink;
  }
  return SURFACES.light.text;
}

/** The shard purple. */
export const SHARD = GP.rare;

// ---------- the weapon (unit square as 0..100, pointing up) ----------

type Part =
  | { k: "rect"; x0: number; y0: number; x1: number; y1: number; r: number }
  | { k: "circle"; cx: number; cy: number; r: number }
  | { k: "path"; d: string }
  /** A stroked line (the bow's limb and string, the staff's fork), `w` wide. */
  | { k: "line"; d: string; w: number };

const rect = (x0: number, y0: number, x1: number, y1: number, r = 2): Part => ({ k: "rect", x0, y0, x1, y1, r });
const circle = (cx: number, cy: number, r: number): Part => ({ k: "circle", cx, cy, r });
const path = (d: string): Part => ({ k: "path", d });
const line = (d: string, w: number): Part => ({ k: "line", d, w });

/** WeaponShape: built from overlapping parts, outlined in ink, filled on top. */
function weaponParts(kind: string): Part[] {
  switch (kind) {
    case "axe":
      return [rect(45, 10, 55, 96, 4), path("M53 16 L74 7 Q102 30 76 58 L53 46 Z"), path("M47 22 L27 30 L47 40 Z"), circle(50, 94, 6)];
    case "bow":
      return [
        line("M60 6 Q2 50 60 94", 11),
        line("M60 6 L60 94", 3.5),
        rect(30, 47, 86, 53, 2),
        path("M98 50 L82 40 L82 60 Z"),
        rect(40, 33, 50, 49, 2),
        rect(40, 33, 44, 50, 1),
      ];
    case "staff":
      return [rect(45, 28, 55, 97, 4), line("M30 20 Q50 46 70 20", 7), path("M50 0 L63 17 L50 34 L37 17 Z"), rect(40, 60, 60, 66, 2)];
    case "hammer":
      return [rect(45, 32, 55, 96, 4), rect(16, 8, 84, 38, 6), rect(10, 12, 20, 34, 3), rect(80, 12, 90, 34, 3), circle(50, 93, 6)];
    case "gauntlet":
      return [
        ...[0, 1, 2, 3].map((i) => {
          const x = 22 + i * 14.5;
          return rect(x, 12 + (i === 0 || i === 3 ? 5 : 0), x + 15, 46, 7);
        }),
        rect(20, 30, 80, 70, 12),
        rect(14, 44, 52, 58, 7),
        path("M26 68 L74 68 L80 95 L20 95 Z"),
      ];
    default:
      // blade
      return [path("M50 2 L60 14 L60 64 L40 64 L40 14 Z"), rect(22, 62, 78, 71, 4), rect(45, 70, 55, 88, 2), circle(50, 92, 6.5)];
  }
}

/** WeaponShine: a fuller of light, so it reads as metal rather than a sticker. */
function weaponShine(kind: string): Part | null {
  switch (kind) {
    case "blade":
      return rect(47.5, 14, 51, 58);
    case "axe":
      return rect(64, 16, 70, 46);
    case "hammer":
      return rect(24, 12, 76, 17);
    case "staff":
      return rect(46, 7, 50, 24);
    case "gauntlet":
      return rect(30, 34, 70, 39);
    default:
      return null;
  }
}

const turn = (kind: string) => (kind === "bow" ? -30 : 38);

function drawPart(p: Part, key: string, fill: string, opacity: number, outline: number) {
  if (p.k === "line") {
    return <Path key={key} d={p.d} fill="none" stroke={fill} strokeOpacity={opacity} strokeWidth={p.w + outline * 2} strokeLinecap="round" />;
  }
  const stroke = outline > 0 ? { stroke: fill, strokeOpacity: opacity, strokeWidth: outline * 2, strokeLinejoin: "round" as const } : {};
  if (p.k === "rect") {
    return <Rect key={key} x={p.x0} y={p.y0} width={p.x1 - p.x0} height={p.y1 - p.y0} rx={p.r} fill={fill} fillOpacity={opacity} {...stroke} />;
  }
  if (p.k === "circle") return <Circle key={key} cx={p.cx} cy={p.cy} r={p.r} fill={fill} fillOpacity={opacity} {...stroke} />;
  return <Path key={key} d={p.d} fill={fill} fillOpacity={opacity} {...stroke} />;
}

/**
 * The weapon's layers in a 0..100 box, already turned. `lw`: the ink line in
 * box units (0 = a flat silhouette in `fill`).
 */
function WeaponLayers({ kind, fill, ink, lw, gradientId, shadow, opacity = 1 }: { kind: string; fill: string; ink: string; lw: number; gradientId?: string; shadow?: number; opacity?: number }) {
  const parts = weaponParts(kind);
  const shine = weaponShine(kind);
  const rotate = `rotate(${turn(kind)} 50 50)`;
  return (
    <G>
      {shadow ? (
        <G transform={`translate(0 ${shadow})`}>
          <G transform={rotate}>{parts.map((p, i) => drawPart(p, `s${i}`, "#000000", 0.3, lw))}</G>
        </G>
      ) : null}
      <G transform={rotate}>
      {lw > 0 ? parts.map((p, i) => drawPart(p, `o${i}`, ink, 1, lw)) : null}
      {parts.map((p, i) =>
        p.k === "line"
          ? drawPart(p, `f${i}`, fill, opacity, 0)
          : drawPart(p, `f${i}`, gradientId ? `url(#${gradientId})` : fill, opacity, 0),
      )}
      {lw > 0 && shine ? drawPart(shine, "shine", "#FFFFFF", 0.85, 0) : null}
      </G>
    </G>
  );
}

/**
 * The weapon alone (WeaponGlyph; flat, it is the rail button's WeaponShape
 * in white).
 */
export function WeaponGlyph({ kind, size, fill = GP.cream, ink = GP.ink, lineWidth = 3, flat }: { kind: string; size: number; fill?: string; ink?: string; lineWidth?: number; flat?: boolean }) {
  const gid = `wg${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <Svg width={size} height={size} viewBox="-6 -6 112 112" accessible={Platform.OS === "web" ? undefined : false}>
      {flat ? null : (
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={fill} stopOpacity={1} />
            <Stop offset="1" stopColor={fill} stopOpacity={0.78} />
          </LinearGradient>
        </Defs>
      )}
      <WeaponLayers kind={kind} fill={fill} ink={ink} lw={flat ? 0 : (lineWidth * 112) / size} gradientId={flat ? undefined : gid} />
    </Svg>
  );
}

// ---------- the crystal ----------

/** CrystalFacet: the light upper-left face. */
function facetPath(w: number, h: number): string {
  return `M${w / 2} ${h * 0.06} L${w * 0.06} ${h * 0.28} L${w * 0.06} ${h * 0.55} L${w / 2} ${h / 2} Z`;
}

/**
 * RelicArt: a faceted hexagon in the rarity's colour, a hard darker base like
 * every panel in the game, and the weapon across it. Not owned: a dim crystal
 * with a ghost of the weapon and a "?".
 */
export function RelicArt({ kind, rarity, owned = true, size = 80 }: { kind: string; rarity: string; owned?: boolean; size?: number }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const gid = `ra${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const look = useLook();
  // Not found yet: a dim crystal in the paper's own shade, not a navy hole.
  const dim = look.dark ? "#2E3A52" : "#CFC6B6";
  const tint = owned ? rarityColor(rarity) : dim;
  const w = size;
  const h = size * 1.08;
  const base = size * 0.05;
  const outer = Math.max(2, size * 0.04);
  const inset = size * 0.05;
  // The weapon sits in the middle, 0.6 of the crystal wide.
  const glyph = Math.min(w, h) - size * 0.4;
  const gx = (w - glyph) / 2;
  const gy = (h - glyph) / 2;
  const lw = (Math.max(1.5, size * 0.028) * 100) / glyph;
  const frame = crystalPath(outer / 2, outer / 2, w - outer, h - outer);
  return (
    <View style={{ width: w, height: h + base }} accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width={w} height={h + base}>
        <Defs>
          <LinearGradient id={`${gid}b`} x1="0" y1="0" x2="0" y2="1">
            {owned
              ? [
                  <Stop key="0" offset="0" stopColor={tint} stopOpacity={0.85} />,
                  <Stop key="1" offset="0.5" stopColor={tint} stopOpacity={1} />,
                  <Stop key="2" offset="1" stopColor={edgeOf(tint)} stopOpacity={1} />,
                ]
              : [<Stop key="0" offset="0" stopColor={dim} stopOpacity={0.9} />, <Stop key="1" offset="1" stopColor={edgeOf(dim, 0.85)} stopOpacity={1} />]}
          </LinearGradient>
          <LinearGradient id={`${gid}m`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={GP.cream} stopOpacity={1} />
            <Stop offset="1" stopColor={GP.cream} stopOpacity={0.78} />
          </LinearGradient>
        </Defs>
        <G transform={`translate(0 ${base})`}>
          <Path d={frame} fill={edgeOf(tint)} />
        </G>
        <Path d={frame} fill={`url(#${gid}b)`} />
        <Path d={facetPath(w, h)} fill="#FFFFFF" fillOpacity={owned ? 0.22 : 0.06} />
        <Path
          d={crystalPath(inset, inset, w - inset * 2, h - inset * 2)}
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity={owned ? 0.75 : 0.12}
          strokeWidth={Math.max(1.5, size * 0.03)}
        />
        <G transform={`translate(${gx} ${gy}) scale(${glyph / 100})`}>
          {owned ? (
            <WeaponLayers kind={kind} fill={GP.cream} ink={GP.ink} lw={lw} gradientId={`${gid}m`} shadow={3} />
          ) : (
            <WeaponLayers kind={kind} fill="#FFFFFF" ink={GP.ink} lw={0} opacity={0.13} />
          )}
        </G>
        <Path d={frame} fill="none" stroke={GP.ink} strokeOpacity={owned ? 0.9 : 0.25} strokeWidth={outer} />
        {owned && rarity === "legendary" ? <LegendaryRim frame={frame} perimeter={crystalPerimeter(outer / 2, outer / 2, w - outer, h - outer)} size={size} /> : null}
      </Svg>
      {owned ? null : (
        <View style={[styles.mark, { height: h }]}>
          <Text style={{ fontFamily: GF.display, fontSize: size * 0.3, color: look.dark ? "rgba(255,255,255,0.45)" : "rgba(28,43,58,0.4)" }}>?</Text>
        </View>
      )}
    </View>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

/** One band of the rim: `seg` long, centred `centre` of the way round at turn 0, sliding with `turn`. */
function RimBand({ frame, perimeter, seg, centre, color, width, turn }: { frame: string; perimeter: number; seg: number; centre: number; color: string; width: number; turn: { get(): number } }) {
  const props = useAnimatedProps(() => ({ strokeDashoffset: bandOffset(perimeter, seg, centre, turn.get()) }));
  return <AnimatedPath d={frame} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={[seg, perimeter - seg]} animatedProps={props} />;
}

/**
 * The legendary rim (RelicArt's AngularGradient of sun, white, berry, sun,
 * white, sun, one turn every 4 s, with a sun glow of radius size x 0.08).
 */
function LegendaryRim({ frame, perimeter, size }: { frame: string; perimeter: number; size: number }) {
  const reduced = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(turn);
    turn.set(0);
    if (!reduced) turn.set(withRepeat(withTiming(1, { duration: 4000, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(turn);
  }, [reduced, turn]);
  const width = Math.max(2, size * 0.05);
  const seg = perimeter * 0.15;
  return (
    <G>
      <Path d={frame} fill="none" stroke={GP.sun} strokeOpacity={0.3} strokeWidth={width + size * 0.16} strokeLinejoin="round" />
      <Path d={frame} fill="none" stroke={GP.sun} strokeWidth={width} strokeLinejoin="round" />
      <RimBand frame={frame} perimeter={perimeter} seg={seg} centre={0.2} color="#FFFFFF" width={width} turn={turn} />
      <RimBand frame={frame} perimeter={perimeter} seg={seg * 0.9} centre={0.4} color={GP.berry} width={width} turn={turn} />
      <RimBand frame={frame} perimeter={perimeter} seg={seg} centre={0.8} color="#FFFFFF" width={width} turn={turn} />
    </G>
  );
}

/**
 * Sunburst (UI/ResultsView.swift): 14 rays fading outwards, turning once in
 * 24 s (still under Reduce Motion). Draw it at its own size; the caller
 * masks it to a circle.
 */
export function RelicSunburst({ color, size = 260 }: { color: string; size?: number }) {
  const reduced = useReducedMotion();
  const gid = `sb${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const spin = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(spin);
    spin.set(0);
    if (!reduced) spin.set(withRepeat(withTiming(1, { duration: 24000, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(spin);
  }, [reduced, spin]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get() * 360}deg` }] }));
  const r = size / 2;
  const rays = 14;
  return (
    <Animated.View pointerEvents="none" style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id={gid} cx={r} cy={r} r={r} fx={r} fy={r} gradientUnits="userSpaceOnUse">
            <Stop offset={40 / r} stopColor={color} stopOpacity={0.55} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {Array.from({ length: rays }, (_, i) => {
          const a0 = (i / rays) * 2 * Math.PI;
          const a1 = a0 + Math.PI / rays;
          return <Path key={i} d={`M${r} ${r} L${r + r * Math.cos(a0)} ${r + r * Math.sin(a0)} L${r + r * Math.cos(a1)} ${r + r * Math.sin(a1)} Z`} fill={`url(#${gid})`} />;
        })}
      </Svg>
    </Animated.View>
  );
}

/** RelicPips: ten pips, filled to the level. */
export function RelicPips({ level, tint, size = 7 }: { level: number; tint: string; size?: number }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={[styles.pips, { gap: size * 0.4 }]} accessible accessibilityLabel={`Level ${level} of ${RELIC_MAX_LEVEL}`}>
      {Array.from({ length: RELIC_MAX_LEVEL }, (_, i) => (
        <View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: i < level ? tint : "rgba(31,59,77,0.15)",
            borderWidth: 1,
            borderColor: i < level ? "rgba(31,59,77,0.5)" : "rgba(31,59,77,0.15)",
          }}
        />
      ))}
    </View>
  );
}

const STYLE_PAIR = themedStyles({
  mark: { position: "absolute", left: 0, right: 0, top: 0, alignItems: "center", justifyContent: "center" },
  pips: { flexDirection: "row", alignItems: "center" },
});
