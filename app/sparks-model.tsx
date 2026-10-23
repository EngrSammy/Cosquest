// ==========================================
// SPARKS AI ON THIS PHONE
// ==========================================
// Can this phone run the Sparks AI (about 6 GB RAM in this release)? If so,
// download the model (about 1 GB, Wi-Fi). Phones that can't still see every
// Spark: other members' phones do the AI work for the group.
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FONTS } from "@/constants/fonts";
import { useSparksBoot } from "@/hooks/useSparks";
import {
  cancelModelDownload,
  deleteModel,
  downloadModel,
  getCapabilities,
  getSparksSdk,
  modelStatus,
  onModelStatus,
  sparksEnabled,
  type DeviceCapabilities,
  type ModelStatus,
} from "@/services/sparksSdk";
import { safeBack } from "@/utils/safeBack";
import { ScreenGradient } from "@/components/chat/ui";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";

const PINK = "#B63D91";
const INK = "#24283C";
const MUTED = "#66738A";
const LILAC = "#F0EDF9";

const REASONS: Record<string, string> = {
  ram: "This phone has less memory than the AI needs (about 6 GB).",
  cpu: "This phone's processor is too old for the AI.",
  os: "This phone's system version is too old for the AI.",
  storage: "There isn't enough free storage for the AI (about 1.2 GB).",
  manifest: "No AI version is available for this phone yet.",
  forced: "The AI is turned off on this phone.",
};

const PHASES: Record<string, string> = {
  unsupported: "Not available on this phone",
  not_downloaded: "Not downloaded",
  checking: "Checking for the latest version…",
  downloading: "Downloading…",
  download_paused: "Paused: waiting for Wi-Fi or storage",
  verifying: "Checking the download…",
  ready: "Downloaded",
  loading: "Starting…",
  loaded: "On and ready",
  error: "Something went wrong",
};

function gb(bytes?: number) {
  return bytes ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : "?";
}

