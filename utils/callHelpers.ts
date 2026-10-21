import { AudioModule } from "expo-audio";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

import { AVATARS, smallAvatarUrl } from "@/constants/avatars";

import type { CallType } from "@/services/calls";

// ==========================================
// PERMISSIONS
// ==========================================
// Reuses packages the app already has: expo-audio (mic) and
// expo-image-picker (camera). They ask for the same phone permissions
// calls need, so nothing new to install for this.

export async function ensureCallPermissions(type: CallType): Promise<boolean> {
  const mic = await AudioModule.requestRecordingPermissionsAsync();

  if (!mic.granted) {
    Alert.alert(
      "Microphone permission",
      "Allow CosQuest to use your microphone to make calls. You can turn it on in Settings.",
    );
    return false;
  }

  if (type === "video") {
    const camera = await ImagePicker.requestCameraPermissionsAsync();

    if (!camera.granted) {
      Alert.alert(
        "Camera permission",
        "Allow CosQuest to use your camera for video calls. You can turn it on in Settings.",
      );
      return false;
    }
  }

  return true;
}

// ==========================================
// AVATAR
// ==========================================
// Same logic as the Followers/Following screens: uploaded photo first,
// then the preset avatar picked at signup (avatarKey), then the default.
// Also accepts the extra URL fields the chat participant type uses.

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
    // A resized copy (Cloudinary): full-size uploads are 140-400 KB each,
    // 480 px is ~10x smaller and still sharp on the largest call tile.
    return { uri: smallAvatarUrl(photo, 480) };
  }

  const preset = AVATARS.find((avatar) => avatar.id === person?.avatarKey);

  if (preset?.source) {
    return preset.source;
  }

  return require("@/assets/images/dp-avatar.png");
}
