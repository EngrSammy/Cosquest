// Squad up in person (features/game/squad.ts): your friend's hero joins your
// next 3D fight as the ally, and fighting together pays a small bonus.
// iPhones hold the phones together (the friend add's card and radios,
// pointed at /v1/roam/squad/nearby); anything else shows or scans a squad
// code (its QR is a cosquest://squad/<code> link, so the other phone's
// camera opens it straight into this sheet). The server decides every
// pairing; this sheet shows what it says.
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { canSubmitCode, cleanCode, codeSecondsLeft, countdownText, spelledCode } from "@/features/game/friends";
import { useGame } from "@/features/game/runtime";
import { bonusLine, type Squad, squadLine } from "@/features/game/squad";
import { squadByUWB, squadModel, squadNearby, useSquad, useSquadNearby } from "@/features/game/squadRuntime";

import { HoldPhonesCard } from "./HoldPhonesCard";
import { Chip, GameButton, GamePanel, MAX_FONT_SCALE } from "./kit";
import { notify } from "./prefs";
import { QrCode } from "./QrCode";
import { SheetHost } from "./Sheet";
import { SheetFrame } from "./SheetFrame";
import { SheetHeader } from "./SheetHeader";
import { playSound } from "./sound";
import { labelOn, SURFACES } from "./look";
import { GF, GP, realmColor } from "./theme";
import { useOnScreen } from "./useOnScreen";
import { themedStyles, useThemedStyles } from "@/constants/chatTheme";
import { POP_FADE, POP_IN } from "./sheetMotion";

export default function SquadSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <SheetHost band={{ top: insets.top + 40, height: 90 }} scrimLabel="Close Squad up" onClose={onClose}>
      {(close) => <SquadBody close={close} />}
    </SheetHost>
  );
}

function SquadBody({ close }: { close: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const insets = useSafeAreaInsets();
  const squad = useSquad();
  const nearby = useSquadNearby();
  const fix = useGame((s) => s.fix);
  const [typed, setTyped] = useState("");

  // The server's view first (a pairing made while this sheet was shut); stop asking when it closes.
  useEffect(() => {
    void squadModel.refresh();
    return () => squadModel.stopListening();
  }, []);

  // A squad link opened the app: join it as soon as there is a fix.
  useEffect(() => {
    if (squad.pendingCode && fix && !squad.busy) void squadModel.join(squad.pendingCode);
  }, [squad.pendingCode, fix, squad.busy]);

  // A new pairing: the fanfare and the success haptic, once.
  const seen = useRef(squad.celebrations);
  useEffect(() => {
    if (squad.celebrations > seen.current) {
      notify(Haptics.NotificationFeedbackType.Success);
      playSound("fanfare");
    }
    seen.current = squad.celebrations;
  }, [squad.celebrations]);

  const live = squad.squad;

  return (
    <SheetFrame top={insets.top + 40}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}>
        <SheetHeader title="Squad up" onClose={close} closeLabel="Close Squad up" />
        <Text style={styles.lead} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          Together in person? Squad up and your friend&apos;s hero fights beside you in your next battle.
        </Text>

        {live ? (
          <SquadReady s={live} />
        ) : (
          <>
            {squadNearby ? (
              <HoldPhonesCard
                use={{
                  model: squadNearby,
                  state: nearby,
                  title: "Hold phones together",
                  sub: squadByUWB ? "Open Squad up on both iPhones and touch them together." : "This iPhone can't measure distance. Use a squad code below.",
                  action: (h) => `Squad up with ${h}`,
                  icon: "people",
                }}
              />
            ) : null}

            <GamePanel>
              <View style={styles.stack}>
                <Text style={styles.big} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  {squadNearby ? "Or use a squad code" : "Squad code"}
                </Text>
                {!squadNearby ? (
                  <Text style={styles.sub} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    Stand together. One of you shows a code, the other scans it with the camera or types it.
                  </Text>
                ) : null}
                {!fix ? (
                  <View style={styles.row}>
                    <ActivityIndicator color={GP.mist} />
                    <Text style={styles.line} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                      Waiting for your location
                    </Text>
                  </View>
                ) : (
                  <>
                    <MySquadCode />
                    <View style={styles.divider} />
                    <Text style={styles.label} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                      {"Got your friend's squad code?"}
                    </Text>
                    <View style={styles.row}>
                      <TextInput
                        value={typed}
                        onChangeText={(v) => setTyped(cleanCode(v))}
                        placeholder="ABC123"
                        placeholderTextColor="rgba(30,58,76,0.3)"
                        autoCapitalize="characters"
                        autoCorrect={false}
                        autoComplete="off"
                        spellCheck={false}
                        keyboardType={Platform.OS === "android" ? "visible-password" : "default"}
                        returnKeyType="done"
                        onSubmitEditing={() => {
                          if (canSubmitCode(typed) && !squad.busy) void squadModel.join(typed);
                        }}
                        style={styles.input}
                        maxFontSizeMultiplier={MAX_FONT_SCALE}
                        accessibilityLabel="Friend's squad code"
                      />
                      <GameButton
                        title="Join"
                        size="medium"
                        color={GP.mint}
                        onPress={() => void squadModel.join(typed)}
                        disabled={!canSubmitCode(typed) || squad.busy}
                        accessibilityLabel="Squad up with this code"
                      />
                    </View>
                  </>
                )}
              </View>
            </GamePanel>
          </>
        )}

        {squad.busy && squad.pendingCode === null && !live ? <ActivityIndicator color={GP.mist} accessibilityLabel="Squadding up" /> : null}
        {squad.error ? (
          <GamePanel padding={14}>
            <Text style={styles.line} accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {squad.error}
            </Text>
          </GamePanel>
        ) : null}
      </ScrollView>
    </SheetFrame>
  );
}

