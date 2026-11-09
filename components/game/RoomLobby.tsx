// A Room's door: what it is, how long it has, who is in, your side (preset
// to your Roam faction) and your name (your Roam handle), then Enter.
// costquest-ios UI/EntryView.swift as a Room uses it (presetSide,
// presetHandle): a Room is free, so there are no prize terms to read.
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { isTerminal, presetSide, timeLeft } from "@/features/game/rooms";
import type { RoomSession, RoomSessionState } from "@/features/game/roomsSession";
import { gameStore, useGame } from "@/features/game/runtime";

import { Chip, GameButton, MAX_FONT_SCALE } from "./kit";
import { GameBackdrop } from "./GameBackdrop";
import { ACCENT, ELEVATION, RADIUS, SURFACES, TEXT_ON_DARK, TEXT_ON_LIGHT, useLook } from "./look";
import { GF, GP } from "./theme";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";

export default function RoomLobby({ session, state, onClose }: { session: RoomSession; state: RoomSessionState; onClose: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const look = useLook();
  const insets = useSafeAreaInsets();
  const me = useGame((s) => s.me);
  const { terms, problem, joining } = state;
  const [side, setSide] = useState<string | null>(null);
  const [handle, setHandle] = useState(() => gameStore.playerName());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // The side is the player's Roam faction, matched by id or display name.
  const sides = terms?.factions ?? [];
  const preset = presetSide(sides, [me?.faction, me?.faction_name]);
  const chosen = side ?? preset;
  const ended = terms ? isTerminal(terms.status) : false;
  const coins = terms?.entry_coins ?? 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <GameBackdrop tint={ACCENT.berry.fill} />
      <View style={styles.top}>
        <Pressable onPress={onClose} style={styles.back} accessibilityRole="button" accessibilityLabel="Back to the map" hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={look.text} />
        </Pressable>
        <Text style={styles.kicker}>ROOM</Text>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        {!terms ? (
          problem ? (
            <View style={styles.panel}>
              <Text style={styles.problemText}>{problem}</Text>
              <GameButton title="Try again" small color={GP.skyDeep} onPress={() => session.load()} />
            </View>
          ) : (
            <ActivityIndicator color={look.textMuted} style={{ marginTop: 60 }} />
          )
        ) : (
          <>
            <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {terms.title}
            </Text>
            <View style={styles.chips}>
              <Chip text={ended ? "Ended" : timeLeft(terms.ends_at, now)} color={ended ? GP.mist : GP.berry} />
              <Chip text={`${terms.players_joined ?? 0} in`} color={GP.skyDeep} />
              <Chip text={coins ? `${coins} CosCoins to enter` : "Free"} color={coins ? GP.sunDeep : GP.mint} />
            </View>

            {ended ? (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>This Room has ended.</Text>
                <GameButton title="Back to the map" color={GP.skyDeep} onPress={onClose} />
              </View>
            ) : (
              <>
                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>How it plays</Text>
                  <Line icon="hammer" text="Walk to a weapon and pick it up. One at a time." />
                  <Line icon="locate" text="Point your phone at a rival and fire. Each hit takes tokens from them to you." />
                  <Line icon="flag" text="Take the shrines for your side. Open the chests for a question." />
                  <Line icon="time" text="Down at zero tokens: respawn after a short wait. Most tokens for your side when time runs out wins." />
                  <Text style={styles.small}>
                    Here the arena is a map and distances come from GPS (good to about 5 m). The server rules on every hit, pickup and capture.
                  </Text>
                </View>

                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>Your side</Text>
                  <View style={styles.sides}>
                    {sides.map((f) => {
                      const on = chosen === f.name;
                      return (
                        <Pressable
                          key={f.name}
                          onPress={() => setSide(f.name)}
                          style={[styles.side, { borderColor: on ? f.color ?? look.text : "transparent", backgroundColor: on ? look.surface : look.surfaceAlt }]}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={`${f.name}, ${f.players ?? 0} players`}>
                          <View style={[styles.swatch, { backgroundColor: f.color ?? GP.skyDeep }]} />
                          <Text style={styles.sideName}>{f.name}</Text>
                          <Text style={styles.small}>{f.players ?? 0}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={styles.label}>Your name</Text>
                  <TextInput
                    value={handle}
                    onChangeText={setHandle}
                    maxLength={40}
                    autoCorrect={false}
                    style={styles.input}
                    accessibilityLabel="Your name in this Room"
                    placeholder="Your name"
                    placeholderTextColor={look.textMuted}
                  />
                </View>

                {problem ? (
                  <View style={styles.problem} accessibilityLiveRegion="polite">
                    <Ionicons name="warning" size={16} color={look.dark ? TEXT_ON_DARK.danger : TEXT_ON_LIGHT.danger} />
                    <Text style={styles.problemBanner}>{problem}</Text>
                  </View>
                ) : null}

                <GameButton
                  title={joining ? "Joining…" : "Enter the battle"}
                  color={GP.mint}
                  disabled={joining || handle.trim().length < 2}
                  onPress={() => session.join(handle, chosen)}
                  icon={joining ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="flash" size={18} color="#FFFFFF" />}
                />
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Line({ icon, text }: { icon: "hammer" | "locate" | "flag" | "time"; text: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <View style={styles.line}>
      <Ionicons name={icon} size={18} color={ACCENT.berry.fill} />
      <Text style={styles.lineText}>{text}</Text>
    </View>
  );
}

const L = SURFACES.light;
const D = SURFACES.dark;

// The lobby on the game's paper with a Berry glow (it was a solid berry page).
const STYLE_PAIR = themedStyles(
  {
    root: { ...StyleSheet.absoluteFill, backgroundColor: L.screen },
    top: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingBottom: 8 },
    back: { width: 40, height: 40, borderRadius: 20, backgroundColor: L.surfaceAlt, alignItems: "center", justifyContent: "center" },
    kicker: { fontFamily: GF.bold, fontSize: 13, lineHeight: 17, letterSpacing: 1, color: L.textMuted },
    title: { fontFamily: GF.display, fontSize: 28, lineHeight: 32, color: L.text },
    body: { padding: 16, gap: 14 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    panel: { padding: 16, gap: 10, borderRadius: RADIUS.card, backgroundColor: L.surface, ...ELEVATION.low },
    panelTitle: { fontFamily: GF.bold, fontSize: 20, lineHeight: 24, color: L.text },
    line: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
    lineText: { flex: 1, fontFamily: GF.regular, fontSize: 15, lineHeight: 21, color: L.text },
    small: { fontFamily: GF.regular, fontSize: 12, lineHeight: 16, color: L.textMuted },
    sides: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    side: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, height: 40, borderRadius: 20, borderWidth: 2 },
    swatch: { width: 16, height: 16, borderRadius: 8 },
    sideName: { fontFamily: GF.bold, fontSize: 14, lineHeight: 18, color: L.text },
    label: { fontFamily: GF.bold, fontSize: 14, lineHeight: 18, color: L.text, marginTop: 4 },
    input: { height: 48, paddingHorizontal: 14, paddingVertical: 0, textAlignVertical: "center", borderRadius: RADIUS.button, borderWidth: 1, borderColor: L.hairline, backgroundColor: L.surface, fontFamily: GF.bold, fontSize: 17, color: L.text },
    problemText: { fontFamily: GF.regular, fontSize: 15, lineHeight: 21, color: L.text },
    problem: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADIUS.button, backgroundColor: L.surface, borderWidth: 1, borderColor: L.hairline },
    problemBanner: { fontFamily: GF.body, fontSize: 14, lineHeight: 19, color: TEXT_ON_LIGHT.danger, flexShrink: 1 },
  },
  {
    root: { backgroundColor: D.screen },
    back: { backgroundColor: D.surfaceAlt },
    kicker: { color: D.textMuted },
    title: { color: D.text },
    panel: { backgroundColor: D.surface, borderWidth: 1, borderColor: D.hairline, shadowOpacity: 0, elevation: 0, boxShadow: "none" },
    panelTitle: { color: D.text },
    lineText: { color: D.text },
    small: { color: D.textMuted },
    sideName: { color: D.text },
    label: { color: D.text },
    input: { borderColor: D.hairline, backgroundColor: D.surface, color: D.text },
    problemText: { color: D.text },
    problem: { backgroundColor: D.surface, borderColor: D.hairline },
    problemBanner: { color: TEXT_ON_DARK.danger },
  },
);
