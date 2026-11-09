import { FONTS } from "@/constants/fonts";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { OnboardingScreen, useHeroHeight } from "@/components/OnboardingScreen";
import { C } from "@/theme/tokens";
import { themedStyles, useInk, useThemedStyles } from "@/constants/chatTheme";
import { TRIVIA_DOOR } from "@/features/game/run";

function Button({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }]}
    >
      <Text style={[styles.buttonLabel]}>{label}</Text>
    </Pressable>
  );
}

export default function Welcome() {
  // The picture is 400 high on tall phones and shrinks on short ones (an
  // iPhone SE) so the headline and Continue fit without scrolling.
  const heroHeight = useHeroHeight(400, 300);
  const styles = useThemedStyles(STYLE_PAIR);
  return (
    <OnboardingScreen background="plain" topGap={0} centered contentStyle={styles.screen}>
        <View style={styles.body}>
          <Text style={styles.headline}>SCAN, SOLVE,{"\n"}EARN</Text>
          <Image
            source={require("@/assets/images/welcome-page.png")}
            style={[styles.hero, { height: heroHeight }]}
            contentFit="contain"
          />
          <Button
            label="Continue"
            onPress={() => router.push("/onboarding/oauthSignup")}
          />
          {/* The trivia front door: plays with no account and no location (app/trivia.tsx). */}
          {TRIVIA_DOOR ? (
            <Pressable
              onPress={() => router.push("/trivia")}
              accessibilityRole="button"
              hitSlop={8}
              style={({ pressed }) => [styles.trivia, pressed && { opacity: 0.6 }]}
              testID="welcome-trivia"
            >
              <Text style={styles.triviaLabel}>Play trivia now, no sign-up</Text>
            </Pressable>
          ) : null}
        </View>
    </OnboardingScreen>
  );
}

const STYLE_PAIR = themedStyles({
  screen: {
    paddingHorizontal: 25,
    paddingBottom: 24,
  },
  headline: {
    fontFamily: FONTS.bold,
    fontSize: 35,
    fontWeight: "800",
    textAlign: "center",
    color: C.ink,
  },
  body: { justifyContent: "center", gap: 15 },
  hero: { width: "100%", marginVertical: 24 },
  button: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 15,
    borderRadius: 30,
    backgroundColor: C.brand,
    marginTop: 15,
  },
  buttonLabel: { fontFamily: FONTS.semibold, fontSize: 17, fontWeight: "600", color: "#FFFFFF" },
  trivia: { alignItems: "center", paddingVertical: 12 },
  triviaLabel: { fontFamily: FONTS.semibold, fontSize: 16, fontWeight: "600", color: C.brand, textDecorationLine: "underline" },
});
