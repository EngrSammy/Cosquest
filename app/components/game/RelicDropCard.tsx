// A Relic dropping, on the reward screen: a burst in its rarity's colour, the
// crystal flips in, and a line says whether it is new or shards.
// costquest-ios Features/RelicsFeature.swift (RelicDropCard), placed in
// Roam/RewardView.swift (the extras, after the XP has counted).
//
// The drop is the server's (roam_relics.grant, in the verdict's `extras`);
// this only draws it, and asks for the Relicdex again so the rail badge and
// the Relicdex have it (RelicsModel.noteDrop in RoamHomeView).
import * as Haptics from "expo-haptics";
import { useEffect, useId } from "react";
import { Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { abilityName, powerNow, relicDrop, type RelicDrop } from "@/features/game/relics";
import { relicsStore } from "@/features/game/relicsLive";
import { SPRING_DROP_FLIP } from "@/features/game/spring";
import type { RoamExtra } from "@/features/game/wire";

import { MAX_FONT_SCALE } from "./kit";
import { ACCENT, contrast, edgeColor, RARITY, rarityOf, RADIUS, useLook } from "./look";
import { RelicArt } from "./RelicArt";
import { playSound } from "./sound";
import { GF } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

export function RelicDropCard({ drop }: { drop: RelicDrop }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const { relic, isNew, shards } = drop;
  // One colour per rarity, the same as the map's pin rings and the drop beam (look.ts RARITY).
  const tint = RARITY[rarityOf(relic.rarity)];
  const look = useLook();
  const tintText = contrast(tint, look.surface) >= 4.5 ? tint : contrast(edgeColor(tint, 0.6), look.surface) >= 4.5 ? edgeColor(tint, 0.6) : look.text;
  const reduced = useReducedMotion();
  const gid = `dg${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const flip = useSharedValue(0);
  const glow = useSharedValue(0);

  useEffect(() => {
    // RelicDropCard.task: 150 ms, then the glow (easeOut 0.35 s), the cue and the flip (spring 0.6 / 0.62).
    glow.set(withDelay(150, withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) })));
    flip.set(withDelay(150, reduced ? withTiming(1, { duration: 200 }) : withSpring(1, SPRING_DROP_FLIP)));
    const t = setTimeout(() => {
      playSound(isNew ? "fanfare" : "coin");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }, 150);
    relicsStore.noteDrop();
    return () => clearTimeout(t);
  }, [flip, glow, isNew, reduced]);

  // A radial glow (tint at 0.9 fading to nothing) growing 0.6 to 1.1.
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.get(), transform: [{ scale: 0.6 + 0.5 * glow.get() }] }));
  const artStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, flip.get() * 1.5),
    transform: reduced
      ? [{ scale: 0.4 + 0.6 * flip.get() }]
      : [{ perspective: 600 }, { rotateY: `${(1 - flip.get()) * 180}deg` }, { scale: 0.4 + 0.6 * flip.get() }],
  }));
  const textStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, flip.get()), transform: [{ translateX: reduced ? 0 : (1 - Math.min(1, flip.get())) * 12 }] }));

  return (
    <View
      style={[styles.card, { backgroundColor: `${tint}24`, borderColor: `${tint}99` }]}
      accessible
      accessibilityLabel={isNew ? `New Relic: ${relic.name}, ${relic.rarity}` : `${relic.name} again: ${shards} shards`}>
      <View style={styles.art}>
        <Animated.View style={[styles.glow, glowStyle]} pointerEvents="none">
          <Svg width={112} height={112}>
            <Defs>
              <RadialGradient id={gid} cx={56} cy={56} r={56} fx={56} fy={56} gradientUnits="userSpaceOnUse">
                <Stop offset={4 / 56} stopColor={tint} stopOpacity={0.9} />
                <Stop offset="1" stopColor={tint} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x={0} y={0} width={112} height={112} fill={`url(#${gid})`} />
          </Svg>
        </Animated.View>
        <Animated.View style={artStyle}>
          <RelicArt kind={relic.kind} rarity={relic.rarity} size={66} />
        </Animated.View>
      </View>
      <Animated.View style={[styles.text, textStyle]}>
        <View style={styles.row}>
          {isNew ? <Text style={styles.newTag} maxFontSizeMultiplier={MAX_FONT_SCALE}>NEW</Text> : null}
          <Text style={[styles.kicker, { color: tintText }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{`${relic.rarity.toUpperCase()} RELIC`}</Text>
        </View>
        <Text style={[styles.name, { color: look.text }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {relic.name}
        </Text>
        <Text style={[styles.line, { color: look.textMuted }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {isNew ? `${abilityName(relic.ability)} · power ${powerNow(relic)}` : `+${shards} shards`}
        </Text>
      </Animated.View>
    </View>
  );
}

/** A reward extra drawn as a drop card when it is a Relic, else null (Reward.tsx's extras). */
export function RelicDropExtra({ extra }: { extra: RoamExtra }) {
  const drop = relicDrop(extra);
  return drop ? <RelicDropCard drop={drop} /> : null;
}

export default RelicDropCard;

const STYLE_PAIR = themedStyles({
  card: { flexDirection: "row", alignItems: "center", gap: 14, padding: 10, borderRadius: RADIUS.card, borderWidth: 2 },
  art: { width: 80, height: 80, alignItems: "center", justifyContent: "center" },
  glow: { position: "absolute", width: 112, height: 112 },
  text: { flex: 1, gap: 3 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  newTag: {
    fontFamily: GF.bold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    color: ACCENT.sun.label,
    backgroundColor: ACCENT.sun.fill,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: RADIUS.chip,
    overflow: "hidden",
  },
  kicker: { fontFamily: GF.bold, fontSize: 12, lineHeight: 16, letterSpacing: 0.8 },
  name: { fontFamily: GF.display, fontSize: 20, lineHeight: 24 },
  line: { fontFamily: GF.body, fontSize: 14, lineHeight: 18 },
});
