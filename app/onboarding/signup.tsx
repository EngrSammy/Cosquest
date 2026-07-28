import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { OnboardingProgress } from "@/components/OnboardingProgress";
import { Terms } from "@/components/Terms";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

export default function Signup() {
  const [form, setForm] = useState({
    emailOrUsername: "",
    password: "",
    confirmPassword: "",
  });

  const update = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <AppBackground variant="gradient">
      <View style={styles.screen}>
        <OnboardingProgress step={2} total={6} />
        <Text style={styles.headline}>We have a space for you.</Text>
        <Field
          label="Email or Username"
          value={form.emailOrUsername}
          onChangeText={(t) => update("emailOrUsername", t)}
        />
        <Field
          label="Password"
          value={form.password}
          onChangeText={(t) => update("password", t)}
          secureTextEntry
        />
        <Field
          label="Confirm Password"
          value={form.confirmPassword}
          onChangeText={(t) => update("confirmPassword", t)}
          secureTextEntry
        />
        <View style={styles.buttons}>
          <Button
            label="Sign up"
            onPress={() => router.push("/onboarding/createProfile")}
            variant="brand"
          />
        </View>

        <Terms />
      </View>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 25,
    paddingBottom: 70,
    justifyContent: "center",
  },
  headline: {
    fontSize: 35,
    fontWeight: "800",
    textAlign: "center",
    color: "#191922",
    marginTop: 50,
    marginBottom: 50,
  },
  sub: {
    fontSize: 14,
    color: "#2b2b2c",
    textAlign: "center",
    marginTop: 10,
    marginBottom: 50,
    lineHeight: 20,
  },
  row: { flexDirection: "row", gap: 15 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: "#191922", marginBottom: 6 },
  input: {
    backgroundColor: "rgba(255,255,255,0.7)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#191922",
  },
  buttons: { marginTop: 32 },
});
