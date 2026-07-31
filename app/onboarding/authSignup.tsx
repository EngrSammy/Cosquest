import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { OnboardingProgress } from "@/components/OnboardingProgress";
import { Terms } from "@/components/Terms";
import { ONBOARDING_TOTAL, STEP } from "@/constants/onboarding";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export default function AuthSignup() {
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
            quests, your people, one leaderboard. Let's get you set up.
          </Text>
          <View style={styles.buttons}>
            <Button
              label="Sign up with Google"
              prefix="G"
              onPress={() => router.push("/onboarding/signup")}
              variant="light"
            />

            <Button
              label="Sign up with Apple"
              onPress={() => router.push("/onboarding/signup")}
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

          <Text style={styles.sub}>
            Already have an account?{" "}
            <Text
              style={{ color: "#C5399A", fontWeight: "700" }}
              onPress={() => router.push("/onboarding/authSignin")}
            >
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
    justifyContent: "center",
  },
  headline: {
    fontSize: 35,
    fontWeight: "800",
    textAlign: "center",
    color: "#191922",
  },
  body: { flex: 1, justifyContent: "center" },
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
  terms: { fontSize: 12, color: "#707072", textAlign: "center", marginTop: 60 },
});
