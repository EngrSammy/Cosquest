import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { OnboardingProgress } from "@/components/OnboardingProgress";
import { Terms } from "@/components/Terms";
import { ONBOARDING_TOTAL, STEP } from "@/constants/onboarding";
import { useGoogleAuth } from "@/utils/googleAuth";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useAppSelector } from "../../store/hooks";

WebBrowser.maybeCompleteAuthSession();

export default function AuthSignup() {
  const { loading } = useAppSelector((state) => state.auth);

  // Same Google flow as the Sign in screen — the backend decides whether
  // it's a new account (-> onboarding) or an existing one (-> home).
  const { continueWithGoogle, googleLoading } = useGoogleAuth();

  return (
    <AppBackground variant="gradient">
      <View style={styles.screen}>
        <OnboardingProgress step={STEP.account} total={ONBOARDING_TOTAL} />

        <View style={styles.body}>
          <Text style={styles.headline}>
            One Place for{"\n"}Everything you{"\n"}Love
          </Text>

          <Text style={styles.sub}>
            CosQuest turns your city into a fandom playground — real-world
            quests, your people, one leaderboard. Let&apos;s get you set up.
          </Text>

          <View style={styles.buttons}>
            <Button
              label={
                googleLoading ? "Connecting to Google…" : "Sign up with Google"
              }
              prefix="G"
              onPress={continueWithGoogle}
              variant="light"
              disabled={googleLoading || loading}
            />

            <Button
              label="Sign up with Apple"
              onPress={() => {}}
              variant="dark"
            />

            <View style={styles.divider}>
              <View style={styles.dividerLine} />

              <Text style={styles.dividerText}>or</Text>

              <View style={styles.dividerLine} />
            </View>

            <Button
              label="Sign up with email"
              onPress={() => router.push("/onboarding/signup")}
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

          <Text style={styles.accountText}>
            Already have an account?{" "}
            <Text
              style={styles.signinLink}
              onPress={() => router.push("/onboarding/signin")}>
              Sign-in
            </Text>
          </Text>

          <Terms />
        </View>
      </View>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 25,
    paddingBottom: 24,
  },

  headline: {
    fontSize: 35,
    fontWeight: "800",
    textAlign: "center",
    color: "#191922",
  },

  body: {
    flex: 1,
    justifyContent: "center",
  },

  sub: {
    fontSize: 14,
    color: "#2b2b2c",
    textAlign: "center",
    marginTop: 20,
    lineHeight: 20,
  },

  buttons: {
    marginTop: 40,
    gap: 14,
  },

  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 5,
  },

  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#c0bebe",
  },

  dividerText: {
    color: "#675656",
    fontSize: 15,
  },

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

  accountText: {
    fontSize: 14,
    color: "#2b2b2c",
    textAlign: "center",
    marginTop: 22,
  },

  signinLink: {
    color: "#C5399A",
    fontWeight: "700",
  },
});
