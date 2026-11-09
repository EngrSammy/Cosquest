// The phone's position right now, for joining a live quest that needs you
// at the venue. Asks for location permission here (the person just tapped
// Join, so the reason is clear). Returns null if refused or unavailable.
import * as Location from "expo-location";
import { Platform } from "react-native";

export type Position = { lat: number; lng: number; accuracy: number };

export async function currentPosition(): Promise<Position | null> {
  if (Platform.OS === "web") {
    if (typeof navigator === "undefined" || !navigator.geolocation) return null;
    return new Promise((resolve) =>
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy || 0 }),
        () => resolve(null),
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 },
      ),
    );
  }
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy || 0 };
  } catch {
    return null;
  }
}
