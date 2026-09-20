import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { ErrorText } from "@/components/ErrorText";
import { OnboardingProgress } from "@/components/OnboardingProgress";
import { ONBOARDING_TOTAL, STEP } from "@/constants/onboarding";
import { useOnboarding } from "@/context/OnboardingContext";
import { useAppDispatch } from "@/store/hooks";
import {
  saveLocationPreference,
  saveNotificationPreference,
} from "@/store/thunks/userThunks";
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

function Toggle({
  on,
  disabled,
  onToggle,
}: {
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      style={[styles.toggle, on && styles.toggleOn]}
      onPress={onToggle}
      disabled={disabled}>
      <View style={[styles.knob, on && styles.knobOn]} />
    </Pressable>
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error("LOCATION_TIMEOUT"));
      }, timeoutMs);
    }),
  ]);
}

export default function Permissions() {
  const { data, update } = useOnboarding();

  const dispatch = useAppDispatch();

  const [locationLoading, setLocationLoading] = useState(false);

  const [notificationLoading, setNotificationLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const [errors, setErrors] = useState<{
    [k: string]: string;
  }>({});

  async function toggleLocation() {
    if (data.locationGranted) {
      update({
        locationGranted: false,
        lat: null,
        lng: null,
      });

      setErrors((current) => ({
        ...current,
        location: "",
      }));

      return;
    }

    setLocationLoading(true);

    setErrors((current) => ({
      ...current,
      location: "",
    }));

    try {
      const { status } = await withTimeout(
        Location.requestForegroundPermissionsAsync(),
        8000,
      );

      if (status !== "granted") {
        update({
          locationGranted: false,
          lat: null,
          lng: null,
        });

        setErrors((current) => ({
          ...current,
          location:
            "Location permission was not granted. Please enable it and try again.",
        }));

        return;
      }

      update({
        locationGranted: true,
      });

      let position = await Location.getLastKnownPositionAsync();

      if (position) {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        update({
          locationGranted: true,
          lat,
          lng,
        });

        setErrors((current) => ({
          ...current,
          location: "",
        }));

        return;
      }

      position = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        }),
        6000,
      );

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      update({
        locationGranted: true,
        lat,
        lng,
      });

      setErrors((current) => ({
        ...current,
        location: "",
      }));
    } catch (error) {
      update({
        locationGranted: false,
        lat: null,
        lng: null,
      });

      if (error instanceof Error && error.message === "LOCATION_TIMEOUT") {
        setErrors((current) => ({
          ...current,
          location:
            "We could not get your location quickly enough. Please try again.",
        }));
      } else {
        setErrors((current) => ({
          ...current,
          location: "Unable to get your location. Please try again.",
        }));
      }
    } finally {
      setLocationLoading(false);
    }
  }

  async function toggleNotifications() {
    if (data.notificationsEnabled) {
      update({
        notificationsEnabled: false,
      });

      setErrors((current) => ({
        ...current,
        notifications: "",
      }));

      return;
    }

    setNotificationLoading(true);

    setErrors((current) => ({
      ...current,
      notifications: "",
    }));

    try {
      const { status, canAskAgain } =
        await Notifications.requestPermissionsAsync();

      const granted = status === "granted";

      update({
        notificationsEnabled: granted,
      });

      setErrors((current) => ({
        ...current,
        notifications:
          granted || canAskAgain
            ? ""
            : "Notifications are off. Enable them in Settings to get quest alerts.",
      }));
    } catch (error) {
      update({
        notificationsEnabled: false,
      });

      setErrors((current) => ({
        ...current,
        notifications: "Unable to update notification permission.",
      }));
    } finally {
      setNotificationLoading(false);
    }
  }

  function validate() {
    const next: {
      [k: string]: string;
    } = {};

    if (!data.email.trim()) {
      next.general = "Your email is missing. Please go back and try again.";
    }

    if (locationLoading) {
      next.location = "Getting your location. Please wait a moment.";
    } else if (!data.locationGranted) {
      next.location = "Location is required to play CosQuest.";
    } else if (data.lat === null || data.lng === null) {
      next.location = "We could not get your location. Please try again.";
    }

    setErrors(next);

    return Object.keys(next).length === 0;
  }

  async function handleContinue() {
    if (saving) {
      return;
    }

    if (!validate()) {
      return;
    }

    setSaving(true);

    setErrors((current) => ({
      ...current,
      general: "",
    }));

    try {
      const notificationResult = await dispatch(
        saveNotificationPreference({
          email: data.email.trim(),
          notificationsEnabled: data.notificationsEnabled,
        }),
      ).unwrap();

      const locationResult = await dispatch(
        saveLocationPreference({
          email: data.email.trim(),
          locationEnabled: data.locationGranted,
          radiusMiles: data.radiusMi,
          lat: data.lat as number,
          lng: data.lng as number,
        }),
      ).unwrap();

      router.push("/onboarding/faction");
    } catch (error) {
      setErrors({
        general:
          error instanceof Error
            ? error.message
            : "Failed to save your permissions. Please try again.",
      });
    } finally {
      setSaving(false);
    }
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

        {errors.general ? (
          <View style={styles.generalError}>
            <ErrorText>{errors.general}</ErrorText>
          </View>
        ) : null}

        <View style={styles.rows}>
          <View style={styles.row}>
            <View style={styles.iconWrap}>
              <Ionicons name="location" size={22} color="#C5399A" />
            </View>

            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Enable Location</Text>

              <Text style={styles.rowDetail}>
                {locationLoading
                  ? "Getting your location..."
                  : "See and play CosQuests happening near you."}
              </Text>
            </View>

            <Toggle
              on={data.locationGranted}
              onToggle={toggleLocation}
              disabled={locationLoading || saving}
            />
          </View>

          {errors.location ? (
            <>
              <ErrorText>{errors.location}</ErrorText>

              <Text style={styles.settingsLink} onPress={toggleLocation}>
                Try Location Again
              </Text>
            </>
          ) : null}

          <View style={styles.radiusRow}>
            <View style={styles.radiusHeader}>
              <Text style={styles.rowTitle}>Show Quest Within</Text>

              <Text style={styles.radiusValue}>{data.radiusMi} mi</Text>
            </View>

            <Slider
              minimumValue={5}
              maximumValue={100}
              step={5}
              value={data.radiusMi}
              onValueChange={(value) =>
                update({
                  radiusMi: value,
                })
              }
              minimumTrackTintColor="#C5399A"
              maximumTrackTintColor="#D5D5DC"
              thumbTintColor="#C5399A"
              disabled={saving}
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

            <Toggle
              on={data.notificationsEnabled}
              onToggle={toggleNotifications}
              disabled={notificationLoading || saving}
            />
          </View>

          {errors.notifications ? (
            <>
              <ErrorText>{errors.notifications}</ErrorText>

              <Text
                style={styles.settingsLink}
                onPress={() => Linking.openSettings()}>
                Open Settings
              </Text>
            </>
          ) : null}
        </View>

        <View style={styles.btn}>
          <Button
            label={saving ? "Saving..." : "Continue"}
            variant="brand"
            onPress={handleContinue}
            disabled={saving}
          />
        </View>
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    flexGrow: 1,
  },

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

  generalError: {
    alignItems: "center",
    marginBottom: 12,
  },

  rows: {
    gap: 14,
  },

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

  rowText: {
    flex: 1,
  },

  rowTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#191922",
  },

  rowDetail: {
    fontSize: 12,
    color: "#6b6b72",
    marginTop: 2,
  },

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

  radiusValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#C5399A",
  },

  toggle: {
    width: 46,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#D5D5DC",
    padding: 3,
    justifyContent: "center",
  },

  toggleOn: {
    backgroundColor: "#34C759",
  },

  knob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
    alignSelf: "flex-start",
  },

  knobOn: {
    alignSelf: "flex-end",
  },

  btn: {
    marginTop: 50,
    paddingTop: 24,
    width: "100%",
  },

  settingsLink: {
    color: "#C5399A",
    fontWeight: "500",
    textAlign: "center",
    marginTop: 5,
  },
});
