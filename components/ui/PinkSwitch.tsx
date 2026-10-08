// The Figma switch: pink when on, grey when off, white knob. Drawn by hand so
// it looks the same on phones and the website.
import { Pressable, StyleSheet, View } from "react-native";

export function PinkSwitch({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={() => !disabled && onChange(!value)}
      disabled={disabled}
      hitSlop={8}
      style={[styles.track, value && styles.trackOn, disabled && styles.disabled]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}>
      <View style={[styles.knob, value && styles.knobOn]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 44,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: "center",
    backgroundColor: "#D3D3D8",
  },
  trackOn: {
    backgroundColor: "#C34D9C",
  },
  knob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    alignSelf: "flex-start",
    shadowColor: "#000000",
    shadowOpacity: 0.15,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  knobOn: {
    alignSelf: "flex-end",
  },
  disabled: {
    opacity: 0.6,
  },
});
