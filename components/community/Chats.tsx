import { StyleSheet, Text, View } from "react-native";

export function Chats() {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.text}>Chats — coming soon.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { paddingVertical: 60, alignItems: "center" },
  text: { color: "#9C9CAA", fontSize: 15 },
});
