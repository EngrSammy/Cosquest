import { AppBackground } from "@/components/AppBackground";
import { logout as logoutApi } from "@/services/auth";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { logout as logoutLocal } from "@/store/slices/authSlice";
import { clearUser } from "@/store/slices/userSlice";
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
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}>
      <Ionicons name={icon} size={20} color="#C5399A" />

      <Text style={styles.rowLabel}>{label}</Text>

      {value ? <Text style={styles.rowValue}>{value}</Text> : null}

      <Ionicons name="chevron-forward" size={16} color="#9C9CAA" />
    </Pressable>
  );
}

export default function Settings() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const token = useAppSelector((state) => state.auth.token);

  async function handleLogout() {
    try {
      if (token) {
        await logoutApi(token);
      }
    } catch (error) {
      console.log("LOGOUT API ERROR:", error);
    } finally {
      dispatch(logoutLocal());
      dispatch(clearUser());

      if (router.canDismiss()) {
        router.dismissAll();
      }

      router.replace("/onboarding/signin");
    }
  }

  return (
    <AppBackground variant="blueGradient">
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + 40,
          },
        ]}
        showsVerticalScrollIndicator={false}>
        {/* HEADER */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#191922" />
          </Pressable>

          <Text style={styles.headerTitle}>Settings</Text>

          <View style={styles.headerSpacer} />
        </View>

        {/* ACCOUNT SETTINGS */}
        <Text style={styles.sectionLabel}>ACCOUNT SETTINGS</Text>

        <SettingRow
          icon="person-outline"
          label="Account Information"
          onPress={() => router.push("/account-information")}
        />

        <SettingRow
          icon="lock-closed-outline"
          label="Privacy & Visibility"
          onPress={() => router.push("/privacy-visibility")}
        />

        <SettingRow
          icon="notifications-outline"
          label="Notification Preferences"
          onPress={() => router.push("/notification-preferences")}
        />

        {/* APP PREFERENCES */}
        <Text style={styles.sectionLabel}>APP PREFERENCES</Text>

        <SettingRow
          icon="eye-outline"
          label="Appearance"
          value="Light Mode"
          onPress={() => router.push("/appearance")}
        />

        <SettingRow
          icon="cellular-outline"
          label="Data Usage"
          onPress={() => router.push("/data-usage")}
        />

        <SettingRow
          icon="help-circle-outline"
          label="Help & Support"
          onPress={() => router.push("/help-support")}
        />

        {/* LOG OUT */}
        <Pressable
          style={({ pressed }) => [styles.logoutRow, pressed && styles.pressed]}
          onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#E24D4D" />

          <Text style={styles.logoutLabel}>Log Out</Text>
        </Pressable>
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },

  backButton: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "700",
    color: "#191922",
  },

  headerSpacer: {
    width: 24,
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
    shadowOffset: {
      width: 0,
      height: 5,
    },
    elevation: 4,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 15,
    marginBottom: 10,
  },

  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#191922",
  },

  rowValue: {
    fontSize: 13,
    color: "#9C9CAA",
  },

  logoutRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 0.2,
    borderColor: "rgba(255,255,255,0.6)",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    elevation: 4,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 15,
    marginTop: 30,
  },

  logoutLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#E24D4D",
  },

  pressed: {
    opacity: 0.7,
  },
});
