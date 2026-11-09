// Progress bars in the game's two shapes: the chunky XPBar of the reward and
// the journal (a flat capsule, never thinner than a nub), and the hero
// screen's slim stat bar. Flat fills, no gloss or gradient (art direction 6.2). costquest-ios Roam/RewardView.swift (XPBar),
// Features/CodexFeature.swift (CodexBar), UI/HeroStage.swift (HeroStatBar).
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Text, View } from "react-native";

import { MAX_FONT_SCALE } from "./kit";
import { ACCENT, SURFACES, TEXT_ON_DARK, TEXT_ON_LIGHT, useLook } from "./look";
import { GF } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

/** XPBar: a flat fill (Sky by default) on an ink-tinted track, 16 high, a nub of 12 at least. `colors[0]` is the fill. */
export function XPBar({
  progress,
  colors = [ACCENT.sky.fill, ACCENT.sky.edge],
  height = 16,
  minWidth = 12,
}: {
  progress: number;
  colors?: [string, string];
  height?: number;
  minWidth?: number;
}) {
  const look = useLook();
  return (
    <View
      style={{ height, borderRadius: height / 2, backgroundColor: look.dark ? "rgba(255,255,255,0.12)" : "rgba(28,43,58,0.10)", overflow: "hidden" }}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden>
      <View style={{ width: `${clamp01(progress) * 100}%`, minWidth, height, borderRadius: height / 2, backgroundColor: colors[0] }} />
    </View>
  );
}

/** CodexBar: XPBar's shape, Mint, gold once a set is done. */
export function CodexBar({ progress, done }: { progress: number; done: boolean }) {
  return <XPBar progress={progress} height={14} colors={done ? [ACCENT.coin.fill, ACCENT.coin.edge] : [ACCENT.mint.fill, ACCENT.mint.edge]} />;
}

/** One stat on the hero screen: icon, name, value, and a Sky bar on a pale track (HeroStatBar). */
export function HeroStatBar({
  icon,
  name,
  value,
  extra,
  progress,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  name: string;
  value: string;
  extra?: string;
  progress: number;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const look = useLook();
  return (
    <View accessible accessibilityLabel={`${name}, ${value}${extra ? ` ${extra}` : ""}`} style={{ gap: 6 }}>
      <View style={styles.statRow}>
        <Ionicons name={icon} size={17} color={look.text} style={{ width: 22 }} />
        <Text style={styles.statName} maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.statValue} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {value}
        </Text>
        {extra ? (
          <Text style={styles.statExtra} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {extra}
          </Text>
        ) : null}
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: look.dark ? "rgba(255,255,255,0.12)" : "rgba(28,43,58,0.10)", overflow: "hidden" }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={{ width: `${clamp01(progress) * 100}%`, minWidth: 8, height: 8, borderRadius: 4, backgroundColor: ACCENT.sky.fill }} />
      </View>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    statRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    statName: { flex: 1, fontFamily: GF.body, fontSize: 15, lineHeight: 20, color: SURFACES.light.text },
    statValue: { fontFamily: GF.display, fontSize: 17, lineHeight: 22, color: SURFACES.light.text, fontVariant: ["tabular-nums"] },
    statExtra: { fontFamily: GF.bold, fontSize: 13, color: TEXT_ON_LIGHT.warning },
  },
  {
    statName: { color: SURFACES.dark.text },
    statValue: { color: SURFACES.dark.text },
    statExtra: { color: TEXT_ON_DARK.warning },
  },
);
