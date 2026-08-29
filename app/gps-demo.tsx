import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

// Standalone demo screen — reachable at /gps-demo (web: /Cosquest/gps-demo).
// Purpose: show a non-technical viewer that a browser/PWA STOPS tracking
// location the moment the screen locks or the tab is backgrounded.
// How to demo: open on the WEB build → Start → let a few fixes log → lock the
// screen ~30s → unlock. You'll see a gap in the timestamps and the "last fix"
// counter jump to ~30s, because the browser froze all timers while locked.

type Fix = { time: string; lat: number; lng: number };

export default function GpsDemo() {
  const [status, setStatus] = useState("Idle — tap Start");
  const [running, setRunning] = useState(false);
  const [count, setCount] = useState(0);
  const [log, setLog] = useState<Fix[]>([]);
  const [sinceSec, setSinceSec] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastFixAt = useRef<number>(0);

  function stop() {
    if (pollRef.current) clearInterval(pollRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    pollRef.current = null;
    tickRef.current = null;
    setRunning(false);
    setStatus("Stopped");
  }

  async function start() {
    const { status: perm } = await Location.requestForegroundPermissionsAsync();
    if (perm !== "granted") {
      setStatus("Location permission denied");
      return;
    }
    setStatus("Tracking — now lock your screen for ~30s, then unlock");
    setRunning(true);
    lastFixAt.current = Date.now();

    // Ask for a fresh position every 2s. When the screen locks / tab
    // backgrounds, the OS/browser suspends this timer — so fixes stop.
    pollRef.current = setInterval(async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        lastFixAt.current = Date.now();
        setCount((c) => c + 1);
        setLog((prev) =>
          [
            {
              time: new Date().toLocaleTimeString(),
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            },
            ...prev,
          ].slice(0, 12),
        );
      } catch {
        // ignore a single failed read
      }
    }, 2000);

    // Ticker: seconds since the last fix. After a lock it jumps, exposing the gap.
    tickRef.current = setInterval(() => {
      setSinceSec(Math.round((Date.now() - lastFixAt.current) / 1000));
    }, 500);
  }

  // Clean up timers if the screen unmounts mid-run.
  useEffect(() => {
    return () => stop();
  }, []);

  const stale = running && sinceSec >= 6;

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>GPS Heartbeat</Text>
      <Text style={styles.platform}>
        Running on: {Platform.OS === "web" ? "WEB / PWA" : "NATIVE APP"}
      </Text>

      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{count}</Text>
          <Text style={styles.statLabel}>fixes received</Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statValue, stale && styles.statStale]}>
            {running ? `${sinceSec}s` : "—"}
          </Text>
          <Text style={styles.statLabel}>since last fix</Text>
        </View>
      </View>

      {stale ? (
        <Text style={styles.frozen}>
          ⚠️ No location update for {sinceSec}s — tracking is frozen.
        </Text>
      ) : null}

      <Text style={styles.status}>{status}</Text>

      <Pressable
        style={[styles.btn, running && styles.btnStop]}
        onPress={running ? stop : start}
      >
        <Text style={styles.btnText}>{running ? "Stop" : "Start"}</Text>
      </Pressable>

      <Text style={styles.logHeader}>Fix log (newest first)</Text>
      <ScrollView style={styles.logBox} contentContainerStyle={{ padding: 12 }}>
        {log.length === 0 ? (
          <Text style={styles.logEmpty}>No fixes yet.</Text>
        ) : (
          log.map((f, i) => (
            <Text key={i} style={styles.logLine}>
              {f.time} — {f.lat.toFixed(5)}, {f.lng.toFixed(5)}
            </Text>
          ))
        )}
      </ScrollView>

      <Text style={styles.hint}>
        Demo: Start → wait for a few fixes → lock the screen ~30s → unlock. On
        the web/PWA the log stops and “since last fix” jumps. A native app with
        background location keeps logging.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF", padding: 24, paddingTop: 64 },
  title: { fontSize: 28, fontWeight: "800", color: "#191922", textAlign: "center" },
  platform: {
    fontSize: 13,
    fontWeight: "700",
    color: "#C5399A",
    textAlign: "center",
    marginTop: 4,
    letterSpacing: 1,
  },
  statRow: { flexDirection: "row", gap: 12, marginTop: 24 },
  stat: {
    flex: 1,
    backgroundColor: "#F4F4F7",
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: "center",
  },
  statValue: { fontSize: 40, fontWeight: "900", color: "#191922", fontVariant: ["tabular-nums"] },
  statStale: { color: "#E24D4D" },
  statLabel: { fontSize: 12, color: "#6b6b72", marginTop: 4 },
  frozen: { color: "#E24D4D", fontWeight: "700", textAlign: "center", marginTop: 14 },
  status: { fontSize: 14, color: "#2b2b2c", textAlign: "center", marginTop: 14, lineHeight: 20 },
  btn: {
    backgroundColor: "#34C759",
    borderRadius: 30,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 18,
  },
  btnStop: { backgroundColor: "#E24D4D" },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 17 },
  logHeader: { fontSize: 12, fontWeight: "700", color: "#6b6b72", marginTop: 24, marginBottom: 8, letterSpacing: 0.5 },
  logBox: { flex: 1, backgroundColor: "#0F0F14", borderRadius: 14 },
  logEmpty: { color: "#9C9CAA", fontSize: 13 },
  logLine: { color: "#8FE39B", fontSize: 13, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", marginBottom: 4 },
  hint: { fontSize: 12, color: "#9C9CAA", textAlign: "center", marginTop: 14, lineHeight: 18 },
});