export default function SparksModel() {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();
  useSparksBoot();

  const [caps, setCaps] = useState<DeviceCapabilities | null>(null);
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [waiting, setWaiting] = useState(true);
  const [busy, setBusy] = useState(false);

  // Wait for the SDK to start (after login), then read this phone's details.
  useEffect(() => {
    if (!sparksEnabled() || Platform.OS === "web") {
      setWaiting(false);
      return;
    }
    let off = () => {};
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      if (getSparksSdk()) {
        clearInterval(timer);
        setCaps(await getCapabilities());
        setStatus(modelStatus());
        off = onModelStatus(setStatus);
        setWaiting(false);
      } else if (tries > 40) {
        clearInterval(timer);
        setWaiting(false);
      }
    }, 250);
    return () => {
      clearInterval(timer);
      off();
    };
  }, []);

  const download = async (allowCellular: boolean) => {
    try {
      setBusy(true);
      setStatus(await downloadModel(allowCellular));
    } catch (error: any) {
      Alert.alert("Sparks AI", error?.message || "The download didn't finish. Try again on Wi-Fi.");
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert("Delete the AI from this phone?", "You'll still see every Spark. You can download it again later.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await deleteModel();
          setStatus(modelStatus());
        },
      },
    ]);

  const capable = caps?.tier && caps.tier !== "none";
  const phase = status?.phase || (capable ? "not_downloaded" : "unsupported");
  const downloading = phase === "downloading" || phase === "verifying" || phase === "checking" || phase === "loading";
  const percent =
    status?.bytesTotal && status.bytesDownloaded ? Math.round((status.bytesDownloaded / status.bytesTotal) * 100) : 0;

  let body;
  if (!sparksEnabled()) {
    body = <Text style={styles.text}>The Sparks AI isn't switched on yet. Sparks keep working as they do today.</Text>;
  } else if (Platform.OS === "web") {
    body = (
      <Text style={styles.text}>
        The Sparks AI runs on phones. On the website you still see every Spark: members' phones do the AI work for the group.
      </Text>
    );
  } else if (waiting) {
    body = <ActivityIndicator color={ink.text(PINK)} style={styles.loading} />;
  } else if (!getSparksSdk()) {
    body = <Text style={styles.text}>The Sparks AI couldn't start. Check your connection and open this screen again.</Text>;
  } else {
    body = (
      <>
        {/* THIS PHONE */}
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons
              name={capable ? "checkmark-circle" : "information-circle"}
              size={26}
              color={ink.text(capable ? "#2A8A92" : MUTED)}
            />
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>
                {capable ? "This phone can run the Sparks AI" : "This phone can't run the Sparks AI yet"}
              </Text>
              <Text style={styles.cardText}>
                {caps?.deviceModel ? `${caps.deviceModel} · ` : ""}
                {gb(caps?.ramBytes)} memory
              </Text>
            </View>
          </View>
          {!capable ? (
            <Text style={styles.note}>
              {REASONS[caps?.tierReason || ""] || "A smaller version for more phones is planned."} You still see every
              Spark: other members' phones do the AI work for the group.
            </Text>
          ) : null}
        </View>

        {/* THE MODEL */}
        {capable ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>The Sparks AI</Text>
            <Text style={styles.cardText}>
              {PHASES[phase] || phase}
              {status?.variant?.model?.bytes ? ` · ${gb(status.variant.model.bytes)}` : " · about 1 GB"}
              {status?.version ? ` · version ${status.version}` : ""}
            </Text>

            {phase === "downloading" ? (
              <View style={styles.track}>
                <View style={[styles.bar, { width: `${percent}%` }]} />
              </View>
            ) : null}
            {phase === "downloading" ? <Text style={styles.note}>{percent}% · keep the app open</Text> : null}
            {status?.error?.message ? <Text style={styles.error}>{status.error.message}</Text> : null}

            {phase === "not_downloaded" || phase === "error" || phase === "download_paused" ? (
              <>
                <Pressable style={[styles.primary, busy && styles.off]} disabled={busy} onPress={() => download(false)}>
                  {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Download on Wi-Fi</Text>}
                </Pressable>
                <Pressable style={styles.secondary} disabled={busy} onPress={() => download(true)}>
                  <Text style={styles.secondaryText}>Download now (uses mobile data)</Text>
                </Pressable>
              </>
            ) : null}

            {downloading ? (
              <Pressable style={styles.secondary} onPress={() => cancelModelDownload()}>
                <Text style={styles.secondaryText}>Cancel download</Text>
              </Pressable>
            ) : null}

            {phase === "ready" || phase === "loaded" ? (
              <Pressable style={styles.secondary} onPress={remove}>
                <Text style={[styles.secondaryText, styles.danger]}>Delete the AI from this phone</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.footnote}>
          The AI runs on your phone, not on a server. It works out Spark subjects and summaries for your chats, only while
          you're not busy in the game.
        </Text>
      </>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenGradient />
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => safeBack()} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={ink.text(INK)} />
        </Pressable>
        <Text style={styles.title}>Sparks AI on this phone</Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 30 }]}>{body}</ScrollView>
    </View>
  );
}

const STYLE_PAIR = themedStyles({
  screen: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  off: { opacity: 0.5 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingBottom: 8 },
  title: { flex: 1, fontFamily: FONTS.semibold, fontSize: 22, lineHeight: 28, color: INK },
  content: { paddingHorizontal: 18, paddingTop: 12 },
  loading: { marginTop: 40 },
  text: { fontFamily: FONTS.regular, fontSize: 15, lineHeight: 22, color: MUTED },
  card: {
    marginBottom: 14,
    padding: 16,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(36,40,60,0.08)",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardTitle: { fontFamily: FONTS.semibold, fontSize: 16, color: INK },
  cardText: { marginTop: 3, fontFamily: FONTS.regular, fontSize: 13, color: MUTED },
  note: { marginTop: 12, fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19, color: MUTED },
  error: { marginTop: 10, fontFamily: FONTS.regular, fontSize: 13, color: "#C0394B" },
  track: { marginTop: 14, height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: "#E3E7EF" },
  bar: { height: 8, borderRadius: 4, backgroundColor: PINK },
  primary: { marginTop: 16, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: PINK },
  primaryText: { fontFamily: FONTS.semibold, fontSize: 16, color: "#FFFFFF" },
  secondary: { marginTop: 10, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: LILAC },
  secondaryText: { fontFamily: FONTS.semibold, fontSize: 15, color: PINK },
  danger: { color: "#C0394B" },
  footnote: { marginTop: 6, fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 18, color: MUTED },
});
