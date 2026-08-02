import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { ErrorText } from "@/components/ErrorText";
import { Field } from "@/components/Field";
import { OnboardingProgress } from "@/components/OnboardingProgress";
import { Terms } from "@/components/Terms";
import { ONBOARDING_TOTAL, STEP } from "@/constants/onboarding";
import { signUp } from "@/services/auth";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function Signup() {
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
  });

  const update = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const [errors, setErrors] = useState<{ [k: string]: string }>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function validate() {
    const next: { [k: string]: string } = {};
    if (!form.email.trim()) {
      next.email = "Type your email";
    } else if (!form.email.includes("@")) next.email = "Enter a valid email";
    if (!form.password.trim()) {
      next.password = "Password is required";
    } else if (form.password.trim().length < 8) {
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

  async function handleSignup() {
    if (!validate()) return;
    setSubmitError("");
    setSubmitting(true);
    try {
      await signUp(form.email, form.password);
      router.push("/onboarding/createProfile");
    } catch (e) {
      if (e instanceof Error && e.message === "email_taken") {
        setErrors({ email: "This email is already registered" });
      } else {
        setSubmitError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppBackground variant="gradient">
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.screen}>
          <OnboardingProgress step={STEP.account} total={ONBOARDING_TOTAL} />
          <Text style={styles.headline}>We have a space {"\n"} for you!</Text>
          <Field
            label="Email Address"
            leftIcon="mail-outline"
            textContentType="emailAddress"
            autoComplete="email"
            keyboardType="email-address"
            value={form.email}
            onChangeText={(t) => update("email", t)}
            error={errors.email}
          />
          <Field
            label="Password"
            leftIcon="lock-closed-outline"
            secureTextEntry
            textContentType="newPassword"
            autoComplete="new-password"
            value={form.password}
            onChangeText={(t) => update("password", t)}
            error={errors.password}
          />
          <Field
            label="Confirm Password"
            leftIcon="lock-closed-outline"
            secureTextEntry
            textContentType="newPassword"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChangeText={(t) => update("confirmPassword", t)}
            error={errors.confirmPassword}
          />
          <ErrorText>{submitError}</ErrorText>
          <View style={styles.buttons}>
            <Button
              label={submitting ? "Creating account…" : "Sign up"}
              onPress={handleSignup}
              variant="brand"
            />
          </View>

          <Terms />
        </View>
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 25,
  },
  headline: {
    fontSize: 35,
    fontWeight: "800",
    textAlign: "center",
    color: "#191922",
    marginTop: 20,
    marginBottom: 60,
  },
  buttons: { marginTop: 32 },
});
