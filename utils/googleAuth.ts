// ==========================================
// GOOGLE SIGN-IN / SIGN-UP (phones + website)
// ==========================================
// One flow for BOTH buttons ("Sign up with Google" and "Sign in with
// Google") — the backend decides whether this is a new account
// (onboardingRequired) or an existing one.
//
// How it works:
//   1. The app opens the backend's Google page and tells it where to send
//      the person back to (redirectUri):
//        phone app -> cosquest://onboarding/oauthGoogle
//        website   -> https://<site>/onboarding/oauthGoogle
//   2. After Google, the backend sends them to that address with
//      ?oauthCode=...
//   3. The app swaps the code for a login (exchangeGoogleCode) and goes to
//      onboarding (new account) or home (existing account).
//
// Phones: opens an in-app browser (openAuthSessionAsync), which hands the
// return address straight back here.
// Website: a full-page redirect (more reliable than a popup, especially on
// iPhone Safari); app/onboarding/oauthGoogle.tsx finishes the sign-in.

import * as Linking from "expo-linking";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useState } from "react";
import { Alert, Platform } from "react-native";

import { useOnboarding } from "@/context/OnboardingContext";
import { useAppDispatch } from "@/store/hooks";
import { exchangeGoogleCode } from "@/store/thunks/authThunks";

// Where the backend should send people back to after Google.
export const GOOGLE_RETURN_PATH = "onboarding/oauthGoogle";

// True while the phone's in-app browser flow is running, so the landing
// screen (which the phone may also open for the same return link) doesn't
// use the one-time code a second time.
let phoneFlowInProgress = false;

export function isPhoneGoogleFlowInProgress() {
  return phoneFlowInProgress;
}

export function getGoogleRedirectUri() {
  return Linking.createURL(GOOGLE_RETURN_PATH);
}

function getGoogleAuthUrl() {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL;

  if (!baseUrl) {
    throw new Error("EXPO_PUBLIC_API_URL is not configured");
  }

  const redirectUri = getGoogleRedirectUri();

  return `${baseUrl}/api/auth/oauth/google?redirectUri=${encodeURIComponent(
    redirectUri,
  )}`;
}

// Reads ?oauthCode=... (or ?code=...) from the return link.
export function readOAuthCode(
  params: Record<string, unknown> | null | undefined,
) {
  const value = params?.oauthCode ?? params?.code;

  if (typeof value === "string" && value) {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return null;
}

type OnboardingUpdate = (patch: Record<string, unknown>) => void;

// Swap the one-time code for a login, then go to the right screen.
// Returns an error message, or null when it worked.
export async function finishGoogleSignIn(
  oauthCode: string,
  dispatch: ReturnType<typeof useAppDispatch>,
  update: OnboardingUpdate,
): Promise<string | null> {
  const exchangeResult = await dispatch(exchangeGoogleCode(oauthCode));

  if (!exchangeGoogleCode.fulfilled.match(exchangeResult)) {
    return typeof exchangeResult.payload === "string"
      ? exchangeResult.payload
      : "We could not complete Google authentication.";
  }

  const { onboardingRequired, user: googleUser } = exchangeResult.payload;

  if (googleUser) {
    update({
      email: googleUser.email || "",
      firstName: googleUser.profile?.firstName || "",
      lastName: googleUser.profile?.lastName || "",
      username: googleUser.profile?.username || "",
      age: googleUser.profile?.age ?? null,
      gender: googleUser.profile?.gender || "",
      avatar: googleUser.profile?.avatarKey || "",
    });
  }

  router.replace(onboardingRequired ? "/onboarding/createProfile" : "/home");

  return null;
}

// The hook both Google buttons use.
export function useGoogleAuth() {
  const dispatch = useAppDispatch();
  const { update } = useOnboarding();

  const [googleLoading, setGoogleLoading] = useState(false);

  const continueWithGoogle = useCallback(async () => {
    if (googleLoading) {
      return;
    }

    let authUrl: string;

    try {
      authUrl = getGoogleAuthUrl();
    } catch (error) {
      Alert.alert(
        "Google sign-in",
        error instanceof Error
          ? error.message
          : "Google sign-in is not set up.",
      );
      return;
    }

    // WEBSITE: go to Google in the same tab. The landing page
    // (app/onboarding/oauthGoogle.tsx) finishes the sign-in on return.
    if (Platform.OS === "web") {
      setGoogleLoading(true);
      window.location.assign(authUrl);
      return;
    }

    // PHONES: in-app browser that hands the return link straight back.
    try {
      setGoogleLoading(true);
      phoneFlowInProgress = true;

      const result = await WebBrowser.openAuthSessionAsync(
        authUrl,
        getGoogleRedirectUri(),
      );

      if (result.type !== "success" || !result.url) {
        return;
      }

      const parsed = Linking.parse(result.url);
      const oauthCode = readOAuthCode(parsed.queryParams);

      if (!oauthCode) {
        const backendError = parsed.queryParams?.error;

        Alert.alert(
          "Google sign-in failed",
          typeof backendError === "string" && backendError
            ? backendError
            : "We could not complete the Google authentication. Please try again.",
        );
        return;
      }

      const errorMessage = await finishGoogleSignIn(
        oauthCode,
        dispatch,
        update as OnboardingUpdate,
      );

      if (errorMessage) {
        Alert.alert("Google sign-in failed", errorMessage);
      }
    } catch (error) {
      Alert.alert(
        "Google sign-in failed",
        error instanceof Error
          ? error.message
          : "Something went wrong with Google sign-in.",
      );
    } finally {
      phoneFlowInProgress = false;
      setGoogleLoading(false);
    }
  }, [googleLoading, dispatch, update]);

  return { continueWithGoogle, googleLoading };
}
