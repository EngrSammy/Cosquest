import { PinkSwitch } from "@/components/ui/PinkSwitch";
import { FONTS } from "@/constants/fonts";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchDataUsageSettings,
  updateDataUsageSettingsThunk,
} from "@/store/thunks/settingsThunks";
import { safeBack } from "@/utils/safeBack";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PINK = "#C34D9C";

type ImageQuality = "low" | "medium" | "high" | "auto";

const QUALITY_OPTIONS: { value: ImageQuality; label: string; hint: string }[] =
  [
    { value: "low", label: "Low", hint: "Uses the least data" },
    { value: "medium", label: "Medium", hint: "A good balance" },
    { value: "high", label: "High", hint: "Sharpest pictures" },
    { value: "auto", label: "Auto", hint: "Depends on your connection" },
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

function RowIcon({ name }: { name: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.rowIcon}>
      <Ionicons name={name} size={15} color={PINK} />
    </View>
  );
}

function DownloadRow({
  icon,
  label,
  value,
  onChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <RowIcon name={icon} />

      <Text style={[styles.rowLabel, styles.rowLabelFlex]}>{label}</Text>

      <PinkSwitch value={value} onChange={onChange} />
    </View>
  );
}

// 1024 -> "1 KB", 1073741824 -> "1 GB"
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];

  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );

  const value = bytes / Math.pow(1024, index);

  if (index === 0 || value >= 100) {
    return `${Math.round(value)} ${units[index]}`;
  }

  if (value >= 10) {
    return `${value.toFixed(1)} ${units[index]}`;
  }

  return `${value.toFixed(2)} ${units[index]}`;
}

// The real size of everything in the app's cache folder.
async function calculateCacheSize(uri: string): Promise<number> {
  let totalSize = 0;

  try {
    const entries = await FileSystem.readDirectoryAsync(uri);

    for (const entry of entries) {
      const childUri = `${uri}${entry}`;

      try {
        const info = await FileSystem.getInfoAsync(childUri);

        if (!info.exists) {
          continue;
        }

        if (info.isDirectory) {
          totalSize += await calculateCacheSize(
            childUri.endsWith("/") ? childUri : `${childUri}/`,
          );
        } else {
          totalSize += info.size ?? 0;
        }
      } catch {
        // A cache entry disappeared while scanning.
      }
    }
  } catch {
    // Cache folder unavailable or empty.
  }

  return totalSize;
}

// Deletes what's inside the cache folder (the folder itself stays).
async function clearApplicationCache(uri: string): Promise<void> {
  const entries = await FileSystem.readDirectoryAsync(uri);

  for (const entry of entries) {
    try {
      await FileSystem.deleteAsync(`${uri}${entry}`, {
        idempotent: true,
      });
    } catch {
      // Keep clearing the rest.
    }
  }
}

