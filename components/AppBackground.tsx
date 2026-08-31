import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
type Variant = "plain" | "gradient" | "blueGradient" | "blueMap";

// Which map image each variant shows behind the content (null = no map).
const MAP_SOURCES = {
  plain: require("@/assets/images/map-texture.png"),
  gradient: require("@/assets/images/map-texture.png"),
  blueMap: require("@/assets/images/blue-map-texture.png"),
  blueGradient: null,
} as const;

export function AppBackground({
  children,
  variant = "plain",
}: {
  children: React.ReactNode;
  variant?: Variant;
}) {
  const map = MAP_SOURCES[variant];

  return (
    <View style={styles.root}>
      {map ? (
        <Image
          source={map}
          style={[StyleSheet.absoluteFill, styles.map]}
          contentFit="cover"
        />
      ) : null}

      {variant === "gradient" ? (
        <LinearGradient
          colors={[
            "rgba(153,28,92,0.01)",
            "rgba(220,23,159,0.55)",
            "rgba(51,190,239,0.39)",
          ]}
          locations={[0, 0.62, 0.9]}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {/* blueMap: translucent blue over the street-map image so the map shows through */}
      {variant === "blueMap" ? (
        <LinearGradient
          colors={[
            "rgba(227,240,255,0.15)",
            "rgba(90,143,224,0.45)",
            "rgba(59,130,246,0.35)",
          ]}
          locations={[0, 0.62, 0.9]}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {/* blueGradient: a clean blue gradient, no map */}
      {variant === "blueGradient" ? (
        <LinearGradient
          colors={[
            "rgba(227,240,255,0.15)",
            "rgba(90,143,224,0.45)",
            "rgba(59,130,246,0.35)",
          ]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
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
