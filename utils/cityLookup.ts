// The city for a point ("San Diego"), for the home page chip.
// Phones: the phone's own address lookup. Website: BigDataCloud's free
// browser lookup (no key, made for client-side use). Results are kept for
// the session, rounded to ~1 km, so it isn't asked again and again.
import * as Location from "expo-location";
import { Platform } from "react-native";

const cache = new Map<string, string | null>();

export async function lookupCity(lat: number, lng: number): Promise<string | null> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (cache.has(key)) return cache.get(key)!;
  let city: string | null = null;
  try {
    if (Platform.OS === "web") {
      const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`);
      const data = await response.json();
      city = data?.city || data?.locality || data?.principalSubdivision || null;
    } else {
      const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      city = place?.city || place?.subregion || place?.region || null;
    }
  } catch {
    city = null;
  }
  cache.set(key, city);
  return city;
}
