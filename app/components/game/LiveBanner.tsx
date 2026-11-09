// The live banner on the map, under the player chip: Quest Hour (or Landmark
// Day) on now with its countdown, or the next one if it starts within a day.
// Tapping it opens the events calendar. It wakes exactly when what it says
// could change, so it flips on the minute by the phone's clock without a
// refetch; the calendar itself is fetched every 5 minutes.
// costquest-ios Features/LiveFeature.swift (LiveBanner, LiveCard).
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { bannerAt, type LiveCalendar, type LiveClock, nextChange, phoneClock, soonText, times } from "@/features/game/live";
import { liveCalendar, livePlace, useLiveCalendar } from "@/features/game/liveRuntime";
import { useGame } from "@/features/game/runtime";

import { HUD_FONT_SCALE, pressFeedback } from "./kit";
import { ACCENT, ELEVATION, RADIUS, SURFACES } from "./look";
import { GF } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

/** The phone's clock (its zone is read per instant, so a zone change still shows). */
export const LIVE_CLOCK: LiveClock = phoneClock();

/** How often to look for a fix or a stale calendar (iOS waits 5 s for a fix). */
const POLL_MS = 15000;

/** `#rrggbb` at an opacity. */
export function withAlpha(hex: string, alpha: number): string {
  return `${hex}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
}

/** The phone's time, re-read whenever the calendar could say something new. */
export function useLiveNow(calendar: LiveCalendar | null, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!calendar || !active) return;
    const t0 = Date.now();
    // A calendar that just arrived, or a page that was parked: catch up first.
    const at = t0 - now > 1000 ? t0 : nextChange(calendar, t0, LIVE_CLOCK);
    // Land just past the boundary; never sleep longer than a minute (a clock
    // the user moves by hand is noticed within it).
    const delay = at === null ? 60000 : Math.min(60000, Math.max(0, at - t0 + 50));
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [calendar, now, active]);
  return now;
}

/** Fetch the calendar once there is a place, and again when it is 5 minutes old. */
function useCalendarPolling(active: boolean) {
  const fix = useGame((s) => s.fix);
  const centre = useGame((s) => s.centre);
  const hasPlace = fix !== null || centre !== null;
  useEffect(() => {
    if (!active || !hasPlace) return;
    const tick = () => {
      const here = livePlace();
      if (here) void liveCalendar.refreshIfStale(here.lat, here.lng);
    };
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => clearInterval(timer);
  }, [active, hasPlace]);
}

/**
 * The map banner. Draws nothing until there is something on (or soon).
 * `parked`: the game page is off screen; nothing polls or ticks.
 */
export default function LiveBanner({ parked, onOpen }: { parked: boolean; onOpen: () => void }) {
  const { calendar } = useLiveCalendar();
  useCalendarPolling(!parked);
  const now = useLiveNow(calendar, !parked);
  const banner = bannerAt(calendar, now);
  if (!banner) return null;
  const isLive = banner.kind === "live";
  const detail = isLive ? `On now · ${banner.left}` : soonText(banner.start, now, LIVE_CLOCK);
  const mult = times(banner.event.multiplier);
  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)}>
      <Pressable
        onPressIn={pressFeedback}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${banner.event.title}, ${mult} XP, ${isLive ? banner.left : detail}`}
        accessibilityHint="Opens the events calendar">
        {({ pressed }) => <LiveCard title={banner.event.title} detail={detail} multiplier={mult} isLive={isLive} pressed={pressed} />}
      </Pressable>
    </Animated.View>
  );
}

/**
 * One paper plate for "on now" and "starting soon", like the rest of the HUD:
 * the XP multiplier leads (it is the news), then the event and when. Live
 * events carry a Sun bar down the left; no icon tile, no pulse, no glow.
 */
function LiveCard({ title, detail, multiplier, isLive, pressed }: { title: string; detail: string; multiplier: string; isLive: boolean; pressed: boolean }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={[styles.card, pressed && styles.pressed]}>
      {isLive ? <View style={styles.bar} /> : null}
      <View style={[styles.mult, !isLive && styles.multSoon]}>
        <Text style={[styles.multText, !isLive && styles.multTextSoon]} maxFontSizeMultiplier={HUD_FONT_SCALE}>
          {multiplier}
        </Text>
        <Text style={[styles.multUnit, !isLive && styles.multTextSoon]} maxFontSizeMultiplier={HUD_FONT_SCALE}>
          XP
        </Text>
      </View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1} maxFontSizeMultiplier={HUD_FONT_SCALE}>
          {title}
        </Text>
        <Text style={styles.detail} numberOfLines={1} maxFontSizeMultiplier={HUD_FONT_SCALE}>
          {detail}
        </Text>
      </View>
    </View>
  );
}

const L = SURFACES.light;
const D = SURFACES.dark;

const STYLE_PAIR = themedStyles(
  {
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingLeft: 10,
      paddingRight: 14,
      paddingVertical: 8,
      borderRadius: RADIUS.card,
      overflow: "hidden",
      backgroundColor: L.surface,
      borderWidth: 1,
      borderColor: L.hairline,
      ...ELEVATION.float,
    },
    pressed: { transform: [{ scale: 0.98 }] },
    bar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: ACCENT.sun.fill },
    mult: { minWidth: 48, height: 40, paddingHorizontal: 6, borderRadius: RADIUS.chip, alignItems: "center", justifyContent: "center", backgroundColor: ACCENT.sun.fill },
    multSoon: { backgroundColor: L.surfaceAlt },
    multText: { fontFamily: GF.display, fontSize: 18, lineHeight: 20, color: ACCENT.sun.label },
    multUnit: { fontFamily: GF.bold, fontSize: 12, lineHeight: 13, color: ACCENT.sun.label },
    multTextSoon: { color: L.text },
    text: { flex: 1, gap: 1 },
    title: { fontFamily: GF.display, fontSize: 16, lineHeight: 20, color: L.text },
    detail: { fontFamily: GF.regular, fontSize: 13, lineHeight: 17, color: L.textMuted },
  },
  {
    card: { backgroundColor: D.surface, borderColor: D.hairline, shadowOpacity: 0, elevation: 0, boxShadow: "none" },
    multSoon: { backgroundColor: D.surfaceAlt },
    multTextSoon: { color: D.text },
    title: { color: D.text },
    detail: { color: D.textMuted },
  },
);
