import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { ErrorText } from "@/components/ErrorText";
import { Field } from "@/components/Field";
import { useOnboarding } from "@/context/OnboardingContext";
import { loginUser } from "@/store/thunks/authThunks";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppDispatch, useAppSelector } from "../../store/hooks";

export default function Signin() {
  const insets = useSafeAreaInsets();

  const dispatch = useAppDispatch();

  const { update } = useOnboarding();

  const { loading, error } = useAppSelector((state) => state.auth);

  const [form, setForm] = useState({
    emailOrUsername: "",
    password: "",
  });

  const [errors, setErrors] = useState<{
    [k: string]: string;
  }>({});

  const updateForm = (key: keyof typeof form, value: string) => {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  function validate() {
    const next: { [k: string]: string } = {};

    if (!form.emailOrUsername.trim()) {
      next.emailOrUsername = "Type your email or username";
    }

    if (!form.password.trim()) {
      next.password = "Password is required";
    }

    setErrors(next);

    return Object.keys(next).length === 0;
  }

  async function handleSignin() {
    if (!validate()) return;

    const result = await dispatch(
      loginUser({
        emailOrUsername: form.emailOrUsername.trim(),
        password: form.password,
      }),
    );

    if (!loginUser.fulfilled.match(result)) {
      return;
    }

    console.log("LOGIN RESPONSE:", result.payload);

    const response = result.payload;
    const loggedInUser = response?.user;

    if (!loggedInUser) {
      console.log("LOGIN ERROR: No user returned:", response);
      return;
    }

    /*
     * Save the logged-in user's email.
     * Onboarding screens use this email when saving data.
     */
    update({
      email: loggedInUser.email,
    });

    console.log("LOGIN USER:", loggedInUser);
    console.log("ONBOARDING COMPLETE:", loggedInUser.onboardingComplete);

    /*
     * USER HAS NOT COMPLETED ONBOARDING
     */
    if (loggedInUser.onboardingComplete === false) {
      router.replace("/onboarding/createProfile");
      return;
    }

    /*
     * USER HAS COMPLETED ONBOARDING
     */
    if (loggedInUser.onboardingComplete === true) {
      router.replace("/home");
      return;
    }

    /*
     * Unexpected/missing onboarding status
     */
    console.log("Could not determine onboarding status:", loggedInUser);
  }

  return (
    <AppBackground variant="gradient">
      <ScrollView keyboardShouldPersistTaps="handled">
        <View
          style={[
            styles.screen,
            {
              paddingTop: insets.top + 35,
            },
          ]}>
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
            onChangeText={(text) => updateForm("emailOrUsername", text)}
            error={errors.emailOrUsername}
            autoCapitalize="none"
          />

          <Field
            label="Password"
            leftIcon="lock-closed-outline"
            secureTextEntry
            textContentType="password"
            autoComplete="current-password"
            value={form.password}
            onChangeText={(text) => updateForm("password", text)}
            error={errors.password}
          />

          <ErrorText>{error || ""}</ErrorText>

          <View style={styles.buttons}>
            <Button
              label={loading ? "Signing in…" : "Sign in"}
              onPress={handleSignin}
              variant="brand"
              disabled={loading}
            />
          </View>

          <Pressable onPress={() => router.push("/onboarding/forgotPassword")}>
            <Text style={styles.forgot}>Forgot password?</Text>
          </Pressable>

          <View style={styles.signupRow}>
            <Text style={styles.signupText}>Don't have an account? </Text>

            <Pressable onPress={() => router.push("/onboarding/signup")}>
              <Text style={styles.signupLink}>Sign up</Text>
            </Pressable>
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

  buttons: {
    marginTop: 32,
  },

  forgot: {
    color: "#5e5e5e",
    textAlign: "center",
    marginTop: 30,
  },

  signupRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 22,
  },

  signupText: {
    color: "#5e5e5e",
    fontSize: 14,
  },

  signupLink: {
    color: "#C5399A",
    fontSize: 14,
    fontWeight: "700",
  },
});
