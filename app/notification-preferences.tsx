import { AppBackground } from "@/components/AppBackground";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchCurrentUser,
  saveNotificationPreference,
} from "@/store/thunks/userThunks";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type NotificationToggleRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  showIcon?: boolean;
};

function NotificationToggleRow({
  icon,
  label,
  value,
  onChange,
  disabled = false,
  showIcon = true,
}: NotificationToggleRowProps) {
  return (
    <View style={styles.notificationRow}>
      {showIcon ? (
        <View style={styles.rowIconContainer}>
          <Ionicons name={icon} size={17} color="#C5399A" />
        </View>
      ) : null}

      <Text style={styles.rowLabel}>{label}</Text>

      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{
          false: "#D4D4D8",
          true: "#D88CC0",
        }}
        thumbColor={value ? "#C5399A" : "#F4F4F5"}
        ios_backgroundColor="#D4D4D8"
      />
    </View>
  );
}

export default function NotificationPreferences() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const authUser = useAppSelector((state) => state.auth.user);
  const user = useAppSelector((state) => state.user.user);

  const email = authUser?.email || user?.email || "";

  // Real backend notification preference.
  const backendNotificationsEnabled =
    user?.preferences?.notificationsEnabled ?? true;

  const [notificationsEnabled, setNotificationsEnabled] = useState(
    backendNotificationsEnabled,
  );

  /*
   * These are shown in the Figma but are not currently
   * exposed as individual backend preferences.
   *
   * Keep them as UI state until the backend provides
   * separate preference fields/endpoints.
   */
  const [eventReminders, setEventReminders] = useState(true);
  const [questUpdates, setQuestUpdates] = useState(true);
  const [factionNews, setFactionNews] = useState(false);
  const [friendActivity, setFriendActivity] = useState(true);
  const [rankChanges, setRankChanges] = useState(true);

  const [weeklyNewsletter, setWeeklyNewsletter] = useState(false);
  const [promotionalEvents, setPromotionalEvents] = useState(false);

  const [saving, setSaving] = useState(false);

  // Load the latest backend notification preference.
  useEffect(() => {
    if (email) {
      dispatch(fetchCurrentUser(email));
    }
  }, [dispatch, email]);

  // Keep the main push switch synchronized with Redux.
  useEffect(() => {
    setNotificationsEnabled(backendNotificationsEnabled);
  }, [backendNotificationsEnabled]);

  async function handlePushNotificationToggle(value: boolean) {
    if (!email) {
      Alert.alert("Error", "Your account information could not be loaded.");
      return;
    }

    const previousValue = notificationsEnabled;

    setNotificationsEnabled(value);
    setSaving(true);

    try {
      await dispatch(
        saveNotificationPreference({
          email,
          notificationsEnabled: value,
        }),
      ).unwrap();

      await dispatch(fetchCurrentUser(email)).unwrap();
    } catch (error) {
      console.log("NOTIFICATION PREFERENCE ERROR:", error);

      setNotificationsEnabled(previousValue);

      Alert.alert(
        "Unable to Save",
        error instanceof Error
          ? error.message
          : "We could not update your notification preference. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleUnsupportedPreference(
    setter: (value: boolean) => void,
    value: boolean,
    feature: string,
  ) {
    setter(value);

    Alert.alert(
      "Backend Update Needed",
      `${feature} is available in the design, but the backend does not currently expose a separate preference endpoint for it.`,
    );
  }

  return (
    <AppBackground variant="blueGradient">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + 40,
          },
        ]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.backButton}>
            <Ionicons name="arrow-back" size={23} color="#191922" />
          </Pressable>

          <View style={styles.headerCenter}>
            {/* Grey notification icon container */}
            <View style={styles.headerIconContainer}>
              <Ionicons
                name="notifications-outline"
                size={16}
                color="#C5399A"
              />
            </View>

            <Text style={styles.headerTitle}>Notifications</Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        {/* PUSH NOTIFICATIONS */}
        <Text style={styles.sectionLabel}>PUSH NOTIFICATIONS</Text>

        {/* Main backend-connected notification preference */}
        <NotificationToggleRow
          icon="notifications"
          label="Allow Push Notifications"
          value={notificationsEnabled}
          onChange={handlePushNotificationToggle}
          disabled={saving}
        />

        <NotificationToggleRow
          icon="notifications-outline"
          label="Event Reminders"
          value={eventReminders}
          onChange={(value) =>
            handleUnsupportedPreference(
              setEventReminders,
              value,
              "Event Reminders",
            )
          }
          showIcon={false}
        />

        <NotificationToggleRow
          icon="notifications-outline"
          label="Quest Updates"
          value={questUpdates}
          onChange={(value) =>
            handleUnsupportedPreference(setQuestUpdates, value, "Quest Updates")
          }
          showIcon={false}
        />

        <NotificationToggleRow
          icon="notifications-outline"
          label="Faction News"
          value={factionNews}
          onChange={(value) =>
            handleUnsupportedPreference(setFactionNews, value, "Faction News")
          }
          showIcon={false}
        />

        <NotificationToggleRow
          icon="notifications-outline"
          label="Friend Activity"
          value={friendActivity}
          onChange={(value) =>
            handleUnsupportedPreference(
              setFriendActivity,
              value,
              "Friend Activity",
            )
          }
          showIcon={false}
        />

        <NotificationToggleRow
          icon="notifications-outline"
          label="Rank Changes"
          value={rankChanges}
          onChange={(value) =>
            handleUnsupportedPreference(setRankChanges, value, "Rank Changes")
          }
          showIcon={false}
        />

        {/* EMAIL NOTIFICATIONS */}
        <Text style={[styles.sectionLabel, styles.emailSectionLabel]}>
          EMAIL NOTIFICATIONS
        </Text>

        <NotificationToggleRow
          icon="notifications"
          label="Weekly Newsletter"
          value={weeklyNewsletter}
          onChange={(value) =>
            handleUnsupportedPreference(
              setWeeklyNewsletter,
              value,
              "Weekly Newsletter",
            )
          }
          showIcon={false}
        />

        <NotificationToggleRow
          icon="notifications"
          label="Promotional Events"
          value={promotionalEvents}
          onChange={(value) =>
            handleUnsupportedPreference(
              setPromotionalEvents,
              value,
              "Promotional Events",
            )
          }
          showIcon={false}
        />
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 18,
  },

  header: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
  },

  backButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },

  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },

  headerIconContainer: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F0F2",
    marginRight: 8,
  },

  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#191922",
  },

  headerSpacer: {
    width: 36,
  },

  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#8D8D98",
    letterSpacing: 0.5,
    marginBottom: 9,
    marginLeft: 2,
  },

  emailSectionLabel: {
    marginTop: 18,
  },

  notificationRow: {
    minHeight: 53,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
    paddingVertical: 9,
    marginBottom: 8,
    borderRadius: 12,

    backgroundColor: "rgba(255,255,255,0.48)",

    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.36)",

    shadowColor: "#8EB4C8",
    shadowOpacity: 0.13,
    shadowRadius: 7,
    shadowOffset: {
      width: 0,
      height: 4,
    },

    elevation: 3,
  },

  rowIconContainer: {
    width: 29,
    height: 29,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
    backgroundColor: "rgba(255,255,255,0.72)",
  },

  rowLabel: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: "600",
    color: "#5B5B67",
  },
});
