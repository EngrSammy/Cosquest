// The app's one squad model (squad.ts), wired to the game store's signed
// client and fix, plus the hold-phones model pointed at the squad route
// (friendsNearby.ts with squadClaimer). The client sends the live token with
// the next 3D fight's start (GameClient.squad). Glue, not unit tested.
import { useSyncExternalStore } from "react";

import { nativeHelpers } from "@/modules/costquest-game/src";

import { createNearbyFriendModel, type NearbyFriendModel, type NearbyState, NEARBY_INITIAL } from "./friendsNearby.ts";
import { gameStore } from "./runtime.ts";
import { createSquadModel, squadClaimer, type SquadState } from "./squad.ts";

const here = () => {
  const fix = gameStore.get().fix;
  return fix ? { lat: fix.lat, lng: fix.lng } : null;
};

export const squadModel = createSquadModel({ client: () => gameStore.client, here });

gameStore.client.squad = { token: () => squadModel.token(), used: () => squadModel.used() };

function makeNearby(): NearbyFriendModel | null {
  const n = nativeHelpers;
  if (!n?.friendBeaconAvailable || !n.startFriendBeacon || !n.stopFriendBeacon || !n.addListener) return null;
  const start = n.startFriendBeacon.bind(n);
  const stop = n.stopFriendBeacon.bind(n);
  const addListener = n.addListener.bind(n);
  return createNearbyFriendModel({
    beacon: {
      usesUWB: n.friendBeaconUWB === true,
      start: (me) => start(me.key, me.handle),
      stop: () => stop(),
      listen: (on) => {
        const sub = addListener("onFriendBeacon", on);
        return () => sub.remove();
      },
    },
    claimer: squadClaimer((s) => squadModel.paired(s)),
    client: () => gameStore.client,
    here,
    handle: () => gameStore.playerName(),
    onFriend: () => {},
  });
}

/** Hold phones together to squad up; null where phones cannot be held together (Android, web). */
export const squadNearby: NearbyFriendModel | null = makeNearby();

/** The phone can measure the other phone (UWB): holding them together is the way in. */
export const squadByUWB = squadNearby !== null && squadNearby.usesUWB;

export function useSquad(): SquadState {
  return useSyncExternalStore(squadModel.subscribe, squadModel.get, squadModel.get);
}

const noop = () => () => {};
const initial = () => NEARBY_INITIAL;

export function useSquadNearby(): NearbyState {
  return useSyncExternalStore(squadNearby?.subscribe ?? noop, squadNearby?.get ?? initial, squadNearby?.get ?? initial);
}
