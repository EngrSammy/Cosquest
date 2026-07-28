import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Terms } from "@/components/Terms";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

export default function Signin() {
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
        <Text style={styles.headline}>Welcome back!</Text>
        <Text style={styles.sub}>
          Sign in to your account and continue your journey in the CosQuest
          community.
        </Text>
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
        <View style={styles.buttons}>
          <Button
            label="Sign in"
            onPress={() => router.push("/")}
            variant="brand"
          />
        </View>
        <Text style={styles.forgot}>Forgot password?</Text>

        <Terms />
      </View>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 25,
    paddingBottom: 110,
    justifyContent: "center",
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
  forgot: { color: "#ffffff" },
});
