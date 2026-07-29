import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ErrorText } from "./ErrorText";

type IconName = keyof typeof Ionicons.glyphMap;

export function Field({
  label,
  value,
  onChangeText,
  secureTextEntry,
  placeholder,
  keyboardType,
  leftIcon,
  textContentType,
  autoComplete,
  error,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "email-address";
  leftIcon?: IconName;
  textContentType?:
    | "none"
    | "username"
    | "password"
    | "newPassword"
    | "emailAddress";
  autoComplete?:
    | "off"
    | "email"
    | "password"
    | "new-password"
    | "current-password"
    | "username";
  error?: string;
}) {
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputRow,
          focused && styles.inputRowFocused,
          error ? styles.inputRowError : null,
        ]}
      >
        {leftIcon ? (
          <Ionicons name={leftIcon} size={18} color="#C5399A" />
        ) : null}
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry ? hidden : false}
          placeholderTextColor="#9C9CAA"
          autoCapitalize="none"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          textContentType={textContentType}
          autoComplete={autoComplete}
        />
        {secureTextEntry ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10}>
            <Ionicons
              name={hidden ? "eye-off-outline" : "eye-outline"}
              size={20}
              color="#616161"
            />
          </Pressable>
        ) : null}
      </View>
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#191922", marginBottom: 6 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.20)",
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: "rgba(187, 165, 165, 1)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#191922",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
  },
  inputRowError: { borderColor: "#E24D4D", borderWidth: 1 },
  inputRowFocused: { borderColor: "#C5399A", borderWidth: 1 },
  input: { flex: 1, fontSize: 15, color: "#191922" },
});
