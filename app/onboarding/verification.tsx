import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
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

  return (
    <AppBackground variant="gradient">
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={[styles.screen, { paddingTop: insets.top + 35 }]}>
          <Text style={styles.headline}>Verification</Text>
          <Text style={styles.sub}>
            Enter the code sent to your email address
          </Text>
          <Field
            label=""
            value={form.code}
            onChangeText={(t) => update("code", t)}
          />

          <Text style={styles.verification}>
            <Text>Didn't receive code?</Text>
            <Text style={styles.resend}>Resend Now</Text>
          </Text>

          <View style={styles.buttons}>
            <Button
              label="Verify"
              onPress={() => router.push("/onboarding/resetPassword")}
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
  row: { flexDirection: "row", gap: 15 },
  verification: {
    textAlign: "center",
    fontSize: 15,
    color: "#2b2b2c",
    gap: 5,
    marginTop: 20,
    marginBottom: 20,
  },
  resend: { color: "#C5399A", fontWeight: 700, fontSize: 18 },
  buttons: { marginTop: 32 },
});
