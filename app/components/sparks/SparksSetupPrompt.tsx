// ==========================================
// SPARKS SETUP POP-UP
// ==========================================
// Sparks does its AI work (call write-ups, chat topics) on members' phones,
// so a call only gets written up when someone on it has the model. This
// pop-up asks every phone that can run the model, but hasn't downloaded it,
// to download it now. "Later" asks again the next day; phones that can't run
// the model, the website, and phones that already have it never see it.
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { FONTS } from "@/constants/fonts";
import { useSparksBoot } from "@/hooks/useSparks";
import {
  downloadModel,
  getCapabilities,
  getSparksSdk,
  modelStatus,
  onModelStatus,
  sparksEnabled,
  type ModelStatus,
} from "@/services/sparksSdk";
import { getPref, setPref } from "@/utils/prefsStorage";

const PINK = "#B63D91";
const INK = "#24283C";
const MUTED = "#66738A";
const LILAC = "#F0EDF9";

const LATER_KEY = "sparks.setupPrompt.laterUntil";
const ASK_AGAIN_MS = 24 * 60 * 60 * 1000;

// Phases where the model still needs a download (or a retry).
const NEEDS_DOWNLOAD = new Set(["not_downloaded", "download_paused", "error"]);
const BUSY = new Set(["checking", "downloading", "verifying", "loading"]);

function gb(bytes?: number) {
  return bytes ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : "about 1 GB";
}

export function SparksSetupPrompt() {
  useSparksBoot();

  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wait for the SDK (it starts after login), then decide whether to ask.
  useEffect(() => {
    if (!sparksEnabled() || Platform.OS === "web") return;
    let off = () => {};
    let cancelled = false;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      if (!getSparksSdk()) {
        if (tries > 120) clearInterval(timer);
        return;
      }
      clearInterval(timer);
      const [caps, laterUntil] = await Promise.all([getCapabilities(), getPref(LATER_KEY)]);
      if (cancelled) return;
      const current = modelStatus();
      setStatus(current);
      off = onModelStatus(setStatus);
      const capable = !!caps?.tier && caps.tier !== "none";
      const snoozed = laterUntil ? Date.now() < Number(laterUntil) : false;
      const phase = current?.phase || "not_downloaded";
      if (capable && !snoozed && NEEDS_DOWNLOAD.has(phase)) setVisible(true);
    }, 500);
    return () => {
      cancelled = true;
      clearInterval(timer);
      off();
    };
  }, []);

  const phase = status?.phase || "not_downloaded";
  const done = phase === "ready" || phase === "loaded";
  const working = busy || BUSY.has(phase);
  const percent =
    status?.bytesTotal && status.bytesDownloaded ? Math.round((status.bytesDownloaded / status.bytesTotal) * 100) : 0;

  const download = async (allowCellular: boolean) => {
    setError(null);
    setBusy(true);
    try {
      setStatus(await downloadModel(allowCellular));
    } catch (e: any) {
      setError(e?.message || "The download didn't finish. Try again on Wi-Fi.");
    } finally {
      setBusy(false);
    }
  };

  const later = () => {
    setPref(LATER_KEY, String(Date.now() + ASK_AGAIN_MS));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={working ? () => setVisible(false) : later}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="sparkles" size={26} color={PINK} />
          </View>

          <Text style={styles.title}>{done ? "Sparks is ready" : "Set up Sparks on this phone"}</Text>

          {done ? (
            <Text style={styles.text}>
              Thanks! Your phone can now write up calls and group chat topics for everyone you talk to.
            </Text>
          ) : (
            <Text style={styles.text}>
              Sparks writes up your calls and sorts group chats into topics, right on members' phones. A call is only
              written up if someone on it has Sparks, so every member needs it. It's a one-time download (
              {gb(status?.variant?.model?.bytes)}), best on Wi-Fi.
            </Text>
          )}

          {working && !done ? (
            <>
              <View style={styles.track}>
                <View style={[styles.bar, { width: `${Math.max(percent, 3)}%` }]} />
              </View>
              <Text style={styles.note}>
                {phase === "downloading" ? `${percent}% · you can keep using the app` : "Getting things ready…"}
              </Text>
            </>
          ) : null}

          {phase === "download_paused" && !working ? (
            <Text style={styles.note}>Paused: waiting for Wi-Fi or free storage.</Text>
          ) : null}
          {error || status?.error?.message ? <Text style={styles.error}>{error || status?.error?.message}</Text> : null}

          {done ? (
            <Pressable style={styles.primary} onPress={() => setVisible(false)} accessibilityRole="button">
              <Text style={styles.primaryText}>Done</Text>
            </Pressable>
          ) : working ? (
            <Pressable style={styles.secondary} onPress={() => setVisible(false)} accessibilityRole="button">
              <Text style={styles.secondaryText}>Keep downloading in the background</Text>
            </Pressable>
          ) : (
            <>
              <Pressable style={styles.primary} onPress={() => download(false)} accessibilityRole="button">
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Download on Wi-Fi</Text>}
              </Pressable>
              <Pressable style={styles.secondary} onPress={() => download(true)} accessibilityRole="button">
                <Text style={styles.secondaryText}>Download now (uses mobile data)</Text>
              </Pressable>
              <Pressable style={styles.later} onPress={later} hitSlop={8} accessibilityRole="button">
                <Text style={styles.laterText}>Later</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
    backgroundColor: "rgba(16,18,28,0.55)",
  },
  card: { width: "100%", maxWidth: 420, padding: 22, borderRadius: 24, backgroundColor: "#FFFFFF" },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: LILAC,
    marginBottom: 14,
  },
  title: { fontFamily: FONTS.semibold, fontSize: 20, lineHeight: 26, color: INK },
  text: { marginTop: 8, fontFamily: FONTS.regular, fontSize: 15, lineHeight: 22, color: MUTED },
  note: { marginTop: 8, fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19, color: MUTED },
  error: { marginTop: 10, fontFamily: FONTS.regular, fontSize: 13, color: "#C0394B" },
  track: { marginTop: 16, height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: "#E3E7EF" },
  bar: { height: 8, borderRadius: 4, backgroundColor: PINK },
  primary: {
    marginTop: 18,
    height: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PINK,
  },
  primaryText: { fontFamily: FONTS.semibold, fontSize: 16, color: "#FFFFFF" },
  secondary: {
    marginTop: 10,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: LILAC,
    paddingHorizontal: 12,
  },
  secondaryText: { fontFamily: FONTS.semibold, fontSize: 15, color: PINK, textAlign: "center" },
  later: { marginTop: 12, alignSelf: "center", padding: 6 },
  laterText: { fontFamily: FONTS.semibold, fontSize: 15, color: MUTED },
});
