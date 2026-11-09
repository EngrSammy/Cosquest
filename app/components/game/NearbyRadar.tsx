// A strip above the Nearby tray naming what is close and what is about to
// appear or vanish: "2 in reach · 1 wandering · next in 4 min". Polls the
// server's public "next spawn" once a minute and redraws every 20 s, so the
// counts stay true between point refreshes. costquest-ios
// Features/SpawnsFeature.swift NearbyRadar.
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { gameStore } from "@/features/game/runtime";
import { nextAtFrom, radarCounts, radarParts, spawnsNext } from "@/features/game/siege";
import type { QuestPoint } from "@/features/game/wire";

import { MAX_FONT_SCALE } from "./kit";
import { ACCENT, ELEVATION, RADIUS, SURFACES } from "./look";
import { GF } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

const POLL_MS = 60_000;
const REDRAW_MS = 20_000;

export default function NearbyRadar({
  points,
  fix,
  inReach,
}: {
  points: QuestPoint[];
  fix: { lat: number; lng: number } | null;
  inReach: (p: QuestPoint) => boolean;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const [nextAt, setNextAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const fixRef = useRef(fix);
  useEffect(() => {
    fixRef.current = fix;
  });
  const hasFix = fix !== null;

  // Poll while the strip is on screen. The server derives wandering
  // challenges from place and time, so this is a cheap, public read; a
  // failure just hides the "next" part.
  useEffect(() => {
    if (!hasFix) return;
    let alive = true;
    const refresh = async () => {
      const f = fixRef.current;
      if (!f) return;
      try {
        const r = await spawnsNext(gameStore.client, f.lat, f.lng);
        if (alive) setNextAt(nextAtFrom(r, Date.now()));
      } catch {
        if (alive) setNextAt(null);
      }
    };
    void refresh();
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [hasFix]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), REDRAW_MS);
    return () => clearInterval(t);
  }, []);

  if (!hasFix) return null;
  const { reach, wandering } = radarCounts(points, inReach, now);
  const parts = radarParts(reach, wandering, nextAt, now);
  if (parts.length === 0) return null;
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.panel} accessible accessibilityLabel={parts.join(", ")}>
      {wandering > 0 ? (
        <Ionicons name="footsteps" size={18} color={ACCENT.sun.edge} />
      ) : (
        <Ionicons name="radio" size={18} color={ACCENT.sun.edge} />
      )}
      <Text style={styles.text} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {parts.join(" · ")}
      </Text>
    </Animated.View>
  );
}

// A paper plate over the map, like the rest of the HUD (cream by day, ink by dusk).
const STYLE_PAIR = themedStyles(
  {
    panel: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 8,
      marginHorizontal: 14,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: RADIUS.pill,
      backgroundColor: SURFACES.light.surface,
      borderWidth: 1,
      borderColor: SURFACES.light.hairline,
      ...ELEVATION.float,
      maxWidth: "88%",
    },
    text: { flexShrink: 1, fontFamily: GF.body, fontSize: 14, lineHeight: 18, color: SURFACES.light.text },
  },
  {
    panel: { backgroundColor: SURFACES.dark.surface, borderColor: SURFACES.dark.hairline, shadowOpacity: 0, elevation: 0, boxShadow: "none" },
    text: { color: SURFACES.dark.text },
  },
);
