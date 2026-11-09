// ==========================================
// FLIP CAMERA (front <-> back): every call screen
// ==========================================
// The same steps as the DM / group call screen (Subomi): LiveKit's restart
// with the other facing mode first; some Android phones ignore that, so the
// phone's own camera switch next. Returns the new facing, or null when it
// couldn't switch (one camera only, or the camera is off).
import { Track, type LocalParticipant, type LocalVideoTrack } from "livekit-client";

export type Facing = "user" | "environment";

export async function flipCamera(participant: LocalParticipant | null | undefined, facing: Facing): Promise<Facing | null> {
  const track = participant?.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined;
  if (!track) return null;
  const next: Facing = facing === "user" ? "environment" : "user";

  try {
    await track.restartTrack({ facingMode: next });
    return next;
  } catch {
    // Some Android phones ignore that - use the phone's own switch below.
  }

  try {
    const mediaTrack = track.mediaStreamTrack as unknown as {
      _switchCamera?: () => void;
      applyConstraints?: (constraints: object) => Promise<void>;
    };
    if (typeof mediaTrack._switchCamera === "function") {
      mediaTrack._switchCamera();
      return next;
    }
    if (typeof mediaTrack.applyConstraints === "function") {
      await mediaTrack.applyConstraints({ facingMode: next });
      return next;
    }
  } catch {
    // Only one camera on this device.
  }
  return null;
}
