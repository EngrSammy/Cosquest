// Crash and error reporting (Sentry). Without EXPO_PUBLIC_SENTRY_DSN every
// function here does nothing and the SDK is never started, so a build with
// no DSN sends nothing anywhere. With one, it starts once at launch
// (app/_layout.tsx) and the root error boundary reports what it catches.
import * as Sentry from "@sentry/react-native";

import { appConfig } from "./appConfig";

let started = false;

export function startMonitoring() {
  if (started || !appConfig.sentryDsn) return;
  try {
    Sentry.init({
      dsn: appConfig.sentryDsn,
      environment: appConfig.sentryEnvironment,
      release: `cosquest@${appConfig.appVersion}`,
      // Errors only: no performance tracing, no session replay, no PII.
      tracesSampleRate: 0,
      sendDefaultPii: false,
      enableAutoSessionTracking: true,
    });
    started = true;
  } catch {
    started = false;
  }
}

export function monitoringOn() {
  return started;
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
  if (!started) return;
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    // never let reporting break the app
  }
}

/** Who is signed in (id only), so reports group by person without their details. */
export function setMonitoringUser(id: string | null) {
  if (!started) return;
  try {
    Sentry.setUser(id ? { id } : null);
  } catch {
    // ignore
  }
}
