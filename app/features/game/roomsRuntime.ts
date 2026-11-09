// The app's one Rooms model and the glue a Room's session needs on a phone:
// the game store's signed client and fix, React Native's WebSocket, the
// compass (expo-location's heading). rooms.ts and roomsSession.ts are the
// pure parts; this file is the glue, so it is not unit tested.
// costquest-ios Roam/RoamHomeView.swift (the beacon loop, ~lines 355-367).
import * as Location from "expo-location";
import { useEffect, useState, useSyncExternalStore } from "react";

import { gameStore, refreshFix } from "./runtime.ts";
import { createRoomSession, createRoomsModel, type RoomSession, type RoomSessionState, type RoomsState, type SocketLike } from "./roomsSession.ts";

export const roomsModel = createRoomsModel({
  client: () => gameStore.client,
  here: () => {
    const fix = gameStore.get().fix;
    return fix ? { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy } : null;
  },
});

export function useRooms(): RoomsState {
  return useSyncExternalStore(roomsModel.subscribe, roomsModel.get, roomsModel.get);
}

/**
 * Rooms come and go in minutes, so their beacons are polled on their own:
 * quickly until the first fetch is in, then every half minute, while the
 * game page is up and the player has reached "battle" (level 3).
 */
export function useRoomBeacons(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      await roomsModel.refresh();
      if (stopped) return;
      timer = setTimeout(tick, roomsModel.get().loaded ? 30000 : 2000);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled]);
}

/** A session for one Room's game, on this phone's client and socket. */
export function newRoomSession(gameId: string): RoomSession {
  return createRoomSession({
    client: gameStore.client,
    gameId,
    openSocket: (url) => new WebSocket(url) as unknown as SocketLike,
    // A fresh fix before a located action when the last is old (fixInfo.ts).
    freshFix: refreshFix,
  });
}

export function useRoomSession(session: RoomSession): RoomSessionState {
  return useSyncExternalStore(session.subscribe, session.get, session.get);
}

/**
 * Where the phone points, degrees from true north (magnetic when true north
 * is not known), or null when there is no compass. Only while `active`, and
 * only changes of two degrees or more re-render.
 */
export function useHeading(active: boolean): number | null {
  const [heading, setHeading] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    let last = -1000;
    Location.watchHeadingAsync((h) => {
      const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
      if (!Number.isFinite(deg) || deg < 0) return;
      const diff = Math.abs(((deg - last + 540) % 360) - 180);
      if (diff < 2) return;
      last = deg;
      setHeading(Math.round(deg));
    })
      .then((s) => {
        if (cancelled) s.remove();
        else sub = s;
      })
      .catch(() => setHeading(null));
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [active]);
  return heading;
}
