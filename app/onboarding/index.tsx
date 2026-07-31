import { AppBackground } from "@/components/AppBackground";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

function Button({ label, onPress }: { label: string; onPress: () => void }) {
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
  return (
    <AppBackground variant="plain">
      <View style={styles.screen}>
        <View style={styles.body}>
          <Text style={styles.headline}>SCAN, SOLVE,{"\n"}EARN</Text>
          <Image
            source={require("@/assets/images/welcome-page.png")}
            style={styles.hero}
            contentFit="contain"
          />
          <Button
            label="Continue"
            onPress={() => router.push("/onboarding/authSignup")}
          />
        </View>
      </View>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 25,
    paddingBottom: 24,
    justifyContent: "center",
  },
  headline: {
    fontSize: 35,
    fontWeight: "800",
    textAlign: "center",
    color: "#191922",
  },
  body: { flex: 1, justifyContent: "center", gap: 15 },
  hero: { width: "100%", height: 400, marginVertical: 24 },
  button: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 15,
    borderRadius: 30,
    backgroundColor: "#C5399A",
    marginTop: 15,
  },
  buttonLabel: { fontSize: 17, fontWeight: "600", color: "#FFFFFF" },
});
