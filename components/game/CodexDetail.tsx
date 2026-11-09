// The Codex's cards: a tile in the grid, the foil's turning rainbow edge, and
// the card shown big over the grid (Fandom, City, Played, First won).
// costquest-ios Features/CodexFeature.swift (CodexTile, FoilBorder, CodexDetail).
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { detailRows, FOIL_STOPS, FOIL_TURN_MS, tierName, tileLabel } from "@/features/game/journal";
import type { CodexCard } from "@/features/game/wire";

import { Chip, GameIconButton, GamePanel, MAX_FONT_SCALE } from "./kit";
import { ELEVATION, labelOn, RADIUS, SURFACES, useLook } from "./look";
import { GF, GP, realmColor, realmIcon, tierColor } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

/** Swift spring(duration: 0.3) has no bounce: response 0.3, damping 1. */
const SPRING = { stiffness: (2 * Math.PI) ** 2 / 0.3 ** 2, damping: 2 * Math.sqrt((2 * Math.PI) ** 2 / 0.3 ** 2), mass: 1 };

/**
 * FoilBorder: a rainbow edge that turns once every 3 s, around whatever it
 * holds. Still when Reduce Motion is on: the colours alone say "foil".
 * (Neither platform strokes with a conic gradient here: a gradient square
 * turns behind the content, which sits inside a face-coloured inset.)
 */
