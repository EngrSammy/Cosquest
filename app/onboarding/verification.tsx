import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { CodeInput } from "@/components/CodeInputs";
import { ErrorText } from "@/components/ErrorText";
import { requestPasswordReset } from "@/services/auth";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// There is no separate "check this code" endpoint on the backend: the code
// is checked in the LAST step (reset-password), together with the new
// password. So this screen only makes sure 6 digits were typed, then
// carries the email + code on to the Reset Password screen.
export default function Verification() {
  const insets = useSafeAreaInsets();

  // Sent here by the Forgot Password screen.
  const params = useLocalSearchParams<{ email?: string }>();
  const email = String(params.email || "");

  const [form, setForm] = useState({
    code: "",
  });

  const update = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const [resendMsg, setResendMsg] = useState("");
  const [resendError, setResendError] = useState("");
  const [resending, setResending] = useState(false);

  // Sends a NEW code to the same email. The previous code stops working
  // (only the newest one is valid), and it counts towards the backend's
  // limit of 3 codes per account per day.
  async function handleResend() {
    if (resending) return;
    setResendMsg("");
    setResendError("");

    if (!email) {
      setResendError("Go back and enter your email again.");
      return;
    }

    setResending(true);
    try {
      await requestPasswordReset(email);
      setForm({ code: "" });
      setResendMsg("A new code has been sent. Only the newest code works.");
    } catch (error) {
      // e.g. "Too many password reset requests for this account today..."
      setResendError(
        error instanceof Error && error.message
          ? error.message
          : "Couldn't resend. Please try again.",
      );
    } finally {
      setResending(false);
    }
  }

  const [verifyError, setVerifyError] = useState("");

  function handleVerify() {
    setVerifyError("");

    const code = form.code.trim();

    if (!/^\d{6}$/.test(code)) {
      setVerifyError("Enter the 6-digit code");
      return;
    }

    if (!email) {
      setVerifyError("Go back and enter your email again.");
      return;
    }

    // The code travels as TEXT, so a code like "049302" keeps its 0.
    router.push({
      pathname: "/onboarding/resetPassword",
      params: { email, code },
    });
  }

  return (
    <AppBackground variant="gradient">
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={[styles.screen, { paddingTop: insets.top + 35 }]}>
          <Text style={styles.headline}>Verification</Text>
          <Text style={styles.sub}>
            Enter the 6-digit code sent to{"\n"}
            {email ? (
              <Text style={styles.email}>{email}</Text>
            ) : (
              "your email address"
            )}
            {"\n"}It expires in 5 minutes.
          </Text>
          <CodeInput
            value={form.code}
            onChangeText={(t) => update("code", t)}
          />
          <ErrorText>{verifyError}</ErrorText>

          <View style={styles.resendWrap}>
            <Text style={styles.resendPrompt}>
              Didn&apos;t receive the code?
            </Text>
            <Text
              style={[styles.resend, resending && { opacity: 0.7 }]}
              onPress={handleResend}>
              {resending ? "Sending..." : "Resend Now"}
            </Text>
            <ErrorText>{resendError}</ErrorText>
            {resendMsg ? (
              <Text style={styles.resendOk}>{resendMsg}</Text>
            ) : null}
          </View>

          <View style={styles.buttons}>
            <Button label="Verify" onPress={handleVerify} variant="brand" />
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
  email: { fontWeight: "700", color: "#191922" },
  resendWrap: { alignItems: "center", gap: 6, marginTop: 20, marginBottom: 20 },
  resendPrompt: { fontSize: 15, color: "#2b2b2c" },
  resend: { color: "#C5399A", fontWeight: "700", fontSize: 16 },
  resendOk: {
    color: "#2E9E5B",
    fontSize: 12,
    textAlign: "center",
    marginTop: 6,
  },
  buttons: { marginTop: 35 },
});
