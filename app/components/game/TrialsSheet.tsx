// Guardian Trials (costquest-ios Features/DuelFeature.swift TrialsSheet):
// five ladders of faction bosses, playable anywhere. Each rung pays the first
// time it is cleared; a cleared rung can be replayed.
import { Ionicons } from "@expo/vector-icons";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type TrialRequest, trialsOrder } from "@/features/game/duelFlow";
import { gameStore, useGame } from "@/features/game/runtime";
import type { TrialLadder } from "@/features/game/wire";

import { GameButton, MAX_FONT_SCALE } from "./kit";
import { ACCENT, ELEVATION, labelOn, RADIUS, SURFACES } from "./look";
import { SheetHost } from "./Sheet";
import { SheetFrame } from "./SheetFrame";
import { SheetHeader } from "./SheetHeader";
import { GF, GP, realmColor, realmIcon } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

/** A tile of the track the pips sit on. */
const TRACK = "rgba(28,43,58,0.12)";
const L = SURFACES.light;
const D = SURFACES.dark;

export default function TrialsSheet({ onClose, onFight }: { onClose: () => void; onFight: (t: TrialRequest) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <SheetHost band={{ top: insets.top + 40, height: 90 }} scrimLabel="Close Guardian Trials" onClose={onClose}>
      {(close) => <TrialsBody close={close} onFight={onFight} />}
    </SheetHost>
  );
}

function TrialsBody({ close, onFight }: { close: () => void; onFight: (t: TrialRequest) => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();
  const me = useGame((s) => s.me);
  const config = useGame((s) => s.config);
  const trials = me?.features?.duel?.trials ?? {};
  const order = trialsOrder(trials, (config?.factions ?? []).map((f) => f.id));
  // After the sheet has gone, so the fight is not drawn under it.
  const fight = (t: TrialRequest) => {
    close();
    setTimeout(() => onFight(t), 350);
  };
  return (
    <SheetFrame top={insets.top + 40}>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <SheetHeader title="Guardian Trials" onClose={close} />
        <Text style={styles.lead} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {"Climb each faction's ladder of Guardians, one fight a rung. A rung pays out the first time you clear it."}
        </Text>
        {order.length === 0 ? (
          <Text style={styles.closed} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {"No ladders open yet. The Warden will call you when the first Guardian takes its rung."}
          </Text>
        ) : null}
        {order.map((f) => (
          <Ladder key={f} faction={f} ladder={trials[f]} onFight={fight} />
        ))}
      </ScrollView>
    </SheetFrame>
  );
}

function Ladder({ faction, ladder: t, onFight }: { faction: string; ladder: TrialLadder; onFight: (t: TrialRequest) => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const tint = realmColor(faction);
  const name = gameStore.factionName(faction);
  const rungs = Math.max(1, t.rungs);
  return (
    <View style={styles.cardWrap}>
      <View style={styles.card}>
        <View style={styles.head} accessible accessibilityLabel={`${name}, ${t.cleared} of ${t.rungs} cleared`}>
          <View style={[styles.badge, { backgroundColor: tint }]}>
            <Ionicons name={realmIcon(faction)} size={16} color={labelOn(tint)} />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={styles.name} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {name}
            </Text>
            <Text style={styles.count} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {`${t.cleared} of ${t.rungs} cleared`.toUpperCase()}
            </Text>
          </View>
        </View>
        {/* One pip per rung: the ladder at a glance. */}
        <View style={styles.pips} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {Array.from({ length: rungs }, (_, i) => (
            <View key={i} style={[styles.pip, { backgroundColor: i + 1 <= t.cleared ? tint : TRACK }]} />
          ))}
        </View>
        <View style={styles.foot}>
          {t.next ? (
            <>
              <View style={{ flex: 1, gap: 1 }} accessible accessibilityLabel={`Next, rung ${t.next.rung}: ${t.next.name}, level ${t.next.level}`}>
                <Text style={styles.nextKicker} maxFontSizeMultiplier={MAX_FONT_SCALE}>{`NEXT · RUNG ${t.next.rung}`}</Text>
                <Text style={styles.nextName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {t.next.name}
                </Text>
                <Text style={styles.nextLevel}>Level {t.next.level}</Text>
              </View>
              {t.cleared > 0 ? (
                <GameButton title="Replay" size="small" color={GP.skyDeep} onPress={() => onFight({ faction, rung: t.cleared })} accessibilityLabel={`Replay rung ${t.cleared}`} />
              ) : null}
              <GameButton title="Fight" size="small" color={ACCENT.sun.fill} onPress={() => onFight({ faction, rung: null })} accessibilityLabel={`Fight ${t.next.name}`} />
            </>
          ) : (
            <>
              <Text style={[styles.nextName, { flex: 1 }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>Ladder cleared. Every Guardian beaten.</Text>
              <GameButton title="Replay" size="small" color={GP.skyDeep} onPress={() => onFight({ faction, rung: t.rungs })} accessibilityLabel={`Replay rung ${t.rungs}`} />
            </>
          )}
        </View>
      </View>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    body: { paddingHorizontal: 18, gap: 14 },
    lead: { fontFamily: GF.regular, fontSize: 15, lineHeight: 21, color: L.textMuted },
    closed: { paddingTop: 20, fontFamily: GF.body, fontSize: 15, lineHeight: 21, color: L.textMuted },
    cardWrap: {},
    card: { gap: 12, padding: 16, borderRadius: RADIUS.card, backgroundColor: L.surface, ...ELEVATION.low },
    head: { flexDirection: "row", alignItems: "center", gap: 12 },
    badge: { width: 36, height: 36, borderRadius: RADIUS.chip, alignItems: "center", justifyContent: "center" },
    name: { fontFamily: GF.bold, fontSize: 19, lineHeight: 24, color: L.text },
    count: { fontFamily: GF.body, fontSize: 12, lineHeight: 16, letterSpacing: 0.4, color: L.textMuted },
    pips: { flexDirection: "row", gap: 5 },
    pip: { flex: 1, height: 8, borderRadius: 4 },
    foot: { flexDirection: "row", alignItems: "center", gap: 10 },
    nextKicker: { fontFamily: GF.body, fontSize: 12, lineHeight: 16, letterSpacing: 0.4, color: L.textMuted },
    nextName: { fontFamily: GF.display, fontSize: 17, lineHeight: 21, color: L.text },
    nextLevel: { fontFamily: GF.regular, fontSize: 12, lineHeight: 16, color: L.textMuted },
  },
  {
    lead: { color: D.textMuted },
    closed: { color: D.textMuted },
    card: { backgroundColor: D.surface, borderWidth: 1, borderColor: D.hairline, shadowOpacity: 0, elevation: 0, boxShadow: "none" },
    name: { color: D.text },
    count: { color: D.textMuted },
    nextKicker: { color: D.textMuted },
    nextName: { color: D.text },
    nextLevel: { color: D.textMuted },
  },
);