export function FoilFrame({ radius, lineWidth, face, children }: { radius: number; lineWidth: number; face: string; children: ReactNode }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const reduce = useReducedMotion();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const turn = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(turn);
    turn.value = 0;
    if (!reduce) turn.value = withRepeat(withTiming(360, { duration: FOIL_TURN_MS, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(turn);
  }, [reduce, turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  const d = Math.ceil(Math.hypot(box.w, box.h));
  return (
    <View style={[styles.glow, { borderRadius: radius }]}>
      <View style={{ borderRadius: radius, overflow: "hidden" }} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Animated.View style={[{ width: d, height: d }, spin]}>
            <LinearGradient colors={FOIL_STOPS as unknown as [string, string, ...string[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }} />
          </Animated.View>
        </View>
        <View style={{ margin: lineWidth, borderRadius: Math.max(0, radius - lineWidth), backgroundColor: face, overflow: "hidden" }}>{children}</View>
      </View>
    </View>
  );
}

/** One card in the grid: the realm's colour, its symbol, the place, the tier. */
export function CodexTile({ card, width, onPress }: { card: CodexCard; width: number; onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const colour = realmColor(card.realm);
  const look = useLook();
  const body = (
    <View style={styles.tileBody}>
      <View style={[styles.symbol, { backgroundColor: colour }]}>
        <Ionicons name={realmIcon(card.realm)} size={26} color="#FFFFFF" />
      </View>
      <Text style={styles.tileName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {card.point_name}
      </Text>
      <View style={styles.tierRow}>
        <View style={[styles.tier, { backgroundColor: tierColor(card.tier) }]}>
          <Text style={[styles.tierText, { color: labelOn(tierColor(card.tier)) }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {tierName(card.tier).toUpperCase()}
          </Text>
        </View>
        {card.times > 1 ? (
          <Text style={styles.times} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {`×${card.times}`}
          </Text>
        ) : null}
      </View>
    </View>
  );
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={tileLabel(card)} accessibilityHint="Shows the card" style={({ pressed }) => [{ width, borderRadius: RADIUS.button, transform: [{ scale: pressed ? 0.96 : 1 }] }, !look.dark && ELEVATION.low]}>
      {card.foil ? (
        <FoilFrame radius={RADIUS.button} lineWidth={4} face={look.surface}>
          {body}
        </FoilFrame>
      ) : (
        <View style={[styles.plain, { borderColor: `${colour}99` }]}>{body}</View>
      )}
    </Pressable>
  );
}

/** The card, big, over the grid. */
export default function CodexDetail({ card, onClose }: { card: CodexCard; onClose: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const reduce = useReducedMotion();
  const colour = realmColor(card.realm);
  const scale = useSharedValue(reduce ? 1 : 0.9);
  useEffect(() => {
    scale.value = withSpring(1, SPRING);
  }, [scale]);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const art = (
    <View style={[styles.art, { backgroundColor: colour }]}>
      <Ionicons name={realmIcon(card.realm)} size={64} color="#FFFFFF" />
    </View>
  );
  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={[StyleSheet.absoluteFill, styles.overlay]} accessibilityViewIsModal>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} importantForAccessibility="no" />
      <Animated.View style={[styles.detail, pop]}>
        <GamePanel>
          <View style={{ gap: 14 }}>
            <View style={styles.detailHead}>
              {card.foil ? <Chip text="Foil" color={GP.sunDeep} /> : null}
              <Chip text={tierName(card.tier)} color={tierColor(card.tier)} />
              <View style={{ flex: 1 }} />
              <GameIconButton icon="close" diameter={38} onPress={onClose} accessibilityLabel="Close the card" />
            </View>
            <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
              {card.foil ? (
                <FoilFrame radius={20} lineWidth={5} face={colour}>
                  {art}
                </FoilFrame>
              ) : (
                art
              )}
            </View>
            <Text style={styles.detailName} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {card.point_name}
            </Text>
            <View style={{ gap: 6 }}>
              {detailRows(card).map(([label, value]) => (
                <View key={label} accessible accessibilityLabel={`${label}, ${value}`} style={styles.row}>
                  <Text style={styles.rowLabel}>{label}</Text>
                  <Text style={styles.rowValue}>{value}</Text>
                </View>
              ))}
            </View>
          </View>
        </GamePanel>
      </Animated.View>
    </Animated.View>
  );
}

const L = SURFACES.light;
const D = SURFACES.dark;

const STYLE_PAIR = themedStyles(
  {
    glow: { shadowColor: GP.sun, shadowOpacity: 0.6, shadowRadius: 4, shadowOffset: { width: 0, height: 0 }, backgroundColor: L.surface },
    center: { alignItems: "center", justifyContent: "center" },
    plain: { borderRadius: RADIUS.button, borderWidth: 2, backgroundColor: L.surface, overflow: "hidden" },
    tileBody: { padding: 8, gap: 6 },
    symbol: { minHeight: 50, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    tileName: { minHeight: 34, fontFamily: GF.bold, fontSize: 13, lineHeight: 16, color: L.text, textAlign: "center", textAlignVertical: "center" },
    tierRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
    tier: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: RADIUS.chip },
    tierText: { fontFamily: GF.bold, fontSize: 12, lineHeight: 15, letterSpacing: 0.4 },
    times: { fontFamily: GF.bold, fontSize: 12, color: L.textMuted },
    overlay: { backgroundColor: L.scrim, alignItems: "center", justifyContent: "center", padding: 24 },
    detail: { width: "100%", maxWidth: 360 },
    detailHead: { flexDirection: "row", alignItems: "center", gap: 8 },
    art: { minHeight: 130, borderRadius: RADIUS.card, alignItems: "center", justifyContent: "center" },
    detailName: { fontFamily: GF.display, fontSize: 28, lineHeight: 32, color: L.text, textAlign: "center" },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: L.hairline },
    rowLabel: { fontFamily: GF.regular, fontSize: 15, color: L.textMuted },
    rowValue: { fontFamily: GF.body, fontSize: 15, color: L.text, flexShrink: 1, textAlign: "right" },
  },
  {
    glow: { backgroundColor: D.surface },
    plain: { backgroundColor: D.surface },
    tileName: { color: D.text },
    times: { color: D.textMuted },
    overlay: { backgroundColor: D.scrim },
    detailName: { color: D.text },
    row: { borderTopColor: D.hairline },
    rowLabel: { color: D.textMuted },
    rowValue: { color: D.text },
  },
);
