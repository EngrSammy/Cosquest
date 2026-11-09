// A player's avatar, drawn rather than downloaded: one of four shapes, an
// emblem and a tint, with the game's pressed-3D base. Three numbers, so it
// renders the same at any size on any device.
// costquest-ios UI/AvatarView.swift (AvatarView, Diamond, Hexagon).
import { Ionicons } from "@expo/vector-icons";
import { useId } from "react";
import { View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { type AvatarShape, avatarMark, avatarShape, safeTint } from "@/features/game/profile";
import type { ProfileAvatar } from "@/features/game/wire";

import { edgeOf, GP } from "./theme";

/** The shape's outline inside a unit square of `s`, as an SVG path or rect. */
function ShapePath({ shape, s, inset = 0, fill, stroke, strokeWidth, dy = 0 }: { shape: AvatarShape; s: number; inset?: number; fill?: string; stroke?: string; strokeWidth?: number; dy?: number }) {
  const a = inset;
  const b = s - inset;
  const w = b - a;
  const common = { fill: fill ?? "none", stroke, strokeWidth } as const;
  switch (shape) {
    case "circle": {
      const r = w / 2;
      return <Path d={`M ${a} ${a + r + dy} a ${r} ${r} 0 1 0 ${w} 0 a ${r} ${r} 0 1 0 ${-w} 0 Z`} {...common} />;
    }
    case "square":
      return <Rect x={a} y={a + dy} width={w} height={w} rx={s * 0.2} ry={s * 0.2} {...common} />;
    case "diamond":
      return <Path d={`M ${a + w / 2} ${a + dy} L ${b} ${a + w / 2 + dy} L ${a + w / 2} ${b + dy} L ${a} ${a + w / 2 + dy} Z`} {...common} />;
    case "hexagon": {
      const i = w * 0.25;
      return <Path d={`M ${a + i} ${a + dy} L ${b - i} ${a + dy} L ${b} ${a + w / 2 + dy} L ${b - i} ${b + dy} L ${a + i} ${b + dy} L ${a} ${a + w / 2 + dy} Z`} {...common} />;
    }
  }
}

export default function AvatarView({ avatar, size = 64 }: { avatar: ProfileAvatar; size?: number }) {
  const id = useId().replace(/:/g, "");
  const tint = safeTint(avatar.tint);
  const shape = avatarShape(avatar.face);
  // The base sits below the badge, so the drawing is a little shorter than the frame.
  const s = size * 0.94;
  const lw = Math.max(2, size * 0.06);
  return (
    <View style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <LinearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={tint} stopOpacity={0.85} />
            <Stop offset="1" stopColor={tint} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <ShapePath shape={shape} s={s} fill={edgeOf(tint)} dy={size * 0.06} />
        <ShapePath shape={shape} s={s} fill={`url(#${id}f)`} />
        <ShapePath shape={shape} s={s} inset={size * 0.03} stroke={GP.ink} strokeWidth={lw} />
      </Svg>
      <View style={{ position: "absolute", left: 0, top: 0, width: s, height: s, alignItems: "center", justifyContent: "center" }}>
        <Ionicons
          name={avatarMark(avatar.mark)}
          size={size * 0.42}
          color="#FFFFFF"
          style={{ textShadowColor: "rgba(31,59,77,0.5)", textShadowOffset: { width: 0, height: size * 0.03 }, textShadowRadius: 0.1 }}
        />
      </View>
    </View>
  );
}
