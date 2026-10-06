import { PinkSwitch } from "@/components/ui/PinkSwitch";
import { FONTS } from "@/constants/fonts";
import {
  DEFAULT_PRIVACY,
  getPrivacy,
  updatePrivacy,
  type PrivacySettings,
} from "@/services/privacy";
import { getBlockedUsernames } from "@/services/publicProfile";
import { useAppSelector } from "@/store/hooks";
import { safeBack } from "@/utils/safeBack";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PINK = "#C34D9C";

type Visibility = PrivacySettings["profileVisibility"];
type ToggleKey = Exclude<keyof PrivacySettings, "profileVisibility">;

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "friends", label: "Friends" },
  { value: "private", label: "Private" },
];

const TOGGLES: { key: ToggleKey; label: string; hint?: string }[] = [
  { key: "showOnlineStatus", label: "Show Online Status" },
  { key: "showActivityFeed", label: "Show Activity Feed" },
  { key: "allowFriendRequests", label: "Allow Friend Requests" },
  { key: "allowDirectMessages", label: "Allow Direct Messages" },
  {
    key: "readReceipts",
    label: "Read Receipts",
    hint: "Off: people won't see when you've read their messages, and you won't see theirs.",
  },
];

function PrivacyToggleRow({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name="person" size={15} color={PINK} />
      </View>

      <View style={styles.rowTextWrap}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>

      <PinkSwitch value={value} onChange={onChange} disabled={disabled} />
    </View>
  );
}

export default function PrivacyVisibility() {
  const insets = useSafeAreaInsets();

  const token = useAppSelector((state) => state.auth.token);

  const [privacy, setPrivacy] = useState<PrivacySettings>(DEFAULT_PRIVACY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [blockedNames, setBlockedNames] = useState<string[]>([]);

  // Load the real settings and blocked list.
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    getPrivacy(token)
      .then((settings) => {
        if (!cancelled) setPrivacy(settings);
      })
      .catch(() => {
        // Keep the defaults shown.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    getBlockedUsernames(token)
      .then((names) => {
        if (!cancelled) setBlockedNames(Array.from(names));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [token]);

  // Saves one change straight away; puts it back if saving fails.
  async function save<K extends keyof PrivacySettings>(
    key: K,
    value: PrivacySettings[K],
  ) {
    if (!token) {
      return;
    }

    const previous = privacy[key];
    setPrivacy((current) => ({ ...current, [key]: value }));
    setSaving(key);

    try {
      const saved = await updatePrivacy(
        { [key]: value } as Partial<PrivacySettings>,
        token,
      );
      setPrivacy(saved);
    } catch (error) {
      setPrivacy((current) => ({ ...current, [key]: previous }));
      Alert.alert(
        "Couldn't save",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setSaving(null);
    }
  }

  function handleBlockedUsers() {
    if (!blockedNames.length) {
      Alert.alert("Blocked Users", "You haven't blocked anyone.");
      return;
    }

    Alert.alert(
      "Blocked Users",
      `${blockedNames.map((name) => `@${name}`).join("\n")}\n\nTo unblock someone, open their profile (or your chat with them) and tap Unblock.`,
    );
  }

  return (
    <View style={styles.screen}>
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
          { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 40 },
        ]}>
        {/* HEADER: back arrow, then the Figma lock chip + title */}
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
              <Ionicons name="lock-closed-outline" size={16} color={PINK} />
            </View>

            <Text style={styles.headerTitle}>Privacy & Visibility</Text>
          </View>

          <View style={styles.backButton}>
            {loading ? <ActivityIndicator size="small" color={PINK} /> : null}
          </View>
        </View>

        {/* PROFILE VISIBILITY */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PROFILE VISIBILITY</Text>

          <View style={styles.visibilitySelector}>
            {VISIBILITY_OPTIONS.map((option) => {
              const selected = privacy.profileVisibility === option.value;

              return (
                <Pressable
                  key={option.value}
                  disabled={loading || !!saving}
                  onPress={() => save("profileVisibility", option.value)}
                  style={[
                    styles.visibilityOption,
                    selected && styles.visibilityOptionSelected,
                  ]}>
                  <Text
                    style={[
                      styles.visibilityOptionText,
                      selected && styles.visibilityOptionTextSelected,
                    ]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* PREFERENCES */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PREFERENCES</Text>

          {TOGGLES.map((toggle) => (
            <PrivacyToggleRow
              key={toggle.key}
              label={toggle.label}
              hint={toggle.hint}
              value={privacy[toggle.key]}
              disabled={loading || saving === toggle.key}
              onChange={(value) => save(toggle.key, value)}
            />
          ))}
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

            <View style={styles.rowTextWrap}>
              <Text style={styles.blockedTitle}>Blocked Users</Text>

              <Text style={styles.blockedSubtitle}>
                {blockedNames.length}{" "}
                {blockedNames.length === 1 ? "account" : "accounts"} blocked
              </Text>
            </View>

            <Ionicons name="chevron-forward" size={16} color="#8A8A93" />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const MILKY = {
  borderRadius: 14,
  backgroundColor: "#0000000D",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.75)",
  shadowColor: "#000000",
  shadowOpacity: 0.09,
  shadowRadius: 4,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },

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

  headerTitle: { fontFamily: FONTS.semibold, fontSize: 17, color: "#191922" },

  section: { paddingTop: 18, gap: 12 },

  sectionLabel: {
    fontFamily: FONTS.medium,
    fontSize: 11,
    letterSpacing: 0.4,
    color: "#7A7A84",
  },

  visibilitySelector: {
    ...MILKY,
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    padding: 4,
  },

  visibilityOption: {
    flex: 1,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },

  visibilityOptionSelected: { backgroundColor: PINK },

  visibilityOptionText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: "#55555E",
  },

  visibilityOptionTextSelected: { color: "#FFFFFF" },

  row: {
    ...MILKY,
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
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

  rowTextWrap: { flex: 1, minWidth: 0 },

  rowLabel: { fontFamily: FONTS.regular, fontSize: 13.5, color: "#3B3B42" },

  rowHint: {
    marginTop: 2,
    fontFamily: FONTS.regular,
    fontSize: 11,
    lineHeight: 15,
    color: "#8A8A93",
  },

  blockedRow: { minHeight: 62 },

  blockedTitle: { fontFamily: FONTS.regular, fontSize: 11.5, color: "#7A7A84" },

  blockedSubtitle: {
    fontFamily: FONTS.semibold,
    fontSize: 14,
    color: "#191922",
  },

  pressed: { opacity: 0.75 },
});
