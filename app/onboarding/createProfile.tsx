import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { ErrorText } from "@/components/ErrorText";
import { Field } from "@/components/Field";
import { OnboardingProgress } from "@/components/OnboardingProgress";
import { AVATARS } from "@/constants/avatars";
import { ONBOARDING_TOTAL, STEP } from "@/constants/onboarding";
import { useOnboarding } from "@/context/OnboardingContext";
import { Image } from "expo-image";
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

export default function CreateProfile() {
  const useOnboardingContext = useOnboarding();
  const { data, update } = useOnboardingContext;

  const [errors, setErrors] = useState<{ [k: string]: string }>({});

  function validate() {
    const next: { [k: string]: string } = {};
    if (!data.firstName.trim()) {
      next.firstName = "Enter your first name";
    }
    if (!data.lastName.trim()) {
      next.lastName = "Enter your last name";
    }
    if (!data.username.trim()) {
      next.username = "Enter your username";
    }
    if (!data.age.trim()) {
      next.age = "Enter your age";
    }
    if (!data.gender.trim()) {
      next.gender = "Choose a gender";
    }
    if (!data.avatar.trim()) {
      next.avatar = "Choose an avatar";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  return (
    <AppBackground variant="gradient">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <OnboardingProgress step={STEP.profile} total={ONBOARDING_TOTAL} />
          <Text style={styles.headline}>Create Your Profile</Text>
          <Text style={styles.sub}>
            This is how you will show up in the community{"\n"}and on the Bounty
            Board.
          </Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field
                label="First Name"
                value={data.firstName}
                onChangeText={(t) => update({ firstName: t })}
                error={errors.firstName}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Last Name"
                value={data.lastName}
                onChangeText={(t) => update({ lastName: t })}
                error={errors.lastName}
              />
            </View>
          </View>
          <Field
            label="Username"
            value={data.username}
            onChangeText={(t) => update({ username: t })}
            error={errors.username}
          />
          <View style={styles.row}>
            <View style={{ flex: 0.5 }}>
              <Field
                label="Age"
                value={data.age}
                onChangeText={(t) => update({ age: t })}
                keyboardType="numeric"
                error={errors.age}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Gender</Text>
              <View style={styles.seg}>
                {(["Male", "Female"] as const).map((g) => (
                  <Pressable
                    key={g}
                    style={[
                      styles.segBtn,
                      data.gender === g && styles.segActive,
                    ]}
                    onPress={() => update({ gender: g })}
                  >
                    <Text
                      style={[
                        styles.segText,
                        data.gender === g && styles.segTextActive,
                      ]}
                    >
                      {g}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <ErrorText>{errors.gender}</ErrorText>
            </View>
          </View>

          <Text style={styles.profileLabel}>
            <Text
              style={{ color: "#C5399A" }}
              onPress={() => router.push("/onboarding/uploadPicture")}
            >
              Profile Picture{" "}
            </Text>
            <Text style={styles.hint}>· take a photo or pick an avatar</Text>
          </Text>

          <View style={styles.grid}>
            {AVATARS.map((a) => (
              <Pressable
                key={a.id}
                style={[
                  styles.avatar,
                  data.avatar === a.id && styles.avatarActive,
                ]}
                onPress={() => update({ avatar: a.id })}
              >
                <Image
                  source={a.source}
                  style={styles.avatarImg}
                  contentFit="cover"
                />
              </Pressable>
            ))}
          </View>
          <ErrorText>{errors.avatar}</ErrorText>

          <View style={{ marginTop: 80 }}>
            <Button
              label="Continue"
              variant="brand"
              onPress={() => {
                if (validate()) router.push("/onboarding/interests");
              }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 24, paddingBottom: 80 },
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
  row: { flexDirection: "row", gap: 15 },
  label: { fontSize: 13, fontWeight: "600", color: "#191922", marginBottom: 6 },
  seg: { flexDirection: "row", gap: 8 },
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
    shadowOffset: { width: 0, height: 5 },
  },
  segActive: {
    borderColor: "#C5399A",
    backgroundColor: "#fff",
  },
  segText: { fontSize: 14, fontWeight: "700", color: "#191922" },
  segTextActive: { color: "#C5399A" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  avatar: {
    width: "18%",
    aspectRatio: 1,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(150,150,160,0.30)",
  },
  avatarActive: { borderColor: "#C5399A", borderWidth: 2 },
  avatarImg: { width: "100%", height: "100%", transform: [{ scale: 1.12 }] },
  profileLabel: {
    color: "#000",
    fontWeight: "700",
    marginTop: 20,
    marginBottom: 20,
  },
  hint: { fontWeight: "500", color: "#4c4c4d", fontSize: 14 },
});
