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

  const [errors, setErrors] = useState<{ [k: string]: string }>({});

  function validate() {
    const next: { [k: string]: string } = {};
    if (!form.password.trim()) {
      next.password = "Password is required";
    } else if (form.password.length < 8) {
      next.password = "Use at least 8 characters";
    } else if (!/[A-Z]/.test(form.password)) {
      next.password = "Add an uppercase letter";
    } else if (!/[0-9]/.test(form.password)) {
      next.password = "Add a number";
    } else if (!/[^A-Za-z0-9]/.test(form.password)) {
      next.password = "Add a special character";
    }

    if (!form.confirmPassword.trim()) {
      next.confirmPassword = "Confirm your password";
    } else if (form.confirmPassword !== form.password) {
      next.confirmPassword = "Passwords do not match";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

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
            textContentType="newPassword"
            autoComplete="new-password"
            error={errors.password}
          />
          <Field
            label="Confirm your new password"
            value={form.confirmPassword}
            onChangeText={(t) => update("confirmPassword", t)}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="new-password"
            error={errors.confirmPassword}
          />
          <View style={styles.buttons}>
            <Button
              label="Done"
              onPress={() => {
                if (validate()) router.push("/onboarding/signin");
              }}
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
