// "See it here" (phone-hardware design 2.3 and 2.4, Phase 2 step 1): a Forge
// character or weapon standing in the player's room, through the camera.
//
//   <SummonButton entry={entry} />   the button (iOS only; nothing elsewhere)
//
// The camera, the model, the gestures and the captures are native
// (modules/costquest-game/ios/Embed/SummonIsland.swift); this is the chrome:
// close, the name, one line of help, and the shutter (tap for a photo, hold
// for a clip of up to 10 s), then a small card to share what was taken. A
// phone with no world tracking, a refused camera or a failed AR view gets
// the 3D turntable full screen instead. Android shows no button yet (ARCore
// is Phase 2 step 3; features/game/summon.ts).
//
// Minimal chrome over the camera, the game's palette and fonts, sheetMotion's
// curves, light haptics (GameButton's, and the native view's on each
// capture), no sounds. Shared photos and clips carry no location: the native
// side writes them with no metadata at all, and the share text names the
// character, never the place.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Modal, Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { resolveIslandsOff } from "@/features/game/config";
import type { ForgeEntry } from "@/features/game/forgeWorld";
import { ensureFile, usdzFor } from "@/features/game/forgeWorldDevice";
import {
  SUMMON_CLIP_S,
  type SummonPhase,
  summonHeight,
  summonHint,
  summonKind,
  summonLabel,
  summonMode,
  summonScaleLimits,
  summonShareText,
  summonShown,
} from "@/features/game/summon";
import { CostQuestSummonView, type CostQuestSummonViewHandle, summonARSupported } from "@/modules/costquest-game/src";

import ForgeModel, { thumbSource } from "./ForgeModel";
import { GameButton, MAX_FONT_SCALE } from "./kit";
import { POP_IN, useCardMotion, useSheetMotion } from "./sheetMotion";
import { GF, GP } from "./theme";

const ISLAND_OFF = resolveIslandsOff(process.env.EXPO_PUBLIC_GAME_2D).has("arSummon");

/** Whether this entry gets a "See it here" button on this phone. */
export function useSummonShown(entry: ForgeEntry | null | undefined): boolean {
  return summonShown(entry, { platform: Platform.OS, nativeView: CostQuestSummonView !== null, islandOff: ISLAND_OFF });
}

