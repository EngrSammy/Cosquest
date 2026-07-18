import { StyleSheet, Text, View } from "react-native";

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
});
