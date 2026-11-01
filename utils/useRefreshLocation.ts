// Keeps "Quests within 50 Mi" about where you are NOW, not where you were
// at sign-up. When the home page opens, if you've already allowed location
// (it never asks), the current position is read; if you've moved more than
// a mile from the saved one, it's saved (at most every 10 minutes) and your
// profile is reloaded, so the quests and the city chip follow you.
import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { Platform } from "react-native";

import { updateLocationPreference } from "@/services/settings";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchCurrentUser } from "@/store/thunks/userThunks";

let lastSaved = 0;

function miles(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(bLat - aLat);
  const dLng = r(bLng - aLng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  if (Platform.OS === "web") {
    if (typeof navigator === "undefined" || !navigator.geolocation) return null;
    // Only if already allowed: never a surprise permission prompt.
    try {
      const status = await (navigator as any).permissions?.query({ name: "geolocation" });
      if (status && status.state !== "granted") return null;
    } catch {
      return null;
    }
    return new Promise((resolve) =>
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { maximumAge: 10 * 60 * 1000, timeout: 10000 },
      ),
    );
  }
  const { status } = await Location.getForegroundPermissionsAsync();
  if (status !== "granted") return null;
  const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 }).catch(() => null);
  const p = last || (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null));
  return p ? { lat: p.coords.latitude, lng: p.coords.longitude } : null;
}

export function useRefreshLocation() {
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.auth.token);
  const authUser = useAppSelector((state) => state.auth.user) as any;
  const user = useAppSelector((state) => state.user.user) as any;

  useFocusEffect(
    useCallback(() => {
      const enabled = user?.preferences?.locationEnabled;
      if (!token || !enabled || Date.now() - lastSaved < 10 * 60 * 1000) return;
      let alive = true;
      (async () => {
        const here = await currentPosition();
        if (!alive || !here) return;
        const saved = user?.location;
        if (typeof saved?.lat === "number" && miles(saved.lat, saved.lng, here.lat, here.lng) < 1) return;
        lastSaved = Date.now();
        try {
          await updateLocationPreference(token, { locationEnabled: true, radiusMiles: user?.preferences?.radiusMiles ?? 50, lat: here.lat, lng: here.lng });
          if (authUser?.email) dispatch(fetchCurrentUser(authUser.email));
        } catch {
          // Try again next time.
          lastSaved = 0;
        }
      })();
      return () => {
        alive = false;
      };
    }, [token, user, authUser?.email, dispatch]),
  );
}
