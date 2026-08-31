import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { ErrorText } from "@/components/ErrorText";
import { OnboardingProgress } from "@/components/OnboardingProgress";
import { AVATARS } from "@/constants/avatars";
import { ONBOARDING_TOTAL, STEP } from "@/constants/onboarding";
import { useOnboarding } from "@/context/OnboardingContext";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export default function CreateProfile() {
  const useOnboardingContext = useOnboarding();
  const { data, update } = useOnboardingContext;

  const [errors, setErrors] = useState<{ [k: string]: string }>({});

  function validate() {
    const next: { [k: string]: string } = {};
    if (!data.avatar.trim()) {
      next.avatar = "Choose an avatar";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  return (
    <AppBackground variant="gradient">
      <ScrollView contentContainerStyle={styles.scroll}>
        <OnboardingProgress
          step={STEP.uploadPicture}
          total={ONBOARDING_TOTAL}
        />
        <Text style={styles.headline}>Upload Profile Picture</Text>
        <Text style={styles.profileLabel}>
          <Text>Profile Picture </Text>
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
    textAlign: "center",
    fontSize: 15,
    color: "#000",
    fontWeight: "700",
    marginTop: 10,
    marginBottom: 20,
  },
  hint: {
    fontWeight: "500",
    color: "#4c4c4d",
    fontSize: 14,
  },
});
