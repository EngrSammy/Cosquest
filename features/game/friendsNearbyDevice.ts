// The hold-phones model wired to the phone: the native beacon
// (ios/Embed/FriendBeaconIsland.swift), the game store's signed client and
// fix, and the friends list to refresh when someone new is added.
// friendsNearby.ts is the pure part; this file is the glue, so it is not unit
// tested. Null where there is no beacon (Android, web).
import { useSyncExternalStore } from "react";

import { nativeHelpers } from "@/modules/costquest-game/src";

import { friendsModel } from "./friendsRuntime.ts";
import { createNearbyFriendModel, type NearbyFriendModel, type NearbyState, NEARBY_INITIAL } from "./friendsNearby.ts";
import { gameStore } from "./runtime.ts";

function make(): NearbyFriendModel | null {
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
    client: () => gameStore.client,
    here: () => {
      const fix = gameStore.get().fix;
      return fix ? { lat: fix.lat, lng: fix.lng } : null;
    },
    handle: () => gameStore.playerName(),
    onFriend: () => {
      void friendsModel.refresh();
      void gameStore.refreshMe();
    },
  });
}

/** The app's one hold-phones model, or null where phones cannot be held together. */
export const nearbyFriends: NearbyFriendModel | null = make();

const noop = () => () => {};
const initial = () => NEARBY_INITIAL;

export function useNearbyFriends(): NearbyState {
  return useSyncExternalStore(nearbyFriends?.subscribe ?? noop, nearbyFriends?.get ?? initial, nearbyFriends?.get ?? initial);
}
