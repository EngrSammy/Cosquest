import { Field } from "@/components/Field";
import { MOCK_USER } from "@/constants/mockUser";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function RowSelect({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      onPress={onPress}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        <Text style={styles.rowValue}>{value}</Text>
        <Ionicons name="chevron-forward" size={16} color="#9C9CAA" />
      </View>
    </Pressable>
  );
}

export default function EditProfile() {
  const insets = useSafeAreaInsets();
  const u = MOCK_USER;

  const [form, setForm] = useState({
    displayName: u.name,
    username: u.username,
    bio: u.bio.join(" · "),
    about: u.about,
  });

  const update = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function handleSave() {
    // TODO: PATCH /api/users/me with `form` once the backend is deployed.
    router.back();
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 8 }]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color="#191922" />
        </Pressable>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <Pressable onPress={handleSave} hitSlop={10}>
          <Text style={styles.save}>Save</Text>
        </Pressable>
      </View>

      {/* Avatar */}
      <View style={styles.avatarWrap}>
        <Image
          source={u.profileImage}
          style={styles.avatar}
          contentFit="cover"
        />
        <Pressable onPress={() => router.push("/onboarding/uploadPicture")}>
          <Text style={styles.changePhoto}>Change Profile Photo</Text>
        </Pressable>
      </View>

      {/* Fields */}
      <Field
        label="Display Name"
        value={form.displayName}
        onChangeText={(t) => update("displayName", t)}
        autoCapitalize="words"
      />
      <Field
        label="Username"
        value={form.username}
        onChangeText={(t) => update("username", t)}
        autoCapitalize="none"
      />
      <Field
        label="Bio"
        value={form.bio}
        onChangeText={(t) => update("bio", t)}
      />
      <Field
        label="About"
        value={form.about}
        onChangeText={(t) => update("about", t)}
        multiline
      />

      <Text style={styles.sectionLabel}>Profile Information</Text>
      <RowSelect
        label="Category"
        value="Digital creator"
        onPress={() => router.push("/category")}
      />
      <RowSelect
        label="Contact options"
        value="Email, Phone"
        onPress={() => router.push("/contact-options")}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingBottom: 60 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#191922" },
  save: { fontSize: 16, fontWeight: "700", color: "#C5399A" },

  avatarWrap: { alignItems: "center", marginTop: 8, marginBottom: 24 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#C5399A",
  },
  changePhoto: {
    fontSize: 13,
    fontWeight: "600",
    color: "#C5399A",
    marginTop: 10,
  },

  field: { marginBottom: 16 },
  label: { fontSize: 12, color: "#8A8A90", marginBottom: 6 },
  input: {
    backgroundColor: "rgba(120,120,140,0.14)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#191922",
  },
  inputMultiline: { minHeight: 96, paddingTop: 12 },

  sectionLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#37373a",
    marginBottom: 10,
    marginTop: 15,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: 12,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  rowLabel: { fontSize: 15, fontWeight: "600", color: "#191922" },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowValue: { fontSize: 14, color: "#888891" },
});
