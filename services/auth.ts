import { apiRequest } from "./api";

type AuthResponse = {
  message: string;
  token?: string;
  onboardingRequired?: boolean;
  user?: {
    id: string;
    email: string;
    profile: {
      firstName: string;
      lastName: string;
      username: string;
      age: number | null;
      gender: string;
      avatarKey: string;
      avatarPhotoUrl: string | null;
    };
    faction: string | null;
    interests: string[];
    onboardingComplete: boolean;
  };
};

export function signUp(
  identifier: string,
  password: string,
  confirmPassword: string,
) {
  return apiRequest<AuthResponse>("/api/auth/signup", {
    method: "POST",
    body: {
      identifier,
      password,
      confirmPassword,
    },
  });
}

export function signIn(identifier: string, password: string) {
  return apiRequest<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: {
      identifier,
      password,
    },
  });
}

export function logout(token: string) {
  return apiRequest<{ message: string }>("/api/auth/logout", {
    method: "POST",
    token,
  });
}

export function getGoogleOAuthUrl() {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL;

  if (!baseUrl) {
    throw new Error("EXPO_PUBLIC_API_URL is not configured");
  }

  return `${baseUrl}/api/auth/oauth/google`;
}

export function exchangeGoogleOAuthCode(oauthCode: string) {
  return apiRequest<{
    token: string;
    onboardingRequired: boolean;
  }>("/api/auth/oauth/exchange", {
    method: "POST",
    body: {
      oauthCode,
    },
  });
}
