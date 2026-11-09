// The app's one friends model, wired to the game store: its signed client,
// its location fix, and a refresh of /me and the points when gifts land in
// the bag (RoamStore.featureChanged on iOS). friends.ts is the pure part;
// this file is the glue, so it is not unit tested.
import { useSyncExternalStore } from "react";

import { createFriendsModel, type FriendsState } from "./friends.ts";
import { gameStore } from "./runtime.ts";

export const friendsModel = createFriendsModel({
  client: () => gameStore.client,
  here: () => {
    const fix = gameStore.get().fix;
    return fix ? { lat: fix.lat, lng: fix.lng } : null;
  },
  onChanged: () => {
    void gameStore.refreshMe();
    void gameStore.refreshPoints(true);
  },
});

export function useFriends(): FriendsState {
  return useSyncExternalStore(friendsModel.subscribe, friendsModel.get, friendsModel.get);
}
