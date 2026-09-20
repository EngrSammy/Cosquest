import { File } from "expo-file-system";
import { apiRequest } from "./api";

export type ProfileCategory = {
  key: string;
  name: string;
};

export type UserProfile = {
  email: string;

  profile?: {
    firstName?: string;
    lastName?: string;
    username?: string;
    age?: number | null;
    gender?: string;
    bio?: string;
    category?: string | null;
    showCategoryOnProfile?: boolean;
    avatarKey?: string;
    avatarPhotoUrl?: string | null;
  };

  contact?: {
    email?: string;
    phone?: string;
    businessAddress?: string;
  };

  preferences?: {
    notificationsEnabled?: boolean;
    locationEnabled?: boolean;
    radiusMiles?: number;
  };

  location?: {
    lat?: number | null;
    lng?: number | null;
    updatedAt?: string | null;
  };

  faction?: string;
  interests?: string[];
  pointsBalance?: number;
  onboardingComplete?: boolean;
};

// ============================================
// CURRENT USER
// ============================================

export async function getCurrentUser(email: string) {
  const response = await apiRequest<any>(
    `/api/users/me?email=${encodeURIComponent(email)}`,
  );

  return response?.user || response;
}

// ============================================
// USERNAME
// ============================================

export async function checkUsername(username: string, email: string) {
  return apiRequest(
    `/api/users/check-username?username=${encodeURIComponent(
      username,
    )}&email=${encodeURIComponent(email)}`,
  );
}

// ============================================
// PROFILE
// ============================================

export async function updateProfile(data: {
  email: string;
  firstName: string;
  lastName: string;
  username: string;
  age: number;
  gender: string;
  bio?: string;
}) {
  return apiRequest<any>("/api/users/me/profile", {
    method: "PATCH",
    body: data,
  });
}

// ============================================
// PROFILE CATEGORIES
// ============================================

export async function getProfileCategories() {
  return apiRequest<{
    categories: ProfileCategory[];
  }>("/api/meta/profile-categories");
}

export async function updateCategory(data: {
  email: string;
  category: string;
  showCategoryOnProfile: boolean;
}) {
  return apiRequest<any>("/api/users/me/profile", {
    method: "PATCH",
    body: data,
  });
}

// ============================================
// AVATAR
// ============================================

export async function updateAvatar(data: { email: string; avatar: string }) {
  return apiRequest("/api/users/me/avatar", {
    method: "PATCH",
    body: data,
  });
}

// ============================================
// FACTION
// ============================================

export async function updateFaction(data: {
  email: string;
  factionKey: string;
}) {
  return apiRequest("/api/users/me/faction", {
    method: "POST",
    body: data,
  });
}

// ============================================
// INTERESTS
// ============================================

export async function updateInterests(data: {
  email: string;
  interests: string[];
}) {
  return apiRequest("/api/users/me/interests", {
    method: "PUT",
    body: data,
  });
}

// ============================================
// NOTIFICATIONS
// ============================================

export async function updateNotificationPreference(data: {
  email: string;
  notificationsEnabled: boolean;
}) {
  return apiRequest("/api/users/me/preferences/notifications", {
    method: "PATCH",
    body: data,
  });
}

// ============================================
// LOCATION
// ============================================

export async function updateLocationPreference(data: {
  email: string;
  locationEnabled: boolean;
  radiusMiles: number;
  lat: number;
  lng: number;
}) {
  return apiRequest("/api/users/me/preferences/location", {
    method: "PATCH",
    body: data,
  });
}

// ============================================
// CONTACT
// ============================================

export async function getContact(token?: string) {
  return apiRequest<{
    contact: {
      email: string;
      phone: string;
      businessAddress: string;
    };
  }>("/api/users/me/contact", {
    token,
  });
}

export async function updateContact(
  token: string | undefined,
  data: {
    email: string;
    phone: string;
    businessAddress: string;
  },
) {
  console.log("=================================");
  console.log("UPDATE CONTACT");
  console.log("HAS AUTH TOKEN:", Boolean(token));
  console.log("CONTACT DATA:", data);
  console.log("=================================");

  return apiRequest<{
    contact: {
      email: string;
      phone: string;
      businessAddress: string;
    };
  }>("/api/users/me/contact", {
    method: "PATCH",
    body: data,
    ...(token ? { token } : {}),
  });
}

// ============================================
// DEVICE
// ============================================

export async function registerDevice(data: {
  email: string;
  pushToken: string;
  platform: string;
}) {
  return apiRequest("/api/users/me/devices", {
    method: "POST",
    body: data,
  });
}

// ============================================
// COMPLETE ONBOARDING
// ============================================

export async function completeOnboarding(data: unknown) {
  return apiRequest("/api/users/me/onboarding/complete", {
    method: "POST",
    body: data,
  });
}

// ============================================
// POINTS
// ============================================

export async function getPoints(token: string) {
  return apiRequest("/api/users/me/points", {
    token,
  });
}

// ============================================
// AVATAR PHOTO
// ============================================

export async function uploadAvatarPhoto(email: string, photoUri: string) {
  const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

  if (!BASE_URL) {
    throw new Error("EXPO_PUBLIC_API_URL is not configured");
  }

  if (!email.trim()) {
    throw new Error("Email is required for photo upload.");
  }

  if (!photoUri) {
    throw new Error("Photo URI is required.");
  }

  const file = new File(photoUri);

  const formData = new FormData();

  formData.append("email", email.trim());

  formData.append("photo", file as any);

  const response = await fetch(`${BASE_URL}/api/users/me/avatar/photo`, {
    method: "POST",
    body: formData,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.message || data?.error || "Failed to upload profile photo.",
    );
  }

  return data;
}
