// Sign in with Apple (task 059), behind EXPO_PUBLIC_APPLE_SIGNIN=1. The same
// flow as Google (utils/googleAuth.ts) through the backend's Apple routes
// (GET /api/auth/oauth/apple -> Apple -> POST .../apple/callback -> back to
// the app with ?oauthCode=, swapped by POST /api/auth/oauth/exchange). The
// backend needs its APPLE_* keys; until then it answers "not configured" and
// the button says so. With the flag off there is no Apple button at all.
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useState } from "react";
import { Alert } from "react-native";

import { useOnboarding } from "@/context/OnboardingContext";
import { appConfig } from "@/services/appConfig";
import { useAppDispatch } from "@/store/hooks";

import { finishGoogleSignIn, getGoogleRedirectUri, readOAuthCode } from "./googleAuth";

export function useAppleAuth() {
  const dispatch = useAppDispatch();
  const { update } = useOnboarding();
  const [appleLoading, setAppleLoading] = useState(false);

  const continueWithApple = useCallback(async () => {
    if (appleLoading || !appConfig.apiUrl) return;
    // The return link is the one Google uses: the landing screen is provider-agnostic.
    const redirectUri = getGoogleRedirectUri();
    const authUrl = `${appConfig.apiUrl}/api/auth/oauth/apple?redirectUri=${encodeURIComponent(redirectUri)}`;
    setAppleLoading(true);
    try {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
      if (result.type !== "success" || !result.url) return;
      const parsed = Linking.parse(result.url);
      const code = readOAuthCode(parsed.queryParams);
      if (!code) {
        const backendError = parsed.queryParams?.oauthError ?? parsed.queryParams?.error;
        Alert.alert("Apple sign-in", typeof backendError === "string" && backendError ? backendError : "Apple sign-in didn't finish. Try again.");
        return;
      }
      const message = await finishGoogleSignIn(code, dispatch, update as any);
      if (message) Alert.alert("Apple sign-in", message);
    } catch (error) {
      Alert.alert("Apple sign-in", error instanceof Error ? error.message : "Apple sign-in didn't finish. Try again.");
    } finally {
      setAppleLoading(false);
    }
  }, [appleLoading, dispatch, update]);

  return { continueWithApple, appleLoading, appleEnabled: appConfig.appleSignIn };
}
