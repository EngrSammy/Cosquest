// ==========================================
// STAY LOGGED IN
// ==========================================
// Wraps the app (app/_layout.tsx).
//   On start:  loads the saved login key -> logs you in straight away, then
//              refreshes your profile in the background. If the key no longer
//              works (logged out elsewhere, expired), it's removed.
//   Always:    whenever the login key changes (email / Google login, password
//              reset, Log Out), the saved copy is updated or deleted.
// The app's screens appear once the saved key has been checked - that's
// instant (it's read from the device; no waiting for the server).
import { ReactNode, useEffect, useState } from "react";

import { apiRequest } from "@/services/api";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { logout, restoreSession } from "@/store/slices/authSlice";
import { loadSavedToken, saveToken } from "@/utils/sessionStorage";

export default function SessionGate({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();

  const token = useAppSelector((state) => state.auth.token);

  const [loaded, setLoaded] = useState(false);

  // 1. Load the saved login (once).
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const savedToken = await loadSavedToken();

      if (cancelled) {
        return;
      }

      if (savedToken) {
        dispatch(restoreSession({ token: savedToken, user: null }));
      }

      setLoaded(true);

      if (!savedToken) {
        return;
      }

      // Refresh the profile in the background.
      try {
        const response = await apiRequest<{ user: any }>("/api/users/me", {
          method: "GET",
          token: savedToken,
        });

        if (!cancelled && response?.user) {
          dispatch(restoreSession({ token: savedToken, user: response.user }));
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message.toLowerCase() : "";

        // The key is no longer accepted -> log out cleanly. (A network
        // problem keeps you logged in; it'll work once you're back online.)
        if (
          message.includes("unauthor") ||
          message.includes("authent") ||
          message.includes("signed in elsewhere") ||
          message.includes("expired") ||
          message.includes("invalid") ||
          message.includes("session") ||
          message.includes("token") ||
          message.includes("log in") ||
          message.includes("login")
        ) {
          dispatch(logout());
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  // 2. Keep the saved copy in sync with every login / logout.
  useEffect(() => {
    if (!loaded) {
      return;
    }

    saveToken(token);
  }, [loaded, token]);

  if (!loaded) {
    return null;
  }

  return <>{children}</>;
}
