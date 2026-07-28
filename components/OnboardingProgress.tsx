import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function OnboardingProgress({
  step,
  total,
}: {
  step: number;
  total: number;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.row, { paddingTop: insets.top + 8 }]}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[styles.segment, i < step ? styles.filled : styles.empty]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 4, paddingHorizontal: 24 },
  segment: { flex: 1, height: 6, borderRadius: 5 },
  filled: { backgroundColor: "#C5399A" },
  empty: { backgroundColor: "#cccccc" },
});
