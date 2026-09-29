import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { useAppDispatch } from "@/store/hooks";
import { resetPasswordThunk } from "@/store/thunks/authThunks";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Backend errors that need a special button (exact texts from the API doc).
const INVALID_CODE_ERROR = "That code is invalid or has expired.";
const TOO_MANY_ATTEMPTS_ERROR =
  "Too many incorrect attempts. Request a new code.";

export default function ResetPassword() {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  // Passed along from Forgot Password → Verification → here.
  const params = useLocalSearchParams<{ email?: string; code?: string }>();
  const email = String(params.email || "");
  const code = String(params.code || "");

  const [form, setForm] = useState({
    password: "",
    confirmPassword: "",
  });

  const update = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const [errors, setErrors] = useState<{ [k: string]: string }>({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Same rules the backend enforces, checked here first so the user gets
  // an instant, specific message.
  function validate() {
    const next: { [k: string]: string } = {};
    if (!form.password.trim()) {
      next.password = "Password is required";
    } else if (form.password.length < 8) {
      next.password = "Use at least 8 characters";
    } else if (!/[A-Z]/.test(form.password)) {
      next.password = "Add an uppercase letter";
    } else if (!/[a-z]/.test(form.password)) {
      next.password = "Add a lowercase letter";
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

  async function handleReset() {
    if (submitting) return;

    setServerError("");

    if (!email || !code) {
      // Opened without going through the earlier screens.
      setServerError("Something went wrong. Please request a new code.");
      return;
    }

    if (!validate()) return;

    setSubmitting(true);
    try {
      const result = await dispatch(
        resetPasswordThunk({
          email,
          code,
          newPassword: form.password,
          confirmPassword: form.confirmPassword,
        }),
      ).unwrap();

      // Signed in now (authSlice stored the token). Go into the app —
      // NOTE: use the same destinations your Sign In screen uses after a
      // successful login, if they're different from these.
      if (result?.user?.onboardingComplete === false) {
        router.replace("/onboarding");
      } else {
        router.replace("/(tabs)/home");
      }
    } catch (error) {
      setServerError(
        typeof error === "string" && error
          ? error
          : "Unable to reset your password. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Wrong/expired code, or 5 wrong tries → back to the code screen, where
  // the user can fix the code or tap "Resend Now" for a new one.
  const codeProblem =
    serverError === INVALID_CODE_ERROR ||
    serverError === TOO_MANY_ATTEMPTS_ERROR;

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

          {serverError ? (
            <View style={styles.serverErrorBox}>
              <Text style={styles.serverErrorText}>{serverError}</Text>

              {codeProblem ? (
                <>
                  <Pressable onPress={() => router.back()} hitSlop={8}>
                    <Text style={styles.link}>Back to the code screen</Text>
                  </Pressable>

                  <Text style={styles.hint}>
                    {serverError === TOO_MANY_ATTEMPTS_ERROR
                      ? "Tap “Resend Now” there to get a new code."
                      : "Check the code, or tap “Resend Now” for a new one."}
                  </Text>
                </>
              ) : null}
            </View>
          ) : null}

          <View style={styles.buttons}>
            <Button
              label={submitting ? "Saving..." : "Done"}
              onPress={handleReset}
              variant="brand"
              disabled={submitting}
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
  serverErrorBox: {
    marginTop: 18,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(214,69,69,0.08)",
    alignItems: "center",
    gap: 8,
  },
  serverErrorText: {
    color: "#B42318",
    fontSize: 13,
    textAlign: "center",
  },
  link: {
    color: "#C5399A",
    fontSize: 13,
    fontWeight: "700",
  },
  hint: {
    color: "#5e5e5e",
    fontSize: 12,
    textAlign: "center",
  },
});
