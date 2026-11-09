// The pause page over a fight in progress (costquest-ios Features/BattlePauseView.swift):
// the fight is frozen behind it. Resume, how the controls work, and leaving
// (which counts as a loss, said plainly and confirmed on the page itself, not
// in a system dialog).
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GameButton, announce, MAX_FONT_SCALE, pressFeedback } from "./kit";
import { GF, GP } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

export type PauseControl = { name: string; text: string };

type Page = "menu" | "controls" | "confirm";

export default function BattlePause({
  title,
  place,
  tint,
  controls,
  onResume,
  onLeave,
}: {
  /** What is being fought, e.g. "Final Guard of Big Ben". */
  title: string;
  /** Where, e.g. "Big Ben". */
  place?: string | null;
  tint: string;
  /** The how-to-play rows for the arena being fought. */
  controls: readonly PauseControl[];
  onResume: () => void;
  onLeave: () => void;
}) {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState<Page>("menu");

  useEffect(() => {
    announce("Paused");
  }, []);

  const go = (next: Page) => {
    setPage(next);
    announce(next === "confirm" ? "Leave this fight? It counts as a loss." : next === "controls" ? "How to play" : "Paused");
  };

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={styles.scrim}
      // Nothing behind the page hears a touch.
      onStartShouldSetResponder={() => true}
      accessibilityViewIsModal>
      <ScrollView
        style={StyleSheet.absoluteFill}
        contentContainerStyle={[styles.center, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={[styles.header, { backgroundColor: tint }]} accessible accessibilityRole="header" accessibilityLabel={`Paused. ${title}${place ? `, ${place}` : ""}`}>
            <Text style={styles.kicker} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              PAUSED
            </Text>
            <Text style={styles.title} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {title}
            </Text>
            {place ? (
              <Text style={styles.place} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {place.toUpperCase()}
              </Text>
            ) : null}
          </View>
          <Animated.View key={page} entering={FadeIn.duration(200)} style={styles.body}>
            {page === "confirm" ? (
              <>
                <Text style={styles.confirmTitle} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  Leave this fight?
                </Text>
                <Text style={styles.confirmText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  It counts as a loss, and the point stays out of reach for a while.
                </Text>
                <GameButton title="Keep fighting" color={GP.sun} onPress={onResume} />
                <LeaveLink title="Leave (counts as a loss)" onPress={onLeave} />
              </>
            ) : page === "controls" ? (
              <>
                {controls.map((c) => (
                  <View key={c.name} style={styles.row} accessible accessibilityLabel={`${c.name}. ${c.text}`}>
                    <Text style={[styles.rowName, { color: tint }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                      {c.name.toUpperCase()}
                    </Text>
                    <Text style={styles.rowText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                      {c.text}
                    </Text>
                  </View>
                ))}
                <GameButton title="Back" size="medium" color={GP.skyDeep} onPress={() => go("menu")} style={{ marginTop: 4 }} />
              </>
            ) : (
              <>
                <GameButton title="Resume" color={GP.sun} onPress={onResume} icon={<Ionicons name="play" size={20} color="#FFF" />} />
                <GameButton title="How to play" size="medium" color={GP.skyDeep} onPress={() => go("controls")} icon={<Ionicons name="hand-left" size={18} color="#FFF" />} />
                <LeaveLink title="Leave the fight" onPress={() => go("confirm")} />
              </>
            )}
          </Animated.View>
        </View>
      </ScrollView>
    </Animated.View>
  );
}

function LeaveLink({ title, onPress }: { title: string; onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <Pressable onPressIn={pressFeedback} onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={styles.leave}>
      <Text style={styles.leaveText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {title}
      </Text>
    </Pressable>
  );
}

const STYLE_PAIR = themedStyles({
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(18,38,51,0.9)", zIndex: 20, elevation: 20 },
  center: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 22 },
  card: { width: "100%", maxWidth: 460, borderRadius: 22, overflow: "hidden", borderWidth: 3, borderColor: GP.navy, backgroundColor: GP.cream },
  header: { padding: 18, gap: 4, borderBottomWidth: 4, borderBottomColor: GP.navy },
  kicker: { fontFamily: GF.display, fontSize: 13, letterSpacing: 1.8, color: "rgba(255,255,255,0.85)" },
  title: { fontFamily: GF.display, fontSize: 26, color: "#FFF" },
  place: { fontFamily: GF.bold, fontSize: 12, letterSpacing: 0.8, color: "rgba(255,255,255,0.8)" },
  body: { padding: 18, gap: 12, backgroundColor: GP.cream },
  leave: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  leaveText: { fontFamily: GF.bold, fontSize: 16, color: GP.berry },
  confirmTitle: { fontFamily: GF.display, fontSize: 22, color: GP.ink, textAlign: "center" },
  confirmText: { fontFamily: GF.body, fontSize: 15, color: "rgba(30,58,76,0.7)", textAlign: "center" },
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  rowName: { width: 62, fontFamily: GF.display, fontSize: 12, letterSpacing: 1 },
  rowText: { flex: 1, fontFamily: GF.body, fontSize: 14, color: "rgba(30,58,76,0.8)" },
});
