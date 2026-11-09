// Your Guardian's stance (costquest-ios Features/DuelFeature.swift
// GuardianStancePicker): how your hero fights when a rival sieges a point you
// took. On the Profile's Hero tab, when the server runs the duel.
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { stanceLead, STANCES } from "@/features/game/duelFlow";
import { gameStore } from "@/features/game/runtime";
import type { DuelMe } from "@/features/game/wire";

import { MAX_FONT_SCALE, withAlpha } from "./kit";
import { impact } from "./prefs";
import { GF, GP } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

export default function StancePicker({ duel }: { duel: DuelMe }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const current = picked ?? duel.stance ?? null;

  const choose = async (id: string) => {
    if (id === current || saving) return;
    const before = picked;
    setPicked(id);
    setSaving(true);
    setProblem(null);
    try {
      setPicked(await gameStore.client.setStance(id));
      impact(Haptics.ImpactFeedbackStyle.Light);
      void gameStore.refreshMe();
    } catch (e) {
      setPicked(before);
      setProblem(e instanceof Error ? e.message : "That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.kicker} accessibilityRole="header">
        GUARDIAN STANCE
      </Text>
      <Text style={styles.lead} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {stanceLead(duel.stance_is_default, picked !== null)}
      </Text>
      <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
        {STANCES.map((s) => {
          const on = current === s.id;
          return (
            <Pressable
              key={s.id}
              onPress={() => void choose(s.id)}
              disabled={saving}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: saving }}
              accessibilityLabel={`${s.name}. ${s.line}`}
              style={[styles.row, { backgroundColor: on ? withAlpha(GP.sun, 0.14) : withAlpha(GP.ice, 0.35) }]}>
              <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={18} color={on ? GP.sunDeep : GP.mist} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={styles.name} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  {s.name}
                </Text>
                <Text style={styles.line} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  {s.line}
                </Text>
              </View>
              {saving && picked === s.id ? <ActivityIndicator color={GP.mist} /> : null}
            </Pressable>
          );
        })}
      </View>
      {problem ? <Text style={styles.problem}>{problem}</Text> : null}
    </View>
  );
}

const STYLE_PAIR = themedStyles({
  kicker: { fontFamily: GF.display, fontSize: 13, letterSpacing: 0.8, color: GP.mist },
  lead: { fontFamily: GF.bold, fontSize: 13, color: withAlpha(GP.ink, 0.6) },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12 },
  name: { fontFamily: GF.display, fontSize: 16, color: GP.ink },
  line: { fontFamily: GF.bold, fontSize: 12, color: withAlpha(GP.ink, 0.6) },
  problem: { fontFamily: GF.bold, fontSize: 13, color: GP.berry },
});
