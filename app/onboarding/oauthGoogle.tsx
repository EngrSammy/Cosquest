// ==========================================
// BACK FROM GOOGLE  —  /onboarding/oauthGoogle?oauthCode=...
// ==========================================
// The backend sends people here after they've chosen their Google account.
// This screen swaps the one-time code for a login and continues to
// onboarding (new account) or home (existing account).
//
// On phones the in-app browser usually handles the return link itself
// (utils/googleAuth.ts) — then this screen just steps out of the way so the
// code isn't used twice.

import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import {
      ActivityIndicator,
      Pressable,
      StyleSheet,
      Text,
      View,
} from "react-native";

import { AppBackground } from "@/components/AppBackground";
import { useOnboarding } from "@/context/OnboardingContext";
import { useAppDispatch } from "@/store/hooks";
import {
      finishGoogleSignIn,
      isPhoneGoogleFlowInProgress,
      readOAuthCode,
} from "@/utils/googleAuth";
import { safeBack } from "@/utils/safeBack";

// Lets a popup-style sign-in (if the browser used one) hand the result
// back to the page that opened it and close itself.
WebBrowser.maybeCompleteAuthSession();

export default function GoogleOAuthReturn() {
  const dispatch = useAppDispatch();
  const { update } = useOnboarding();

  const params = useLocalSearchParams<Record<string, string>>();

  const [error, setError] = useState<string | null>(null);

  // The code only works once — never send it twice.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }

    startedRef.current = true;

    // Phone: the in-app browser flow is already finishing the sign-in.
    if (isPhoneGoogleFlowInProgress()) {
      if (router.canGoBack()) {
        safeBack();
      }
      return;
    }

    const oauthCode = readOAuthCode(params);

    if (!oauthCode) {
      // The backend sends the reason as ?oauthError=... when sign-in fails
      // (e.g. cancelled, session expired, Google refused the code).
      const backendError = params.oauthError || params.error;

      setError(
        typeof backendError === "string" && backendError
          ? backendError
          : "Google didn't send us a sign-in code. Please try again.",
      );
      return;
    }

    finishGoogleSignIn(oauthCode, dispatch, update as any).then((message) => {
      if (message) {
        setError(message);
      }
    });
  }, [params, dispatch, update]);

  return (
    <AppBackground variant="gradient">
      <View style={styles.center}>
        {error ? (
          <>
            <Text style={styles.title}>Google sign-in didn&apos;t work</Text>

            <Text style={styles.text}>{error}</Text>

            <Pressable
              style={styles.button}
              onPress={() => router.replace("/onboarding/signin")}>
              <Text style={styles.buttonText}>Back</Text>
            </Pressable>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color="#C5399A" />

            <Text style={styles.text}>Signing you in with Google...</Text>
          </>
        )}
      </View>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
  },

  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#191922",
    textAlign: "center",
  },

  text: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    color: "#4B4B53",
    textAlign: "center",
  },

  button: {
    marginTop: 22,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 22,
    backgroundColor: "#C5399A",
  },

  buttonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
