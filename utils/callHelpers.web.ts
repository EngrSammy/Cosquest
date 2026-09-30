import { AVATARS } from "@/constants/avatars";

import type { CallType } from "@/services/calls";

// ==========================================
// PERMISSIONS (WEB)
// ==========================================
// In a browser, the microphone/camera permission popup appears by itself
// the moment the call starts using them (LiveKit asks the browser), so
// there's nothing to ask up front. The phone version (callHelpers.ts)
// uses expo-audio / expo-image-picker instead.

export async function ensureCallPermissions(_type: CallType): Promise<boolean> {
  return true;
}

// ==========================================
// AVATAR (same as the phone version)
// ==========================================

type AvatarPerson = {
  avatarPhotoUrl?: string | null;
  avatarKey?: string | null;
  profilePicture?: string | null;
  avatarUrl?: string | null;
  avatar?: string | null;
} | null;

export function getAvatarSource(person?: AvatarPerson) {
  const photo =
    person?.avatarPhotoUrl ||
    person?.profilePicture ||
    person?.avatarUrl ||
    person?.avatar;

  if (photo) {
    return { uri: photo };
  }

  const preset = AVATARS.find((avatar) => avatar.id === person?.avatarKey);

  if (preset?.source) {
    return preset.source;
  }

  return require("@/assets/images/dp-avatar.png");
}
