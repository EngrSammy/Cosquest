import { AppBackground } from "@/components/AppBackground";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
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

type VisibilityOption = "Public" | "Friends" | "Private";

type PrivacyToggleRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
};

function PrivacyToggleRow({
  icon,
  label,
  value,
  onChange,
  disabled = false,
}: PrivacyToggleRowProps) {
  return (
    <View style={styles.preferenceRow}>
      <View style={styles.preferenceIcon}>
        <Ionicons name={icon} size={17} color="#C5399A" />
      </View>

      <Text style={styles.preferenceLabel}>{label}</Text>

      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{
          false: "#D3D3D8",
          true: "#D88CC0",
        }}
        thumbColor={value ? "#C5399A" : "#F4F4F5"}
        ios_backgroundColor="#D3D3D8"
      />
    </View>
  );
}

function VisibilitySelector({
  value,
  onChange,
}: {
  value: VisibilityOption;
  onChange: (value: VisibilityOption) => void;
}) {
  const options: VisibilityOption[] = ["Public", "Friends", "Private"];

  return (
    <View style={styles.visibilitySelector}>
      {options.map((option) => {
        const selected = value === option;

        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            style={[
              styles.visibilityOption,
              selected && styles.visibilityOptionSelected,
            ]}>
            <Text
              style={[
                styles.visibilityOptionText,
                selected && styles.visibilityOptionTextSelected,
              ]}>
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function BlockedUsersRow({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.blockedCard, pressed && styles.pressed]}>
      <View style={styles.preferenceIcon}>
        <Ionicons name="lock-closed" size={17} color="#C5399A" />
      </View>

      <View style={styles.blockedTextContainer}>
        <Text style={styles.blockedTitle}>Blocked Users</Text>

        <Text style={styles.blockedSubtitle}>
          {count} {count === 1 ? "account" : "accounts"} blocked
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={17} color="#9999A3" />
    </Pressable>
  );
}

export default function PrivacyVisibility() {
  const insets = useSafeAreaInsets();

  const [visibility, setVisibility] = useState<VisibilityOption>("Friends");

  const [showOnlineStatus, setShowOnlineStatus] = useState(true);

  const [showActivityFeed, setShowActivityFeed] = useState(true);

  const [allowFriendRequests, setAllowFriendRequests] = useState(true);

  const [allowDirectMessages, setAllowDirectMessages] = useState(false);

  // Backend does not currently expose blocked-user count.
  const blockedUsersCount = 0;

  function handleVisibilityChange(value: VisibilityOption) {
    setVisibility(value);

    Alert.alert(
      "Coming Soon",
      "Profile visibility will be connected when the backend privacy endpoint is available.",
    );
  }

  function handlePrivacyToggle(
    setter: (value: boolean) => void,
    value: boolean,
    feature: string,
  ) {
    setter(value);

    Alert.alert(
      "Coming Soon",
      `${feature} will be connected when the backend privacy endpoint is available.`,
    );
  }

  function handleBlockedUsers() {
    Alert.alert(
      "Coming Soon",
      "Blocked users will be available when the backend blocked-users endpoint is added.",
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
            {/* Grey privacy icon container */}
            <View style={styles.privacyIconContainer}>
              <Ionicons name="lock-closed-outline" size={16} color="#C5399A" />
            </View>

            <Text style={styles.headerTitle}>Privacy & Visibility</Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        {/* PROFILE VISIBILITY */}
        <Text style={styles.sectionLabel}>PROFILE VISIBILITY</Text>

        <VisibilitySelector
          value={visibility}
          onChange={handleVisibilityChange}
        />

        {/* PREFERENCES */}
        <Text style={[styles.sectionLabel, styles.preferencesLabel]}>
          PREFERENCES
        </Text>

        <PrivacyToggleRow
          icon="lock-closed"
          label="Show Online Status"
          value={showOnlineStatus}
          onChange={(value) =>
            handlePrivacyToggle(
              setShowOnlineStatus,
              value,
              "Show Online Status",
            )
          }
        />

        <PrivacyToggleRow
          icon="lock-closed"
          label="Show Activity Feed"
          value={showActivityFeed}
          onChange={(value) =>
            handlePrivacyToggle(
              setShowActivityFeed,
              value,
              "Show Activity Feed",
            )
          }
        />

        <PrivacyToggleRow
          icon="lock-closed"
          label="Allow Friend Requests"
          value={allowFriendRequests}
          onChange={(value) =>
            handlePrivacyToggle(
              setAllowFriendRequests,
              value,
              "Allow Friend Requests",
            )
          }
        />

        <PrivacyToggleRow
          icon="lock-closed"
          label="Allow Direct Messages"
          value={allowDirectMessages}
          onChange={(value) =>
            handlePrivacyToggle(
              setAllowDirectMessages,
              value,
              "Allow Direct Messages",
            )
          }
        />

        {/* BLOCKED LIST */}
        <Text style={[styles.sectionLabel, styles.blockedSectionLabel]}>
          BLOCKED LIST
        </Text>

        <BlockedUsersRow
          count={blockedUsersCount}
          onPress={handleBlockedUsers}
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

  /* Grey container from the Figma design */
  privacyIconContainer: {
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

  preferencesLabel: {
    marginTop: 18,
  },

  blockedSectionLabel: {
    marginTop: 18,
  },

  visibilitySelector: {
    height: 43,
    flexDirection: "row",
    alignItems: "center",
    padding: 3,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.52)",

    shadowColor: "#8EB4C8",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 3,
    },

    elevation: 2,
  },

  visibilityOption: {
    flex: 1,
    height: 37,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },

  visibilityOptionSelected: {
    backgroundColor: "#C5399A",
  },

  visibilityOptionText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6D6D78",
  },

  visibilityOptionTextSelected: {
    color: "#FFFFFF",
  },

  preferenceRow: {
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

  preferenceIcon: {
    width: 29,
    height: 29,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
    backgroundColor: "rgba(255,255,255,0.72)",
  },

  preferenceLabel: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: "600",
    color: "#5B5B67",
  },

  blockedCard: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
    paddingVertical: 10,
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

  blockedTextContainer: {
    flex: 1,
  },

  blockedTitle: {
    fontSize: 11.5,
    color: "#85858F",
    marginBottom: 2,
  },

  blockedSubtitle: {
    fontSize: 12.5,
    fontWeight: "600",
    color: "#30303A",
  },

  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.995 }],
  },
});
