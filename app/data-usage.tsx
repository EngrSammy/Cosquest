import { AppBackground } from "@/components/AppBackground";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
      fetchDataUsageSettings,
      updateDataUsageSettingsThunk,
} from "@/store/thunks/settingsThunks";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
      ActivityIndicator,
      Alert,
      Pressable,
      ScrollView,
      StyleSheet,
      Switch,
      Text,
      View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type ImageQuality = "low" | "medium" | "high" | "auto";

type DownloadRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
};

function DownloadRow({ icon, label, value, onChange }: DownloadRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={17} color="#C5399A" />
      </View>

      <Text style={styles.rowLabel}>{label}</Text>

      <Switch
        value={value}
        onValueChange={onChange}
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

/**
 * Convert bytes into a readable storage value.
 *
 * Examples:
 * 1024 -> 1 KB
 * 1048576 -> 1 MB
 * 1073741824 -> 1 GB
 */
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

  if (index === 0) {
    return `${Math.round(value)} ${units[index]}`;
  }

  if (value >= 100) {
    return `${Math.round(value)} ${units[index]}`;
  }

  if (value >= 10) {
    return `${value.toFixed(1)} ${units[index]}`;
  }

  return `${value.toFixed(2)} ${units[index]}`;
}

/**
 * Calculate the actual size of everything inside
 * the application's cache directory.
 */
async function calculateCacheSize(uri: string): Promise<number> {
  let totalSize = 0;

  try {
    const entries = await FileSystem.readDirectoryAsync(uri);

    for (const entry of entries) {
      const childUri = `${uri}${entry}`;

      try {
        const info = await FileSystem.getInfoAsync(childUri, {
          size: true,
        });

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
        // Ignore a cache entry that disappears while scanning.
      }
    }
  } catch {
    // Cache directory may be unavailable or empty.
  }

  return totalSize;
}

/**
 * Delete the actual contents of the application's cache.
 *
 * We delete the contents rather than deleting the cache root itself,
 * because the app may need the cache directory to continue existing.
 */
