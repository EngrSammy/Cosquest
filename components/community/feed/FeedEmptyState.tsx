import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

export function FeedEmptyState() {
  return (
    <View style={styles.container}>
      <Ionicons name="newspaper-outline" size={44} color="#9C9CAA" />

      <Text style={styles.title}>No posts yet</Text>

      <Text style={styles.text}>
        Be the first to share something with the community.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 25,
  },

  title: {
    marginTop: 12,
    fontSize: 17,
    fontWeight: "700",
    color: "#37373A",
  },

  text: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: "#777780",
    textAlign: "center",
  },
});
