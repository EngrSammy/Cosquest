import { FONTS } from "@/constants/fonts";
import { getBlockedUsernames } from "@/services/publicProfile";
import { useAppSelector } from "@/store/hooks";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
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

type VisibilityOption = "Public" | "Friends" | "Private";

// Figma switch: pink when on, grey when off, white knob. Drawn by hand so it
// looks the same on phones and the website.
function PinkSwitch({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      hitSlop={8}
      style={[styles.switchTrack, value && styles.switchTrackOn]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}>
      <View style={[styles.switchKnob, value && styles.switchKnobOn]} />
    </Pressable>
  );
}

function PrivacyToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name="person" size={15} color={PINK} />
      </View>

      <Text style={styles.rowLabel}>{label}</Text>

      <PinkSwitch value={value} onChange={onChange} />
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

export default function PrivacyVisibility() {
  const insets = useSafeAreaInsets();

  const token = useAppSelector((state) => state.auth.token);

  const [visibility, setVisibility] = useState<VisibilityOption>("Friends");

  const [showOnlineStatus, setShowOnlineStatus] = useState(true);

  const [showActivityFeed, setShowActivityFeed] = useState(true);

  const [allowFriendRequests, setAllowFriendRequests] = useState(true);

  const [allowDirectMessages, setAllowDirectMessages] = useState(false);

  // Real list of people you've blocked (GET /api/users/me/blocked).
  const [blockedNames, setBlockedNames] = useState<string[]>([]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;

    getBlockedUsernames(token)
      .then((names) => {
        if (!cancelled) {
          setBlockedNames(Array.from(names));
        }
      })
      .catch(() => {
        // Keep 0 if it can't be loaded.
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const blockedUsersCount = blockedNames.length;

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
    if (!blockedUsersCount) {
      Alert.alert("Blocked Users", "You haven't blocked anyone.");
      return;
    }

    Alert.alert(
      "Blocked Users",
      `${blockedNames.map((name) => `@${name}`).join("\n")}\n\nTo unblock someone, open their profile (or your chat with them) and tap Unblock.`,
    );
  }

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/settings");
    }
  };

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
        {/* HEADER: a clear back arrow, then the Figma lock chip + title */}
        <View style={styles.header}>
          <Pressable
            onPress={goBack}
            hitSlop={10}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={24} color="#191922" />
          </Pressable>

          <View style={styles.headerCenter}>
            <View style={styles.headerIcon}>
              <Ionicons name="lock-closed-outline" size={16} color={PINK} />
            </View>

            <Text style={styles.headerTitle}>Privacy & Visibility</Text>
          </View>

          <View style={styles.backButton} />
        </View>

        {/* PROFILE VISIBILITY */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PROFILE VISIBILITY</Text>

          <VisibilitySelector
            value={visibility}
            onChange={handleVisibilityChange}
          />
        </View>

        {/* PREFERENCES */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PREFERENCES</Text>

          <PrivacyToggleRow
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
        </View>

        {/* BLOCKED LIST */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>BLOCKED LIST</Text>

          <Pressable
            onPress={handleBlockedUsers}
            style={({ pressed }) => [
              styles.row,
              styles.blockedRow,
              pressed && styles.pressed,
            ]}>
            <View style={styles.rowIcon}>
              <Ionicons name="person" size={15} color={PINK} />
            </View>

            <View style={styles.blockedTextContainer}>
              <Text style={styles.blockedTitle}>Blocked Users</Text>

              <Text style={styles.blockedSubtitle}>
                {blockedUsersCount}{" "}
                {blockedUsersCount === 1 ? "account" : "accounts"} blocked
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={16} color="#8A8A93" />
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

  headerIcon: {
    // Figma: 35 x 36, radius 100, padding 8, background #0000000A
    width: 35,
    height: 36,
    borderRadius: 100,
    padding: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0000000A",
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

  headerTitle: {
    fontFamily: FONTS.semibold,
    fontSize: 17,
    color: "#191922",
  },

  headerSpacer: {
    width: 35,
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

  // Milky pressed-in selector, with a pink pill for the chosen option.
  visibilitySelector: {
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    padding: 4,
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

  visibilityOption: {
    flex: 1,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },

  visibilityOptionSelected: {
    backgroundColor: PINK,
  },

  visibilityOptionText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: "#55555E",
  },

  visibilityOptionTextSelected: {
    color: "#FFFFFF",
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

  // Figma: 34 x 34, radius 100, padding 8 - a soft pink chip behind the icon.
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

  // Pink switch (Figma).
  switchTrack: {
    width: 40,
    height: 22,
    borderRadius: 11,
    padding: 2,
    justifyContent: "center",
    backgroundColor: "#D3D3D8",
  },

  switchTrackOn: {
    backgroundColor: PINK,
  },

  switchKnob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    alignSelf: "flex-start",

    shadowColor: "#000000",
    shadowOpacity: 0.15,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },

  switchKnobOn: {
    alignSelf: "flex-end",
  },

  blockedRow: {
    minHeight: 62,
  },

  blockedTextContainer: {
    flex: 1,
  },

  blockedTitle: {
    fontFamily: FONTS.regular,
    fontSize: 11.5,
    color: "#7A7A84",
  },

  blockedSubtitle: {
    fontFamily: FONTS.semibold,
    fontSize: 14,
    color: "#191922",
  },

  pressed: {
    opacity: 0.75,
  },
});
