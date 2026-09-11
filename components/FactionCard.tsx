import { Faction } from "@/constants/factions";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

type FactionCardProps = {
  faction: Faction;
  selected: boolean;
  onPress: () => void;
};

export function FactionCard({
  faction: f,
  selected,
  onPress,
}: FactionCardProps) {
  return (
    <Pressable
      style={[
        styles.wrapper,
        { backgroundColor: "transparent" },
        selected && styles.cardSelected,
        selected && { shadowColor: f.bgColour },
      ]}
      onPress={onPress}
    >
      <View style={[styles.inner, { backgroundColor: f.bgColour }]}>
        <View style={styles.left}>
          <Image source={f.label} style={styles.label} contentFit="contain" />
          <View style={styles.tint}>
            <Text style={styles.caption}>{f.caption}</Text>
          </View>
        </View>
      </View>
      <Image source={f.image} style={styles.image} contentFit="contain" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: 90,
    borderRadius: 12,
    shadowColor: "#191922",
    shadowOpacity: 0.13,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  inner: {
    flexDirection: "row",
    borderRadius: 12,
    height: 90,
    width: "100%",
    alignItems: "center",
    overflow: "hidden",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.6)",
  },
  left: {
    flex: 1,
    padding: 12,
  },
  label: { height: 40, width: 150 },
  tint: {
    alignSelf: "flex-start",
    padding: 5,
    backgroundColor: "rgba(195, 77, 156, 0.22)",
    borderTopRightRadius: 15,
    paddingHorizontal: 8,
    paddingVertical: 6,
    bottom: -13,
    left: -14,
  },
  caption: {
    color: "rgba(94, 72, 72, 1)",
    alignSelf: "center",
    fontWeight: "600",
    fontSize: 10,
  },
  image: {
    position: "absolute",
    width: 280,
    height: 105,
    right: -30,
    bottom: 1,
  },
  cardSelected: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 15,
    elevation: 12,
  },
});
