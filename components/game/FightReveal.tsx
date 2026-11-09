// The Guardian reveal before a fight (phone-hardware design 2.5, Phase 2 step
// 2; the rules in features/game/reveal.ts). DuelScreen lays it over the 3D
// fight while the fight gets ready underneath (Fight3D's hold): the camera
// opens, the point's Guardian rises out of the ground a few metres ahead,
// sways, and wears a nameplate. Fight (or a tap on the Guardian) dives in;
// Photo takes a snapshot with no location in it; Skip goes straight to the
// fight; "AR off" goes too and stops showing it before fights (also in
// Profile). Untouched, it carries on ~8 s after the Guardian stands.
//
// The handover: the camera pauses (the last frame stays) under a white bloom,
// Fight3D starts the prepared fight, and the reveal fades away when Godot
// says the fight is on screen (or failed, or after REVEAL_HANDOFF_MS, when
// the fight's own card shows).
//
// No camera permission, no AR, a failed session, no model to show, or nothing
// standing within REVEAL_FIND_MS: straight to the fight, nothing in the way.
// The camera, the model and the photo are the "See it here" native view
// (SummonIsland.swift) in its reveal mode. sheetMotion curves, a light haptic
// (the player's setting) when the Guardian appears, no sounds.
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { resolveIslandsOff } from "@/features/game/config";
import { ensureFile, refreshCatalogue, usdzFor, useForgeWorld } from "@/features/game/forgeWorldDevice";
import {
  REVEAL_AUTO_MS,
  REVEAL_FIND_MS,
  REVEAL_HANDOFF_MS,
  REVEAL_MAX_MS,
  revealGuardian,
  revealHint,
  revealPlate,
  revealRole,
  revealShareText,
  type RevealEvent,
  type RevealState,
} from "@/features/game/reveal";
import { summonHeight } from "@/features/game/summon";
import type { DuelStart, QuestPoint } from "@/features/game/wire";
import { fightFromStart } from "@/features/game3d/fight3d";
import { CostQuestSummonView, type CostQuestSummonViewHandle } from "@/modules/costquest-game/src";

import { GameButton, MAX_FONT_SCALE } from "./kit";
import { impact, setFightReveal } from "./prefs";
import { POP_IN, SHEET_CLOSE_MS, SHEET_EASE_OUT, SHEET_OPEN_MS, useCardMotion, useSheetMotion } from "./sheetMotion";
import { GF, GP, realmColor } from "./theme";

/** EXPO_PUBLIC_GAME_2D=arReveal turns the reveal off in a build (a phone where it misbehaves). */
export const REVEAL_ISLAND_OFF = resolveIslandsOff(process.env.EXPO_PUBLIC_GAME_2D).has("arReveal");

