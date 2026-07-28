import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function Signin() {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({
    emailOrUsername: "",
    password: "",
    confirmPassword: "",
  });

  const update = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <AppBackground variant="gradient">
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={[styles.screen, { paddingTop: insets.top + 35 }]}>
          <Text style={styles.headline}>Reset Password</Text>
          <Text style={styles.sub}>Enter your new password</Text>
          <Field
            label="New password"
            value={form.password}
            onChangeText={(t) => update("password", t)}
            secureTextEntry
          />
          <Field
            label="Confirm your new password"
            value={form.password}
            onChangeText={(t) => update("password", t)}
            secureTextEntry
          />
          <View style={styles.buttons}>
            <Button
              label="Done"
              onPress={() => router.push("/onboarding/signin")}
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
    paddingBottom: 110,
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
  forgot: { color: "#5e5e5e", textAlign: "center", marginTop: 30 },
});
