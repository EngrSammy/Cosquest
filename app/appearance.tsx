import { AppBackground } from "@/components/AppBackground";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
      ActivityIndicator,
      Pressable,
      ScrollView,
      StyleSheet,
      Switch,
      Text,
      View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
      fetchAppearanceSettings,
      updateAppearanceSettingsThunk,
} from "@/store/thunks/settingsThunks";

type ThemeMode = "Light" | "Dark" | "System";

type FontSize = "Small" | "Medium" | "Large";

type AccentColor = {
  name: string;
  value: string;
};

type BackendThemeMode = "light" | "dark" | "system";

type BackendFontSize = "small" | "medium" | "large";

type AppearanceSettings = {
  themeMode: BackendThemeMode;
  accentColor: string;
  fontSize: BackendFontSize;
  reduceMotion: boolean;
};

const ACCENT_COLORS: AccentColor[] = [
  {
    name: "Pink",
    value: "#C5399A",
  },
  {
    name: "Blue",
    value: "#29B6E8",
  },
  {
    name: "Green",
    value: "#45D56A",
  },
  {
    name: "Orange",
    value: "#FF9500",
  },
  {
    name: "Red",
    value: "#FF3B30",
  },
];

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

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
              style={[
                styles.accentColorOuter,
                selected && styles.accentColorSelected,
              ]}>
              <View
                style={[
                  styles.accentColor,
                  {
                    backgroundColor: color.value,
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

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

  const selectedIndex = sizes.indexOf(value);

  return (
    <View style={styles.fontCard}>
      <View style={styles.sliderTrack}>
        <View
          style={[
            styles.sliderProgress,
            {
              width:
                selectedIndex === 0
                  ? "16%"
                  : selectedIndex === 1
                    ? "50%"
                    : "86%",
            },
          ]}
        />

        <View
          style={[
            styles.sliderThumb,
            {
              left:
                selectedIndex === 0
                  ? "16%"
                  : selectedIndex === 1
                    ? "50%"
                    : "86%",
            },
          ]}
        />
      </View>

      <View style={styles.fontLabels}>
        {sizes.map((size) => (
          <Pressable
            key={size}
            onPress={() => !disabled && onChange(size)}
            disabled={disabled}
            hitSlop={8}>
            <Text
              style={[
                styles.fontLabel,
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

  /**
   * Convert backend theme value to the value
   * currently displayed by the UI.
   */
  const backendThemeToUI = (value?: BackendThemeMode): ThemeMode => {
    switch (value) {
      case "light":
        return "Light";
      case "dark":
        return "Dark";
      case "system":
      default:
        return "System";
    }
  };

  /**
   * Convert backend font size to the value
   * currently displayed by the UI.
   */
  const backendFontSizeToUI = (value?: BackendFontSize): FontSize => {
    switch (value) {
      case "small":
        return "Small";
      case "large":
        return "Large";
      case "medium":
      default:
        return "Medium";
    }
  };

  /**
   * Convert UI theme value to the exact
   * value expected by MongoDB/backend.
   */
  const uiThemeToBackend = (value: ThemeMode): BackendThemeMode => {
    switch (value) {
      case "Light":
        return "light";
      case "Dark":
        return "dark";
      case "System":
      default:
        return "system";
    }
  };

  /**
   * Convert UI font size to the exact
   * value expected by MongoDB/backend.
   */
  const uiFontSizeToBackend = (value: FontSize): BackendFontSize => {
    switch (value) {
      case "Small":
        return "small";
      case "Large":
        return "large";
      case "Medium":
      default:
        return "medium";
    }
  };

  /**
   * Load Appearance settings from MongoDB.
   */
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

  /**
   * Sync the screen with the settings returned
   * from the backend.
   */
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

  /**
   * Save a single Appearance setting.
   */
  const saveAppearanceSetting = async (
    field: keyof AppearanceSettings,
    value: string | boolean,
    previousValue: string | boolean,
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

      console.warn(`Appearance setting "${field}" was not saved.`, {
        attemptedValue: value,
        previousValue,
      });
    } finally {
      setSaving(false);
    }
  };

  /**
   * Theme change.
   */
  const handleThemeChange = (value: ThemeMode) => {
    const previousTheme = theme;

    const backendValue = uiThemeToBackend(value);

    saveAppearanceSetting(
      "themeMode",
      backendValue,
      uiThemeToBackend(previousTheme),
      () => {
        setTheme(value);
      },
      () => {
        setTheme(previousTheme);
      },
    );
  };

  /**
   * Accent color change.
   */
  const handleAccentColorChange = (value: string) => {
    const previousColor = accentColor;

    saveAppearanceSetting(
      "accentColor",
      value.toLowerCase(),
      previousColor.toLowerCase(),
      () => {
        setAccentColor(value);
      },
      () => {
        setAccentColor(previousColor);
      },
    );
  };

  /**
   * Font size change.
   */
  const handleFontSizeChange = (value: FontSize) => {
    const previousFontSize = fontSize;

    const backendValue = uiFontSizeToBackend(value);

    saveAppearanceSetting(
      "fontSize",
      backendValue,
      uiFontSizeToBackend(previousFontSize),
      () => {
        setFontSize(value);
      },
      () => {
        setFontSize(previousFontSize);
      },
    );
  };

  /**
   * Reduce Motion change.
   */
  const handleReduceMotionChange = (value: boolean) => {
    const previousValue = reduceMotion;

    saveAppearanceSetting(
      "reduceMotion",
      value,
      previousValue,
      () => {
        setReduceMotion(value);
      },
      () => {
        setReduceMotion(previousValue);
      },
    );
  };

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
              <Ionicons name="eye-outline" size={16} color="#C5399A" />
            </View>

            <Text style={styles.headerTitle}>Appearance</Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        {/* THEME MODE */}
        <SectionLabel>THEME MODE</SectionLabel>

        <ThemeSelector
          value={theme}
          onChange={handleThemeChange}
          disabled={loading || saving}
        />

        {/* ACCENT COLOR */}
        <SectionLabel>ACCENT COLOR</SectionLabel>

        <AccentColorSelector
          value={accentColor}
          onChange={handleAccentColorChange}
          disabled={loading || saving}
        />

        {/* FONT SIZE */}
        <SectionLabel>FONT SIZE</SectionLabel>

        <FontSizeSelector
          value={fontSize}
          onChange={handleFontSizeChange}
          disabled={loading || saving}
        />

        {/* ACCESSIBILITY */}
        <SectionLabel>ACCESSIBILITY</SectionLabel>

        <View style={styles.preferenceRow}>
          <View style={styles.preferenceIcon}>
            <Ionicons name="ellipse" size={14} color="#C5399A" />
          </View>

          <Text style={styles.preferenceLabel}>Reduce Motion</Text>

          <Switch
            value={reduceMotion}
            onValueChange={handleReduceMotionChange}
            disabled={loading || saving}
            trackColor={{
              false: "#D4D4D8",
              true: "#D88CC0",
            }}
            thumbColor={reduceMotion ? "#C5399A" : "#F4F4F5"}
            ios_backgroundColor="#D4D4D8"
          />
        </View>

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#C5399A" />
          </View>
        )}
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
    marginTop: 14,
    marginLeft: 2,
  },

  segmentContainer: {
    height: 44,
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

  segmentOption: {
    flex: 1,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },

  segmentOptionSelected: {
    backgroundColor: "#C5399A",
  },

  segmentText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6D6D78",
  },

  segmentTextSelected: {
    color: "#FFFFFF",
  },

  card: {
    minHeight: 55,
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: 11,
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

  accentColors: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
  },

  accentColorOuter: {
    width: 31,
    height: 31,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  accentColorSelected: {
    borderWidth: 2,
    borderColor: "#191922",
  },

  accentColor: {
    width: 27,
    height: 27,
    borderRadius: 14,
  },

  fontCard: {
    minHeight: 66,
    justifyContent: "center",
    paddingHorizontal: 12,
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

  sliderTrack: {
    height: 4,
    borderRadius: 3,
    backgroundColor: "#E1E1E5",
    position: "relative",
    marginHorizontal: 1,
  },

  sliderProgress: {
    height: 4,
    borderRadius: 3,
    backgroundColor: "#C5399A",
  },

  sliderThumb: {
    position: "absolute",
    top: -6,
    width: 16,
    height: 16,
    borderRadius: 8,
    marginLeft: -8,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "#C5399A",
  },

  fontLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },

  fontLabel: {
    fontSize: 11,
    color: "#777780",
  },

  fontLabelSelected: {
    fontWeight: "700",
    color: "#191922",
  },

  preferenceRow: {
    minHeight: 53,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
    paddingVertical: 9,
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

  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
});