export default function FightReveal({
  point,
  mode,
  start,
  state,
  send,
}: {
  point: QuestPoint;
  /** The duel's mode (point, trial, siege, raid, run): a raid stands its boss. */
  mode: string;
  /** The server's start, once it has answered (its Guardian and card); null while it is being asked. */
  start: DuelStart | null;
  state: RevealState;
  send: (e: RevealEvent) => void;
}) {
  const insets = useSafeAreaInsets();
  const chrome = useSheetMotion();
  const card = useCardMotion();
  const view = useRef<CostQuestSummonViewHandle | null>(null);
  const entries = useForgeWorld((s) => s.entries);
  const [catalogueChecked, setCatalogueChecked] = useState(entries.length > 0);
  const [uri, setUri] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const tint = realmColor(point.realm);
  const plate = revealPlate(start, point);
  const enemyId = useMemo(() => (start ? (fightFromStart(start)?.enemyId ?? null) : null), [start]);
  const guardian = useMemo(
    () => (start ? revealGuardian(entries, { enemyId, role: revealRole(mode, point.source), key: point.id }) : null),
    [start, entries, enemyId, mode, point.source, point.id],
  );
  const sendRef = useRef(send);
  sendRef.current = send;

  // The catalogue (usually loaded already: the map, the bag and the fight use it).
  useEffect(() => {
    let alive = true;
    void refreshCatalogue()
      .catch(() => {})
      .finally(() => {
        if (alive) setCatalogueChecked(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // The Guardian's USDZ on this phone. None to show: straight to the fight.
  useEffect(() => {
    if (!start || !catalogueChecked) return;
    if (!guardian) {
      sendRef.current("failed");
      return;
    }
    const file = usdzFor(guardian);
    if (!file) {
      sendRef.current("failed");
      return;
    }
    let alive = true;
    void ensureFile(guardian, file).then((u) => {
      if (!alive) return;
      if (u) setUri(u);
      else sendRef.current("failed");
    });
    return () => {
      alive = false;
    };
  }, [start, catalogueChecked, guardian?.id, guardian?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nothing standing in time (a slow download, a camera that won't start): the fight.
  useEffect(() => {
    if (state !== "coming") return;
    const t = setTimeout(() => sendRef.current("failed"), REVEAL_FIND_MS);
    return () => clearTimeout(t);
  }, [state]);

  // Untouched, it carries on into the fight a few seconds after the Guardian stands.
  useEffect(() => {
    if (state !== "standing" || touched) return;
    const t = setTimeout(() => sendRef.current("go"), REVEAL_AUTO_MS);
    return () => clearTimeout(t);
  }, [state, touched]);

  // Touched or not, never long (the share sheet holds it while it is open).
  useEffect(() => {
    if (sharing || (state !== "coming" && state !== "standing")) return;
    const t = setTimeout(() => sendRef.current("go"), REVEAL_MAX_MS);
    return () => clearTimeout(t);
  }, [sharing, state]);

  // The handover: the camera stops, the fight starts underneath; gone once it shows (or after a while).
  useEffect(() => {
    if (state !== "leaving") return;
    view.current?.hold().catch(() => {});
    const t = setTimeout(() => sendRef.current("fightShown"), REVEAL_HANDOFF_MS);
    return () => clearTimeout(t);
  }, [state]);

  // The auto-continue line under Fight: it runs down while the Guardian stands untouched.
  const left = useSharedValue(1);
  useEffect(() => {
    if (state === "standing" && !touched) {
      left.value = 1;
      left.value = withTiming(0, { duration: REVEAL_AUTO_MS, easing: Easing.linear });
    } else {
      left.value = withTiming(0, { duration: 0 });
    }
  }, [state, touched, left]);
  const runDown = useAnimatedStyle(() => ({ transform: [{ scaleX: left.value }] }));

  const go = () => sendRef.current("go");
  const turnOff = () => {
    setFightReveal(false);
    go();
  };
  const photo = async () => {
    if (state !== "standing" || busy) return;
    setTouched(true);
    setBusy(true);
    try {
      const u = await view.current?.photo().catch(() => null);
      if (u) setPhotoUri(u);
    } finally {
      setBusy(false);
    }
  };
  const share = (u: string) => {
    setTouched(true);
    setSharing(true);
    Share.share({ url: u }, { subject: revealShareText(plate.name) })
      .catch(() => {})
      .finally(() => setSharing(false));
  };

  const leaving = state === "leaving";
  const standing = state === "standing";
  const SummonView = CostQuestSummonView;

  return (
    <Animated.View
      style={styles.root}
      exiting={FadeOut.duration(SHEET_CLOSE_MS).easing(SHEET_EASE_OUT)}
      accessibilityViewIsModal
      testID="fight-reveal">
      {SummonView && uri ? (
        <SummonView
          ref={view}
          style={StyleSheet.absoluteFill}
          uri={uri}
          kind="character"
          name={plate.name}
          heightM={guardian ? summonHeight(guardian) : 0}
          tint={tint}
          reveal
          accessibilityLabel={`Camera view. ${plate.name} rises out of the ground ahead of you.${plate.holds ? ` ${plate.holds}.` : ""}`}
          onSummonTap={() => {
            if (state === "standing") go();
          }}
          onSummonState={(e) => {
            const ph = e.nativeEvent.phase;
            if (ph === "placed") {
              impact(Haptics.ImpactFeedbackStyle.Light);
              sendRef.current("placed");
            } else if (ph === "denied" || ph === "failed") {
              sendRef.current("failed");
            }
          }}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.waiting]} />
      )}

      {leaving ? (
        <Animated.View
          entering={FadeIn.duration(SHEET_OPEN_MS).easing(SHEET_EASE_OUT)}
          style={[StyleSheet.absoluteFill, styles.bloom]}
          pointerEvents="none"
          accessible
          accessibilityLabel="Into the fight">
          <Text style={styles.bloomText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {plate.name}
          </Text>
          <Text style={styles.bloomSub} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {revealHint("leaving", true)}
          </Text>
        </Animated.View>
      ) : null}

      {!leaving ? (
        <>
          <Animated.View entering={chrome.entering} style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
            <Pressable onPress={go} hitSlop={12} style={styles.pill} accessibilityRole="button" accessibilityLabel="Skip to the fight" testID="fight-reveal-skip">
              <Text style={styles.pillText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                Skip
              </Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={turnOff}
              hitSlop={12}
              style={styles.pill}
              accessibilityRole="button"
              accessibilityLabel="Turn AR reveals off"
              accessibilityHint="Goes to the fight, and future fights open without the camera. Turn it back on in Profile."
              testID="fight-reveal-off">
              <Ionicons name="eye-off-outline" size={15} color="#FFF" />
              <Text style={styles.pillText} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                AR off
              </Text>
            </Pressable>
          </Animated.View>

          <View style={[styles.plateWrap, { top: insets.top + 64 }]} pointerEvents="none">
            <Animated.View key={standing ? "standing" : "coming"} entering={standing ? POP_IN : chrome.entering} style={[styles.plate, { borderColor: tint }]}>
              <Text style={[styles.kicker, { color: tint }]} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {plate.kicker}
              </Text>
              <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityRole="header">
                {plate.name}
              </Text>
              {plate.holds ? (
                <Text style={[styles.holds, { color: tint }]} numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE} testID="fight-reveal-holds">
                  {plate.holds}
                </Text>
              ) : null}
              <Text style={styles.place} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {point.name}
              </Text>
            </Animated.View>
          </View>

          <Animated.View entering={chrome.entering} style={[styles.bottom, { paddingBottom: insets.bottom + 18 }]} pointerEvents="box-none">
            {photoUri ? (
              <Animated.View entering={POP_IN} exiting={card.exiting} style={styles.card}>
                <Image source={{ uri: photoUri }} style={styles.cardThumb} contentFit="cover" accessibilityLabel={`Photo of ${plate.name}`} />
                <Text style={styles.cardText} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                  Photo taken
                </Text>
                <GameButton title="Share" small color={GP.mint} onPress={() => share(photoUri)} accessibilityLabel="Share the photo" />
                <Pressable onPress={() => setPhotoUri(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss">
                  <Ionicons name="close" size={18} color="rgba(255,255,255,0.8)" />
                </Pressable>
              </Animated.View>
            ) : null}

            <Text style={styles.hint} accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {revealHint(state, start !== null && uri !== null)}
            </Text>

            <View style={styles.actions}>
              <Pressable
                onPress={() => void photo()}
                disabled={!standing || busy}
                style={[styles.round, (!standing || busy) && styles.dim]}
                accessibilityRole="button"
                accessibilityLabel="Take a photo"
                accessibilityHint="Saved with no location in it"
                accessibilityState={{ disabled: !standing || busy, busy }}
                testID="fight-reveal-photo">
                <Ionicons name="camera" size={22} color="#FFF" />
              </Pressable>
              <View style={styles.fightBox}>
                <GameButton
                  title="Fight"
                  color={GP.berry}
                  onPress={go}
                  icon={<Ionicons name="flash" size={20} color="#FFF" />}
                  accessibilityLabel={`Fight ${plate.name}`}
                  accessibilityHint={standing && !touched ? "Starts by itself in a few seconds" : undefined}
                  testID="fight-reveal-fight"
                  style={{ alignSelf: "stretch" }}
                />
                <View style={styles.runTrack} pointerEvents="none">
                  <Animated.View style={[styles.runFill, runDown]} />
                </View>
              </View>
            </View>
          </Animated.View>
        </>
      ) : null}
    </Animated.View>
  );
}

const ROUND = 56;
const GLASS = "rgba(20,28,44,0.55)";

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: "#000", zIndex: 20 },
  waiting: { backgroundColor: GP.navy },
  bloom: { backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
  bloomText: { fontFamily: GF.display, fontSize: 30, color: GP.navy, textAlign: "center" },
  bloomSub: { fontFamily: GF.body, fontSize: 15, color: GP.navy, opacity: 0.7, textAlign: "center" },
  top: { position: "absolute", left: 16, right: 16, top: 0, flexDirection: "row", alignItems: "center" },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 36, borderRadius: 18, backgroundColor: GLASS },
  pillText: { fontFamily: GF.bold, fontSize: 14, color: "#FFF" },
  plateWrap: { position: "absolute", left: 16, right: 16, alignItems: "center" },
  plate: { alignItems: "center", gap: 2, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 18, borderWidth: 2, backgroundColor: GLASS, maxWidth: 360 },
  kicker: { fontFamily: GF.bold, fontSize: 11, letterSpacing: 1.4 },
  name: { fontFamily: GF.display, fontSize: 26, color: "#FFF" },
  holds: { fontFamily: GF.bold, fontSize: 13, textAlign: "center" },
  place: { fontFamily: GF.body, fontSize: 12, color: "rgba(255,255,255,0.75)" },
  bottom: { position: "absolute", left: 16, right: 16, bottom: 0, alignItems: "center", gap: 14 },
  hint: { fontFamily: GF.body, fontSize: 14, color: "#FFF", textAlign: "center", textShadowColor: "rgba(0,0,0,0.75)", textShadowRadius: 5, maxWidth: 420 },
  actions: { flexDirection: "row", alignItems: "center", gap: 14, width: "100%", maxWidth: 380 },
  round: { width: ROUND, height: ROUND, borderRadius: ROUND / 2, backgroundColor: GLASS, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "rgba(255,255,255,0.85)" },
  dim: { opacity: 0.4 },
  fightBox: { flex: 1, gap: 6 },
  runTrack: { height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.2)", overflow: "hidden", marginHorizontal: 8 },
  runFill: { height: 3, backgroundColor: "#FFF", transformOrigin: "left" },
  card: { flexDirection: "row", alignItems: "center", gap: 10, padding: 8, paddingRight: 12, borderRadius: 18, backgroundColor: GLASS, maxWidth: 420, alignSelf: "stretch" },
  cardThumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)" },
  cardText: { flex: 1, fontFamily: GF.body, fontSize: 14, color: "#FFF" },
});
