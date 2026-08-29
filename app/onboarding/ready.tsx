import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { Image } from "expo-image";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function Ready() {
  const insets = useSafeAreaInsets();

  return (
    <AppBackground variant="blueMap">
      <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
        <View style={styles.titleWrap}>
          <Text style={styles.small}>Welcome To</Text>
          <Text style={styles.big}>COSQUEST</Text>
        </View>

        {/* Layered scene — children are absolutely positioned within.
            The two side heroes sit behind; the main hero sits in front,
            center-bottom. Arrow + pins overlay on top. Tune the
            top/left/right/bottom numbers to match the mockup exactly. */}
        <View style={styles.scene}>
          <Image
            source={require("@/assets/images/ready/left_hero.png")}
            style={styles.leftHero}
            contentFit="contain"
          />
          <Image
            source={require("@/assets/images/ready/right_hero.png")}
            style={styles.rightHero}
            contentFit="contain"
          />
          <Image
            source={require("@/assets/images/ready/hero.png")}
            style={styles.mainHero}
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
            label="Continue"
            variant="brand"
            onPress={() => router.replace("/home")}
          />
        </View>
      </View>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 24, paddingBottom: 24 },
  titleWrap: { alignItems: "center" },
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

  scene: { flex: 1, position: "relative", marginTop: 12 },

  // two behind, higher up
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
  // main in front, center-bottom, largest
  mainHero: {
    position: "absolute",
    left: 33,
    right: 30,
    bottom: 0,
    width: "85%",
    height: "80%",
    zIndex: 3,
  },

  // overlays
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

  btn: { paddingTop: 5, paddingBottom: 30 },
});
