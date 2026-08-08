import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { ErrorText } from "@/components/ErrorText";
import { Field } from "@/components/Field";
import { OnboardingProgress } from "@/components/OnboardingProgress";
import { Terms } from "@/components/Terms";
import { ONBOARDING_TOTAL, STEP } from "@/constants/onboarding";
import { useOnboarding } from "@/context/OnboardingContext";
import { signUp } from "@/services/auth";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function Signup() {
  const useOnboardingContext = useOnboarding();
  const { data, update } = useOnboardingContext;
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<{ [k: string]: string }>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function validate() {
    const next: { [k: string]: string } = {};
    if (!data.email.trim()) {
      next.email = "Type your email";
    } else if (!data.email.includes("@")) next.email = "Enter a valid email";
    if (!data.password.trim()) {
      next.password = "Password is required";
    } else if (data.password.length < 8) {
      next.password = "Use at least 8 characters";
    } else if (!/[A-Z]/.test(data.password)) {
      next.password = "Add an uppercase letter";
    } else if (!/[0-9]/.test(data.password)) {
      next.password = "Add a number";
    } else if (!/[^A-Za-z0-9]/.test(data.password)) {
      next.password = "Add a special character";
    }

    if (!confirmPassword.trim()) {
      next.confirmPassword = "Confirm your password";
    } else if (confirmPassword !== data.password) {
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
      await signUp(data.email, data.password);
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
            value={data.email}
            onChangeText={(t) => update({ email: t })}
            error={errors.email}
          />
          <Field
            label="Password"
            leftIcon="lock-closed-outline"
            secureTextEntry
            textContentType="newPassword"
            autoComplete="new-password"
            value={data.password}
            onChangeText={(t) => update({ password: t })}
            error={errors.password}
          />
          <Field
            label="Confirm Password"
            leftIcon="lock-closed-outline"
            secureTextEntry
            textContentType="newPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
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
