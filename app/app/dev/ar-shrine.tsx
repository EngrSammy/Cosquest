// TEST BUILDS ONLY (AR_SHRINE_DEV: EXPO_PUBLIC_AR_SHRINE=1, or EXPO_PUBLIC_E2E=1, or a dev build):
// the iOS shrine through the camera on its own, with no Quest Point, server or
// location needed, so the AR island (ios/Embed/ShrineIsland.swift, ARKit +
// RealityKit) can be proved on a real phone (phone-hardware design, Phase 2
// step 0). Point at the floor, the shrine is placed (or stands 1.5 m ahead
// when no plane is found), then Strike plays the three pulses and the break,
// Again resets it and Photo shares the moment.   cosquest://dev/ar-shrine
// Also reached from the game's More sheet ("AR shrine"). Every other build
// sends this route home.
import { Redirect, router } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AR_SHRINE_DEV } from "@/components/game/prefs";
import { CostQuestShrineView, type CostQuestShrineViewHandle, shrineARSupported } from "@/modules/costquest-game/src";

const ON = AR_SHRINE_DEV || __DEV__;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function ARShrinePreview() {
  const insets = useSafeAreaInsets();
  const shrine = useRef<CostQuestShrineViewHandle | null>(null);
  const [useAR, setUseAR] = useState(true);
  const [status, setStatus] = useState("Point your camera at the ground");
  const [busy, setBusy] = useState(false);
  if (!ON) return <Redirect href="/" />;

  const strike = async () => {
    if (busy) return;
    setBusy(true);
    try {
      for (let i = 0; i < 3; i++) {
        await shrine.current?.pulse(i).catch(() => {});
        await wait(450);
      }
      await shrine.current?.resolve(true).catch(() => {});
      setStatus("The shrine broke. Again to put it back.");
    } finally {
      setBusy(false);
    }
  };
  const again = () => {
    shrine.current?.reset().catch(() => {});
    setStatus("Tap Strike");
  };
  const photo = async () => {
    const uri = await shrine.current?.photo().catch(() => null);
    if (uri) Share.share({ url: uri, message: "CosQuest AR shrine" }).catch(() => {});
    else setStatus("No photo: a photo is only taken through the camera");
  };

  const Shrine = CostQuestShrineView;
  return (
    <View style={styles.root}>
      {Shrine ? (
        <Shrine
          key={useAR ? "ar" : "stage"}
          ref={shrine}
          style={StyleSheet.absoluteFill}
          tint="#7C5CFF"
          wardenTint="#E5484D"
          useAR={useAR}
          onPlaced={(e) => setStatus(e.nativeEvent.ar ? "Placed in your room. Walk round it, then Strike." : "On the 3D stage (no camera). Tap Strike.")}
        />
      ) : null}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Button label="Close" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
        <Text style={styles.title}>AR shrine (test build)</Text>
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.status} accessibilityLiveRegion="polite">
          {!Shrine
            ? "This phone has no native shrine view (iOS only)."
            : !shrineARSupported
              ? "This phone cannot do world-tracking AR: showing the 3D stage."
              : status}
        </Text>
        {Shrine ? (
          <View style={styles.row}>
            <Button label={busy ? "…" : "Strike"} onPress={strike} />
            <Button label="Again" onPress={again} />
            <Button label="Photo" onPress={photo} />
            {shrineARSupported ? <Button label={useAR ? "3D stage" : "Camera"} onPress={() => setUseAR((v) => !v)} /> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Button({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B1020" },
  top: { position: "absolute", left: 16, right: 16, top: 0, flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: "#FFF", fontSize: 16, fontWeight: "700" },
  bottom: { position: "absolute", left: 16, right: 16, bottom: 0, gap: 12 },
  status: { color: "#FFF", fontSize: 15, textAlign: "center", textShadowColor: "rgba(0,0,0,0.8)", textShadowRadius: 4 },
  row: { flexDirection: "row", justifyContent: "center", gap: 10, flexWrap: "wrap" },
  btn: { backgroundColor: "rgba(20,24,40,0.85)", borderRadius: 22, paddingHorizontal: 18, paddingVertical: 11, minHeight: 44, justifyContent: "center" },
  pressed: { opacity: 0.7 },
  btnText: { color: "#FFF", fontSize: 15, fontWeight: "600" },
});
