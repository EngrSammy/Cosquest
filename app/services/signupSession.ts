// The token sign-up hands back, kept in memory for the onboarding steps.
//
// The onboarding calls (profile, avatar, faction, interests, preferences,
// complete) used to name the account by its email alone, with no token,
// and the backend's identifyUser accepts that for ANY account at any time:
// whoever knows a username can read its email and devices and change its
// profile (docs/journeys/FINDINGS.md). Sending the sign-up token as a
// Bearer makes the backend use it ("a Bearer token always wins"), so the
// backend can drop the email-only path without breaking sign-up.
//
// Only in memory: an app restart mid-onboarding falls back to the old
// email path until the backend drops it. Cleared on sign-in and sign-out.
let token: string | null = null;

export function setSignupToken(value: string | null | undefined) {
  token = value || null;
}

export function signupToken(): string | null {
  return token;
}

/** The token for a call that did not bring its own: only the account's own
 * /api/users/me routes, so it never leaks to anything else. */
export function signupTokenFor(endpoint: string): string | undefined {
  return token && endpoint.startsWith("/api/users/me") ? token : undefined;
}
