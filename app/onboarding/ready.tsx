import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { useOnboarding } from "@/context/OnboardingContext";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { finishOnboarding } from "@/store/thunks/userThunks";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Dimensions, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const AnimatedImage = Animated.createAnimatedComponent(Image);

export default function Ready() {
  const insets = useSafeAreaInsets();

  const { data } = useOnboarding();

  const dispatch = useAppDispatch();

  const token = useAppSelector((state) => state.auth.token);

  const [saving, setSaving] = useState(false);

  const p = useSharedValue(0);

  // ============================================
  // INTRO ANIMATION
  // ============================================

  useEffect(() => {
    p.value = withTiming(1, {
      duration: 1200,
      easing: Easing.out(Easing.cubic),
    });
  }, [p]);

  const leftStyle = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [
      {
        translateX: (1 - p.value) * -SCREEN_W,
      },
    ],
  }));

  const rightStyle = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [
      {
        translateX: (1 - p.value) * SCREEN_W,
      },
    ],
  }));

  const mainStyle = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [
      {
        translateY: (1 - p.value) * SCREEN_H * 0.5,
      },
    ],
  }));

  // ============================================
  // COMPLETE ONBOARDING
  // ============================================

  async function handleContinue() {
    if (saving) {
      return;
    }

    console.log("=================================");
    console.log("COSQUEST - FINISH ONBOARDING");
    console.log("=================================");
    console.log("AUTH TOKEN EXISTS:", Boolean(token));
    console.log("EMAIL:", data.email);
    console.log("USERNAME:", data.username);
    console.log("FIRST NAME:", data.firstName);
    console.log("LAST NAME:", data.lastName);
    console.log("GENDER:", data.gender);
    console.log("AVATAR:", data.avatar);
    console.log("FACTION:", data.faction);
    console.log("INTERESTS:", data.interests);
    console.log("LOCATION GRANTED:", data.locationGranted);
    console.log("LAT:", data.lat);
    console.log("LNG:", data.lng);
    console.log("NOTIFICATIONS:", data.notificationsEnabled);
    console.log("=================================");

    // ============================================
    // VALIDATION
    // ============================================

    if (!data.email?.trim()) {
      Alert.alert(
        "Missing information",
        "Your email is missing. Please go back and complete your email information.",
      );
      return;
    }

    if (!data.firstName?.trim()) {
      Alert.alert("Missing information", "Please enter your first name.");
      return;
    }

    if (!data.lastName?.trim()) {
      Alert.alert("Missing information", "Please enter your last name.");
      return;
    }

    if (!data.username?.trim()) {
      Alert.alert("Missing information", "Please enter your username.");
      return;
    }

    if (!data.gender?.trim()) {
      Alert.alert("Missing information", "Please select your gender.");
      return;
    }

    if (!data.avatar?.trim()) {
      Alert.alert("Missing information", "Please select an avatar.");
      return;
    }

    if (!data.faction?.trim()) {
      Alert.alert("Missing information", "Please select a faction.");
      return;
    }

    if (!Array.isArray(data.interests) || data.interests.length === 0) {
      Alert.alert(
        "Missing information",
        "Please select at least one interest.",
      );
      return;
    }

    if (data.locationGranted && (data.lat === null || data.lng === null)) {
      Alert.alert(
        "Location information missing",
        "Your location permission was granted, but your location coordinates were not found.",
      );
      return;
    }

    // ============================================
    // AUTH TOKEN
    // ============================================
    // No hard block here anymore. Every other onboarding step
    // (profile, avatar, category, faction, interests, notifications,
    // location) has already been completing successfully this whole
    // flow using email-based identification with no token at all — the
    // backend explicitly documents that it accepts "the email or
    // username you signed up with (before login) OR an Authorization
    // Bearer token (after login)". A token simply doesn't exist yet at
    // this point for a brand-new signup, and that's expected, not an
    // error state. This used to hard-stop here with "Session expired"
    // even though the request was never actually going to be missing
    // anything the backend requires — data.email (validated above) is
    // enough. If a token IS available, it's still sent along below so
    // logged-in flows use it.
    if (!token) {
      console.log(
        "No auth token yet — continuing with email-based identification, same as every prior onboarding step.",
      );
    }

    try {
      setSaving(true);

      // ============================================
      // ONBOARDING PAYLOAD
      // ============================================

      const onboardingPayload = {
        email: data.email.trim(),

        profile: {
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          username: data.username.trim(),
          age: data.age,
          gender: data.gender,
          avatar: data.avatar,
        },

        faction: data.faction,

        interests: data.interests,

        preferences: {
          notificationsEnabled: data.notificationsEnabled,
        },

        location: {
          locationEnabled: data.locationGranted,
          radiusMiles: data.radiusMi,
          lat: data.lat,
          lng: data.lng,
        },
      };

      console.log("ONBOARDING PAYLOAD:", onboardingPayload);

      // ============================================
      // SEND TO BACKEND
      // ============================================

      const response = await dispatch(
        finishOnboarding(onboardingPayload),
      ).unwrap();

      console.log("=================================");
      console.log("ONBOARDING COMPLETED SUCCESSFULLY");
      console.log("RESPONSE:", response);
      console.log("=================================");

      // ============================================
      // GO TO HOME
      // ============================================

      Alert.alert(
        "Welcome to CosQuest!",
        "Your account has been set up successfully.",
        [
          {
            text: "Continue",
            onPress: () => {
              router.replace("/home");
            },
          },
        ],
      );
    } catch (error) {
      console.error("=================================");
      console.error("FINISH ONBOARDING ERROR:", error);
      console.error("=================================");

      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "We could not complete your onboarding.";

      Alert.alert("Could not finish setup", message);
    } finally {
      setSaving(false);
    }
  }

  // ============================================
  // UI
  // ============================================

  return (
    <AppBackground variant="blueMap">
      <View
        style={[
          styles.screen,
          {
            paddingTop: insets.top + 24,
          },
        ]}>
        {/* TITLE */}

        <View style={styles.titleWrap}>
          <Text style={styles.small}>Welcome To</Text>

          <Text style={styles.big}>COSQUEST</Text>
        </View>

        {/* HERO SCENE */}

        <View style={styles.scene}>
          <AnimatedImage
            source={require("@/assets/images/ready/left_hero.png")}
            style={[styles.leftHero, leftStyle]}
            contentFit="contain"
          />

          <AnimatedImage
            source={require("@/assets/images/ready/right_hero.png")}
            style={[styles.rightHero, rightStyle]}
            contentFit="contain"
          />

          <AnimatedImage
            source={require("@/assets/images/ready/hero.png")}
            style={[styles.mainHero, mainStyle]}
            contentFit="contain"
          />

          <Image
            source={require("@/assets/images/ready/ready_arrow.png")}
            style={styles.arrow}
            contentFit="contain"
          />

          <Image
            source={require("@/assets/images/ready/ready_pin2.png")}
            style={styles.pinLeft}
            contentFit="contain"
          />

          <Image
            source={require("@/assets/images/ready/ready_pin.png")}
            style={styles.pinRight}
            contentFit="contain"
          />

          <Image
            source={require("@/assets/images/ready/ready_pin2.png")}
            style={styles.pinBottom}
            contentFit="contain"
          />
        </View>

        {/* CONTINUE BUTTON */}

        <View style={styles.btn}>
          <Button
            label={saving ? "Setting up..." : "Continue"}
            variant="brand"
            onPress={handleContinue}
            disabled={saving}
          />
        </View>
      </View>
    </AppBackground>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },

  titleWrap: {
    alignItems: "center",
  },

  small: {
    fontSize: 35,
    fontWeight: "800",
    color: "#191922",
    textAlign: "center",
  },

  big: {
    fontSize: 44,
    fontWeight: "900",
    color: "#191922",
    textAlign: "center",
    letterSpacing: 1,
  },

  scene: {
    flex: 1,
    position: "relative",
    marginTop: 12,
  },

  leftHero: {
    position: "absolute",
    top: "2%",
    left: "-2%",
    width: "50%",
    height: "50%",
    zIndex: 1,
  },

  rightHero: {
    position: "absolute",
    top: "5%",
    right: "-3%",
    width: "50%",
    height: "50%",
    zIndex: 1,
  },

  mainHero: {
    position: "absolute",
    left: 33,
    right: 30,
    bottom: 0,
    width: "85%",
    height: "80%",
    zIndex: 3,
  },

  arrow: {
    position: "absolute",
    top: "45%",
    right: "86%",
    width: 50,
    height: 100,
    zIndex: 4,
  },

  pinLeft: {
    position: "absolute",
    left: "3%",
    top: "35%",
    width: 25,
    height: 34,
    zIndex: 4,
  },

  pinRight: {
    position: "absolute",
    right: "2%",
    bottom: "31%",
    width: 38,
    height: 42,
    zIndex: 4,
  },

  pinBottom: {
    position: "absolute",
    left: "10%",
    bottom: "25%",
    width: 38,
    height: 42,
    zIndex: 2,
  },

  btn: {
    paddingTop: 5,
    paddingBottom: 30,
  },
});
