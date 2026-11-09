import { Redirect } from "expo-router";
import { Platform } from "react-native";

import { triviaOnlyWeb } from "@/features/game/config";

import { useAppSelector } from "@/store/hooks";

// Straight to the right screen (audit B6): the native splash stays up until
// the fonts and the saved login are ready (app/_layout.tsx, SessionGate), so
// there is no second splash and no timer.
//   logged in (saved login - see components/SessionGate) -> home
//   logged in but onboarding not finished               -> onboarding
//     (SessionGate sends you there once your profile says so)
//   not logged in                                       -> onboarding
/** The public trivia web page (<game server>/play): the root is trivia. */
const TRIVIA_ONLY = triviaOnlyWeb(process.env.EXPO_PUBLIC_TRIVIA_WEB, Platform.OS);

export default function Index() {
  if (TRIVIA_ONLY) return <Redirect href="/trivia" />;
  return <AppIndex />;
}

function AppIndex() {
  // Lands on Home (the team's dashboard) when logged in; no splash timer.
  const token = useAppSelector((s) => s.auth.token);
  const user = useAppSelector((s) => s.auth.user);
  return <Redirect href={token && user?.onboardingComplete !== false ? "/home" : "/onboarding"} />;
}
