import { StyleSheet, Text } from "react-native";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";

export function ErrorText({ children }: { children?: string }) {
  const styles = useThemedStyles(STYLE_PAIR);
  if (!children) return null;
  return <Text style={styles.text}>{children}</Text>;
}

const STYLE_PAIR = themedStyles({
  text: { color: "#E24D4D", fontSize: 12, marginTop: 5 },
});
