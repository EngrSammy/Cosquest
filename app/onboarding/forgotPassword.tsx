import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { requestPasswordReset } from "@/services/auth";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ForgotPassword() {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({
    email: "",
  });

  const update = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const [errors, setErrors] = useState<{ [k: string]: string }>({});

  function validate() {
    const next: { [k: string]: string } = {};
    if (!form.email.trim()) {
      next.email = "Type your email address";
    } else if (!form.email.includes("@")) next.email = "Enter a valid email";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  const [submitting, setSubmitting] = useState(false);

  // The backend ALWAYS answers "a code has been sent if the account
  // exists" — on purpose, so nobody can use this screen to find out which
  // emails have accounts. So on success we always go to the code screen,
  // and never say "no account found".
  //
  // The only real errors are:
  //   - 429: more than 3 requests for this account today
  //   - no internet / server down
  async function handleForgot() {
    if (submitting) return;
    if (!validate()) return; // shape (empty / has "@") first

    const email = form.email.trim();

    setSubmitting(true);
    try {
      await requestPasswordReset(email);

      // The email travels to the next screens so the final reset request
      // can send it together with the code.
      router.push({
        pathname: "/onboarding/verification",
        params: { email, flow: "reset" },
      });
    } catch (error) {
      setErrors({
        email:
          error instanceof Error && error.message
            ? error.message
            : "Couldn't send the code. Check your connection and try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppBackground variant="gradient">
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={[styles.screen, { paddingTop: insets.top + 35 }]}>
          <Text style={styles.headline}>Forgot Your Password?</Text>
          <Text style={styles.sub}>
            Enter your email address and we&apos;ll send you a 6-digit code to
            reset your password
          </Text>
          <Field
            label="Email"
            value={form.email}
            onChangeText={(t) => update("email", t)}
            keyboardType="email-address"
            error={errors.email}
          />
          <View style={styles.buttons}>
            <Button
              label={submitting ? "Sending..." : "Send"}
              onPress={handleForgot}
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
