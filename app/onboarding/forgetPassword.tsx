import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ForgetPassword() {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({
    email: "",
  });

  const update = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <AppBackground variant="gradient">
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={[styles.screen, { paddingTop: insets.top + 35 }]}>
          <Text style={styles.headline}>Forgot Your Password?</Text>
          <Text style={styles.sub}>
            Enter your email address to recover your password
          </Text>
          <Field
            label="Email"
            value={form.email}
            onChangeText={(t) => update("email", t)}
          />
          <View style={styles.buttons}>
            <Button
              label="Send"
              onPress={() => router.push("/onboarding/verification")}
              variant="brand"
            />
          </View>
        </View>
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 25,
    paddingBottom: 70,
  },
  headline: {
    fontSize: 35,
    fontWeight: "800",
    textAlign: "center",
    color: "#191922",
  },
  sub: {
    fontSize: 14,
    color: "#2b2b2c",
    textAlign: "center",
    marginTop: 20,
    marginBottom: 50,
    lineHeight: 20,
  },
  buttons: { marginTop: 32 },
});
