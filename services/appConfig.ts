// Everything a build is configured with, in one place (task 059). All of it
// is build-time env (EXPO_PUBLIC_* is inlined by Metro), so a store build
// carries no test host and a test build no production one. Unset optional
// values switch their feature off, never on.
//
// Release builds are checked by scripts/check-release-env.js (EAS pre-install
// hook): https only, no raw-IP or Render hosts.
import Constants from "expo-constants";
import { Platform } from "react-native";

const env = (value: string | undefined) => (value ?? "").trim();
const url = (value: string | undefined) => {
  const v = env(value).replace(/\/+$/, "");
  return /^https?:\/\//i.test(v) ? v : null;
};
const flag = (value: string | undefined) => env(value) === "1" || env(value).toLowerCase() === "true";

export const appConfig = {
  /** The chat API (required). */
  apiUrl: url(process.env.EXPO_PUBLIC_API_URL),
  /** The website, for share links. */
  webUrl: url(process.env.EXPO_PUBLIC_WEB_URL),

  /** Legal pages and help (not written by us: published by the team). Unset: "not published yet". */
  termsUrl: url(process.env.EXPO_PUBLIC_TERMS_URL),
  privacyUrl: url(process.env.EXPO_PUBLIC_PRIVACY_URL),
  guidelinesUrl: url(process.env.EXPO_PUBLIC_GUIDELINES_URL),
  faqUrl: url(process.env.EXPO_PUBLIC_FAQ_URL),

  /** A JSON file with { minVersion, latestVersion, storeUrl } (force update). Unset: no check. */
  remoteConfigUrl: url(process.env.EXPO_PUBLIC_CONFIG_URL),

  /** Crash reporting. Unset: off (no SDK calls at all). */
  sentryDsn: env(process.env.EXPO_PUBLIC_SENTRY_DSN) || null,
  sentryEnvironment: env(process.env.EXPO_PUBLIC_SENTRY_ENV) || (__DEV__ ? "development" : "production"),

  /** Sign in with Apple (the backend's Apple web flow: needs APPLE_* keys on the server). Off: no Apple button. */
  appleSignIn: flag(process.env.EXPO_PUBLIC_APPLE_SIGNIN) && Platform.OS !== "web",

  /** Call features that are not built yet: hidden unless turned on for testing. */
  callScreenShare: flag(process.env.EXPO_PUBLIC_CALL_SCREEN_SHARE),
  callSparks: flag(process.env.EXPO_PUBLIC_CALL_SPARKS),

  /** The installed app's version (app.json "version"). */
  appVersion: Constants.expoConfig?.version ?? "0.0.0",
};

export { compareVersions } from "./versions";
