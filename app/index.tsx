import { AppBackground } from "@/components/AppBackground";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

export default function Index() {
  useEffect(() => {
    // No auth yet → after a brief splash, enter onboarding.
    // Later: check for a saved session and router.replace("/home") if signed in.
    const t = setTimeout(() => router.replace("/onboarding"), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <AppBackground variant="plain">
      <View style={styles.screen}>
        <Image
          source={require("@/assets/images/cosquest-logo.png")}
          style={styles.logo}
          contentFit="contain"
        />
      </View>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { width: 220, height: 90 },
});
