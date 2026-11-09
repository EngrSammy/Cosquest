// One identity across both halves (task 059): the signed-in person's own
// picture (their photo, else their chosen chat avatar), for the game's HUD
// chip and anything else in the game that shows "you".
import type { ImageSourcePropType } from "react-native";

import { AVATARS } from "@/constants/avatars";
import { useAppSelector } from "@/store/hooks";

export function useMyPicture(): ImageSourcePropType | null {
  const photo = useAppSelector(
    (state) => (state.user.user as any)?.profile?.avatarPhotoUrl ?? (state.auth.user as any)?.profile?.avatarPhotoUrl ?? null,
  ) as string | null;
  const key = useAppSelector(
    (state) => (state.user.user as any)?.profile?.avatarKey ?? (state.auth.user as any)?.profile?.avatarKey ?? null,
  ) as string | null;
  if (photo) return { uri: photo };
  const preset = key ? AVATARS.find((a) => a.id === key) : null;
  return preset?.source ?? null;
}
