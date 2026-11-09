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

// ==========================================
// FORGOT PASSWORD
// POST /api/auth/forgot-password   { email }
// ==========================================
// Always answers with the same 200 message whether or not the account
// exists (so nobody can use it to find out which emails are registered).
// The only errors are 400 (no email sent) and 429 (more than 3 requests
// for this account in 24 hours).

// The backend currently waits for the email to be sent before replying,
// so if the email server is slow or unreachable this request can hang for
// minutes. Give up after 20 seconds with a clear message instead of
// leaving the user on "Sending..." forever.
const PASSWORD_RESET_TIMEOUT_MS = 20000;

export function requestPasswordReset(email: string) {
  const request = apiRequest<{ message: string }>("/api/auth/forgot-password", {
    method: "POST",
    body: {
      email: email.trim(),
    },
  });

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          "The server is taking too long to respond. Please try again in a moment.",
        ),
      );
    }, PASSWORD_RESET_TIMEOUT_MS);
  });

  return Promise.race([request, timeout]);
}

// ==========================================
// RESET PASSWORD
// POST /api/auth/reset-password
//   { email, code, newPassword, confirmPassword }
// ==========================================
// Redeems the 6-digit code, sets the new password AND signs the user in:
// the response has the same { token, user } as login, so the app goes
// straight into the app afterwards.
//
// `code` MUST be a string — "049302" as a number would lose its leading 0.

export function resetPassword(data: {
  email: string;
  code: string;
  newPassword: string;
  confirmPassword: string;
}) {
  return apiRequest<AuthResponse>("/api/auth/reset-password", {
    method: "POST",
    body: {
      email: data.email.trim(),
      code: String(data.code).trim(),
      newPassword: data.newPassword,
      confirmPassword: data.confirmPassword,
    },
  });
}
