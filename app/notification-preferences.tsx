import { PinkSwitch } from "@/components/ui/PinkSwitch";
import { FONTS } from "@/constants/fonts";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchNotificationSettings,
  updateNotificationSettingsThunk,
} from "@/store/thunks/settingsThunks";
import { safeBack } from "@/utils/safeBack";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PINK = "#C34D9C";

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

// Figma row: milky card; main rows have a pink bell on a soft pink chip,
// the push sub-options are indented and have no icon.
function NotificationToggleRow({
  label,
  value,
  onChange,
  disabled = false,
  showIcon = true,
  indented = false,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  showIcon?: boolean;
  indented?: boolean;
}) {
  return (
    <View style={[styles.row, indented && styles.rowIndented]}>
      {showIcon ? (
        <View style={styles.rowIcon}>
          <Ionicons name="notifications" size={15} color={PINK} />
        </View>
      ) : null}

      <Text style={styles.rowLabel}>{label}</Text>

      <PinkSwitch value={value} onChange={onChange} disabled={disabled} />
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

  // Load the real notification preferences when the screen opens.
  useEffect(() => {
    if (!token) {
      return;
    }

    dispatch(fetchNotificationSettings(token));
  }, [dispatch, token]);

  // Keep the switches in sync with what the backend returned.
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

  // Saves one switch (the backend accepts partial updates).
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

  // One handler for every switch: update now, roll back if saving fails.
  function toggle(
    field: keyof NotificationSettings,
    current: boolean,
    setter: (value: boolean) => void,
  ) {
    return async (value: boolean) => {
      setter(value);

      await updateNotificationSetting(field, value, () => setter(current));
    };
  }

  return (
    <View style={styles.screen}>
      {/* Figma: linear-gradient(180deg, #FFFFFF 0%, #E1F3FF 64.42%) */}
      <LinearGradient
        colors={["#FFFFFF", "#E1F3FF"]}
        locations={[0, 0.6442]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 10,
            paddingBottom: insets.bottom + 40,
          },
        ]}>
        {/* HEADER: back arrow, then the Figma bell chip + title */}
        <View style={styles.header}>
          <Pressable
            onPress={() => safeBack("/settings")}
            hitSlop={10}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={24} color="#191922" />
          </Pressable>

          <View style={styles.headerCenter}>
            <View style={styles.headerIcon}>
              <Ionicons name="notifications-outline" size={16} color={PINK} />
            </View>

            <Text style={styles.headerTitle}>Notifications</Text>
          </View>

          <View style={styles.backButton} />
        </View>

        {/* PUSH NOTIFICATIONS */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PUSH NOTIFICATIONS</Text>

          <NotificationToggleRow
            label="Allow Push Notifications"
            value={notificationsEnabled}
            onChange={toggle(
              "notificationsEnabled",
              notificationsEnabled,
              setNotificationsEnabled,
            )}
            disabled={savingField === "notificationsEnabled"}
          />

          <NotificationToggleRow
            label="Event Reminders"
            value={eventReminders}
            onChange={toggle(
              "eventReminders",
              eventReminders,
              setEventReminders,
            )}
            disabled={savingField === "eventReminders"}
            showIcon={false}
            indented
          />

          <NotificationToggleRow
            label="Quest Updates"
            value={questUpdates}
            onChange={toggle("questUpdates", questUpdates, setQuestUpdates)}
            disabled={savingField === "questUpdates"}
            showIcon={false}
            indented
          />

          <NotificationToggleRow
            label="Faction News"
            value={factionNews}
            onChange={toggle("factionNews", factionNews, setFactionNews)}
            disabled={savingField === "factionNews"}
            showIcon={false}
            indented
          />

          <NotificationToggleRow
            label="Friend Activity"
            value={friendActivity}
            onChange={toggle(
              "friendActivity",
              friendActivity,
              setFriendActivity,
            )}
            disabled={savingField === "friendActivity"}
            showIcon={false}
            indented
          />

          <NotificationToggleRow
            label="Rank Changes"
            value={rankChanges}
            onChange={toggle("rankChanges", rankChanges, setRankChanges)}
            disabled={savingField === "rankChanges"}
            showIcon={false}
            indented
          />
        </View>

        {/* EMAIL NOTIFICATIONS */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>EMAIL NOTIFICATIONS</Text>

          <NotificationToggleRow
            label="Weekly Newsletter"
            value={weeklyNewsletter}
            onChange={toggle(
              "emailWeeklyNewsletter",
              weeklyNewsletter,
              setWeeklyNewsletter,
            )}
            disabled={savingField === "emailWeeklyNewsletter"}
          />

          <NotificationToggleRow
            label="Promotional Events"
            value={promotionalEvents}
            onChange={toggle(
              "emailPromotionalEvents",
              promotionalEvents,
              setPromotionalEvents,
            )}
            disabled={savingField === "emailPromotionalEvents"}
          />
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
    paddingHorizontal: 20,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },

  header: {
    height: 50,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },

  backButton: {
    width: 36,
    height: 36,
    alignItems: "flex-start",
    justifyContent: "center",
  },

  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  // Figma: 35 x 36, radius 100, padding 8, background #0000000A
  headerIcon: {
    width: 35,
    height: 36,
    borderRadius: 100,
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0000000A",
  },

  headerTitle: {
    fontFamily: FONTS.semibold,
    fontSize: 17,
    color: "#191922",
  },

  section: {
    paddingTop: 18,
    gap: 12,
  },

  sectionLabel: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    letterSpacing: 0.4,
    color: "#7A7A84",
  },

  // Milky pressed-in row.
  row: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
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

  // Push sub-options sit a little in (Figma).
  rowIndented: {
    marginLeft: 16,
  },

  // Figma: 34 x 34, radius 100, padding 8, soft pink.
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 100,
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(195,77,156,0.12)",
  },

  rowLabel: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 13.5,
    color: "#3B3B42",
  },
});
