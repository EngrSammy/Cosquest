import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { ErrorText } from "@/components/ErrorText";
import { OnboardingProgress } from "@/components/OnboardingProgress";
import { SelectableCard } from "@/components/SelectableCard";
import { INTERESTS } from "@/constants/interests";
import { ONBOARDING_TOTAL, STEP } from "@/constants/onboarding";
import { useOnboarding } from "@/context/OnboardingContext";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function Interests() {
  const { data, update } = useOnboarding();

  const toggle = (id: string) => {
    const next = data.interests.includes(id)
      ? data.interests.filter((x) => x !== id)
      : [...data.interests, id];
    update({ interests: next });
  };

  const [errors, setErrors] = useState<{ [k: string]: string }>({});

  function validate() {
    const next: { [k: string]: string } = {};
    if (data.interests.length === 0) {
      next.interests = "Choose at least one interest";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  return (
    <AppBackground variant="gradient">
      <ScrollView contentContainerStyle={styles.scroll}>
        <OnboardingProgress step={STEP.interests} total={ONBOARDING_TOTAL} />
        <Text style={styles.headline}>What Are You Into?</Text>
        <Text style={styles.sub}>
          Pick a few — we&apos;ll surface the quests, posts, and people that
          match. You can change these anytime.
        </Text>
        <View style={styles.grid}>
          {INTERESTS.map((i) => (
            <SelectableCard
              key={i.id}
              label={i.label}
              image={i.image}
              selected={data.interests.includes(i.id)}
              onPress={() => toggle(i.id)}
            />
          ))}
        </View>
        <View style={{ alignItems: "center", marginTop: 20 }}>
          <ErrorText>{errors.interests}</ErrorText>
        </View>
        <View style={styles.btn}>
          <Button
            label="Continue"
            variant="brand"
            onPress={() => {
              if (validate()) router.push("/onboarding/permissions");
            }}
          />
        </View>
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 24, paddingBottom: 60 },
  headline: {
    fontSize: 35,
    fontWeight: "800",
    color: "#191922",
    textAlign: "center",
    marginTop: 20,
  },
  sub: {
    fontSize: 14,
    color: "#2b2b2c",
    textAlign: "center",
    marginTop: 10,
    marginBottom: 20,
    lineHeight: 20,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 20,
    marginTop: 50,
  },
  btn: { marginTop: 100 },
});
