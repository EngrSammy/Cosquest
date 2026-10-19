// ==========================================
// PRIVATE CALL - the audio connection (phones)
// ==========================================
// Its own LiveKit room, next to the main call's (which keeps running).
// Renders `children(controls)` so the sheet can show the mic button.
import { LiveKitRoom, useLocalParticipant, useRemoteParticipants } from "@livekit/react-native";
import type { ReactNode } from "react";

export type PrivateAudioControls = {
  micOn: boolean;
  toggleMic: () => void;
  otherHere: boolean;
};

function Controls({ children }: { children: (controls: PrivateAudioControls) => ReactNode }) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const remotes = useRemoteParticipants();
  return (
    <>
      {children({
        micOn: isMicrophoneEnabled,
        toggleMic: () => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled),
        otherHere: remotes.length > 0,
      })}
    </>
  );
}

export default function PrivateCallAudio({
  livekitUrl,
  token,
  children,
}: {
  livekitUrl: string;
  token: string;
  children: (controls: PrivateAudioControls) => ReactNode;
}) {
  return (
    <LiveKitRoom serverUrl={livekitUrl} token={token} connect audio video={false}>
      <Controls>{children}</Controls>
    </LiveKitRoom>
  );
}
