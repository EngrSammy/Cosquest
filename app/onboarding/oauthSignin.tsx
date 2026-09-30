import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { useGoogleAuth } from "@/utils/googleAuth";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

WebBrowser.maybeCompleteAuthSession();

export default function AuthSignin() {
  const insets = useSafeAreaInsets();

  // Real Google sign-in (was a "Coming soon" placeholder). Same flow as
  // sign-up: existing accounts go straight to home.
  const { continueWithGoogle, googleLoading } = useGoogleAuth();

  function handleApple() {
    Alert.alert("Apple sign-in", "Coming soon — we're wiring this up.");
  }

  return (
    <AppBackground variant="gradient">
      <View style={[styles.screen, { paddingTop: insets.top + 35 }]}>
        <Text style={styles.headline}>
          One Place for{"\n"}Everything you{"\n"}Love
        </Text>

        <Text style={styles.sub}>
          CosQuest turns your city into a fandom playground — real-world quests,
          your people, one leaderboard. Let&apos;s get you set up.
        </Text>

        <View style={styles.buttons}>
          <Button
            label={
              googleLoading ? "Connecting to Google…" : "Sign in with Google"
            }
            prefix="G"
            onPress={continueWithGoogle}
            variant="light"
            disabled={googleLoading}
          />

          <Button
            label="Sign in with Apple"
            onPress={handleApple}
            variant="dark"
          />

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Button
            label="Sign in with email"
            onPress={() => router.push("/onboarding/signin")}
            variant="brand"
          />
        </View>

        {googleLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#C5399A" />

            <Text style={styles.loadingText}>
              Connecting your Google account...
            </Text>
          </View>
        ) : null}

        <Text style={styles.sub}>
          Don&apos;t have an account?{" "}
          <Text
            style={{ color: "#C5399A", fontWeight: "700" }}
            onPress={() => router.push("/onboarding/signup")}>
            Sign-up
          </Text>
        </Text>
      </View>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 25,
    paddingBottom: 70,
  },
  headline: {
    fontSize: 35,
    fontWeight: "800",
    textAlign: "center",
    color: "#191922",
  },
  sub: {
    fontSize: 14,
    color: "#2b2b2c",
    textAlign: "center",
    marginTop: 20,
    lineHeight: 20,
  },
  buttons: { marginTop: 40, gap: 14 },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 5,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#c0bebe" },
  dividerText: { color: "#675656", fontSize: 15 },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
    gap: 8,
  },
  loadingText: {
    color: "#777985",
    fontSize: 12,
  },
});
