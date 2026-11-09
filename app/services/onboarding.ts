import { apiRequest } from "./api";

export async function updateFaction(email: string, factionKey: string) {
  return apiRequest("/api/users/me/faction", {
    method: "POST",
    body: {
      email,
      factionKey,
    },
  });
}

export async function updateInterests(email: string, interests: string[]) {
  return apiRequest("/api/users/me/interests", {
    method: "PUT",
    body: {
      email,
      interests,
    },
  });
}

export async function updateNotifications(
  email: string,
  notificationsEnabled: boolean,
) {
  return apiRequest("/api/users/me/preferences/notifications", {
    method: "PATCH",
    body: {
      email,
      notificationsEnabled,
    },
  });
}

export async function updateLocation(
  email: string,
  locationEnabled: boolean,
  radiusMiles: number,
  lat: number,
  lng: number,
) {
  return apiRequest("/api/users/me/preferences/location", {
    method: "PATCH",
    body: {
      email,
      locationEnabled,
      radiusMiles,
      lat,
      lng,
    },
  });
}

export async function registerDevice(
  email: string,
  pushToken: string,
  platform: string,
) {
  return apiRequest("/api/users/me/devices", {
    method: "POST",
    body: {
      email,
      pushToken,
      platform,
    },
  });
}

export async function completeOnboarding(data: unknown) {
  return apiRequest("/api/users/me/onboarding/complete", {
    method: "POST",
    body: data,
  });
}
