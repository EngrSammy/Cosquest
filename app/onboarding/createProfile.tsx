import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { ErrorText } from "@/components/ErrorText";
import { Field } from "@/components/Field";
import { OnboardingProgress } from "@/components/OnboardingProgress";
import { ONBOARDING_TOTAL, STEP } from "@/constants/onboarding";
import { useOnboarding } from "@/context/OnboardingContext";
import { checkUsername } from "@/services/user";
import { saveUserProfile } from "@/store/thunks/userThunks";
import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAppDispatch, useAppSelector } from "../../store/hooks";

export default function CreateProfile() {
  const { data, update } = useOnboarding();

  const dispatch = useAppDispatch();

  const { loading } = useAppSelector((state) => state.user);

  /*
   * Get the logged-in user's email from Redux.
   * This is important when the user comes here
   * through Sign In instead of Sign Up.
   */
  const authUser = useAppSelector((state) => state.auth.user);

  const authEmail = authUser?.email?.trim() || "";

  const email = data.email.trim() || authEmail;

  const [errors, setErrors] = useState<{
    [k: string]: string;
  }>({});

  const [ageText, setAgeText] = useState(
    typeof data.age === "number" && Number.isFinite(data.age)
      ? String(data.age)
      : "",
  );

  const [checkingUsername, setCheckingUsername] = useState(false);

  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(
    null,
  );

  function handleAgeChange(text: string) {
    if (text === "") {
      setAgeText("");
      update({ age: null });

      setErrors((previous) => ({
        ...previous,
        age: "",
      }));

      return;
    }

    if (!/^\d+$/.test(text)) {
      return;
    }

    const ageNumber = Number(text);

    if (!Number.isFinite(ageNumber)) {
      return;
    }

    setAgeText(text);
    update({
      age: ageNumber,
    });

    setErrors((previous) => ({
      ...previous,
      age: "",
    }));
  }

  function handleUsernameChange(text: string) {
    update({
      username: text,
    });

    setUsernameAvailable(null);

    setErrors((previous) => ({
      ...previous,
      username: "",
    }));
  }

  function validate() {
    const next: {
      [k: string]: string;
    } = {};

    if (!data.firstName.trim()) {
      next.firstName = "Enter your first name";
    }

    if (!data.lastName.trim()) {
      next.lastName = "Enter your last name";
    }

    if (!data.username.trim()) {
      next.username = "Enter your username";
    }

    if (data.age === null) {
      next.age = "Enter your age";
    } else if (!Number.isFinite(data.age)) {
      next.age = "Enter your age";
    } else if (data.age < 13 || data.age > 120) {
      next.age = "Please enter a valid age (13-120)";
    }

    if (!data.gender.trim()) {
      next.gender = "Choose a gender";
    }

    setErrors(next);

    return Object.keys(next).length === 0;
  }

  async function handleContinue() {
    if (!validate()) return;

    if (data.age === null || !Number.isFinite(data.age)) {
      return;
    }

    /*
     * Make sure we have an email.
     */
    if (!email) {
      setErrors((previous) => ({
        ...previous,
        username: "We could not find your account email. Please sign in again.",
      }));

      return;
    }

    const username = data.username.trim();

    try {
      /*
       * Check username availability.
       */
      setCheckingUsername(true);

      setErrors((previous) => ({
        ...previous,
        username: "",
      }));

      console.log("CHECKING USERNAME:", username);

      const usernameResult = await checkUsername(username, email);

      console.log("USERNAME CHECK RESPONSE:", usernameResult);

      /*
       * The backend may return:
       *
       * { available: true }
       * { available: false }
       *
       * or similar fields.
       */
      const result = usernameResult as {
        available?: boolean;
        isAvailable?: boolean;
        taken?: boolean;
        exists?: boolean;
        message?: string;
      };

      let available: boolean | null = null;

      if (typeof result.available === "boolean") {
        available = result.available;
      } else if (typeof result.isAvailable === "boolean") {
        available = result.isAvailable;
      } else if (typeof result.taken === "boolean") {
        available = !result.taken;
      } else if (typeof result.exists === "boolean") {
        available = !result.exists;
      }

      /*
       * Explicitly unavailable.
       */
      if (available === false) {
        setUsernameAvailable(false);

        setErrors((previous) => ({
          ...previous,
          username:
            result.message ||
            "This username is already taken. Please choose another username.",
        }));

        return;
      }

      /*
       * Username is available.
       */
      if (available === true) {
        setUsernameAvailable(true);
      }

      /*
       * Save the profile.
       */
      console.log("SAVING PROFILE:", {
        email,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        username,
        age: data.age,
        gender: data.gender,
      });

      const profileResult = await dispatch(
        saveUserProfile({
          email,
          firstName: data.firstName.trim(),
          lastName: data.lastName.trim(),
          username,
          age: data.age,
          gender: data.gender,
        }),
      );

      if (saveUserProfile.fulfilled.match(profileResult)) {
        console.log("PROFILE SAVE SUCCESS:", profileResult.payload);

        /*
         * Make sure the email remains in
         * onboarding context for the next screens.
         */
        update({
          email,
        });

        router.push("/onboarding/uploadPicture");

        return;
      }

      /*
       * Backend rejected profile.
       */
      const backendError =
        typeof profileResult.payload === "string"
          ? profileResult.payload
          : "Failed to save your profile.";

      console.log("PROFILE SAVE ERROR:", backendError);

      setErrors((previous) => ({
        ...previous,
        username: backendError,
      }));
    } catch (error) {
      console.log("USERNAME CHECK / PROFILE ERROR:", error);

      const message =
        typeof error === "string"
          ? error
          : error instanceof Error
            ? error.message
            : "Unable to save your profile. Please try again.";

      setErrors((previous) => ({
        ...previous,
        username: message,
      }));

      setUsernameAvailable(false);
    } finally {
      setCheckingUsername(false);
    }
  }

  const isSaving = loading || checkingUsername;

  return (
    <AppBackground variant="gradient">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          <OnboardingProgress step={STEP.profile} total={ONBOARDING_TOTAL} />

          <Text style={styles.headline}>Create Your Profile</Text>

          <Text style={styles.sub}>
            This is how you will show up in the community{"\n"}
            and on the Bounty Board.
          </Text>

          {/* FIRST NAME / LAST NAME */}

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field
                label="First Name"
                value={data.firstName}
                onChangeText={(text) => {
                  update({
                    firstName: text,
                  });

                  setErrors((previous) => ({
                    ...previous,
                    firstName: "",
                  }));
                }}
                error={errors.firstName}
                autoCapitalize="words"
              />
            </View>

            <View style={{ flex: 1 }}>
              <Field
                label="Last Name"
                value={data.lastName}
                onChangeText={(text) => {
                  update({
                    lastName: text,
                  });

                  setErrors((previous) => ({
                    ...previous,
                    lastName: "",
                  }));
                }}
                error={errors.lastName}
                autoCapitalize="words"
              />
            </View>
          </View>

          {/* USERNAME */}

          <Field
            label="Username"
            value={data.username}
            onChangeText={handleUsernameChange}
            autoCapitalize="none"
            error={errors.username}
          />

          {checkingUsername ? (
            <Text style={styles.usernameChecking}>Checking username...</Text>
          ) : usernameAvailable === true ? (
            <Text style={styles.usernameAvailable}>Username available ✓</Text>
          ) : null}

          {/* AGE / GENDER */}

          <View style={styles.row}>
            <View style={{ flex: 0.5 }}>
              <Field
                label="Age"
                value={ageText}
                onChangeText={handleAgeChange}
                keyboardType="numeric"
                error={errors.age}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Gender</Text>

              <View style={styles.seg}>
                {(["Male", "Female"] as const).map((gender) => (
                  <Pressable
                    key={gender}
                    style={[
                      styles.segBtn,
                      data.gender === gender && styles.segActive,
                    ]}
                    onPress={() => {
                      update({
                        gender,
                      });

                      setErrors((previous) => ({
                        ...previous,
                        gender: "",
                      }));
                    }}
                    disabled={isSaving}>
                    <Text
                      style={[
                        styles.segText,
                        data.gender === gender && styles.segTextActive,
                      ]}>
                      {gender}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <ErrorText>{errors.gender}</ErrorText>
            </View>
          </View>

          {/* CONTINUE */}

          <View style={styles.buttonContainer}>
            <Button
              label={
                checkingUsername
                  ? "Checking username..."
                  : loading
                    ? "Saving..."
                    : "Continue"
              }
              variant="brand"
              onPress={handleContinue}
              disabled={isSaving}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 24,
    paddingBottom: 80,
  },

  headline: {
    fontSize: 35,
    fontWeight: "800",
    textAlign: "center",
    color: "#191922",
    marginTop: 20,
  },

  sub: {
    fontSize: 14,
    color: "#2b2b2c",
    textAlign: "center",
    marginTop: 10,
    marginBottom: 50,
    lineHeight: 20,
  },

  row: {
    flexDirection: "row",
    gap: 15,
  },

  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#191922",
    marginBottom: 6,
  },

  seg: {
    flexDirection: "row",
    gap: 8,
  },

  segBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: "rgba(187, 165, 165, 1)",
    backgroundColor: "rgba(255,255,255,0.20)",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: {
      width: 0,
      height: 5,
    },
  },

  segActive: {
    borderColor: "#C5399A",
    backgroundColor: "#fff",
  },

  segText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#191922",
  },

  segTextActive: {
    color: "#C5399A",
  },

  usernameChecking: {
    color: "#666",
    fontSize: 12,
    marginTop: -10,
    marginBottom: 12,
    marginLeft: 4,
  },

  usernameAvailable: {
    color: "#1FA85A",
    fontSize: 12,
    fontWeight: "600",
    marginTop: -10,
    marginBottom: 12,
    marginLeft: 4,
  },

  buttonContainer: {
    marginTop: 80,
  },
});
