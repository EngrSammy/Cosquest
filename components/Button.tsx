import { Pressable, StyleSheet, Text } from "react-native";

type Variant = "light" | "dark" | "brand";

export function Button({
  label,
  onPress,
  variant = "light",
  prefix,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  prefix?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.sso,
        CONTAINER[variant],
        pressed && { opacity: 0.6 },
      ]}
    >
      {prefix ? <Text style={[styles.prefix]}>{prefix}</Text> : null}
      <Text style={[styles.ssoLabel, LABEL[variant]]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  buttons: { marginTop: 35, gap: 14 },
  sso: {
    flexDirection: "row", // so prefix + label sit in a row
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    borderRadius: 30,
    paddingVertical: 15,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
  ssoLight: { backgroundColor: "#FFFFFF" },
  ssoDark: { backgroundColor: "#191922" },
  ssoBrand: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.6)",
  },

  ssoLabel: { fontSize: 16, fontWeight: "700" },
  labelDark: { color: "#191922" },
  labelLight: { color: "#FFFFFF" },
  labelBrand: { color: "#C5399A" },
  prefix: { fontSize: 20, fontWeight: "800", color: "#4285F4" }, // Google blue
});

const CONTAINER: Record<Variant, object> = {
  light: styles.ssoLight,
  dark: styles.ssoDark,
  brand: styles.ssoBrand,
};
const LABEL: Record<Variant, object> = {
  light: styles.labelDark, // dark text on white
  dark: styles.labelLight, // white text on near-black
  brand: styles.labelBrand, // white text on magenta
};
