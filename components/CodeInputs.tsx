import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export function CodeInput({
  value,
  onChangeText,
  length = 6,
}: {
  value: string;
  onChangeText: (t: string) => void;
  length?: number;
}) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  return (
    <Pressable style={styles.row} onPress={() => inputRef.current?.focus()}>
      {Array.from({ length }).map((_, i) => {
        const isActive = focused && i === value.length; // the next box to fill
        return (
          <View key={i} style={[styles.box, isActive && styles.boxActive]}>
            <Text style={styles.digit}>{value[i] ?? ""}</Text>
          </View>
        );
      })}

      {/* the real input — invisible, sits on top, captures everything */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(t) =>
          onChangeText(t.replace(/[^0-9]/g, "").slice(0, length))
        }
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.hiddenInput}
        caretHidden
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "center", gap: 10 },
  box: {
    width: 48,
    height: 56,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: "rgba(187, 165, 165, 1)",
    backgroundColor: "rgba(255,255,255,0.30)",
    alignItems: "center",
    justifyContent: "center",
  },
  boxActive: { borderColor: "#C5399A", borderWidth: 1 },
  digit: { fontSize: 22, fontWeight: "700", color: "#191922" },
  hiddenInput: { ...StyleSheet.absoluteFillObject, opacity: 0 },
});
