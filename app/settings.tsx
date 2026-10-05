import { FONTS } from "@/constants/fonts";
import { logout as logoutApi } from "@/services/auth";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { logout as logoutLocal } from "@/store/slices/authSlice";
import { clearUser } from "@/store/slices/userSlice";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { safeBack } from "@/utils/safeBack";

type IconName = keyof typeof Ionicons.glyphMap;

const PINK = "#C34D9C";
const RED = "#E24D4D";

// Figma row: icon, label, (value), then the ">" right AFTER the text.
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
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <Ionicons name={icon} size={20} color={PINK} />

      <Text style={styles.rowLabel}>{label}</Text>

      {value ? <Text style={styles.rowValue}>{value}</Text> : null}

      <Ionicons name="chevron-forward" size={16} color="#3B3B42" />
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

  const goBack = () => {
    if (router.canGoBack()) {
      safeBack();
    } else {
      router.replace("/profile");
    }
  };

  return (
    <View style={styles.screen}>
      {/* Figma background:
          linear-gradient(180deg, rgba(255,255,255,0.6) 4.59%,
                                  rgba(184,232,255,0.6) 67.7%) */}
      <LinearGradient
        colors={["rgba(255,255,255,0.6)", "rgba(184,232,255,0.6)"]}
        locations={[0.0459, 0.677]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 10,
            paddingBottom: insets.bottom + 40,
          },
        ]}
        showsVerticalScrollIndicator={false}>
        {/* HEADER */}
        <View style={styles.header}>
          <Pressable
            onPress={goBack}
            hitSlop={10}
            style={styles.headerSide}
            accessibilityRole="button"
            accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={24} color="#191922" />
          </Pressable>

          <Text style={styles.headerTitle}>Settings</Text>

          <View style={styles.headerSide} />
        </View>

        {/* ACCOUNT SETTINGS (Figma: padding 16 top / 20 sides, gap 12) */}
        <View style={styles.section}>
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
        </View>

        {/* APP PREFERENCES */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>APP PREFERENCES</Text>

          <SettingRow
            icon="eye-outline"
            label="Appearance"
            value="Light Mode"
            onPress={() => router.push("/appearance")}
          />

          {/* Figma: a database icon */}
          <SettingRow
            icon="server-outline"
            label="Data Usage"
            onPress={() => router.push("/data-usage")}
          />

          <SettingRow
            icon="help-circle-outline"
            label="Help & Support"
            onPress={() => router.push("/help-support")}
          />
        </View>

        {/* LOG OUT */}
        <View style={[styles.section, styles.logoutSection]}>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={handleLogout}
            accessibilityRole="button"
            accessibilityLabel="Log out">
            <Ionicons name="log-out-outline" size={21} color={RED} />

            <Text style={styles.logoutLabel}>Log Out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },

  scroll: {
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 8,
  },

  headerSide: {
    width: 40,
    height: 36,
    justifyContent: "center",
  },

  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: FONTS.semibold,
    fontSize: 20,
    color: "#000000",
  },

  // Figma: 402 wide, padding 16 top / 20 left and right, gap 12.
  section: {
    paddingTop: 16,
    paddingHorizontal: 20,
    gap: 12,
  },

  sectionLabel: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    letterSpacing: 0.3,
    color: "#7A7A84",
  },

  // Milky pressed-in row: #0000000D, radius 14, soft shadow, white rim.
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 46,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#0000000D",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.75)",

    shadowColor: "#000000",
    shadowOpacity: 0.09,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  rowLabel: {
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: "#191922",
  },

  rowValue: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: "#7A7A84",
  },

  logoutSection: {
    paddingTop: 30,
  },

  logoutLabel: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: RED,
  },

  pressed: {
    opacity: 0.7,
  },
});
