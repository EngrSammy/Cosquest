// Minimum version / force update (task 059). With EXPO_PUBLIC_CONFIG_URL set,
// the app reads { minVersion, latestVersion, storeUrl, message } at launch:
// below minVersion it shows "Update CosQuest" and nothing else; below
// latestVersion a dismissible note. No URL, no answer within 5 s, a bad file:
// the app opens as normal (fails open).
import { Ionicons } from "@expo/vector-icons";
import { type ReactNode, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { FONTS } from "@/constants/fonts";
import { appConfig } from "@/services/appConfig";
import { type RemoteConfig, updateVerdict } from "@/services/versions";
import { C, radius, space, type } from "@/theme/tokens";

async function fetchRemoteConfig(): Promise<RemoteConfig | null> {
  if (!appConfig.remoteConfigUrl) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(appConfig.remoteConfigUrl, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    return (await response.json()) as RemoteConfig;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default function ForceUpdateGate({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<RemoteConfig | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let live = true;
    void fetchRemoteConfig().then((c) => {
      if (live) setConfig(c);
    });
    return () => {
      live = false;
    };
  }, []);

  const verdict = updateVerdict(appConfig.appVersion, config);
  const storeUrl = typeof config?.storeUrl === "string" && /^https:\/\//.test(config.storeUrl) ? config.storeUrl : null;

  if (verdict === "force") {
    return (
      <View style={styles.screen} accessibilityViewIsModal>
        <View style={styles.badge}>
          <Ionicons name="arrow-up-circle" size={40} color={C.white} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Update CosQuest
        </Text>
        <Text style={styles.body}>{config?.message || "This version is too old to keep up with the game and your chats. Update to carry on."}</Text>
        {storeUrl ? (
          <Pressable onPress={() => void Linking.openURL(storeUrl)} style={styles.button} accessibilityRole="button" accessibilityLabel="Update now">
            <Text style={styles.buttonText}>Update now</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {children}
      {verdict === "suggest" && !dismissed ? (
        <View style={styles.note} accessibilityRole="alert">
          <Text style={styles.noteText}>A new version of CosQuest is out.</Text>
          {storeUrl ? (
            <Pressable onPress={() => void Linking.openURL(storeUrl)} accessibilityRole="button" accessibilityLabel="Update">
              <Text style={styles.noteAction}>Update</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => setDismissed(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Not now">
            <Ionicons name="close" size={18} color={C.white} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xxxl, backgroundColor: C.skyPale, gap: space.md },
  badge: { width: 76, height: 76, borderRadius: 38, backgroundColor: C.brand, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: FONTS.bold, ...type.headline, color: C.ink, textAlign: "center" },
  body: { fontFamily: FONTS.regular, ...type.body, color: C.slate, textAlign: "center", maxWidth: 320 },
  button: { marginTop: space.lg, minHeight: 48, paddingHorizontal: space.xxxl, borderRadius: radius.pill, backgroundColor: C.brand, alignItems: "center", justifyContent: "center" },
  buttonText: { fontFamily: FONTS.semibold, ...type.bodyLarge, color: C.white },
  note: { position: "absolute", left: space.lg, right: space.lg, bottom: 110, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: C.inkNavy },
  noteText: { flex: 1, fontFamily: FONTS.medium, ...type.small, color: C.white },
  noteAction: { fontFamily: FONTS.semibold, ...type.small, color: C.brandTint },
});
