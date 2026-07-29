import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { CodeInput } from "@/components/CodeInputs";
import { ErrorText } from "@/components/ErrorText";
import { resendCode, verifyCode } from "@/services/auth";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function ForgetPassword() {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({
    code: "",
  });

  const update = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const [resendMsg, setResendMsg] = useState("");
  const [resendError, setResendError] = useState("");
  const [resending, setResending] = useState(false);

  async function handleResend() {
    if (resending) return;
    setResendMsg("");
    setResendError("");
    setResending(true);
    try {
      await resendCode();
      setResendMsg("A new code has been sent.");
    } catch {
      setResendError("Couldn't resend. Please try again.");
    } finally {
      setResending(false);
    }
  }

  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  async function handleVerify() {
    if (verifying) return;
    setVerifyError("");
    if (form.code.length !== 6) {
      setVerifyError("Enter the 6-digit code");
      return;
    }
    setVerifying(true);
    try {
      await verifyCode(form.code);
      router.push("/onboarding/resetPassword"); // success → advance
    } catch {
      setVerifyError("That code isn't right. Check and try again.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <AppBackground variant="gradient">
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={[styles.screen, { paddingTop: insets.top + 35 }]}>
          <Text style={styles.headline}>Verification</Text>
          <Text style={styles.sub}>
            Enter the code sent to your email address
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
              onPress={handleResend}
            >
              {resending ? "Sending..." : "Resend Now"}
            </Text>
            <ErrorText>{resendError}</ErrorText>
            {resendMsg ? (
              <Text style={styles.resendOk}>{resendMsg}</Text>
            ) : null}
          </View>

          <View style={styles.buttons}>
            <Button
              label={verifying ? "Verifying..." : "Verify"}
              onPress={handleVerify}
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