/** "See it here": opens the entry in the room (or on the turntable). Renders nothing where it can't. */
export function SummonButton({ entry, small = true, color = GP.skyDeep }: { entry: ForgeEntry | null | undefined; small?: boolean; color?: string }) {
  const shown = useSummonShown(entry);
  const [open, setOpen] = useState(false);
  if (!shown || !entry) return null;
  return (
    <>
      <GameButton
        title="See it here"
        small={small}
        color={color}
        icon={<Ionicons name="scan" size={small ? 16 : 20} color="#FFF" />}
        onPress={() => setOpen(true)}
        accessibilityLabel={summonLabel(entry.name)}
        accessibilityHint={summonARSupported ? "Opens the camera and stands it on your floor" : "Shows it in 3D, full screen"}
        testID="summon-open"
      />
      {open ? <SummonAR entry={entry} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

type Capture = { kind: "photo" | "video"; uri: string };

export default function SummonAR({ entry, onClose }: { entry: ForgeEntry; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const view = useRef<CostQuestSummonViewHandle | null>(null);
  const chrome = useSheetMotion();
  const card = useCardMotion();
  const kind = summonKind(entry);
  const limits = summonScaleLimits(kind);
  const file = usdzFor(entry);
  const [uri, setUri] = useState<string | null>(null);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const [phase, setPhase] = useState<SummonPhase | null>(null);
  const [recording, setRecording] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [capture, setCapture] = useState<Capture | null>(null);
  const [busy, setBusy] = useState(false);
  const recordingRef = useRef(false);
  const mode = downloadFailed ? "turntable" : summonMode(summonARSupported && CostQuestSummonView !== null, phase);
  const placed = phase === "placed";

  useEffect(() => {
    if (!file || !summonARSupported) return;
    let alive = true;
    void ensureFile(entry, file).then((u) => {
      if (!alive) return;
      if (u) setUri(u);
      else setDownloadFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [entry, file?.file]); // eslint-disable-line react-hooks/exhaustive-deps

  // The clip's clock, and its 10 s limit.
  useEffect(() => {
    if (recording === null) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n - recording >= SUMMON_CLIP_S * 1000) void stopClip();
    }, 200);
    return () => clearInterval(t);
  }, [recording]);

  const photo = async () => {
    if (!placed || busy || recordingRef.current) return;
    setBusy(true);
    try {
      const u = await view.current?.photo().catch(() => null);
      if (u) setCapture({ kind: "photo", uri: u });
    } finally {
      setBusy(false);
    }
  };
  const startClip = async () => {
    if (!placed || busy || recordingRef.current) return;
    recordingRef.current = true;
    const ok = (await view.current?.startVideo().catch(() => null)) != null;
    // Let go before the camera started recording: stopClip already ran.
    if (!recordingRef.current) return;
    if (ok) {
      const t = Date.now();
      setNow(t);
      setRecording(t);
    } else {
      recordingRef.current = false;
    }
  };
  async function stopClip() {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(null);
    const u = await view.current?.stopVideo().catch(() => null);
    if (u) setCapture({ kind: "video", uri: u });
  }
  const share = (c: Capture) => {
    Share.share({ url: c.uri }, { subject: summonShareText(entry.name) }).catch(() => {});
  };
  const close = () => {
    if (recordingRef.current) void stopClip();
    onClose();
  };

  const seconds = recording !== null ? Math.min(SUMMON_CLIP_S, Math.floor((now - recording) / 1000)) : 0;
  const hint =
    mode === "turntable" && phase !== "denied"
      ? summonARSupported
        ? summonHint(kind, "failed", false)
        : "This phone can't do AR. Here it is in 3D: drag to turn it."
      : !uri && mode === "ar"
        ? "Getting it ready…"
        : summonHint(kind, phase, recording !== null);
  const SummonView = CostQuestSummonView;

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={close}>
      <View style={styles.root} accessibilityViewIsModal>
        {mode === "ar" && SummonView && uri ? (
          <SummonView
            ref={view}
            style={StyleSheet.absoluteFill}
            uri={uri}
            kind={kind}
            name={entry.name}
            heightM={summonHeight(entry)}
            minScale={limits.min}
            maxScale={limits.max}
            tint={GP.sun}
            accessibilityLabel={`Camera view with ${entry.name} on your floor`}
            onSummonState={(e) => setPhase(e.nativeEvent.phase)}
          />
        ) : mode === "ar" ? (
          <View style={[StyleSheet.absoluteFill, styles.centre]}>
            {thumbSource(entry, 512) ? <Image source={thumbSource(entry, 512)!} style={styles.waitThumb} contentFit="contain" /> : null}
            <ActivityIndicator color={GP.sun} />
          </View>
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.stage]}>
            <View style={[styles.floor, { backgroundColor: GP.sun }]} pointerEvents="none" />
            <ForgeModel
              entry={entry}
              purpose="closeup"
              animation={entry.type === "character" && entry.rigged ? "idle" : null}
              spin={entry.type !== "character"}
              style={styles.turntable}
              size={360}
              distance={entry.type === "character" ? 2.7 : 2.6}
            />
          </View>
        )}

        <Animated.View entering={chrome.entering} style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <Pressable onPress={close} hitSlop={12} style={styles.round} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={22} color="#FFF" />
          </Pressable>
          <View style={styles.titleBox} pointerEvents="none">
            <Text style={styles.kicker} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {mode === "ar" ? "IN YOUR ROOM" : "IN 3D"}
            </Text>
            <Text style={styles.title} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} accessibilityRole="header">
              {entry.name}
            </Text>
          </View>
          <View style={styles.roundSpacer} />
        </Animated.View>

        <Animated.View entering={chrome.entering} style={[styles.bottom, { paddingBottom: insets.bottom + 18 }]} pointerEvents="box-none">
          {capture ? (
            <Animated.View entering={POP_IN} exiting={card.exiting} style={styles.card}>
              {capture.kind === "photo" ? (
                <Image source={{ uri: capture.uri }} style={styles.cardThumb} contentFit="cover" accessibilityLabel={`Photo of ${entry.name}`} />
              ) : (
                <View style={[styles.cardThumb, styles.centre]} accessibilityLabel={`Clip of ${entry.name}`}>
                  <Ionicons name="videocam" size={22} color="#FFF" />
                </View>
              )}
              <Text style={styles.cardText} maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1}>
                {capture.kind === "photo" ? "Photo taken" : "Clip recorded"}
              </Text>
              <GameButton title="Share" small color={GP.mint} onPress={() => share(capture)} accessibilityLabel={`Share the ${capture.kind === "photo" ? "photo" : "clip"}`} />
              <Pressable onPress={() => setCapture(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss">
                <Ionicons name="close" size={18} color="rgba(255,255,255,0.8)" />
              </Pressable>
            </Animated.View>
          ) : null}

          <Text style={styles.hint} accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {recording !== null ? `● ${seconds}s / ${SUMMON_CLIP_S}s   ${hint}` : hint}
          </Text>

          {mode === "ar" ? (
            <View style={styles.controls}>
              <Pressable
                onPress={() => view.current?.recenter().catch(() => {})}
                disabled={!uri}
                style={[styles.round, !uri && styles.dim]}
                accessibilityRole="button"
                accessibilityLabel="Place it again in front of you">
                <Ionicons name="locate" size={22} color="#FFF" />
              </Pressable>
              <Pressable
                onPress={() => void photo()}
                onLongPress={() => void startClip()}
                onPressOut={() => {
                  if (recordingRef.current) void stopClip();
                }}
                delayLongPress={280}
                disabled={!placed}
                style={[styles.shutter, !placed && styles.dim]}
                accessibilityRole="button"
                accessibilityLabel={recording !== null ? "Stop recording" : "Take a photo"}
                accessibilityHint={`Hold to record a clip of up to ${SUMMON_CLIP_S} seconds`}
                accessibilityState={{ disabled: !placed, busy }}
                accessibilityActions={[{ name: "activate" }, { name: "longpress", label: "Record a clip" }]}
                onAccessibilityAction={(e) => {
                  if (e.nativeEvent.actionName === "activate") void (recording !== null ? stopClip() : photo());
                  else if (e.nativeEvent.actionName === "longpress") void startClip();
                }}
                testID="summon-shutter">
                <View style={[styles.shutterInner, recording !== null && styles.shutterRec]} />
              </Pressable>
              {kind === "character" ? (
                <Pressable
                  onPress={() => view.current?.celebrate().catch(() => {})}
                  disabled={!placed}
                  style={[styles.round, !placed && styles.dim]}
                  accessibilityRole="button"
                  accessibilityLabel="Celebrate">
                  <Ionicons name="sparkles" size={21} color={GP.sun} />
                </Pressable>
              ) : (
                <View style={styles.roundSpacer} />
              )}
            </View>
          ) : phase === "denied" ? (
            <GameButton title="Open Settings" small color={GP.skyDeep} onPress={() => Linking.openSettings().catch(() => {})} />
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}

const SHUTTER = 76;
const ROUND = 48;
const GLASS = "rgba(20,28,44,0.55)";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  centre: { alignItems: "center", justifyContent: "center" },
  waitThumb: { width: 220, height: 220, marginBottom: 18, opacity: 0.9 },
  stage: { backgroundColor: GP.navy, alignItems: "center", justifyContent: "center" },
  floor: { position: "absolute", bottom: "26%", width: 260, height: 50, borderRadius: 130, opacity: 0.22 },
  turntable: { width: "100%", height: "70%" },
  top: { position: "absolute", left: 16, right: 16, top: 0, flexDirection: "row", alignItems: "center", gap: 12 },
  titleBox: { flex: 1, alignItems: "center" },
  kicker: { fontFamily: GF.bold, fontSize: 11, letterSpacing: 1.2, color: GP.sun, textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 4 },
  title: { fontFamily: GF.display, fontSize: 22, color: "#FFF", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 6 },
  round: { width: ROUND, height: ROUND, borderRadius: ROUND / 2, backgroundColor: GLASS, alignItems: "center", justifyContent: "center" },
  roundSpacer: { width: ROUND, height: ROUND },
  dim: { opacity: 0.4 },
  bottom: { position: "absolute", left: 16, right: 16, bottom: 0, alignItems: "center", gap: 14 },
  hint: { fontFamily: GF.body, fontSize: 14, color: "#FFF", textAlign: "center", textShadowColor: "rgba(0,0,0,0.75)", textShadowRadius: 5, maxWidth: 420 },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%", maxWidth: 360 },
  shutter: { width: SHUTTER, height: SHUTTER, borderRadius: SHUTTER / 2, borderWidth: 4, borderColor: "#FFF", alignItems: "center", justifyContent: "center" },
  shutterInner: { width: SHUTTER - 18, height: SHUTTER - 18, borderRadius: (SHUTTER - 18) / 2, backgroundColor: "#FFF" },
  shutterRec: { width: 28, height: 28, borderRadius: 7, backgroundColor: GP.berry },
  card: { flexDirection: "row", alignItems: "center", gap: 10, padding: 8, paddingRight: 12, borderRadius: 18, backgroundColor: GLASS, maxWidth: 420, alignSelf: "stretch" },
  cardThumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)" },
  cardText: { flex: 1, fontFamily: GF.body, fontSize: 14, color: "#FFF" },
});
