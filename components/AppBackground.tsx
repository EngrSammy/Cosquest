import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";

type Variant = "plain" | "gradient";

export function AppBackground({
  children,
  variant = "plain",
}: {
  children: React.ReactNode;
  variant?: Variant;
}) {
  return (
    <View style={styles.root}>
      <Image
        source={require("@/assets/images/map-texture.png")}
        style={[StyleSheet.absoluteFill, styles.map]}
        contentFit="cover"
      />
      {variant === "gradient" && (
        <LinearGradient
          colors={[
            "rgba(153,28,92,0.01)",
            "rgba(220,23,159,0.55)",
            "rgba(51,190,239,0.39)",
          ]}
          locations={[0, 0.62, 0.9]}
          style={StyleSheet.absoluteFill}
        />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  map: { opacity: 0.5 },
});
