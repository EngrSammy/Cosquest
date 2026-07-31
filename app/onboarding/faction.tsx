import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { ErrorText } from "@/components/ErrorText";
import { OnboardingProgress } from "@/components/OnboardingProgress";
import { SelectableCard } from "@/components/SelectableCard";
import { FACTIONS } from "@/constants/factions";
import { ONBOARDING_TOTAL, STEP } from "@/constants/onboarding";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function Faction() {
  const [faction, setFaction] = useState("");

  const [errors, setErrors] = useState<{ [k: string]: string }>({});

  function validate() {
    const next: { [k: string]: string } = {};
    if (faction.length === 0) {
      next.faction = "Choose at least one faction";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  return (
    <AppBackground variant="gradient">
      <ScrollView contentContainerStyle={styles.scroll}>
        <OnboardingProgress step={STEP.faction} total={ONBOARDING_TOTAL} />
        <Text style={styles.headline}>Start or Join Faction</Text>
        <Text style={styles.sub}>
          Your faction is your people — a badge you carry into every CosQuest.
        </Text>

        <View style={styles.list}>
          {FACTIONS.map((f) => (
            <SelectableCard
              key={f.id}
              label={f.label}
              image={f.image}
              selected={faction === f.id}
              onPress={() => setFaction(f.id)}
              style={styles.card}
            />
          ))}
        </View>
        <View style={{ alignItems: "center", marginTop: 20 }}>
          <ErrorText>{errors.faction}</ErrorText>
        </View>

        <View style={styles.btn}>
          <Button
            label="Continue"
            variant="brand"
            onPress={() => {
              if (validate()) router.push("/onboarding/ready");
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
  list: { gap: 14, marginTop: 50 },
  card: { width: "100%", aspectRatio: 2.1 },
  btn: { marginTop: 100 },
});
