// The events calendar: what is on now, and every Quest Hour and Landmark Day
// in the next 30 days, in the phone's time. The server computes the calendar
// for where the player stands and pays the bonus on the answer itself.
// costquest-ios Features/LiveFeature.swift (LiveCalendarSheet).
import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSheetMotion } from "./sheetMotion";

import { liveAt, type LiveEvent, times, upcomingAfter, whenText } from "@/features/game/live";
import { liveCalendar, livePlace, useLiveCalendar } from "@/features/game/liveRuntime";
import { useGame } from "@/features/game/runtime";

import { GameBackdrop } from "./GameBackdrop";
import { Chip, GameButton, GamePanel, MAX_FONT_SCALE } from "./kit";
import { LIVE_CLOCK, useLiveNow } from "./LiveBanner";
import { ACCENT, edgeColor, RADIUS, SURFACES } from "./look";
import { SheetHeader } from "./SheetHeader";
import { GF } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

function reload() {
  const here = livePlace();
  if (here) void liveCalendar.load(here.lat, here.lng);
}

export default function LiveCalendarSheet({ onClose }: { onClose: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();
  const motion = useSheetMotion();
  const { calendar, error } = useLiveCalendar();
  const fix = useGame((s) => s.fix);
  const centre = useGame((s) => s.centre);
  const hasPlace = fix !== null || centre !== null;
  const now = useLiveNow(calendar);

  // Fresh on open, as iOS does (.task { load }).
  useEffect(() => {
    if (hasPlace) reload();
  }, [hasPlace]);

  const live = calendar ? liveAt(calendar, now) : null;
  const next = calendar ? upcomingAfter(calendar, now) : [];

  return (
    <Animated.View entering={motion.entering} exiting={motion.exiting} style={[styles.sheet, { top: insets.top + 40 }]}>
      <GameBackdrop />
      <View style={styles.head}>
        <SheetHeader title="Events" onClose={onClose} closeLabel="Close" />
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        {calendar ? (
          <>
            {live ? (
              <GamePanel padding={14}>
                <EventRow event={live} badge="Live now" color={ACCENT.berry.fill} />
              </GamePanel>
            ) : null}
            {!live && !next.length ? <Text style={styles.note}>Nothing booked for the next 30 days. Quest Hour is back on Wednesday evening.</Text> : null}
            {next.map((e) => (
              <GamePanel key={`${e.key}@${e.starts_at}`} padding={14}>
                <EventRow event={e} badge={`${times(e.multiplier)} XP`} color={colorFor(e)} />
              </GamePanel>
            ))}
            <Text style={styles.note}>
              Every Wednesday evening is Quest Hour (2× XP). The first Saturday afternoon of each month is Landmark Day (3× XP). Times are local.
            </Text>
          </>
        ) : error ? (
          <View style={{ gap: 10 }}>
            <Text style={styles.note}>{`The calendar didn't load. ${error}`}</Text>
            <GameButton title="Try again" size="medium" color={ACCENT.sky.fill} onPress={reload} />
          </View>
        ) : !hasPlace ? (
          <Text style={styles.note}>Finding where you are: events run on your local time.</Text>
        ) : (
          <View style={{ gap: 14 }} accessible accessibilityLabel="Loading events">
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.skeleton}>
                <View style={[styles.skeletonLine, { width: "60%" }]} />
                <View style={[styles.skeletonLine, { width: "40%", height: 10 }]} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Animated.View>
  );
}

function colorFor(e: LiveEvent): string {
  return e.key === "landmark_day" ? ACCENT.berry.fill : ACCENT.sky.fill;
}

function EventRow({ event, badge, color }: { event: LiveEvent; badge: string; color: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const when = whenText(event, LIVE_CLOCK);
  return (
    <View style={styles.row} accessible accessibilityLabel={`${event.title}, ${when}, ${badge}`}>
      <Ionicons name={event.key === "landmark_day" ? "business" : "flash"} size={24} color={edgeColor(color, 0.85)} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle} numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {event.title}
        </Text>
        <Text style={styles.rowWhen} maxFontSizeMultiplier={MAX_FONT_SCALE}>{when}</Text>
      </View>
      <Chip text={badge} color={color} />
    </View>
  );
}

const L = SURFACES.light;
const D = SURFACES.dark;

const STYLE_PAIR = themedStyles(
  {
    sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, backgroundColor: L.screen, overflow: "hidden", elevation: 18 },
    head: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 10 },
    body: { paddingHorizontal: 18, gap: 14 },
    row: { flexDirection: "row", alignItems: "center", gap: 12 },
    rowTitle: { fontFamily: GF.bold, fontSize: 18, lineHeight: 22, color: L.text },
    rowWhen: { fontFamily: GF.regular, fontSize: 14, lineHeight: 19, color: L.textMuted },
    note: { fontFamily: GF.regular, fontSize: 14, lineHeight: 20, color: L.textMuted, paddingHorizontal: 4 },
    skeleton: { gap: 10, padding: 16, borderRadius: RADIUS.card, backgroundColor: L.surface },
    skeletonLine: { height: 14, borderRadius: 7, backgroundColor: L.surfaceAlt },
  },
  {
    sheet: { backgroundColor: D.screen },
    rowTitle: { color: D.text },
    rowWhen: { color: D.textMuted },
    note: { color: D.textMuted },
    skeleton: { backgroundColor: D.surface },
    skeletonLine: { backgroundColor: D.surfaceAlt },
  },
);
