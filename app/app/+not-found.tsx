// A link the app has no screen for (an old or mistyped cosquest:// link, e.g.
// the message link fallback cosquest://chat/<id>/message/<id>). Without this
// expo-router showed its own developer page ("Unmatched Route"), a dead end.
import { AppBackground } from "@/components/AppBackground";
import { FONTS } from "@/constants/fonts";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { C } from "@/theme/tokens";

export default function NotFound() {
  return (
    <AppBackground variant="blueGradient">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.center}>
        <Ionicons name="compass-outline" size={44} color={C.brand} />
        <Text style={styles.title} accessibilityRole="header">
          This link doesn&apos;t go anywhere
        </Text>
        <Text style={styles.body}>It may be old, or the thing it pointed to has gone.</Text>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          accessibilityRole="button"
          onPress={() => router.replace("/home")}>
          <Text style={styles.buttonText}>Go to your chats</Text>
        </Pressable>
      </View>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 12 },
  title: { fontFamily: FONTS.semibold, fontSize: 20, color: C.ink, textAlign: "center" },
  body: { fontFamily: FONTS.regular, fontSize: 15, color: C.slate, textAlign: "center" },
  button: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 24,
    backgroundColor: C.brand,
  },
  pressed: { opacity: 0.8 },
  buttonText: { fontFamily: FONTS.semibold, fontSize: 15, color: "#FFFFFF" },
});