export default function DataUsage() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const token = useAppSelector((state) => state.auth.token);
  const dataUsage = useAppSelector((state) => state.settings.dataUsage);

  const [wifiOnly, setWifiOnly] = useState(true);
  const [autoPlayVideos, setAutoPlayVideos] = useState(true);
  const [imageQuality, setImageQuality] = useState<ImageQuality>("high");
  const [qualitySheet, setQualitySheet] = useState(false);

  const [cacheBytes, setCacheBytes] = useState(0);
  const [totalStorageBytes, setTotalStorageBytes] = useState(0);
  const [usedStorageBytes, setUsedStorageBytes] = useState(0);

  const [storageLoading, setStorageLoading] = useState(true);
  const [cacheClearing, setCacheClearing] = useState(false);

  const isWeb = Platform.OS === "web";

  // Load the saved Data Usage settings.
  useEffect(() => {
    if (!token) {
      return;
    }

    dispatch(fetchDataUsageSettings(token));
  }, [dispatch, token]);

  // Show what the backend returned.
  useEffect(() => {
    if (!dataUsage) {
      return;
    }

    if (typeof dataUsage.downloadOverWifiOnly === "boolean") {
      setWifiOnly(dataUsage.downloadOverWifiOnly);
    }

    if (typeof dataUsage.autoPlayVideos === "boolean") {
      setAutoPlayVideos(dataUsage.autoPlayVideos);
    }

    if (
      dataUsage.imageQuality === "low" ||
      dataUsage.imageQuality === "medium" ||
      dataUsage.imageQuality === "high" ||
      dataUsage.imageQuality === "auto"
    ) {
      setImageQuality(dataUsage.imageQuality);
    }
  }, [dataUsage]);

  // The phone's real storage and the app's real cache size.
  const loadDeviceStorage = useCallback(async () => {
    try {
      setStorageLoading(true);

      // Browsers can't read device storage - only phones can.
      if (Platform.OS === "web") {
        return;
      }

      const [totalDiskCapacity, freeDiskStorage] = await Promise.all([
        FileSystem.getTotalDiskCapacityAsync(),
        FileSystem.getFreeDiskStorageAsync(),
      ]);

      setTotalStorageBytes(totalDiskCapacity);
      setUsedStorageBytes(Math.max(totalDiskCapacity - freeDiskStorage, 0));

      const cacheDirectory = FileSystem.cacheDirectory;

      setCacheBytes(
        cacheDirectory ? await calculateCacheSize(cacheDirectory) : 0,
      );
    } catch (error) {
      console.error("Failed to load device storage:", error);
    } finally {
      setStorageLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDeviceStorage();
  }, [loadDeviceStorage]);

  // Saves one setting; rolls back (with a message) if it fails.
  async function saveSetting(
    data: Record<string, unknown>,
    rollback: () => void,
    failMessage: string,
  ) {
    if (!token) {
      rollback();
      Alert.alert(
        "Not Signed In",
        "Please sign in again before changing this setting.",
      );
      return;
    }

    try {
      await dispatch(updateDataUsageSettingsThunk({ token, data })).unwrap();
    } catch (error) {
      console.error("Failed to update data usage setting:", error);
      rollback();
      Alert.alert("Update Failed", failMessage);
    }
  }

  function handleWifiOnlyChange(value: boolean) {
    const previous = wifiOnly;
    setWifiOnly(value);

    void saveSetting(
      { downloadOverWifiOnly: value },
      () => setWifiOnly(previous),
      "We could not save your Wi-Fi download preference. Please try again.",
    );
  }

  function handleAutoPlayChange(value: boolean) {
    const previous = autoPlayVideos;
    setAutoPlayVideos(value);

    void saveSetting(
      { autoPlayVideos: value },
      () => setAutoPlayVideos(previous),
      "We could not save your auto-play preference. Please try again.",
    );
  }

  function chooseImageQuality(value: ImageQuality) {
    setQualitySheet(false);

    const previous = imageQuality;
    setImageQuality(value);

    void saveSetting(
      { imageQuality: value },
      () => setImageQuality(previous),
      "We could not save your image quality preference. Please try again.",
    );
  }

  const qualityLabel =
    QUALITY_OPTIONS.find((option) => option.value === imageQuality)?.label ||
    "High";

  function handleClearCache() {
    if (cacheClearing) {
      return;
    }

    if (isWeb) {
      Alert.alert(
        "Clear Cache",
        "On the website, your browser keeps CosQuest's temporary files. You can clear them in your browser's settings.",
      );
      return;
    }

    Alert.alert(
      "Clear Cache",
      `This will remove ${formatBytes(cacheBytes)} of temporary CosQuest files from this device. Your account, posts, messages and profile are not deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Cache",
          style: "destructive",
          onPress: () => {
            void clearCache();
          },
        },
      ],
    );
  }

  async function clearCache() {
    const cacheDirectory = FileSystem.cacheDirectory;

    if (!cacheDirectory) {
      Alert.alert(
        "Cache Unavailable",
        "The app's cache folder isn't available on this device.",
      );
      return;
    }

    try {
      setCacheClearing(true);

      await clearApplicationCache(cacheDirectory);

      const remaining = await calculateCacheSize(cacheDirectory);

      setCacheBytes(remaining);

      Alert.alert(
        "Cache Cleared",
        remaining > 0
          ? `The cache was cleared. ${formatBytes(remaining)} remains because some files are in use.`
          : "The CosQuest cache has been cleared.",
      );
    } catch (error) {
      console.error("Failed to clear application cache:", error);

      try {
        setCacheBytes(await calculateCacheSize(cacheDirectory));
      } catch {
        // Keep the current value.
      }

      Alert.alert(
        "Clear Cache Failed",
        "Some temporary files could not be removed. Please try again.",
      );
    } finally {
      setCacheClearing(false);
    }
  }

  const storageProgress =
    totalStorageBytes > 0
      ? Math.min(usedStorageBytes / totalStorageBytes, 1)
      : 0;

  const cacheText = formatBytes(cacheBytes);

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
        {/* HEADER: back arrow, then the Figma database chip + title */}
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
              <Ionicons name="server-outline" size={16} color={PINK} />
            </View>

            <Text style={styles.headerTitle}>Data Usage</Text>
          </View>

          <View style={styles.backButton} />
        </View>

        {/* STORAGE DETAILS */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>STORAGE DETAILS</Text>

          <View style={styles.storageCard}>
            <View style={styles.storageHeader}>
              <Text style={styles.storageTitle}>Storage Space</Text>

              {isWeb ? (
                <Text style={styles.storageValue}>On your phone</Text>
              ) : storageLoading ? (
                <ActivityIndicator size="small" color={PINK} />
              ) : (
                <Text style={styles.storageValue}>
                  {formatBytes(usedStorageBytes)} /{" "}
                  {formatBytes(totalStorageBytes)}
                </Text>
              )}
            </View>

            <View style={styles.progressBackground}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${storageProgress * 100}%` },
                ]}
              />
            </View>

            <View style={styles.cacheInfo}>
              <View style={styles.cacheDot} />

              <Text style={styles.cacheText}>
                {isWeb
                  ? "App Cache (in your browser)"
                  : `App Cache (${cacheText})`}
              </Text>
            </View>
          </View>
        </View>

        {/* BANDWIDTH & SAVING */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>BANDWIDTH & SAVING</Text>

          <Pressable
            style={({ pressed }) => [
              styles.row,
              pressed && styles.pressed,
              cacheClearing && styles.disabledRow,
            ]}
            onPress={handleClearCache}
            disabled={cacheClearing}>
            <RowIcon name="trash-outline" />

            <View style={styles.rowTextContainer}>
              <Text style={styles.rowLabel}>Clear Cache</Text>

              <Text style={styles.rowValue}>
                {cacheClearing ? "Clearing..." : isWeb ? "Browser" : cacheText}
              </Text>
            </View>

            {cacheClearing ? (
              <ActivityIndicator size="small" color={PINK} />
            ) : null}
          </Pressable>

          <DownloadRow
            icon="wifi-outline"
            label="Download over Wi-Fi Only"
            value={wifiOnly}
            onChange={handleWifiOnlyChange}
          />

          <DownloadRow
            icon="play-circle-outline"
            label="Auto-play Videos"
            value={autoPlayVideos}
            onChange={handleAutoPlayChange}
          />

          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => setQualitySheet(true)}>
            <RowIcon name="image-outline" />

            <View style={styles.rowTextContainer}>
              <Text style={styles.rowLabel}>Image Quality</Text>

              <Text style={styles.rowValue}>{qualityLabel}</Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>

      {/* IMAGE QUALITY SHEET (works on phones and the website) */}
      <Modal
        visible={qualitySheet}
        transparent
        animationType="slide"
        onRequestClose={() => setQualitySheet(false)}>
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setQualitySheet(false)}>
          <Pressable
            style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}
            onPress={(event) => event.stopPropagation()}>
            <View style={styles.sheetHandle} />

            <Text style={styles.sheetTitle}>Image Quality</Text>

            {QUALITY_OPTIONS.map((option) => {
              const selected = option.value === imageQuality;

              return (
                <Pressable
                  key={option.value}
                  style={[styles.sheetOption, selected && styles.sheetOptionOn]}
                  onPress={() => chooseImageQuality(option.value)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetOptionLabel}>{option.label}</Text>
                    <Text style={styles.sheetOptionHint}>{option.hint}</Text>
                  </View>

                  {selected ? (
                    <Ionicons name="checkmark-circle" size={22} color={PINK} />
                  ) : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
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

  storageCard: {
    ...MILKY,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },

  storageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  storageTitle: {
    fontFamily: FONTS.semibold,
    fontSize: 13.5,
    color: "#191922",
  },

  storageValue: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: "#6B6B72",
  },

  progressBackground: {
    height: 8,
    borderRadius: 5,
    backgroundColor: "rgba(0,0,0,0.08)",
    marginTop: 10,
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    borderRadius: 5,
    backgroundColor: PINK,
  },

  cacheInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },

  cacheDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: PINK,
    marginRight: 6,
  },

  cacheText: {
    fontFamily: FONTS.regular,
    fontSize: 11,
    color: "#7A7A84",
  },

  // Milky row.
  row: {
    ...MILKY,
    minHeight: 58,
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

  rowTextContainer: {
    flex: 1,
  },

  rowLabel: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: "#55555E",
  },

  rowLabelFlex: {
    flex: 1,
  },

  rowValue: {
    marginTop: 1,
    fontFamily: FONTS.semibold,
    fontSize: 14,
    color: "#191922",
  },

  pressed: {
    opacity: 0.75,
  },

  disabledRow: {
    opacity: 0.75,
  },

  sheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.3)",
  },

  sheet: {
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 10,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: "#FFFFFF",
  },

  sheetHandle: {
    alignSelf: "center",
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D5D5DA",
    marginBottom: 6,
  },

  sheetTitle: {
    fontFamily: FONTS.semibold,
    fontSize: 17,
    color: "#191922",
    marginBottom: 4,
  },

  sheetOption: {
    ...MILKY,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  sheetOptionOn: {
    borderColor: PINK,
  },

  sheetOptionLabel: {
    fontFamily: FONTS.semibold,
    fontSize: 14.5,
    color: "#191922",
  },

  sheetOptionHint: {
    marginTop: 1,
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: "#7A7A84",
  },
});
