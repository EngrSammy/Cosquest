// Terms, Privacy and Community Guidelines (task 059), loaded from the URLs
// the build is configured with (EXPO_PUBLIC_TERMS_URL, _PRIVACY_URL,
// _GUIDELINES_URL, _FAQ_URL). We do not write legal text: until the team
// publishes a page, this says plainly that it is not published yet.
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

import { EmptyState, ErrorState, Header, SkeletonBlock } from "@/components/kit";
import { LEGAL_DOCS, type LegalDoc } from "@/services/legal";
import { space, useRoles } from "@/theme";

export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const r = useRoles();
  const entry = LEGAL_DOCS[(doc as LegalDoc) in LEGAL_DOCS ? (doc as LegalDoc) : "terms"];
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  return (
    <View style={[styles.screen, { backgroundColor: r.screen }]}>
      <Header title={entry.title} backTo="/settings" />
      {!entry.url ? (
        <EmptyState
          icon="document-text-outline"
          title="Not published yet"
          message={`The ${entry.title} will appear here once CosQuest publishes it.`}
        />
      ) : failed ? (
        <ErrorState
          title={`Couldn't load the ${entry.title}`}
          onRetry={() => {
            setFailed(false);
            setLoading(true);
            setAttempt((n) => n + 1);
          }}
        />
      ) : (
        <View style={styles.page}>
          <WebView
            key={attempt}
            source={{ uri: entry.url }}
            onLoadEnd={() => setLoading(false)}
            onError={() => setFailed(true)}
            onHttpError={() => setFailed(true)}
            setSupportMultipleWindows={false}
            style={styles.web}
          />
          {loading ? (
            <View style={[StyleSheet.absoluteFill, styles.loading, { backgroundColor: r.screen }]} pointerEvents="none">
              {[90, 70, 85, 60, 80].map((w, i) => (
                <SkeletonBlock key={i} w={`${w}%`} h={14} />
              ))}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  page: { flex: 1 },
  web: { flex: 1, backgroundColor: "transparent" },
  loading: { padding: space.xl, gap: space.md },
});
