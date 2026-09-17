import { AppBackground } from "@/components/AppBackground";
import { Field } from "@/components/Field";
import { MOCK_USER } from "@/constants/mockUser";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type IconName = keyof typeof Ionicons.glyphMap;

// One contact line: left icon, the value, optional chevron when it's tappable.
function ContactRow({
  icon,
  value,
  chevron,
  onPress,
}: {
  icon: IconName;
  value: string;
  chevron?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={20} color="#C5399A" />
      <Text style={styles.value}>{value}</Text>
      {chevron ? (
        <Ionicons name="chevron-forward" size={16} color="#9C9CAA" />
      ) : null}
    </Pressable>
  );
}

export default function ContactOptions() {
  const insets = useSafeAreaInsets();
  const c = MOCK_USER.contact;

  // Controlled copy prefilled from the mock so the Fields hold + edit values.
  const [form, setForm] = useState({ email: c.email, phone: c.phone });
  const update = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function handleSave() {
    // TODO: PATCH /api/users/me contact fields (form) once the backend exists.
    router.back();
  }

  return (
    <AppBackground variant="blueGradient">
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 8 }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color="#191922" />
        </Pressable>
        <Text style={styles.headerTitle}>Contact options</Text>
        <Pressable onPress={handleSave} hitSlop={10}>
          <Text style={styles.save}>Save</Text>
        </Pressable>
      </View>

      {/* Rows */}
      <Field
        label="Email"
        leftIcon="mail-outline"
        value={form.email}
        onChangeText={(t) => update("email", t)}
        keyboardType="email-address"
        autoCapitalize="none"
        textContentType="emailAddress"
        autoComplete="email"
      />
      <Field
        label="Phone"
        leftIcon="call-outline"
        value={form.phone}
        onChangeText={(t) => update("phone", t)}
        keyboardType="numeric"
        autoCapitalize="none"
      />
      <ContactRow
        icon="location-outline"
        value={c.address}
        chevron
        onPress={() => {}}
      />
    </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 60 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#191922" },
  save: { fontSize: 16, fontWeight: "700", color: "#C5399A" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 15,
    marginBottom: 12,
  },
  value: { flex: 1, fontSize: 15, color: "#191922" },
});
