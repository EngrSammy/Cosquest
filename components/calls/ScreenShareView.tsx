// A shared screen (phones): someone sharing from the website, shown whole.
import { VideoTrack } from "@livekit/react-native";
import { Track } from "livekit-client";
import { StyleSheet } from "react-native";

import type { ShareInfo } from "./useCallTools";

export default function ScreenShareView({ share }: { share: ShareInfo }) {
  return (
    <VideoTrack
      trackRef={{ participant: share.participant, publication: share.publication, source: Track.Source.ScreenShare } as any}
      style={StyleSheet.absoluteFill}
      objectFit="contain"
    />
  );
}
