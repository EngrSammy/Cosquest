import { OnboardingProvider } from "@/context/OnboardingContext";
import DesktopAuthFrame from "@/components/desktop/DesktopAuthFrame";
import { useIsDesktop } from "@/hooks/useDesktop";
import { Stack } from "expo-router";

// Phones: the onboarding screens full screen, one at a time.
// Computer: the same screens in a split frame - the CosQuest brand panel on
// the left, the current step in a centred card on the right.
export default function OnboardingLayout() {
  const desktop = useIsDesktop();

  const screens = (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "transparent" },
      }}
    />
  );

  return (
    <OnboardingProvider>
      {desktop ? <DesktopAuthFrame>{screens}</DesktopAuthFrame> : screens}
    </OnboardingProvider>
  );
}
