export const STEP = {
  account: 1, // authentication, signup
  profile: 2, // createProfile
  uploadPicture: 3, // uploadPicture
  interests: 4,
  permissions: 5,
  faction: 6,
} as const;

// Derived, never hand-maintained — always the highest step number.
export const ONBOARDING_TOTAL = Math.max(...Object.values(STEP));
