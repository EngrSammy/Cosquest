// A card in the Dailies: this week's distance walked and its rewards at 5, 25
// and 50 km (costquest-ios Features/StepsFeature.swift StepsCard,
// MilestoneTile; placed like RoamSheets.swift DailiesSheet, behind the
// "walking" unlock). The phone's step counter feeds it on Android
// (features/game/stepsDevice.ts); the server decides what the walk is worth
// and pays it, and its refusals are shown in its own words.
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, Text, View } from "react-native";

import { gameStore } from "@/features/game/runtime";
import {
  describeRewards,
  EMPTY_STEPS_VIEW,
  km,
  type MilestoneState,
  milestoneState,
  permissionName,
  progressTo,
  type StepsMilestone,
  type StepsStatus,
  type StepsView,
} from "@/features/game/steps";
import { updateStepsOnPhone } from "@/features/game/stepsDevice";

import { announce, Chip, GameButton, MAX_FONT_SCALE, ProgressBar } from "./kit";
import { playSound } from "./sound";
import { ACCENT, labelOn, RADIUS, SURFACES, TEXT_ON_DARK, TEXT_ON_LIGHT, useLook } from "./look";
import { GF } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

export default function StepsCard() {
  const styles = useThemedStyles(STYLE_PAIR);
  const look = useLook();
  const [view, setView] = useState<StepsView>(EMPTY_STEPS_VIEW);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const latest = useRef<StepsView>(EMPTY_STEPS_VIEW);
  const alive = useRef(true);

  const update = async (ask: boolean) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      const next = await updateStepsOnPhone(latest.current, ask);
      latest.current = next;
      if (!alive.current) return;
      setView(next);
      if (next.note) announce(next.note);
      if (next.justPaid) {
        // StepsModel.update: fanfare and a success haptic when a milestone pays.
        playSound("fanfare");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        announce(next.newly.map((n) => `${n.km} km reached! ${describeRewards(n.rewards)}`).join(". "));
        // XP and the item bag moved; let the rest of the game see it.
        void gameStore.refreshMe();
      }
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  };

  // Once per appearance: opening the dailies is when a player wants to see
  // this week's walk, and the report is cheap and idempotent.
  useEffect(() => {
    alive.current = true;
    void update(false);
    return () => {
      alive.current = false;
    };
  }, []);

  const s = view.status;
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {km(s?.meters ?? 0)} km walked this week
        </Text>
        <Text style={styles.muted} maxFontSizeMultiplier={MAX_FONT_SCALE}>Every 5, 25 and 50 km pays out. The count resets on Monday.</Text>
      </View>
      {s ? (
        <>
          <Progress status={s} />
          <View style={styles.tiles}>
            {s.milestones.map((m) => (
              <MilestoneTile key={m.km} milestone={m} state={milestoneState(s, m.km)} />
            ))}
          </View>
        </>
      ) : busy ? (
        <ActivityIndicator color={look.textMuted} style={{ marginVertical: 8 }} />
      ) : null}
      {view.newly.length ? (
        <View style={styles.paid} accessible accessibilityLabel={view.newly.map((n) => `${n.km} km reached! ${describeRewards(n.rewards)}`).join(". ")}>
          {view.newly.map((n) => (
            <View key={n.km} style={styles.paidRow}>
              <Ionicons name="walk" size={18} color={look.dark ? TEXT_ON_DARK.success : TEXT_ON_LIGHT.success} accessibilityElementsHidden importantForAccessibility="no" />
              <Text style={styles.paidText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {n.km} km reached! {describeRewards(n.rewards)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {view.note ? (
        <Text style={[styles.note, { color: view.noteIsProblem ? (look.dark ? TEXT_ON_DARK.danger : TEXT_ON_LIGHT.danger) : look.textMuted }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {view.note}
        </Text>
      ) : null}
      {view.motionDenied ? (
        <GameButton
          title="Open Settings"
          color={ACCENT.sky.fill}
          small
          style={{ alignSelf: "flex-start" }}
          onPress={() => {
            Linking.openSettings().catch(() => {});
          }}
          accessibilityLabel={`Open Settings to allow ${permissionName(Platform.OS === "ios" ? "ios" : "android")}`}
        />
      ) : null}
      <GameButton
        title={busy ? "Counting your steps" : "Count my steps"}
        color={ACCENT.mint.fill}
        icon={<Ionicons name="walk" size={20} color={busy ? SURFACES.light.textMuted : labelOn(ACCENT.mint.fill)} />}
        disabled={busy}
        onPress={() => void update(true)}
        accessibilityLabel="Update this week's walk from your phone"
      />
    </View>
  );
}

function Progress({ status }: { status: StepsStatus }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const p = progressTo(status);
  return (
    <View style={{ gap: 6 }} accessible accessibilityLabel={p.line}>
      <ProgressBar value={p.value} color={p.allDone ? ACCENT.mint.fill : ACCENT.sun.fill} />
      <Text style={[styles.line, p.allDone && styles.lineDone]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{p.line}</Text>
    </View>
  );
}

/** One of the three weekly milestones: done, the one being walked towards, or later. */
function MilestoneTile({ milestone, state }: { milestone: StepsMilestone; state: MilestoneState }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const color = state === "done" ? ACCENT.mint.fill : state === "next" ? ACCENT.sun.fill : RARITY_COMMON;
  const word = state === "done" ? "Done" : state === "next" ? "Next" : "Locked";
  return (
    <View
      style={[styles.tile, { backgroundColor: `${color}${state === "locked" ? "14" : "29"}` }]}
      accessible
      accessibilityLabel={`${milestone.km} kilometres, ${word.toLowerCase()}. ${describeRewards(milestone)}`}>
      {state === "done" ? (
        <MaterialCommunityIcons name="check-decagram" size={22} color={color} />
      ) : (
        <Ionicons name={state === "next" ? "flag" : "lock-closed"} size={20} color={state === "next" ? ACCENT.sun.edge : color} />
      )}
      <Text style={styles.tileKm} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {milestone.km} km
      </Text>
      <Text style={styles.tileRewards} numberOfLines={3} adjustsFontSizeToFit maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {describeRewards(milestone, true)}
      </Text>
      <View>
        <Chip text={word} color={color} />
      </View>
    </View>
  );
}

const RARITY_COMMON = "#8FA3B5";
const L = SURFACES.light;
const D = SURFACES.dark;

const STYLE_PAIR = themedStyles(
  {
    card: { gap: 12, padding: 16, borderRadius: RADIUS.card, backgroundColor: L.surface },
    header: { gap: 2 },
    title: { fontFamily: GF.display, fontSize: 22, lineHeight: 26, color: L.text },
    muted: { fontFamily: GF.regular, fontSize: 13, lineHeight: 17, color: L.textMuted },
    line: { fontFamily: GF.body, fontSize: 13, lineHeight: 17, color: L.textMuted },
    lineDone: { color: TEXT_ON_LIGHT.success },
    tiles: { flexDirection: "row", gap: 8 },
    tile: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 16 },
    tileKm: { fontFamily: GF.display, fontSize: 17, lineHeight: 21, color: L.text },
    tileRewards: { fontFamily: GF.regular, fontSize: 12, lineHeight: 15, color: L.textMuted, textAlign: "center" },
    paid: { gap: 6, padding: 10, borderRadius: 14, backgroundColor: "rgba(245,158,42,0.18)" },
    paidRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    paidText: { flex: 1, fontFamily: GF.bold, fontSize: 14, lineHeight: 18, color: L.text },
    note: { fontFamily: GF.body, fontSize: 14, lineHeight: 18 },
  },
  {
    card: { backgroundColor: D.surface, borderWidth: 1, borderColor: D.hairline },
    title: { color: D.text },
    muted: { color: D.textMuted },
    line: { color: D.textMuted },
    lineDone: { color: TEXT_ON_DARK.success },
    tileKm: { color: D.text },
    tileRewards: { color: D.textMuted },
    paidText: { color: D.text },
  },
);
