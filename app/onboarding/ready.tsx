import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { useOnboarding } from "@/context/OnboardingContext";
import { useAppDispatch } from "@/store/hooks";
import { finishOnboarding } from "@/store/thunks/userThunks";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
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

  const [saving, setSaving] = useState(false);

  const p = useSharedValue(0);

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

  async function handleContinue() {
    if (saving) {
      return;
    }

    if (!data.email?.trim()) {
      return;
    }

    if (!data.firstName?.trim()) {
      return;
    }

    if (!data.lastName?.trim()) {
      return;
    }

    if (!data.username?.trim()) {
      return;
    }

    if (!data.gender?.trim()) {
      return;
    }

    if (!data.avatar?.trim()) {
      return;
    }

    if (!data.faction?.trim()) {
      return;
    }

    if (!Array.isArray(data.interests) || data.interests.length === 0) {
      return;
    }

    if (data.locationGranted && (data.lat === null || data.lng === null)) {
      return;
    }

    try {
      setSaving(true);

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

      const response = await dispatch(
        finishOnboarding(onboardingPayload),
      ).unwrap();

      router.replace("/home");
    } catch (error) {
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppBackground variant="blueMap">
      <View
        style={[
          styles.screen,
          {
            paddingTop: insets.top + 24,
          },
        ]}>
        <View style={styles.titleWrap}>
          <Text style={styles.small}>Welcome To</Text>

          <Text style={styles.big}>COSQUEST</Text>
        </View>

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
