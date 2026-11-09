// The Nearby tray: the Quest Points round the player, as one slim strip along
// the bottom of the map.
//
// The map is the hero. The tray is a single low band in the HUD's own navy
// plate (the top bar's chips), not a row of floating cards: each point is the
// same object as its pin on the map (the same disc, colour, ring and icon,
// from WorldMap's pinFill), its real name, its distance in metres with an
// arrow pointing where it lies on the map as the map is turned, and at most
// one short state chip (READY, a rest or raid timer, NEW, START, its holder).
// The first point (the Warden's suggestion, else the nearest) leads: a bigger
// pin, a coloured bar on top. Four show; the rest fold behind "+n".
//
// Tapping a point flies the map to it and opens it (GameRoot). The tray
// steps out of the way while a finger moves the map and comes back on
// release (mapBusy, driven on the UI thread: no React render per gesture).
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, { type SharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";

import { distanceText } from "@/features/game/geo";
import { cardLabel, trayChipState, trayOrder } from "@/features/game/guide";
import type { QuestPoint } from "@/features/game/wire";

import { CoachAnchor } from "./Coach";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";
import { GAME_TO_CHAT } from "@/features/world/factionLink";

import { HUD_FONT_SCALE, withAlpha } from "./kit";
import { ACCENT, ELEVATION, FACTION, labelOn, RADIUS, SURFACES, useLook } from "./look";
import { RaidCrown } from "./RaidParts";
import { SHEET_CLOSE_MS, SHEET_EASE_IN, SHEET_EASE_OUT } from "./sheetMotion";
import { GF } from "./theme";
import { challengeGlyph, pinFill } from "./WorldMap";

/** Points shown before the rest fold behind "+n". */
export const TRAY_FOLDED = 4;
const LEAD_W = 196;
const ITEM_W = 172;
const MORE_W = 56;
const BAND_H = 58;
/** A resting point's pin, as the map draws it (WorldMap PointMarker). */
const COOLING_FILL = "#B3B9C0";
const L = SURFACES.light;
const D = SURFACES.dark;

export type TrayChip = { text: string; fg: string; bg: string; icon?: "timer-outline" | "hourglass-outline" };

/** The chip's colours, from the game's palette (the state itself is guide.ts trayChipState). */
function trayChip(p: QuestPoint, o: { ready: boolean; cooling: boolean; newCard: boolean; now: number; muted: string }): TrayChip | null {
  const c = trayChipState(p, o);
  if (!c) return null;
  const icon = c.timer ? (c.tone === "rest" ? "hourglass-outline" : "timer-outline") : undefined;
  const fill = (bg: string): TrayChip => ({ text: c.text, fg: labelOn(bg), bg, icon });
  switch (c.tone) {
    case "rest":
      return { text: c.text, fg: o.muted, bg: "transparent", icon };
    case "ready":
      return fill(ACCENT.mint.fill);
    case "raid":
      return fill(ACCENT.berry.fill);
    case "event":
      return fill(ACCENT.sky.fill);
    case "new":
      return fill(ACCENT.sun.fill);
    case "holder":
      return fill(FACTION[GAME_TO_CHAT[c.holder ?? ""] ?? ""]?.fill ?? ACCENT.ink.fill);
  }
}

/** The map's pin, small: the same disc, ring, colour and icon, so the eye matches the two. */
function PinGlyph({ point, cooling, size }: { point: QuestPoint; cooling: boolean; size: number }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const fill = cooling ? COOLING_FILL : pinFill(point);
  const icon = Math.round(size * 0.5);
  return (
    <View style={{ alignItems: "center" }}>
      <View style={[styles.pin, { width: size, height: size, borderRadius: size / 2, backgroundColor: fill, borderWidth: size > 28 ? 2.5 : 2 }]}>
        {point.source === "raid" ? <RaidCrown size={icon} /> : <Ionicons name={challengeGlyph(point)} size={icon} color="#FFFFFF" />}
      </View>
    </View>
  );
}

/** Points where the place lies on the map as it is turned now (UI thread: follows a twist live). */
function Bearing({ deg, mapRot }: { deg: number; mapRot?: SharedValue<number> }) {
  const look = useLook();
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${deg + ((mapRot ? mapRot.get() : 0) * 180) / Math.PI}deg` }] }));
  return (
    <Animated.View style={style}>
      <Ionicons name="navigate" size={11} color={look.textMuted} style={{ transform: [{ rotate: "-45deg" }] }} />
    </Animated.View>
  );
}

function Chip({ chip }: { chip: TrayChip }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const outline = chip.bg === "transparent";
  return (
    <View style={[styles.chip, { backgroundColor: chip.bg }, outline && { borderWidth: 1, borderColor: withAlpha(chip.fg, 0.7) }]}>
      {chip.icon ? <Ionicons name={chip.icon} size={11} color={chip.fg} /> : null}
      <Text style={[styles.chipText, { color: chip.fg }]} maxFontSizeMultiplier={1.1} numberOfLines={1}>
        {chip.text}
      </Text>
    </View>
  );
}

export function NearbyTray({
  points,
  suggested,
  distanceOf,
  bearingOf,
  inReach,
  cooling,
  newCard,
  onSelect,
  mapRot,
  mapBusy,
}: {
  /** Every point, nearest first (the tray shows ten at most). */
  points: QuestPoint[];
  /** The Warden's best next move: it leads. */
  suggested: string | null;
  distanceOf: (p: QuestPoint) => number | null;
  /** Compass bearing from the player, degrees (null without a fix). */
  bearingOf: (p: QuestPoint) => number | null;
  inReach: (p: QuestPoint) => boolean;
  cooling: (p: QuestPoint) => boolean;
  newCard: (p: QuestPoint) => boolean;
  onSelect: (p: QuestPoint) => void;
  /** The map's turn, radians (WorldMap camRot): arrows follow it. */
  mapRot?: SharedValue<number>;
  /** A finger is moving the map (WorldMap mapBusy): the tray steps aside. */
  mapBusy?: SharedValue<boolean>;
}) {
  // Rest and raid timers in minutes: every 30 s is plenty.
  const styles = useThemedStyles(STYLE_PAIR);
  const look = useLook();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const [open, setOpen] = useState(false);
  const aside = useAnimatedStyle(() => {
    const busy = mapBusy ? mapBusy.get() : false;
    const t = busy ? { duration: 140, easing: SHEET_EASE_IN } : { duration: SHEET_CLOSE_MS, easing: SHEET_EASE_OUT };
    return { opacity: withTiming(busy ? 0 : 1, t), transform: [{ translateY: withTiming(busy ? 18 : 0, t) }] };
  });

  const all = trayOrder(points, suggested);
  if (all.length === 0) return null;
  const folded = !open && all.length > TRAY_FOLDED + 1;
  const shown = folded ? all.slice(0, TRAY_FOLDED) : all;
  const offsets = shown.map((_, i) => (i === 0 ? 0 : LEAD_W + (i - 1) * ITEM_W));

  return (
    <Animated.View style={[styles.band, aside]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToOffsets={offsets}
        decelerationRate="fast"
        contentContainerStyle={styles.row}
        accessibilityLabel="Nearby Quest Points">
        {shown.map((p, i) => {
          const lead = i === 0;
          const reach = inReach(p);
          const cool = cooling(p);
          const ready = reach && !cool;
          const d = distanceOf(p);
          const b = bearingOf(p);
          const chip = trayChip(p, { ready, cooling: cool, newCard: newCard(p), now, muted: look.textMuted });
          const accent = lead ? (ready ? ACCENT.mint.fill : p.id === suggested ? ACCENT.sun.fill : null) : null;
          const item = (
            <Pressable
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                onSelect(p);
              }}
              style={({ pressed }) => [styles.item, { width: lead ? LEAD_W : ITEM_W }, i > 0 && styles.divider, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={cardLabel(p, { inReach: reach, distanceText: distanceText(d), cooling: cool, suggested: p.id === suggested })}
              accessibilityHint="Shows it on the map">
              {accent ? <View style={[styles.accent, { backgroundColor: accent }]} /> : null}
              <PinGlyph point={p} cooling={cool} size={lead ? 32 : 26} />
              <View style={styles.words}>
                <Text style={[styles.name, lead ? styles.nameLead : null, cool && { color: look.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={HUD_FONT_SCALE}>
                  {p.name}
                </Text>
                <View style={styles.facts}>
                  {ready ? null : (
                    <>
                      {b !== null ? <Bearing deg={b} mapRot={mapRot} /> : null}
                      <Text style={styles.distance} numberOfLines={1} maxFontSizeMultiplier={HUD_FONT_SCALE}>
                        {distanceText(d)}
                      </Text>
                    </>
                  )}
                  {chip ? <Chip chip={chip} /> : null}
                </View>
              </View>
            </Pressable>
          );
          // The Warden's first coach step lights the starter.
          return p.source === "starter" ? (
            <CoachAnchor key={p.id} ids={["starter"]}>
              {item}
            </CoachAnchor>
          ) : (
            <View key={p.id}>{item}</View>
          );
        })}
        {folded ? (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              setOpen(true);
            }}
            style={({ pressed }) => [styles.more, styles.divider, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`${all.length - TRAY_FOLDED} more nearby`}>
            <Text style={styles.moreText} maxFontSizeMultiplier={HUD_FONT_SCALE}>
              +{all.length - TRAY_FOLDED}
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Animated.View>
  );
}

// One look in light and dark: the HUD's navy plate over whatever the map is lit as.
const STYLE_PAIR = themedStyles(
  {
    band: {
      marginHorizontal: 12,
      height: BAND_H,
      borderRadius: RADIUS.card,
      backgroundColor: L.surface,
      borderWidth: 1,
      borderColor: L.hairline,
      overflow: "hidden",
      ...ELEVATION.float,
    },
    row: { alignItems: "stretch" },
    item: { height: BAND_H, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 12, paddingRight: 8 },
    divider: { borderLeftWidth: 1, borderLeftColor: L.hairline },
    pressed: { backgroundColor: L.surfaceAlt },
    accent: { position: "absolute", left: 14, right: 14, top: 0, height: 3, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
    pin: { borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
    words: { flex: 1, gap: 3 },
    name: { fontFamily: GF.bold, fontSize: 14, lineHeight: 18, color: L.text },
    nameLead: { fontFamily: GF.display, fontSize: 16, lineHeight: 20 },
    facts: { flexDirection: "row", alignItems: "center", gap: 5 },
    distance: { flexShrink: 0, fontFamily: GF.regular, fontSize: 12, lineHeight: 16, color: L.textMuted, fontVariant: ["tabular-nums"] },
    chip: { flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 3, height: 18, paddingHorizontal: 6, borderRadius: 6 },
    chipText: { fontFamily: GF.bold, fontSize: 12, lineHeight: 15, letterSpacing: 0.4 },
    more: { width: MORE_W, height: BAND_H, alignItems: "center", justifyContent: "center" },
    moreText: { fontFamily: GF.display, fontSize: 16, lineHeight: 20, color: L.textMuted },
  },
  {
    band: { backgroundColor: D.surface, borderColor: D.hairline, shadowOpacity: 0, elevation: 0, boxShadow: "none" },
    divider: { borderLeftColor: D.hairline },
    pressed: { backgroundColor: D.surfaceAlt },
    name: { color: D.text },
    distance: { color: D.textMuted },
    moreText: { color: D.textMuted },
  },
);
