import { AppBackground } from "@/components/AppBackground";
import { store } from "@/store/store";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

export default function Index() {
  useEffect(() => {
    // After a brief splash:
    //   logged in (saved login - see components/SessionGate) -> home
    //   logged in but onboarding not finished               -> onboarding
    //   not logged in                                       -> onboarding
    const t = setTimeout(() => {
      const { token, user } = store.getState().auth;

      if (token && user?.onboardingComplete !== false) {
        router.replace("/home");
        return;
      }

      router.replace("/onboarding");
    }, 1500);

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
