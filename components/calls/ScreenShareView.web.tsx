// A shared screen (website), shown whole.
import type { VideoTrack } from "livekit-client";
import { useEffect, useRef } from "react";

import type { ShareInfo } from "./useCallTools";

export default function ScreenShareView({ share }: { share: ShareInfo }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const track = share.publication.track as VideoTrack | undefined;

  useEffect(() => {
    const element = ref.current;
    if (!element || !track) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  return <video ref={ref} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "contain", background: "#0E0F16" }} />;
}
