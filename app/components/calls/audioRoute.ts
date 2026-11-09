// ==========================================
// SPEAKER / EARPIECE (phones) - group calls, voice chats, scheduled calls
// ==========================================
// The same routing as DM calls: loudspeaker, or else the private output -
// Bluetooth, then headphones, then the earpiece (whichever is connected).
import { AudioSession } from "@livekit/react-native";
import { Platform } from "react-native";

const PRIVATE_OUTPUTS = ["bluetooth", "headset", "wired_headset", "earpiece"];

export const CAN_ROUTE_AUDIO = true;

export async function routeAudio(speakerOn: boolean) {
  try {
    if (Platform.OS === "ios") {
      // iOS prefers connected earphones on "default" by itself.
      await AudioSession.selectAudioOutput(speakerOn ? "force_speaker" : "default");
      return;
    }
    if (speakerOn) {
      await AudioSession.selectAudioOutput("speaker");
      return;
    }
    let available: string[] = [];
    try {
      available = (await AudioSession.getAudioOutputs()) || [];
    } catch {
      // Older phones may not report outputs: the earpiece.
    }
    await AudioSession.selectAudioOutput(PRIVATE_OUTPUTS.find((output) => available.includes(output)) || "earpiece");
  } catch {
    // Some phones refuse a manual change: the call keeps its current route.
  }
}
