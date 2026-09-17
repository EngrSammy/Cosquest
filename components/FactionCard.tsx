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
    <Pressable style={styles.wrapper} onPress={onPress}>
      {selected ? (
        <View
          style={[
            styles.glow,
            { backgroundColor: f.glowColour, shadowColor: f.glowColour },
          ]}
        />
      ) : null}
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
    backgroundColor: "transparent",
    position: "relative",
  },
  inner: {
    flexDirection: "row",
    borderRadius: 12,
    height: 90,
    width: "100%",
    alignItems: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
  },
  left: {
    flex: 1,
    padding: 10,
  },
  label: { height: 40, width: 140 },
  tint: {
    alignSelf: "flex-start",
    padding: 5,
    backgroundColor: "rgba(195, 77, 156, 1)",
    borderTopRightRadius: 15,
    paddingHorizontal: 8,
    paddingVertical: 6,
    bottom: -12,
    left: -10,
  },
  caption: {
    color: "rgba(94, 72, 72, 1)",
    alignSelf: "center",
    fontWeight: "600",
    fontSize: 13,
  },
  image: {
    position: "absolute",
    width: 180,
    height: 200,
    right: -10,
    bottom: -50,
  },
  glow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 12,
    shadowOpacity: 0.9,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
});
