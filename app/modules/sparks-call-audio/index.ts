// SPARKS CALL AUDIO (phones only)
// Connects LiveKit's microphone capture to Sparks call notes. While attached,
// every 10 ms of this user's own call audio (after LiveKit's echo
// cancellation and noise suppression) goes straight from LiveKit to the
// Sparks SDK in native code; nothing passes through JavaScript.
// Sparks ignores the audio unless notes are on for this call
// (sdk.calls.startTranscription) and not muted.
import { requireOptionalNativeModule } from "expo";

type NativeModule = { attach(): boolean; detach(): void };

const native = requireOptionalNativeModule<NativeModule>("SparksCallAudio");

/** True when this build has the module (false on web and in older builds). */
export const callAudioAvailable = Boolean(native);

/** Start handing this user's call audio to Sparks. Safe to call twice. */
export function attachCallAudio(): boolean {
  return native ? native.attach() : false;
}

/** Stop handing audio to Sparks. Safe to call when not attached. */
export function detachCallAudio() {
  native?.detach();
}
