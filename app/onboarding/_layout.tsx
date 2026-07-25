import { AppBackground } from "@/components/AppBackground";
import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return (
    <AppBackground variant="gradient">
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
    </AppBackground>
  );
}
