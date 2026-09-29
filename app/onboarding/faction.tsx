import { AppBackground } from "@/components/AppBackground";
import { Button } from "@/components/Button";
import { ErrorText } from "@/components/ErrorText";
import { FactionDescriptionModal } from "@/components/faction/FactionDescriptionModal";
import { FactionCard } from "@/components/FactionCard";
import { FactionModal } from "@/components/FactionModal";
import { OnboardingProgress } from "@/components/OnboardingProgress";
import { FACTIONS } from "@/constants/factions";
import { ONBOARDING_TOTAL, STEP } from "@/constants/onboarding";
import { useOnboarding } from "@/context/OnboardingContext";
import { useAppDispatch } from "@/store/hooks";
import { saveUserFaction } from "@/store/thunks/userThunks";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

const POPUP_DELAY = 2000;

export default function Faction() {
  const { data, update } = useOnboarding();

  const dispatch = useAppDispatch();

  const [errors, setErrors] = useState<{
    [k: string]: string;
  }>({});

  const [saving, setSaving] = useState(false);

  const [consentVisible, setConsentVisible] = useState(false);

  const [hasAgreed, setHasAgreed] = useState(false);

  const [selectedFactionId, setSelectedFactionId] = useState<string | null>(
    data.faction || null,
  );

  // Set only when "Join Faction" is actually pressed inside the
  // description modal — separate from selectedFactionId, which changes
  // the instant a card is tapped (used purely for the card highlight).
  // Without this split, tapping a card then dismissing the description
  // modal without joining still left selectedFactionId set, so the
  // page-level Continue button would silently save a faction the user
  // never actually confirmed.
  const [factionConfirmed, setFactionConfirmed] = useState(
    Boolean(data.faction),
  );

  const [descriptionVisible, setDescriptionVisible] = useState(false);

  const consentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const descriptionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearConsentTimer() {
    if (consentTimer.current) {
      clearTimeout(consentTimer.current);
      consentTimer.current = null;
    }
  }

  function clearDescriptionTimer() {
    if (descriptionTimer.current) {
      clearTimeout(descriptionTimer.current);
      descriptionTimer.current = null;
    }
  }

  function showConsentWithDelay() {
    // If a timer is already counting down, let it keep running instead
    // of restarting it — previously every repeated tap while waiting
    // reset the 2s delay back to the start, so a few impatient taps in a
    // row meant the popup never appeared at all.
    if (consentTimer.current) {
      return;
    }

    setConsentVisible(false);

    consentTimer.current = setTimeout(() => {
      setConsentVisible(true);
      consentTimer.current = null;
    }, POPUP_DELAY);
  }

  function showDescriptionWithDelay(id: string) {
    // Same fix as showConsentWithDelay — don't restart an already-
    // running timer just because the same or another card was tapped
    // again while waiting.
    if (descriptionTimer.current) {
      setSelectedFactionId(id);
      setFactionConfirmed(false);
      setErrors({});
      return;
    }

    setDescriptionVisible(false);

    setSelectedFactionId(id);

    // Selecting a (possibly different) card always requires a fresh
    // confirmation via "Join Faction" in the modal.
    setFactionConfirmed(false);

    setErrors({});

    descriptionTimer.current = setTimeout(() => {
      setDescriptionVisible(true);
      descriptionTimer.current = null;
    }, POPUP_DELAY);
  }

  useEffect(() => {
    showConsentWithDelay();

    return () => {
      clearConsentTimer();
      clearDescriptionTimer();
    };
  }, []);

  const handleToggleAgree = () => {
    setHasAgreed((current) => {
      const next = !current;

      return next;
    });

    setErrors((current) => ({
      ...current,
      faction: "",
    }));
  };

  const handleAgree = () => {
    if (!hasAgreed) {
      setErrors((current) => ({
        ...current,
        faction: "Please check the box before continuing.",
      }));

      return;
    }

    setErrors((current) => ({
      ...current,
      faction: "",
    }));

    setConsentVisible(false);
  };

  const handleCloseConsent = () => {
    clearConsentTimer();

    setConsentVisible(false);
  };

  const handleCardPress = (id: string) => {
    if (!hasAgreed) {
      showConsentWithDelay();

      return;
    }

    showDescriptionWithDelay(id);
  };

  const handleCloseDescription = () => {
    clearDescriptionTimer();

    setDescriptionVisible(false);
  };

  const handleFactionContinue = () => {
    if (!selectedFactionId) {
      return;
    }

    setDescriptionVisible(false);

    setErrors((current) => ({
      ...current,
      faction: "",
    }));

    // This is the one place a faction selection is actually confirmed.
    setFactionConfirmed(true);

    update({
      faction: selectedFactionId,
    });
  };

  function validate() {
    const next: {
      [k: string]: string;
    } = {};

    if (!hasAgreed) {
      next.faction =
        "Please agree to the faction information before continuing.";
    } else if (!selectedFactionId) {
      next.faction = "Choose a faction.";
    } else if (!factionConfirmed) {
      // Tapped a card but backed out of the description modal without
      // pressing "Join Faction" — don't let Continue silently save it.
      next.faction = "Please confirm your faction by tapping Join Faction.";
    }

    setErrors(next);

    return Object.keys(next).length === 0;
  }

  const handlePageContinue = async () => {
    if (saving) {
      return;
    }

    if (!validate()) {
      return;
    }

    if (!selectedFactionId) {
      return;
    }

    if (!data.email.trim()) {
      setErrors({
        faction: "Your email is missing. Please go back and try again.",
      });

      return;
    }

    setSaving(true);

    try {
      await dispatch(
        saveUserFaction({
          email: data.email.trim(),
          factionKey: selectedFactionId,
        }),
      ).unwrap();

      update({
        faction: selectedFactionId,
      });

      router.push("/onboarding/ready");
    } catch (error) {
      setErrors({
        faction:
          error instanceof Error
            ? error.message
            : "Failed to save faction. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  const selectedFaction = FACTIONS.find((f) => f.id === selectedFactionId);

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
              selected={selectedFactionId === f.id}
              onPress={() => handleCardPress(f.id)}
            />
          ))}
        </View>

        <View style={styles.errorWrap}>
          <ErrorText>{errors.faction}</ErrorText>
        </View>

        <FactionModal
          visible={consentVisible}
          agreed={hasAgreed}
          onToggleAgree={handleToggleAgree}
          onAgree={handleAgree}
          onClose={handleCloseConsent}
        />

        {selectedFaction ? (
          <FactionDescriptionModal
            visible={descriptionVisible}
            faction={selectedFaction}
            onClose={handleCloseDescription}
            onContinue={handleFactionContinue}
          />
        ) : null}

        <View style={styles.btn}>
          <Button
            label={saving ? "Saving..." : "Continue"}
            variant="brand"
            onPress={handlePageContinue}
            disabled={saving}
          />
        </View>
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 24,
    paddingBottom: 60,
  },

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

  list: {
    gap: 25,
    marginTop: 40,
  },

  errorWrap: {
    alignItems: "center",
    marginTop: 20,
  },

  btn: {
    marginTop: 50,
    width: "100%",
  },
});
