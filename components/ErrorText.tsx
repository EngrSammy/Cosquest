import { StyleSheet, Text } from "react-native";

export function ErrorText({ children }: { children?: string }) {
  if (!children) return null;
  return <Text style={styles.text}>{children}</Text>;
}

const styles = StyleSheet.create({
  text: { color: "#E24D4D", fontSize: 12, marginTop: 5 },
});