/** The live pairing: who joins, what it pays, how long it lasts, and the way out. */
function SquadReady({ s }: { s: Squad }) {
  const styles = useThemedStyles(STYLE_PAIR);
  const reduce = useReducedMotion();
  const left = useSecondsLeft(s.expiresAt);
  return (
    <Animated.View entering={reduce ? POP_FADE : POP_IN}>
      <GamePanel>
        <View style={styles.stack} accessible accessibilityLabel={`${squadLine(s)}. ${bonusLine(s)}. Ready for ${countdownText(left)}.`}>
          <View style={styles.readyHead}>
            <View style={[styles.badge, { backgroundColor: realmColor(s.ally.faction) }]}>
              <Ionicons name="people" size={26} color={labelOn(realmColor(s.ally.faction))} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.kicker} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {s.via === "uwb" ? "SQUADDED UP IN PERSON" : "SQUADDED UP"}
              </Text>
              <Text style={styles.big} numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {squadLine(s)}
              </Text>
            </View>
          </View>
          <Text style={styles.line} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {bonusLine(s)}
          </Text>
          <View style={styles.row}>
            <Chip text={`Ready ${countdownText(left)}`} color={left < 300 ? GP.berry : GP.skyDeep} />
          </View>
        </View>
      </GamePanel>
      <View style={styles.leave}>
        <GameButton title="Fight alone" size="small" color={GP.skyDeep} onPress={() => void squadModel.leave()} accessibilityLabel="Cancel the squad and fight alone" />
      </View>
    </Animated.View>
  );
}

/** This phone's squad code and its QR, or the button that makes one. */
function MySquadCode() {
  const styles = useThemedStyles(STYLE_PAIR);
  const squad = useSquad();
  const code = squad.code;
  const left = useSecondsLeft(code?.expiresAt ?? null);
  if (!code || left <= 0) {
    return (
      <GameButton
        title={code ? "Code expired. New code" : "Show my squad code"}
        size="medium"
        color={GP.skyDeep}
        onPress={() => void squadModel.makeCode()}
        disabled={squad.busy}
      />
    );
  }
  return (
    <View style={styles.codeBox}>
      <Pressable
        onPress={() => void squadModel.makeCode()}
        disabled={squad.busy}
        accessibilityRole="button"
        accessibilityLabel={`Your squad code ${spelledCode(code.code)}. Tap for a new one.`}>
        <Text style={styles.code} selectable maxFontSizeMultiplier={1.2}>
          {code.code}
        </Text>
      </Pressable>
      <QrCode text={code.link} />
      <View style={styles.centre}>
        <Chip text={`Valid ${countdownText(left)}`} color={left < 30 ? GP.berry : GP.skyDeep} />
      </View>
      <View style={styles.row}>
        <ActivityIndicator color={GP.mist} />
        <Text style={styles.sub} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          Waiting for your friend to scan it
        </Text>
      </View>
    </View>
  );
}

function useSecondsLeft(expiresAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  const onScreen = useOnScreen();
  const left = codeSecondsLeft(expiresAt, now);
  const ticking = expiresAt !== null && left > 0 && onScreen;
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking]);
  return left;
}

const L = SURFACES.light;
const D = SURFACES.dark;

const STYLE_PAIR = themedStyles(
  {
    body: { paddingHorizontal: 18, gap: 16 },
    lead: { fontFamily: GF.body, fontSize: 15, color: L.textMuted },
    stack: { gap: 14 },
    big: { fontFamily: GF.display, fontSize: 22, color: L.text },
    kicker: { fontFamily: GF.bold, fontSize: 12, letterSpacing: 1.2, color: L.textMuted },
    sub: { fontFamily: GF.regular, fontSize: 14, color: L.textMuted, flexShrink: 1 },
    line: { fontFamily: GF.body, fontSize: 15, color: L.text, flexShrink: 1 },
    label: { fontFamily: GF.bold, fontSize: 15, color: L.text },
    row: { flexDirection: "row", alignItems: "center", gap: 10 },
    readyHead: { flexDirection: "row", alignItems: "center", gap: 12 },
    badge: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
    leave: { alignItems: "center", marginTop: 12 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: L.hairline },
    input: {
      flex: 1,
      height: 52,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: L.hairline,
      backgroundColor: L.surface,
      fontFamily: GF.display,
      fontSize: 24,
      letterSpacing: 4,
      color: L.text,
    },
    codeBox: { alignItems: "center", gap: 10 },
    centre: { alignSelf: "center" },
    code: { fontFamily: GF.display, fontSize: 46, lineHeight: 52, letterSpacing: 6, color: L.text },
  },
  {
    lead: { color: D.textMuted },
    big: { color: D.text },
    kicker: { color: D.textMuted },
    sub: { color: D.textMuted },
    line: { color: D.text },
    label: { color: D.text },
    divider: { backgroundColor: D.hairline },
    input: { borderColor: D.hairline, backgroundColor: D.surface, color: D.text },
    code: { color: D.text },
  },
);
