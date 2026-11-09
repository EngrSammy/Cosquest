// PHONES: runs callSubscriptions' manager for the LiveKit room this sits
// in (inside <LiveKitRoom>). Renders nothing. The website call screen
// starts the same manager next to its own Room.
import { useRoomContext } from "@livekit/react-native";
import { useEffect } from "react";

import { manageCallSubscriptions } from "./callSubscriptions";

export default function CallSubscriptionManager({
  autoSubscribe,
}: {
  // Must match the connectOptions the room was connected with.
  autoSubscribe: boolean;
}) {
  const room = useRoomContext();

  useEffect(
    () => manageCallSubscriptions(room, autoSubscribe),
    [room, autoSubscribe],
  );

  return null;
}
