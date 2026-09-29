import { AppBackground } from "@/components/AppBackground";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchNotificationSettings,
  updateNotificationSettingsThunk,
} from "@/store/thunks/settingsThunks";
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

type NotificationSettings = {
  notificationsEnabled?: boolean;
  eventReminders?: boolean;
  questUpdates?: boolean;
  factionNews?: boolean;
  friendActivity?: boolean;
  rankChanges?: boolean;
  emailWeeklyNewsletter?: boolean;
  emailPromotionalEvents?: boolean;
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

  const token = useAppSelector((state) => state.auth.token);

  const notificationSettings = useAppSelector(
    (state) => state.settings.notifications,
  ) as NotificationSettings | null;

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const [eventReminders, setEventReminders] = useState(true);

  const [questUpdates, setQuestUpdates] = useState(true);

  const [factionNews, setFactionNews] = useState(false);

  const [friendActivity, setFriendActivity] = useState(true);

  const [rankChanges, setRankChanges] = useState(true);

  const [weeklyNewsletter, setWeeklyNewsletter] = useState(false);

  const [promotionalEvents, setPromotionalEvents] = useState(false);

  const [savingField, setSavingField] = useState<string | null>(null);

  /**
   * Load the real notification preferences
   * from the backend when the screen opens.
   */
  useEffect(() => {
    if (!token) {
      return;
    }

    dispatch(fetchNotificationSettings(token));
  }, [dispatch, token]);

  /**
   * Synchronize local UI state with the
   * notification settings returned by the backend.
   */
  useEffect(() => {
    if (!notificationSettings) {
      return;
    }

    if (typeof notificationSettings.notificationsEnabled === "boolean") {
      setNotificationsEnabled(notificationSettings.notificationsEnabled);
    }

    if (typeof notificationSettings.eventReminders === "boolean") {
      setEventReminders(notificationSettings.eventReminders);
    }

    if (typeof notificationSettings.questUpdates === "boolean") {
      setQuestUpdates(notificationSettings.questUpdates);
    }

    if (typeof notificationSettings.factionNews === "boolean") {
      setFactionNews(notificationSettings.factionNews);
    }

    if (typeof notificationSettings.friendActivity === "boolean") {
      setFriendActivity(notificationSettings.friendActivity);
    }

    if (typeof notificationSettings.rankChanges === "boolean") {
      setRankChanges(notificationSettings.rankChanges);
    }

    if (typeof notificationSettings.emailWeeklyNewsletter === "boolean") {
      setWeeklyNewsletter(notificationSettings.emailWeeklyNewsletter);
    }

    if (typeof notificationSettings.emailPromotionalEvents === "boolean") {
      setPromotionalEvents(notificationSettings.emailPromotionalEvents);
    }
  }, [notificationSettings]);

  /**
   * Generic backend update helper.
   *
   * The backend accepts partial updates, so changing
   * one switch only sends that setting.
   */
  async function updateNotificationSetting(
    field: keyof NotificationSettings,
    value: boolean,
    rollback: () => void,
  ) {
    if (!token) {
      rollback();

      Alert.alert(
        "Not Signed In",
        "Please sign in again before changing your notification preferences.",
      );

      return;
    }

    setSavingField(field);

    try {
      await dispatch(
        updateNotificationSettingsThunk({
          token,
          data: {
            [field]: value,
          },
        }),
      ).unwrap();

      /**
       * Refresh from the backend after saving.
       *
       * This ensures the UI represents what MongoDB
       * actually accepted.
       */
      await dispatch(fetchNotificationSettings(token)).unwrap();
    } catch (error) {
      console.error(`Failed to update notification setting ${field}:`, error);

      rollback();

      Alert.alert(
        "Unable to Save",
        error instanceof Error
          ? error.message
          : "We could not update your notification preference. Please try again.",
      );
    } finally {
      setSavingField(null);
    }
  }

  /**
   * Allow Push Notifications
   */
  async function handleNotificationsEnabled(value: boolean) {
    const previousValue = notificationsEnabled;

    setNotificationsEnabled(value);

    await updateNotificationSetting("notificationsEnabled", value, () =>
      setNotificationsEnabled(previousValue),
    );
  }

  /**
   * Event Reminders
   */
  async function handleEventReminders(value: boolean) {
    const previousValue = eventReminders;

    setEventReminders(value);

    await updateNotificationSetting("eventReminders", value, () =>
      setEventReminders(previousValue),
    );
  }

  /**
   * Quest Updates
   */
  async function handleQuestUpdates(value: boolean) {
    const previousValue = questUpdates;

    setQuestUpdates(value);

    await updateNotificationSetting("questUpdates", value, () =>
      setQuestUpdates(previousValue),
    );
  }

  /**
   * Faction News
   */
  async function handleFactionNews(value: boolean) {
    const previousValue = factionNews;

    setFactionNews(value);

    await updateNotificationSetting("factionNews", value, () =>
      setFactionNews(previousValue),
    );
  }

  /**
   * Friend Activity
   */
  async function handleFriendActivity(value: boolean) {
    const previousValue = friendActivity;

    setFriendActivity(value);

    await updateNotificationSetting("friendActivity", value, () =>
      setFriendActivity(previousValue),
    );
  }

  /**
   * Rank Changes
   */
  async function handleRankChanges(value: boolean) {
    const previousValue = rankChanges;

    setRankChanges(value);

    await updateNotificationSetting("rankChanges", value, () =>
      setRankChanges(previousValue),
    );
  }

  /**
   * Weekly Newsletter
   */
  async function handleWeeklyNewsletter(value: boolean) {
    const previousValue = weeklyNewsletter;

    setWeeklyNewsletter(value);

    await updateNotificationSetting("emailWeeklyNewsletter", value, () =>
      setWeeklyNewsletter(previousValue),
    );
  }

  /**
   * Promotional Events
   */
  async function handlePromotionalEvents(value: boolean) {
    const previousValue = promotionalEvents;

    setPromotionalEvents(value);

    await updateNotificationSetting("emailPromotionalEvents", value, () =>
      setPromotionalEvents(previousValue),
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

        <NotificationToggleRow
          icon="notifications"
          label="Allow Push Notifications"
          value={notificationsEnabled}
          onChange={handleNotificationsEnabled}
          disabled={savingField === "notificationsEnabled"}
        />

        <NotificationToggleRow
          icon="notifications-outline"
          label="Event Reminders"
          value={eventReminders}
          onChange={handleEventReminders}
          disabled={savingField === "eventReminders"}
          showIcon={false}
        />

        <NotificationToggleRow
          icon="notifications-outline"
          label="Quest Updates"
          value={questUpdates}
          onChange={handleQuestUpdates}
          disabled={savingField === "questUpdates"}
          showIcon={false}
        />

        <NotificationToggleRow
          icon="notifications-outline"
          label="Faction News"
          value={factionNews}
          onChange={handleFactionNews}
          disabled={savingField === "factionNews"}
          showIcon={false}
        />

        <NotificationToggleRow
          icon="notifications-outline"
          label="Friend Activity"
          value={friendActivity}
          onChange={handleFriendActivity}
          disabled={savingField === "friendActivity"}
          showIcon={false}
        />

        <NotificationToggleRow
          icon="notifications-outline"
          label="Rank Changes"
          value={rankChanges}
          onChange={handleRankChanges}
          disabled={savingField === "rankChanges"}
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
          onChange={handleWeeklyNewsletter}
          disabled={savingField === "emailWeeklyNewsletter"}
          showIcon={false}
        />

        <NotificationToggleRow
          icon="notifications"
          label="Promotional Events"
          value={promotionalEvents}
          onChange={handlePromotionalEvents}
          disabled={savingField === "emailPromotionalEvents"}
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
