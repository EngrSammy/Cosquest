import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import type { ImageSourcePropType, StyleProp, ViewStyle } from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function SelectableCard({
  label,
  image,
  selected,
  onPress,
  style,
}: {
  label: string;
  image: ImageSourcePropType;
  selected: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      style={[styles.card, selected && styles.cardSelected, style]}
      onPress={onPress}
    >
      <Image
        source={image}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
      />
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.75)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.tint}
      />
      <Text style={styles.label}>{label}</Text>
      {selected ? (
        <View style={styles.check}>
          <Text style={styles.checkTxt}>✓</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "47%",
    aspectRatio: 1,
    borderRadius: 25,
    overflow: "hidden",
    justifyContent: "flex-end",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  cardSelected: { borderColor: "#C5399A" },
  tint: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "40%",
  },
  label: { color: "#fff", fontWeight: "700", fontSize: 15, padding: 15 },
  check: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#C5399A",
    alignItems: "center",
    justifyContent: "center",
  },
  checkTxt: { color: "#fff", fontWeight: "900", fontSize: 14 },
});
