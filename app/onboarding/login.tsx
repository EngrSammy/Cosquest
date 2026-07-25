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

export default function Welcome() {
  return (
    <View style={styles.screen}>
      <Text style={styles.headline}>
        One Place for{"\n"}Everything you{"\n"}Love
      </Text>
      <Text style={styles.sub}>
        CosQuest turns your city into a fandom playground — real-world quests,
        your people, one leaderboard. Let's get you set up.
      </Text>
      <View style={styles.buttons}>
        <SSOButton
          label="Sign in with Google"
          prefix="G"
          onPress={() => router.push("/onboarding/profile")}
          variant="light"
        />

        <SSOButton
          label="Sign in with Apple"
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
        Don't have an account?{" "}
        <Text
          style={{ color: "#C5399A", fontWeight: "700" }}
          onPress={() => router.push("/onboarding")}
        >
          Sign-up
        </Text>
      </Text>

      <Text style={styles.terms}>
        By continuing you agree to the CosQuest terms & the community
        guidelines.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, justifyContent: "center" },
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
    marginTop: 12,
    lineHeight: 20,
  },

  buttons: { marginTop: 32, gap: 14 },
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
