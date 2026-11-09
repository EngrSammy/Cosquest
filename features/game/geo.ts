// Distances and the local plane, for the interface only: the server judges
// reach (costquest-ios Roam/RoamStore.swift distance/bearing/reachM).
// Pure (tested in features/game/__tests__).

export type LatLng = { lat: number; lng: number };

const EARTH_M = 6371008.8;
/** Metres per degree of latitude, as costquest-ios GroundGeometry.offset uses. */
export const M_PER_DEG = 111320;

const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres (what CLLocation.distance gives, to well under a metre here). */
export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, degrees clockwise from north. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Metres east (x) and north (z) of `centre`: the ground's local plane. */
export function toLocal(centre: LatLng, p: LatLng): { x: number; z: number } {
  return {
    x: (p.lng - centre.lng) * M_PER_DEG * Math.cos(rad(centre.lat)),
    z: (p.lat - centre.lat) * M_PER_DEG,
  };
}

/** The point `local` metres east (x) and north (z) of `centre`: toLocal's inverse. */
export function fromLocal(centre: LatLng, local: { x: number; z: number }): LatLng {
  return {
    lat: centre.lat + local.z / M_PER_DEG,
    lng: centre.lng + local.x / (M_PER_DEG * Math.cos(rad(centre.lat))),
  };
}

/** How close the button wants a player: the server's radius plus a capped GPS allowance. */
export function reachM(openRadiusM: number | undefined, accuracyM: number): number {
  return (openRadiusM ?? 40) + Math.min(Math.max(accuracyM, 0), 25);
}

/** "40 m", "1.2 km": how the game writes a distance (RoamStyle.distance). */
export function distanceText(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "-";
  if (m < 1000) return `${Math.max(0, Math.round(m / 5) * 5)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

/** Move `from` toward `to` by `stepM` metres (the emulator walk and the dev walk button). */
export function stepToward(from: LatLng, to: LatLng, stepM: number): LatLng {
  const d = distanceM(from, to);
  if (d <= stepM || d === 0) return { ...to };
  const f = stepM / d;
  return { lat: from.lat + (to.lat - from.lat) * f, lng: from.lng + (to.lng - from.lng) * f };
}
