import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function ShareAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.action} onPress={onPress}>
      <View style={styles.icon}>
        <Ionicons name={icon} size={21} color="#FFFFFF" />
      </View>

      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: {
    width: "19%",
    alignItems: "center",
  },

  icon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#C5399A",
  },

  label: {
    marginTop: 6,
    fontSize: 9.5,
    lineHeight: 12,
    color: "#66666F",
    textAlign: "center",
  },
});
