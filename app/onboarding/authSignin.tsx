import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function AuthLogin() {
  const insets = useSafeAreaInsets();
  return (
    <AppBackground variant="gradient">
      <View style={[styles.screen, { paddingTop: insets.top + 35 }]}>
        <Text style={styles.headline}>
          One Place for{"\n"}Everything you{"\n"}Love
        </Text>
        <Text style={styles.sub}>
          CosQuest turns your city into a fandom playground — real-world quests,
          your people, one leaderboard. Let's get you set up.
        </Text>
        <View style={styles.buttons}>
          <Button
            label="Sign in with Google"
            prefix="G"
            onPress={() => router.push("/onboarding/signin")}
            variant="light"
          />

          <Button
            label="Sign in with Apple"
            onPress={() => router.push("/onboarding/signin")}
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

        <Text style={styles.sub}>
          Don't have an account?{" "}
          <Text
            style={{ color: "#C5399A", fontWeight: "700" }}
            onPress={() => router.push("/onboarding/authSignup")}
          >
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
  sso: {
    flexDirection: "row", // so prefix + label sit in a row
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    borderRadius: 30,
    paddingVertical: 14,
  },
  ssoLight: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#ECECF2",
  },
  ssoDark: { backgroundColor: "#191922" },
  ssoBrand: { backgroundColor: "#C5399A" },

  ssoLabel: { fontSize: 15, fontWeight: "600" },
  labelDark: { color: "#191922" },
  labelLight: { color: "#FFFFFF" },
  prefix: { fontSize: 18, fontWeight: "800", color: "#4285F4" }, // Google blue

  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 5,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#c0bebe" },
  dividerText: { color: "#675656", fontSize: 15 },
  terms: { fontSize: 12, color: "#707072", textAlign: "center", marginTop: 60 },
  logo: {
    width: "100%",
    height: 56,
  },
});
