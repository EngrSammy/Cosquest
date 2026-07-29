import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { ErrorText } from "@/components/ErrorText";
import { Field } from "@/components/Field";
import { signIn } from "@/services/auth";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function Signin() {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({
    emailOrUsername: "",
    password: "",
  });

  const update = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const [errors, setErrors] = useState<{ [k: string]: string }>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function validate() {
    const next: { [k: string]: string } = {};
    if (!form.emailOrUsername.trim())
      next.emailOrUsername = "Type your email or username";
    if (!form.password.trim()) next.password = "Password is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSignin() {
    if (!validate()) return;
    setSubmitError("");
    setSubmitting(true);
    try {
      await signIn(form.emailOrUsername, form.password);
      router.replace("/");
    } catch {
      setSubmitError("Incorrect email/username or password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppBackground variant="gradient">
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={[styles.screen, { paddingTop: insets.top + 35 }]}>
          <Text style={styles.headline}>Welcome back!</Text>
          <Text style={styles.sub}>
            Sign in to your account and continue your journey in the CosQuest
            community.
          </Text>
          <Field
            label="Email or Username"
            leftIcon="mail-outline"
            textContentType="username"
            autoComplete="username"
            value={form.emailOrUsername}
            onChangeText={(t) => update("emailOrUsername", t)}
            error={errors.emailOrUsername}
          />
          <Field
            label="Password"
            leftIcon="lock-closed-outline"
            secureTextEntry
            textContentType="password"
            autoComplete="current-password"
            value={form.password}
            onChangeText={(t) => update("password", t)}
            error={errors.password}
          />
          <ErrorText>{submitError}</ErrorText>
          <View style={styles.buttons}>
            <Button
              label={submitting ? "Signing in…" : "Sign in"}
              onPress={handleSignin}
              variant="brand"
            />
          </View>
          <Text
            style={styles.forgot}
            onPress={() => router.push("/onboarding/forgotPassword")}
          >
            Forgot password?
          </Text>
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
