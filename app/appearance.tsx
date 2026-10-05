import { PinkSwitch } from "@/components/ui/PinkSwitch";
import { FONTS } from "@/constants/fonts";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchAppearanceSettings,
  updateAppearanceSettingsThunk,
} from "@/store/thunks/settingsThunks";
import { safeBack } from "@/utils/safeBack";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PINK = "#C34D9C";

type ThemeMode = "Light" | "Dark" | "System";

type FontSize = "Small" | "Medium" | "Large";

type BackendThemeMode = "light" | "dark" | "system";

type BackendFontSize = "small" | "medium" | "large";

type AppearanceSettings = {
  themeMode: BackendThemeMode;
  accentColor: string;
  fontSize: BackendFontSize;
  reduceMotion: boolean;
};

const ACCENT_COLORS = [
  { name: "Pink", value: "#C5399A" },
  { name: "Blue", value: "#29B6E8" },
  { name: "Green", value: "#45D56A" },
  { name: "Orange", value: "#FF9500" },
  { name: "Red", value: "#FF3B30" },
];

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

function ThemeSelector({
  value,
  onChange,
  disabled,
}: {
  value: ThemeMode;
  onChange: (value: ThemeMode) => void;
  disabled?: boolean;
}) {
  const options: ThemeMode[] = ["Light", "Dark", "System"];

  return (
    <View style={styles.segmentContainer}>
      {options.map((option) => {
        const selected = value === option;

        return (
          <Pressable
            key={option}
            onPress={() => !disabled && onChange(option)}
            disabled={disabled}
            style={[
              styles.segmentOption,
              selected && styles.segmentOptionSelected,
            ]}>
            <Text
              style={[
                styles.segmentText,
                selected && styles.segmentTextSelected,
              ]}>
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function AccentColorSelector({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.accentColors}>
        {ACCENT_COLORS.map((color) => {
          const selected = value.toLowerCase() === color.value.toLowerCase();

          return (
            <Pressable
              key={color.name}
              onPress={() => !disabled && onChange(color.value)}
              disabled={disabled}
              accessibilityLabel={`${color.name} accent`}
              style={[
                styles.accentColorOuter,
                selected && styles.accentColorSelected,
              ]}>
              <View
                style={[styles.accentColor, { backgroundColor: color.value }]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// Figma: Small (small text) · Medium (bold) · Large (bigger text).
const FONT_LABEL_SIZE: Record<FontSize, number> = {
  Small: 11,
  Medium: 13.5,
  Large: 15.5,
};

function FontSizeSelector({
  value,
  onChange,
  disabled,
}: {
  value: FontSize;
  onChange: (value: FontSize) => void;
  disabled?: boolean;
}) {
  const sizes: FontSize[] = ["Small", "Medium", "Large"];

  const position = ["4%", "62%", "96%"][sizes.indexOf(value)] as `${number}%`;

  return (
    <View style={[styles.card, styles.fontCard]}>
      <View style={styles.sliderTrack}>
        <View style={[styles.sliderProgress, { width: position }]} />

        <View style={[styles.sliderThumb, { left: position }]} />
      </View>

      <View style={styles.fontLabels}>
        {sizes.map((size) => (
          <Pressable
            key={size}
            onPress={() => !disabled && onChange(size)}
            disabled={disabled}
            hitSlop={10}>
            <Text
              style={[
                styles.fontLabel,
                { fontSize: FONT_LABEL_SIZE[size] },
                value === size && styles.fontLabelSelected,
              ]}>
              {size}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function Appearance() {
  const insets = useSafeAreaInsets();

  const dispatch = useAppDispatch();

  const token = useAppSelector((state) => state.auth.token);
  const appearanceFromStore = useAppSelector(
    (state) => state.settings.appearance,
  );

  const [theme, setTheme] = useState<ThemeMode>("System");

  const [accentColor, setAccentColor] = useState("#CA4AA0");

  const [fontSize, setFontSize] = useState<FontSize>("Medium");

  const [reduceMotion, setReduceMotion] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const backendThemeToUI = (value?: BackendThemeMode): ThemeMode =>
    value === "light" ? "Light" : value === "dark" ? "Dark" : "System";

  const backendFontSizeToUI = (value?: BackendFontSize): FontSize =>
    value === "small" ? "Small" : value === "large" ? "Large" : "Medium";

  const uiThemeToBackend = (value: ThemeMode): BackendThemeMode =>
    value === "Light" ? "light" : value === "Dark" ? "dark" : "system";

  const uiFontSizeToBackend = (value: FontSize): BackendFontSize =>
    value === "Small" ? "small" : value === "Large" ? "large" : "medium";

  // Load the saved appearance settings.
  useEffect(() => {
    let mounted = true;

    const loadAppearance = async () => {
      if (!token) {
        if (mounted) {
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);

        await dispatch(fetchAppearanceSettings(token)).unwrap();
      } catch (error) {
        console.error("Failed to load appearance settings:", error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadAppearance();

    return () => {
      mounted = false;
    };
  }, [dispatch, token]);

  // Show what the backend returned.
  useEffect(() => {
    if (!appearanceFromStore) {
      return;
    }

    const appearance = appearanceFromStore as AppearanceSettings;

    setTheme(backendThemeToUI(appearance.themeMode));

    setAccentColor(appearance.accentColor || "#CA4AA0");

    setFontSize(backendFontSizeToUI(appearance.fontSize));

    setReduceMotion(Boolean(appearance.reduceMotion));
  }, [appearanceFromStore]);

  // Saves one setting; rolls back if the save fails.
  const saveAppearanceSetting = async (
    field: keyof AppearanceSettings,
    value: string | boolean,
    updateLocal: () => void,
    rollbackLocal: () => void,
  ) => {
    if (!token) {
      return;
    }

    try {
      updateLocal();
      setSaving(true);

      await dispatch(
        updateAppearanceSettingsThunk({
          token,
          data: {
            [field]: value,
          },
        }),
      ).unwrap();
    } catch (error) {
      console.error(`Failed to update appearance setting "${field}":`, error);

      rollbackLocal();
    } finally {
      setSaving(false);
    }
  };

  const handleThemeChange = (value: ThemeMode) => {
    const previous = theme;

    saveAppearanceSetting(
      "themeMode",
      uiThemeToBackend(value),
      () => setTheme(value),
      () => setTheme(previous),
    );
  };

  const handleAccentColorChange = (value: string) => {
    const previous = accentColor;

    saveAppearanceSetting(
      "accentColor",
      value.toLowerCase(),
      () => setAccentColor(value),
      () => setAccentColor(previous),
    );
  };

  const handleFontSizeChange = (value: FontSize) => {
    const previous = fontSize;

    saveAppearanceSetting(
      "fontSize",
      uiFontSizeToBackend(value),
      () => setFontSize(value),
      () => setFontSize(previous),
    );
  };

  const handleReduceMotionChange = (value: boolean) => {
    const previous = reduceMotion;

    saveAppearanceSetting(
      "reduceMotion",
      value,
      () => setReduceMotion(value),
      () => setReduceMotion(previous),
    );
  };

  const busy = loading || saving;

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
        {/* HEADER: back arrow, then the Figma eye chip + title */}
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
              <Ionicons name="eye-outline" size={16} color={PINK} />
            </View>

            <Text style={styles.headerTitle}>Appearance</Text>
          </View>

          <View style={styles.backButton} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>THEME MODE</Text>

          <ThemeSelector
            value={theme}
            onChange={handleThemeChange}
            disabled={busy}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACCENT COLOR</Text>

          <AccentColorSelector
            value={accentColor}
            onChange={handleAccentColorChange}
            disabled={busy}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>FONT SIZE</Text>

          <FontSizeSelector
            value={fontSize}
            onChange={handleFontSizeChange}
            disabled={busy}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACCESSIBILITY</Text>

          <View style={styles.row}>
            <View style={styles.rowIcon}>
              <Ionicons name="ellipse" size={13} color={PINK} />
            </View>

            <Text style={styles.rowLabel}>Reduce Motion</Text>

            <PinkSwitch
              value={reduceMotion}
              onChange={handleReduceMotionChange}
              disabled={busy}
            />
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={PINK} />
          </View>
        ) : null}
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

  // Milky selector with a pink pill.
  segmentContainer: {
    ...MILKY,
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    padding: 4,
  },

  segmentOption: {
    flex: 1,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },

  segmentOptionSelected: {
    backgroundColor: PINK,
  },

  segmentText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: "#55555E",
  },

  segmentTextSelected: {
    color: "#FFFFFF",
  },

  card: {
    ...MILKY,
    minHeight: 58,
    justifyContent: "center",
    paddingHorizontal: 14,
  },

  accentColors: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },

  accentColorOuter: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },

  // Dark ring around the chosen colour (Figma).
  accentColorSelected: {
    borderWidth: 2,
    borderColor: "#191922",
  },

  accentColor: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },

  fontCard: {
    minHeight: 72,
    paddingVertical: 14,
  },

  sliderTrack: {
    height: 4,
    borderRadius: 3,
    backgroundColor: "rgba(195,77,156,0.15)",
    position: "relative",
  },

  sliderProgress: {
    height: 4,
    borderRadius: 3,
    backgroundColor: PINK,
  },

  sliderThumb: {
    position: "absolute",
    top: -7,
    width: 18,
    height: 18,
    borderRadius: 9,
    marginLeft: -9,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: PINK,
  },

  fontLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 12,
  },

  fontLabel: {
    fontFamily: FONTS.regular,
    color: "#6B6B72",
  },

  fontLabelSelected: {
    fontFamily: FONTS.semibold,
    color: "#191922",
  },

  // Milky row.
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

  rowLabel: {
    flex: 1,
    fontFamily: FONTS.regular,
    fontSize: 13.5,
    color: "#3B3B42",
  },

  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
});
