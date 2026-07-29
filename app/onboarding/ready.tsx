import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

function SSOButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.sso, pressed && { opacity: 0.6 }]}
    >
      <Text style={styles.ssoLabel}>{label}</Text>
    </Pressable>
  );
}

export default function Welcome() {
  return (
    <View style={styles.screen}>
      <Text style={styles.headline}>
        One place for{"\n"}everything you love.
      </Text>
      <Text style={styles.sub}>
        CosQuest turns your city into a fandom playground — real-world quests,
        your people, one leaderboard. Let's get you set up.
      </Text>
      <View style={styles.buttons}>
        <SSOButton
          label="Continue with Google"
          onPress={() => router.push("/onboarding/createProfile")}
        />
        <SSOButton
          label="Continue with Apple"
          onPress={() => router.push("/onboarding/createProfile")}
        />
        <SSOButton
          label="Sign up with email"
          onPress={() => router.push("/onboarding/createProfile")}
        />
      </View>

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
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
    color: "#191922",
  },
  sub: {
    fontSize: 14,
    color: "#9C9CAA",
    textAlign: "center",
    marginTop: 12,
    lineHeight: 20,
  },
  buttons: { marginTop: 32, gap: 12 },
  sso: {
    borderWidth: 1,
    borderColor: "#ECECF2",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  ssoLabel: { fontSize: 15, fontWeight: "600", color: "#191922" },
  terms: { fontSize: 11, color: "#9C9CAA", textAlign: "center", marginTop: 16 },
});
