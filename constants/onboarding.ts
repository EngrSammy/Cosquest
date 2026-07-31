export const STEP = {
  account: 1, // authentication, signup
  profile: 2, // createProfile
  interests: 3,
  permissions: 4,
  faction: 5,
} as const;

// Derived, never hand-maintained — always the highest step number.
export const ONBOARDING_TOTAL = Math.max(...Object.values(STEP));
