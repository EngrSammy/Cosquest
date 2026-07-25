import { AppBackground } from "@/components/AppBackground";
import { OnboardingProgress } from "@/components/OnboardingProgress";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Variant = "light" | "dark" | "brand";

function SSOButton({
  label,
  onPress,
  variant = "light",
  prefix,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  prefix?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.sso,
        CONTAINER[variant],
        pressed && { opacity: 0.6 },
      ]}
    >
      {prefix ? <Text style={[styles.prefix]}>{prefix}</Text> : null}
      <Text style={[styles.ssoLabel, LABEL[variant]]}>{label}</Text>
    </Pressable>
  );
}

export default function Authentication() {
  return (
    <AppBackground variant="gradient">
      <View style={styles.screen}>
        <OnboardingProgress step={2} total={6} />
        <View style={styles.body}>
          <Text style={styles.headline}>
            One Place for{"\n"}Everything you{"\n"}Love
          </Text>
          <Text style={styles.sub}>
            CosQuest turns your city into a fandom playground — real-world
            quests, your people, one leaderboard. Let's get you set up.
          </Text>
          <View style={styles.buttons}>
            <SSOButton
              label="Sign up with Google"
              prefix="G"
              onPress={() => router.push("/onboarding/profile")}
              variant="light"
            />

            <SSOButton
              label="Sign up with Apple"
              onPress={() => router.push("/onboarding/profile")}
              variant="dark"
            />

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <SSOButton
              label="Sign up with email"
              onPress={() => router.push("/onboarding/profile")}
              variant="brand"
            />
          </View>

          <Text style={styles.sub}>
            Already have an account?{" "}
            <Text
              style={{ color: "#C5399A", fontWeight: "700" }}
              onPress={() => router.push("/onboarding/login")}
            >
              Sign-in
            </Text>
          </Text>

          <Text style={styles.terms}>
            By continuing you agree to the{" "}
            <Text
              style={{ color: "#C5399A" }}
              onPress={() => router.push("/onboarding/login")}
            >
              CosQuest terms
            </Text>{" "}
            & the{" "}
            <Text
              style={{ color: "#C5399A" }}
              onPress={() => router.push("/onboarding/login")}
            >
              community guidelines
            </Text>
            .
          </Text>
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
    marginTop: 12,
    lineHeight: 20,
  },

  buttons: { marginTop: 35, gap: 14 },
  sso: {
    flexDirection: "row", // so prefix + label sit in a row
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    borderRadius: 30,
    paddingVertical: 15,
  },
  ssoLight: { backgroundColor: "#FFFFFF" },
  ssoDark: { backgroundColor: "#191922" },
  ssoBrand: { backgroundColor: "#C5399A" },

  ssoLabel: { fontSize: 15, fontWeight: "600" },
  labelDark: { color: "#191922" },
  labelLight: { color: "#FFFFFF" },
  prefix: { fontSize: 20, fontWeight: "800", color: "#4285F4" }, // Google blue

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

const CONTAINER: Record<Variant, object> = {
  light: styles.ssoLight,
  dark: styles.ssoDark,
  brand: styles.ssoBrand,
};
const LABEL: Record<Variant, object> = {
  light: styles.labelDark, // dark text on white
  dark: styles.labelLight, // white text on near-black
  brand: styles.labelLight, // white text on magenta
};
