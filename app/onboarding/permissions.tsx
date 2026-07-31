import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { ErrorText } from "@/components/ErrorText";
import { OnboardingProgress } from "@/components/OnboardingProgress";
import { ONBOARDING_TOTAL, STEP } from "@/constants/onboarding";
import { Ionicons } from "@expo/vector-icons";
import Slider from "@react-native-community/slider";
import { Image } from "expo-image";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useState } from "react";
import {
  Dimensions,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const SCREEN_H = Dimensions.get("window").height;

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Pressable
      style={[styles.toggle, on && styles.toggleOn]}
      onPress={onToggle}
    >
      <View style={[styles.knob, on && styles.knobOn]} />
    </Pressable>
  );
}

export default function Permissions() {
  const [location, setLocation] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [radius, setRadius] = useState(50);
  const [errors, setErrors] = useState<{ [k: string]: string }>({});

  async function toggleLocation() {
    if (location) {
      setLocation(false);
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === "granted") {
      setLocation(true);
      setErrors((e) => ({ ...e, location: "" }));
    } else {
      setLocation(false);
      setErrors((e) => ({
        ...e,
        location:
          "Location is off. Enable it in Settings to find nearby quests.",
      }));
    }
  }

  async function toggleNotifications() {
    if (notifications) {
      setNotifications(false);
      return;
    }
    const { status } = await Notifications.requestPermissionsAsync();
    setNotifications(status === "granted");
  }

  function validate() {
    const next: { [k: string]: string } = {};
    if (!location) {
      next.location = "Location is required to play CosQuest.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  return (
    <AppBackground variant="gradient">
      <ScrollView contentContainerStyle={styles.scroll}>
        <OnboardingProgress step={STEP.permissions} total={ONBOARDING_TOTAL} />

        <Image
          source={require("@/assets/images/permissions.png")}
          style={styles.hero}
          contentFit="cover"
        />
        <Text style={styles.headline}>Find CosQuests {"\n"} near you</Text>
        <Text style={styles.sub}>
          CosQuest is played in the real world, so we use your location to show
          quests around you. {"\n"} You&apos;re always in control.
        </Text>

        <View style={styles.rows}>
          <View style={styles.row}>
            <View style={styles.iconWrap}>
              <Ionicons name="location" size={22} color="#C5399A" />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Enable Location</Text>
              <Text style={styles.rowDetail}>
                See and play CosQuests happening near you.
              </Text>
            </View>
            <Toggle on={location} onToggle={toggleLocation} />
          </View>
          <ErrorText>{errors.location}</ErrorText>

          <View style={styles.radiusRow}>
            <View style={styles.radiusHeader}>
              <Text style={styles.rowTitle}>Show Quest Within</Text>
              <Text style={styles.radiusValue}>{radius} mi</Text>
            </View>
            <Slider
              minimumValue={5}
              maximumValue={100}
              step={5}
              value={radius}
              onValueChange={setRadius}
              minimumTrackTintColor="#C5399A"
              maximumTrackTintColor="#D5D5DC"
              thumbTintColor="#C5399A"
            />
          </View>

          <View style={styles.row}>
            <View style={styles.iconWrap}>
              <Ionicons name="notifications" size={22} color="#C5399A" />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Allow Notifications</Text>
              <Text style={styles.rowDetail}>
                Get told when a quest drops in your area.
              </Text>
            </View>
            <Toggle on={notifications} onToggle={toggleNotifications} />
          </View>
        </View>

        <View style={styles.btn}>
          <Button
            label="Continue"
            variant="brand"
            onPress={() => {
              if (validate()) router.push("/onboarding/faction");
            }}
          />
          {errors.location ? (
            <Text
              style={styles.settingsLink}
              onPress={() => Linking.openSettings()}
            >
              Open Settings
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 24, paddingBottom: 40, flexGrow: 1 },
  hero: {
    alignSelf: "stretch",
    marginHorizontal: -24,
    height: SCREEN_H / 3,
    marginTop: 8,
  },
  headline: {
    fontSize: 35,
    fontWeight: "800",
    color: "#191922",
    textAlign: "center",
    marginTop: 8,
  },
  sub: {
    fontSize: 14,
    color: "#2b2b2c",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 20,
  },
  rows: { gap: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "rgba(255,255,255,0.6)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(150,150,160,0.25)",
    padding: 16,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(197,57,154,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: "700", color: "#191922" },
  rowDetail: { fontSize: 12, color: "#6b6b72", marginTop: 2 },
  radiusRow: {
    backgroundColor: "rgba(255,255,255,0.6)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(150,150,160,0.25)",
    padding: 16,
  },
  radiusHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  radiusValue: { fontSize: 14, fontWeight: "700", color: "#C5399A" },
  toggle: {
    width: 46,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#D5D5DC",
    padding: 3,
    justifyContent: "center",
  },
  toggleOn: { backgroundColor: "#34C759" },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff" },
  knobOn: { alignSelf: "flex-end" },
  btn: { marginTop: 50, paddingTop: 24 },
  settingsLink: {
    color: "#C5399A",
    fontWeight: "500",
    textAlign: "center",
    marginTop: 15,
  },
});
