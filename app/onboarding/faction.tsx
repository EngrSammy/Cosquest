import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { ErrorText } from "@/components/ErrorText";
import { FactionCard } from "@/components/FactionCard";
import { FactionModal } from "@/components/FactionModal";
import { OnboardingProgress } from "@/components/OnboardingProgress";
import { FACTIONS } from "@/constants/factions";
import { ONBOARDING_TOTAL, STEP } from "@/constants/onboarding";
import { useOnboarding } from "@/context/OnboardingContext";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function Faction() {
  const { data, update } = useOnboarding();
  const [errors, setErrors] = useState<{ [k: string]: string }>({});

  const [pending, setPending] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [seenInfo, setSeenInfo] = useState(false);

  const openFor = (id: string) => {
    setPending(id);
    setAgreed(false);
  };
  const agree = () => {
    if (pending) update({ faction: pending });
    setSeenInfo(true);
    setPending(null);
  };
  const cancel = () => setPending(null);
  const handleCardPress = (id: string) => {
    if (seenInfo) {
      update({ faction: id }); // already agreed once → just select
    } else {
      setPending(id); // first time → open the modal
      setAgreed(false);
    }
  };

  function validate() {
    const next: { [k: string]: string } = {};
    if (data.faction.length === 0) {
      next.faction = "Choose at least one faction";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  return (
    <AppBackground variant="blueGradient">
      <ScrollView contentContainerStyle={styles.scroll}>
        <OnboardingProgress step={STEP.faction} total={ONBOARDING_TOTAL} />
        <Text style={styles.headline}>Start or Join Faction</Text>
        <Text style={styles.sub}>
          Your faction is your people — a badge you carry into every CosQuest.
        </Text>

        <View style={styles.list}>
          {FACTIONS.map((f) => (
            <FactionCard
              key={f.id}
              faction={f}
              selected={data.faction === f.id}
              onPress={() => handleCardPress(f.id)}
            />
          ))}
        </View>
        <View style={{ alignItems: "center", marginTop: 20 }}>
          <ErrorText>{errors.faction}</ErrorText>
        </View>

        <FactionModal
          visible={pending !== null}
          agreed={agreed}
          onToggleAgree={() => setAgreed((a) => !a)}
          onAgree={agree}
          onClose={cancel}
        />

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
  list: { gap: 25, marginTop: 50 },
  btn: { marginTop: 100 },
});
