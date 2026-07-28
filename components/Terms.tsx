import { router } from "expo-router";
import { StyleSheet, Text } from "react-native";

export function Terms() {
  return (
    <Text style={styles.terms}>
      By continuing you agree to the{" "}
      <Text
        style={{ color: "#C5399A" }}
        onPress={() => router.push("/onboarding/authSignup")}
      >
        CosQuest terms
      </Text>{" "}
      & the{" "}
      <Text
        style={{ color: "#C5399A" }}
        onPress={() => router.push("/onboarding/authSignup")}
      >
        community guidelines
      </Text>
      .
    </Text>
  );
}

const styles = StyleSheet.create({
  terms: { fontSize: 12, color: "#707072", textAlign: "center", marginTop: 80 },
});
