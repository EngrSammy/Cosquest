import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";

type Variant = "plain" | "gradient" | "blueGradient" | "blueMap";

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
  const isDark = useColorScheme() === "dark";

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: isDark ? "#101116" : "#FFFFFF" },
      ]}
    >
      {map ? (
        <Image
          source={map}
          style={[
            StyleSheet.absoluteFill,
            styles.map,
            { opacity: isDark ? 0.18 : 0.5 },
          ]}
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

      {variant === "blueGradient" ? (
        <LinearGradient
          colors={
            isDark
              ? ["rgba(16,17,22,0.78)", "rgba(25,35,52,0.88)"]
              : ["rgba(255,255,255,0.6)", "rgba(184,232,255,0.6)"]
          }
          locations={[0.0529, 0.7789]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}

      {isDark ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.darkOverlay]}
        />
      ) : null}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    flex: 1,
  },
  map: {},
  darkOverlay: {
    backgroundColor: "rgba(10,11,17,0.72)",
  },
});
