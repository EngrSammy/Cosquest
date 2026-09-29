import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import {
      Animated,
      Easing,
      ImageSourcePropType,
      Pressable,
      StyleSheet,
      Text,
      View,
} from "react-native";

// Shared pieces for the ringing screen and the call screen, so both look
// like the Figma "Requesting" design: dark purple → teal background,
// glowing halo behind the avatar, teal/pink avatar ring, glass controls.

export const CALL_COLORS = {
  pink: "#C5399A",
  teal: "#3FD3E0",
  red: "#FF2D55",
  green: "#2FB36B",
  text: "#FFFFFF",
  muted: "rgba(255,255,255,0.72)",
  glass: "rgba(255,255,255,0.08)",
  glassBorder: "rgba(255,255,255,0.10)",
};

// ==========================================
// BACKGROUND
// ==========================================

export function CallBackground({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.background}>
      <LinearGradient
        colors={["#1B0714", "#2A1030", "#12303A"]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      {children}
    </View>
  );
}

// ==========================================
// LOGO
// ==========================================

export function CallLogo() {
  return (
    <ExpoImage
      source={require("@/assets/images/cosquest-logo.png")}
      style={styles.logo}
      contentFit="contain"
    />
  );
}

// ==========================================
// AVATAR WITH HALO
// ==========================================

export function CallAvatar({
  source,
  size = 136,
}: {
  source: ImageSourcePropType | { uri: string };
  size?: number;
}) {
  const halo = size * 1.85;

  return (
    <View style={[styles.avatarArea, { width: halo, height: halo }]}>
      {/* Soft glowing circles behind the avatar */}
      <View
        style={[
          styles.haloRing,
          {
            width: halo,
            height: halo,
            borderRadius: halo / 2,
            backgroundColor: "rgba(197,57,154,0.10)",
          },
        ]}
      />
      <View
        style={[
          styles.haloRing,
          {
            width: halo * 0.78,
            height: halo * 0.78,
            borderRadius: (halo * 0.78) / 2,
            backgroundColor: "rgba(160,120,220,0.10)",
          },
        ]}
      />

      <LinearGradient
        colors={[CALL_COLORS.teal, CALL_COLORS.pink]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: size + 8,
          height: size + 8,
          borderRadius: (size + 8) / 2,
          alignItems: "center",
          justifyContent: "center",
        }}>
        <ExpoImage
          source={source}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: "#2A1030",
          }}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      </LinearGradient>
    </View>
  );
}

// ==========================================
// "Requesting • • •" DOTS
// ==========================================

export function AnimatedDots() {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0.25))).current;

  useEffect(() => {
    const animations = dots.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 180),
          Animated.timing(dot, {
            toValue: 1,
            duration: 380,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.25,
            duration: 380,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.delay((2 - index) * 180),
        ]),
      ),
    );

    animations.forEach((animation) => animation.start());

    return () => animations.forEach((animation) => animation.stop());
  }, [dots]);

  return (
    <View style={styles.dots}>
      {dots.map((opacity, index) => (
        <Animated.View key={index} style={[styles.dot, { opacity }]} />
      ))}
    </View>
  );
}

// ==========================================
// ROUND CONTROL BUTTON (Mute / Speaker / Video ...)
// ==========================================

export function CallControl({
  icon,
  label,
  onPress,
  active,
  variant = "glass",
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
  // glass → Requesting/audio screen (active = pink ring)
  // solid → video bar (active = white circle, dark icon)
  variant?: "glass" | "solid";
  disabled?: boolean;
}) {
  const solidActive = variant === "solid" && active;
  const glassActive = variant === "glass" && active;

  return (
    <View style={[styles.controlItem, disabled && styles.disabled]}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: !!active, disabled: !!disabled }}
        style={[
          styles.control,
          glassActive && styles.controlGlassActive,
          solidActive && styles.controlSolidActive,
        ]}>
        <Ionicons
          name={icon}
          size={22}
          color={
            solidActive
              ? "#1B1B22"
              : glassActive
                ? CALL_COLORS.pink
                : CALL_COLORS.text
          }
        />
      </Pressable>

      <Text style={styles.controlLabel}>{label}</Text>
    </View>
  );
}

// ==========================================
// STYLES
// ==========================================

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: "#1B0714" },

  logo: { width: 132, height: 40 },

  avatarArea: { alignItems: "center", justifyContent: "center" },

  haloRing: { position: "absolute" },

  dots: { flexDirection: "row", alignItems: "center", gap: 4, marginLeft: 6 },

  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: CALL_COLORS.teal,
  },

  controlItem: { alignItems: "center", minWidth: 64 },

  disabled: { opacity: 0.4 },

  control: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: CALL_COLORS.glass,
    borderWidth: 1,
    borderColor: CALL_COLORS.glassBorder,
    alignItems: "center",
    justifyContent: "center",
  },

  controlGlassActive: {
    borderColor: CALL_COLORS.pink,
    borderWidth: 1.5,
    backgroundColor: "rgba(197,57,154,0.16)",
  },

  controlSolidActive: { backgroundColor: "#FFFFFF", borderColor: "#FFFFFF" },

  controlLabel: {
    color: CALL_COLORS.muted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8,
  },
});
