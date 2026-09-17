import { AppBackground } from "@/components/AppBackground";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type IconName = keyof typeof Ionicons.glyphMap;

function SettingRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: IconName;
  label: string;
  value?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      onPress={onPress}
    >
      <Ionicons name={icon} size={20} color="#C5399A" />
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      <Ionicons name="chevron-forward" size={16} color="#9C9CAA" />
    </Pressable>
  );
}

export default function Settings() {
  const insets = useSafeAreaInsets();

  function handleLogout() {
    // TODO: clear the auth token here first.
    // Collapse the whole stack to one screen, then swap it for sign-in, so
    // there's nothing behind to swipe/back into after logging out.
    if (router.canDismiss()) router.dismissAll();
    router.replace("/onboarding/signin");
  }

  return (
    <AppBackground variant="blueGradient">
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 8 }]}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color="#191922" />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Account settings */}
      <Text style={styles.sectionLabel}>ACCOUNT SETTINGS</Text>
      <SettingRow
        icon="person-outline"
        label="Account Information"
        onPress={() => {}}
      />
      <SettingRow
        icon="lock-closed-outline"
        label="Privacy & Visibility"
        onPress={() => {}}
      />
      <SettingRow
        icon="notifications-outline"
        label="Notification Preferences"
        onPress={() => {}}
      />

      {/* App preferences */}
      <Text style={styles.sectionLabel}>APP PREFERENCES</Text>
      <SettingRow
        icon="eye-outline"
        label="Appearance"
        value="Light Mode"
        onPress={() => {}}
      />
      <SettingRow
        icon="cellular-outline"
        label="Data Usage"
        onPress={() => {}}
      />
      <SettingRow
        icon="help-circle-outline"
        label="Help & Support"
        onPress={() => {}}
      />

      {/* Log out */}
      <Pressable
        style={({ pressed }) => [styles.logoutRow, pressed && { opacity: 0.7 }]}
        onPress={handleLogout}
      >
        <Ionicons name="log-out-outline" size={20} color="#E24D4D" />
        <Text style={styles.logoutLabel}>Log Out</Text>
      </Pressable>
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
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "700",
    color: "#191922",
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8A8A90",
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 0.2,
    borderColor: "rgba(255,255,255,0.6)",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 15,
    marginBottom: 10,
  },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: "600", color: "#191922" },
  rowValue: { fontSize: 13, color: "#9C9CAA" },

  logoutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 0.2,
    borderColor: "rgba(255,255,255,0.6)",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 15,
    marginTop: 30,
  },
  logoutLabel: { fontSize: 15, fontWeight: "700", color: "#E24D4D" },
});
