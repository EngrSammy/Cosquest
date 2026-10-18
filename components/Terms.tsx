import { router } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";

export function Terms() {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <Text style={styles.terms}>
      By continuing you agree to the{" "}
      <Text
        style={{ color: "#C5399A" }}
        onPress={() => router.push("/onboarding/oauthSignup")}
      >
        CosQuest terms
      </Text>{" "}
      & the{" "}
      <Text
        style={{ color: "#C5399A" }}
        onPress={() => router.push("/onboarding/oauthSignup")}
      >
        community guidelines
      </Text>
      .
    </Text>
  );
}

const STYLE_PAIR = themedStyles({
  terms: { fontSize: 12, color: "#707072", textAlign: "center", marginTop: 80 },
});
