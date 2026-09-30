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
import { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const SCREEN_H = Dimensions.get("window").height;

const IS_WEB = Platform.OS === "web";

// A last-known position older than this is treated as stale and skipped
// in favor of a fresh fix — someone who's traveled since their last GPS
// reading would otherwise silently get quests centered on the wrong
// place with no indication anything was off.
const MAX_LAST_KNOWN_POSITION_AGE_MS = 2 * 60 * 1000;

// iPhone Safari's own wording, so people can find the setting.
const WEB_LOCATION_DENIED_HELP =
  "Location is blocked for this website. On iPhone: Settings → Privacy & Security → Location Services → Safari Websites → While Using the App, then tap “aA” in Safari’s address bar → Website Settings → Location → Allow. On a computer: click the icon next to the website address and allow Location. Then tap Try Location Again.";

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
      style={[
        styles.toggle,
        on && styles.toggleOn,
        disabled && styles.toggleDisabled,
      ]}
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

// WEBSITE ONLY: ask the browser directly. This is what makes Safari /
// Chrome show their "Allow location?" popup. (expo-location's web version
// asks in a way iPhone Safari answers with "not decided yet" instead of
// showing the popup — which the screen read as "permission not granted".)
function getWebPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("LOCATION_UNSUPPORTED"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      (error) => {
        // 1 = denied, 2 = unavailable, 3 = timeout
        reject(
          new Error(
            error.code === 1
              ? "LOCATION_DENIED"
              : error.code === 3
                ? "LOCATION_TIMEOUT"
                : "LOCATION_UNAVAILABLE",
          ),
        );
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: MAX_LAST_KNOWN_POSITION_AGE_MS,
      },
    );
  });
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

  // Guards against setting state after this screen has been navigated
  // away from while a location/notification permission request is still
  // in flight (React warns on state updates after unmount otherwise).
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Merge-based error setter, so one field's error never wipes another's.
  function mergeErrors(patch: { [k: string]: string }) {
    if (!isMountedRef.current) {
      return;
    }

    setErrors((current) => ({
      ...current,
      ...patch,
    }));
  }

  // ---------- LOCATION ON THE WEBSITE ----------

  async function toggleLocationWeb() {
    setLocationLoading(true);

    mergeErrors({
      location: "",
    });

    try {
      // Called straight from the tap (no await before it), which some
      // browsers require before they'll show the popup.
      const { lat, lng } = await getWebPosition();

      if (!isMountedRef.current) {
        return;
      }

      update({
        locationGranted: true,
        lat,
        lng,
      });
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      update({
        locationGranted: false,
        lat: null,
        lng: null,
      });

      const code = error instanceof Error ? error.message : "";

      mergeErrors({
        location:
          code === "LOCATION_DENIED"
            ? WEB_LOCATION_DENIED_HELP
            : code === "LOCATION_TIMEOUT"
              ? "We could not get your location quickly enough. Please try again."
              : code === "LOCATION_UNSUPPORTED"
                ? "This browser can't share your location. Please use Chrome or Safari."
                : "Unable to get your location. Check that location is turned on for your device, then try again.",
      });
    } finally {
      if (isMountedRef.current) {
        setLocationLoading(false);
      }
    }
  }

  // ---------- LOCATION (phones + website) ----------

  async function toggleLocation() {
    if (data.locationGranted) {
      update({
        locationGranted: false,
        lat: null,
        lng: null,
      });

      mergeErrors({
        location: "",
      });

      return;
    }

    if (IS_WEB) {
      await toggleLocationWeb();
      return;
    }

    setLocationLoading(true);

    mergeErrors({
      location: "",
    });

    try {
      const { status } = await withTimeout(
        Location.requestForegroundPermissionsAsync(),
        8000,
      );

      if (!isMountedRef.current) {
        return;
      }

      if (status !== "granted") {
        update({
          locationGranted: false,
          lat: null,
          lng: null,
        });

        mergeErrors({
          location:
            "Location permission was not granted. Please enable it and try again.",
        });

        return;
      }

      update({
        locationGranted: true,
      });

      let position = await Location.getLastKnownPositionAsync();

      const isFresh =
        !!position &&
        Date.now() - position.timestamp <= MAX_LAST_KNOWN_POSITION_AGE_MS;

      if (position && isFresh) {
        if (!isMountedRef.current) {
          return;
        }

        update({
          locationGranted: true,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });

        mergeErrors({
          location: "",
        });

        return;
      }

      position = await withTimeout(
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        }),
        6000,
      );

      if (!isMountedRef.current) {
        return;
      }

      update({
        locationGranted: true,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });

      mergeErrors({
        location: "",
      });
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      update({
        locationGranted: false,
        lat: null,
        lng: null,
      });

      if (error instanceof Error && error.message === "LOCATION_TIMEOUT") {
        mergeErrors({
          location:
            "We could not get your location quickly enough. Please try again.",
        });
      } else {
        mergeErrors({
          location: "Unable to get your location. Please try again.",
        });
      }
    } finally {
      if (isMountedRef.current) {
        setLocationLoading(false);
      }
    }
  }

  // ---------- NOTIFICATIONS ----------
  // Push notifications only exist in the phone app. On the website the
  // switch is simply unavailable (no error message).

  async function toggleNotifications() {
    if (IS_WEB) {
      return;
    }

    if (data.notificationsEnabled) {
      update({
        notificationsEnabled: false,
      });

      mergeErrors({
        notifications: "",
      });

      return;
    }

    setNotificationLoading(true);

    mergeErrors({
      notifications: "",
    });

    try {
      const { status, canAskAgain } =
        await Notifications.requestPermissionsAsync();

      if (!isMountedRef.current) {
        return;
      }

      const granted = status === "granted";

      update({
        notificationsEnabled: granted,
      });

      mergeErrors({
        notifications:
          granted || canAskAgain
            ? ""
            : "Notifications are off. Enable them in Settings to get quest alerts.",
      });
    } catch {
      if (!isMountedRef.current) {
        return;
      }

      update({
        notificationsEnabled: false,
      });

      mergeErrors({
        notifications: "Unable to update notification permission.",
      });
    } finally {
      if (isMountedRef.current) {
        setNotificationLoading(false);
      }
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

    mergeErrors({
      general: next.general || "",
      location: next.location || "",
    });

    return !next.general && !next.location;
  }

  async function handleContinue() {
    if (saving) {
      return;
    }

    if (!validate()) {
      return;
    }

    setSaving(true);

    mergeErrors({
      general: "",
    });

    const [notificationResult, locationResult] = await Promise.allSettled([
      dispatch(
        saveNotificationPreference({
          email: data.email.trim(),
          // Always off on the website (no push notifications there).
          notificationsEnabled: IS_WEB ? false : data.notificationsEnabled,
        }),
      ).unwrap(),
      dispatch(
        saveLocationPreference({
          email: data.email.trim(),
          locationEnabled: data.locationGranted,
          radiusMiles: data.radiusMi,
          lat: data.lat as number,
          lng: data.lng as number,
        }),
      ).unwrap(),
    ]);

    if (!isMountedRef.current) {
      return;
    }

    const failures: string[] = [];

    if (notificationResult.status === "rejected") {
      failures.push("notification preference");
    }

    if (locationResult.status === "rejected") {
      failures.push("location preference");
    }

    if (failures.length > 0) {
      const firstError = [notificationResult, locationResult].find(
        (result) => result.status === "rejected",
      ) as PromiseRejectedResult | undefined;

      const detail =
        firstError?.reason instanceof Error
          ? firstError.reason.message
          : typeof firstError?.reason === "string"
            ? firstError.reason
            : undefined;

      setSaving(false);

      mergeErrors({
        general:
          detail ||
          `Failed to save your ${failures.join(" and ")}. Please try again.`,
      });

      return;
    }

    setSaving(false);

    router.push("/onboarding/faction");
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

          <View style={[styles.row, IS_WEB && styles.rowMuted]}>
            <View style={styles.iconWrap}>
              <Ionicons name="notifications" size={22} color="#C5399A" />
            </View>

            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Allow Notifications</Text>

              <Text style={styles.rowDetail}>
                {IS_WEB
                  ? "Available in the CosQuest mobile app."
                  : "Get told when a quest drops in your area."}
              </Text>
            </View>

            <Toggle
              on={!IS_WEB && data.notificationsEnabled}
              onToggle={toggleNotifications}
              disabled={IS_WEB || notificationLoading || saving}
            />
          </View>

          {!IS_WEB && errors.notifications ? (
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

  rowMuted: {
    opacity: 0.7,
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

  toggleDisabled: {
    opacity: 0.6,
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
