// ==========================================
// CAMERA / MICROPHONE BLOCKED: a clear message, and the call carries on
// ==========================================
// Phones: "Open Settings". Website: how to allow it in the browser.
import { Alert, Linking, Platform } from "react-native";

export type MediaKind = "camera" | "microphone";

const lastShown: Record<MediaKind, number> = { camera: 0, microphone: 0 };

export function kindOfMediaError(error: unknown, deviceKind?: string): MediaKind {
  if (deviceKind === "videoinput") return "camera";
  if (deviceKind === "audioinput") return "microphone";
  return /video|camera/i.test(String((error as any)?.message || "")) ? "camera" : "microphone";
}

export function isBlockedError(error: unknown) {
  const name = String((error as any)?.name || "");
  const message = String((error as any)?.message || "");
  return /NotAllowed|PermissionDenied|Security/i.test(name) || /permission|denied|not allowed/i.test(message);
}

export function explainBlocked(kind: MediaKind) {
  // Once in a while, not for every retry.
  if (Date.now() - lastShown[kind] < 8000) return;
  lastShown[kind] = Date.now();
  const what = kind === "camera" ? "Camera" : "Microphone";
  const effect = kind === "camera" ? "Your video stays off." : "Others can't hear you, but you can still listen.";

  if (Platform.OS === "web") {
    Alert.alert(
      `${what} blocked`,
      `${effect} To allow it, click the lock next to the website address, set ${what} to Allow, then try again. You're still in the call.`,
    );
    return;
  }
  Alert.alert(`${what} blocked`, `${effect} Allow CosQuest to use your ${kind} in Settings. You're still in the call.`, [
    { text: "Not now", style: "cancel" },
    { text: "Open Settings", onPress: () => Linking.openSettings().catch(() => {}) },
  ]);
}
