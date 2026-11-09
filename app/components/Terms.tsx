import { router } from "expo-router";
import { FONTS } from "@/constants/fonts";
import { StyleSheet, Text } from "react-native";
import { C } from "@/theme/tokens";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";

export function Terms() {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <Text style={styles.terms}>
      By continuing you agree to the{" "}
      <Text
        style={{ color: C.brand }}
        onPress={() => router.push("/legal/terms")}
        accessibilityRole="link"
      >
        CosQuest terms
      </Text>{" "}
      & the{" "}
      <Text
        style={{ color: C.brand }}
        onPress={() => router.push("/legal/guidelines")}
        accessibilityRole="link"
      >
        community guidelines
      </Text>
      .
    </Text>
  );
}

const STYLE_PAIR = themedStyles({
  terms: { fontFamily: FONTS.regular, fontSize: 12, color: "#707072", textAlign: "center", marginTop: 80 },
});