async function clearApplicationCache(uri: string): Promise<void> {
  const entries = await FileSystem.readDirectoryAsync(uri);

  for (const entry of entries) {
    const childUri = `${uri}${entry}`;

    try {
      await FileSystem.deleteAsync(childUri, {
        idempotent: true,
      });
    } catch {
      // Continue clearing the remaining cache entries.
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

  const [cacheBytes, setCacheBytes] = useState(0);
  const [totalStorageBytes, setTotalStorageBytes] = useState(0);
  const [usedStorageBytes, setUsedStorageBytes] = useState(0);

  const [storageLoading, setStorageLoading] = useState(true);
  const [cacheClearing, setCacheClearing] = useState(false);

  /**
   * Load the backend Data Usage settings.
   */
  useEffect(() => {
    if (!token) {
      return;
    }

    dispatch(fetchDataUsageSettings(token));
  }, [dispatch, token]);

  /**
   * Synchronize the UI with the exact backend fields.
   *
   * MongoDB:
   *
   * downloadOverWifiOnly
   * autoPlayVideos
   * imageQuality
   */
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

  /**
   * Read the actual device storage and actual CosQuest cache.
   */
  const loadDeviceStorage = useCallback(async () => {
    try {
      setStorageLoading(true);

      // Browsers cannot read device storage - only phones can.

      if (Platform.OS === "web") {

        return;

      }

      

      const [totalDiskCapacity, freeDiskStorage] = await Promise.all([
        FileSystem.getTotalDiskCapacityAsync(),
        FileSystem.getFreeDiskStorageAsync(),
      ]);

      const usedDiskStorage = Math.max(totalDiskCapacity - freeDiskStorage, 0);

      setTotalStorageBytes(totalDiskCapacity);
      setUsedStorageBytes(usedDiskStorage);

      const cacheDirectory = FileSystem.cacheDirectory;

      if (cacheDirectory) {
        const actualCacheSize = await calculateCacheSize(cacheDirectory);

        setCacheBytes(actualCacheSize);
      } else {
        setCacheBytes(0);
      }
    } catch (error) {
      console.error("Failed to load device storage:", error);
    } finally {
      setStorageLoading(false);
    }
  }, []);

  /**
   * Load real device information when the screen opens.
   */
  useEffect(() => {
    void loadDeviceStorage();
  }, [loadDeviceStorage]);

  /**
   * Save Download over Wi-Fi Only.
   */
  async function handleWifiOnlyChange(value: boolean) {
    const previousValue = wifiOnly;

    setWifiOnly(value);

    if (!token) {
      setWifiOnly(previousValue);

      Alert.alert(
        "Not Signed In",
        "Please sign in again before changing this setting.",
      );

      return;
    }

    try {
      await dispatch(
        updateDataUsageSettingsThunk({
          token,
          data: {
            downloadOverWifiOnly: value,
          },
        }),
      ).unwrap();
    } catch (error) {
      console.error("Failed to update Wi-Fi preference:", error);

      setWifiOnly(previousValue);

      Alert.alert(
        "Update Failed",
        "We could not save your Wi-Fi download preference. Please try again.",
      );
    }
  }

  /**
   * Save Auto-play Videos.
   */
  async function handleAutoPlayChange(value: boolean) {
    const previousValue = autoPlayVideos;

    setAutoPlayVideos(value);

    if (!token) {
      setAutoPlayVideos(previousValue);

      Alert.alert(
        "Not Signed In",
        "Please sign in again before changing this setting.",
      );

      return;
    }

    try {
      await dispatch(
        updateDataUsageSettingsThunk({
          token,
          data: {
            autoPlayVideos: value,
          },
        }),
      ).unwrap();
    } catch (error) {
      console.error("Failed to update auto-play preference:", error);

      setAutoPlayVideos(previousValue);

      Alert.alert(
        "Update Failed",
        "We could not save your auto-play preference. Please try again.",
      );
    }
  }

  /**
   * Display backend image-quality values nicely.
   *
   * Backend:
   * low
   * medium
   * high
   * auto
   *
   * UI:
   * Low
   * Medium
   * High
   * Auto
   */
  function displayImageQuality(value: ImageQuality): string {
    switch (value) {
      case "low":
        return "Low";

      case "medium":
        return "Medium";

      case "high":
        return "High";

      case "auto":
        return "Auto";

      default:
        return "High";
    }
  }

  /**
   * Save Image Quality.
   */
  async function saveImageQuality(value: ImageQuality) {
    const previousValue = imageQuality;

    setImageQuality(value);

    if (!token) {
      setImageQuality(previousValue);

      Alert.alert(
        "Not Signed In",
        "Please sign in again before changing this setting.",
      );

      return;
    }

    try {
      await dispatch(
        updateDataUsageSettingsThunk({
          token,
          data: {
            imageQuality: value,
          },
        }),
      ).unwrap();
    } catch (error) {
      console.error("Failed to update image quality:", error);

      setImageQuality(previousValue);

      Alert.alert(
        "Update Failed",
        "We could not save your image quality preference. Please try again.",
      );
    }
  }

  /**
   * Show image quality options.
   */
  function handleImageQuality() {
    Alert.alert("Image Quality", "Choose the image quality to use.", [
      {
        text: "Low",
        onPress: () => {
          void saveImageQuality("low");
        },
      },
      {
        text: "Medium",
        onPress: () => {
          void saveImageQuality("medium");
        },
      },
      {
        text: "High",
        onPress: () => {
          void saveImageQuality("high");
        },
      },
      {
        text: "Auto",
        onPress: () => {
          void saveImageQuality("auto");
        },
      },
      {
        text: "Cancel",
        style: "cancel",
      },
    ]);
  }

  /**
   * Clear the REAL CosQuest application cache.
   */
  function handleClearCache() {
    if (cacheClearing) {
      return;
    }

    const currentCacheSize = formatBytes(cacheBytes);

    Alert.alert(
      "Clear Cache",
      `This will remove ${currentCacheSize} of temporary CosQuest files from this device. Your account, posts, messages, profile, and other cloud data will not be deleted.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
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

  /**
   * Actually delete cached files from the device.
   */
  async function clearCache() {
    const cacheDirectory = FileSystem.cacheDirectory;

    if (!cacheDirectory) {
      Alert.alert(
        "Cache Unavailable",
        "The application cache directory is not available on this device.",
      );

      return;
    }

    try {
      setCacheClearing(true);

      await clearApplicationCache(cacheDirectory);

      /**
       * Read the cache again after deletion.
       * This makes the displayed value reflect the
       * actual device state instead of assuming 0 MB.
       */
      const remainingCacheSize = await calculateCacheSize(cacheDirectory);

      setCacheBytes(remainingCacheSize);

      Alert.alert(
        "Cache Cleared",
        remainingCacheSize > 0
          ? `The cache was cleared. ${formatBytes(
              remainingCacheSize,
            )} of cache data remains because some temporary files are currently in use.`
          : "The CosQuest cache has been cleared.",
      );
    } catch (error) {
      console.error("Failed to clear application cache:", error);

      /**
       * Even if some files could not be deleted,
       * recalculate the actual cache size.
       */
      try {
        const remainingCacheSize = await calculateCacheSize(cacheDirectory);

        setCacheBytes(remainingCacheSize);
      } catch {
        // Keep the current value if recalculation fails.
      }

      Alert.alert(
        "Clear Cache Failed",
        "Some temporary files could not be removed. Please try again.",
      );
    } finally {
      setCacheClearing(false);
    }
  }

  /**
   * Storage progress.
   */
  const storageProgress =
    totalStorageBytes > 0
      ? Math.min(usedStorageBytes / totalStorageBytes, 1)
      : 0;

  const usedStorageText = formatBytes(usedStorageBytes);

  const totalStorageText = formatBytes(totalStorageBytes);

  const cacheText = formatBytes(cacheBytes);

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
            <View style={styles.headerIcon}>
              <Ionicons name="server-outline" size={16} color="#C5399A" />
            </View>

            <Text style={styles.headerTitle}>Data Usage</Text>
          </View>

          <View style={styles.headerSpacer} />
        </View>

        {/* STORAGE DETAILS */}
        <Text style={styles.sectionLabel}>STORAGE DETAILS</Text>

        <View style={styles.storageCard}>
          <View style={styles.storageHeader}>
            <Text style={styles.storageTitle}>Storage Space</Text>

            {storageLoading ? (
              <ActivityIndicator size="small" color="#C5399A" />
            ) : (
              <Text style={styles.storageValue}>
                {usedStorageText} / {totalStorageText}
              </Text>
            )}
          </View>

          <View style={styles.progressBackground}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${storageProgress * 100}%`,
                },
              ]}
            />
          </View>

          <View style={styles.cacheInfo}>
            <View style={styles.cacheDot} />

            <Text style={styles.cacheText}>App Cache ({cacheText})</Text>
          </View>
        </View>

        {/* BANDWIDTH & SAVING */}
        <Text style={[styles.sectionLabel, styles.bandwidthLabel]}>
          BANDWIDTH & SAVING
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.row,
            pressed && styles.pressed,
            cacheClearing && styles.disabledRow,
          ]}
          onPress={handleClearCache}
          disabled={cacheClearing}>
          <View style={styles.rowIcon}>
            <Ionicons name="trash-outline" size={17} color="#C5399A" />
          </View>

          <View style={styles.rowTextContainer}>
            <Text style={styles.rowLabel}>Clear Cache</Text>

            <Text style={styles.rowValue}>
              {cacheClearing ? "Clearing..." : cacheText}
            </Text>
          </View>

          {cacheClearing && <ActivityIndicator size="small" color="#C5399A" />}
        </Pressable>

        <DownloadRow
          icon="phone-portrait-outline"
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
          onPress={handleImageQuality}>
          <View style={styles.rowIcon}>
            <Ionicons name="image-outline" size={17} color="#C5399A" />
          </View>

          <View style={styles.rowTextContainer}>
            <Text style={styles.rowLabel}>Image Quality</Text>

            <Text style={styles.rowValue}>
              {displayImageQuality(imageQuality)}
            </Text>
          </View>

          <Ionicons name="chevron-forward" size={17} color="#9999A3" />
        </Pressable>
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

  headerIcon: {
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

  bandwidthLabel: {
    marginTop: 18,
  },

  storageCard: {
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 13,

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

  storageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  storageTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#33333B",
  },

  storageValue: {
    fontSize: 11,
    color: "#7F7F88",
  },

  progressBackground: {
    height: 8,
    borderRadius: 5,
    backgroundColor: "#E0E0E4",
    marginTop: 10,
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    borderRadius: 5,
    backgroundColor: "#C5399A",
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
    backgroundColor: "#C5399A",
    marginRight: 6,
  },

  cacheText: {
    fontSize: 10.5,
    color: "#7A7A84",
  },

  row: {
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

  rowIcon: {
    width: 29,
    height: 29,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
    backgroundColor: "rgba(255,255,255,0.72)",
  },

  rowTextContainer: {
    flex: 1,
  },

  rowLabel: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: "600",
    color: "#5B5B67",
  },

  rowValue: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#292931",
    marginTop: 2,
  },

  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.995 }],
  },

  disabledRow: {
    opacity: 0.75,
  },
});
