import { StyleSheet, Text, TextInput, View } from "react-native";

export function Field({
  label,
  value,
  onChangeText,
  secureTextEntry,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "email-address";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        placeholderTextColor="#9C9CAA"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#191922", marginBottom: 6 },
  input: {
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
});
