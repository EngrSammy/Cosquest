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

export default function DataUsage() {
  const insets = useSafeAreaInsets();

  const [wifiOnly, setWifiOnly] = useState(true);
  const [autoPlayVideos, setAutoPlayVideos] = useState(true);

  const [imageQuality, setImageQuality] = useState("High");

  const [cacheSize, setCacheSize] = useState("248 MB");

  // Design values until native device storage APIs
  // are connected.
  const usedStorage = "1.2 GB";
  const totalStorage = "64 GB";

  const storageProgress = 0.019;

  function handleClearCache() {
    Alert.alert(
      "Clear Cache",
      "Cache clearing will be connected to the device storage layer.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "OK",
          onPress: () => {
            setCacheSize("0 MB");
          },
        },
      ],
    );
  }

  function handleImageQuality() {
    Alert.alert("Image Quality", "Choose the image quality to use.", [
      {
        text: "Low",
        onPress: () => setImageQuality("Low"),
      },
      {
        text: "Medium",
        onPress: () => setImageQuality("Medium"),
      },
      {
        text: "High",
        onPress: () => setImageQuality("High"),
      },
      {
        text: "Cancel",
        style: "cancel",
      },
    ]);
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

            <Text style={styles.storageValue}>
              {usedStorage} / {totalStorage}
            </Text>
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

            <Text style={styles.cacheText}>App Cache ({cacheSize})</Text>
          </View>
        </View>

        {/* BANDWIDTH & SAVING */}
        <Text style={[styles.sectionLabel, styles.bandwidthLabel]}>
          BANDWIDTH & SAVING
        </Text>

        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          onPress={handleClearCache}>
          <View style={styles.rowIcon}>
            <Ionicons name="trash-outline" size={17} color="#C5399A" />
          </View>

          <View style={styles.rowTextContainer}>
            <Text style={styles.rowLabel}>Clear Cache</Text>

            <Text style={styles.rowValue}>{cacheSize}</Text>
          </View>
        </Pressable>

        <DownloadRow
          icon="phone-portrait-outline"
          label="Download over Wi-Fi Only"
          value={wifiOnly}
          onChange={setWifiOnly}
        />

        <DownloadRow
          icon="play-circle-outline"
          label="Auto-play Videos"
          value={autoPlayVideos}
          onChange={setAutoPlayVideos}
        />

        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          onPress={handleImageQuality}>
          <View style={styles.rowIcon}>
            <Ionicons name="image-outline" size={17} color="#C5399A" />
          </View>

          <View style={styles.rowTextContainer}>
            <Text style={styles.rowLabel}>Image Quality</Text>

            <Text style={styles.rowValue}>{imageQuality}</Text>
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
});
