// The live calendar wired to the phone: one calendar for the map banner and
// the events sheet, fetched with the game's own client. (live.ts is the pure
// part; this file is the glue, so it is not unit tested.)
// costquest-ios Features/LiveFeature.swift (LiveCalendarModel).
import { useSyncExternalStore } from "react";

import { createLiveCalendarStore, fetchLiveCalendar, type LiveCalendarState } from "./live.ts";
import { gameStore } from "./runtime.ts";

export const liveCalendar = createLiveCalendarStore({
  fetchCalendar: (lat, lng) => fetchLiveCalendar(gameStore.client, lat, lng),
});

export function useLiveCalendar(): LiveCalendarState {
  return useSyncExternalStore(liveCalendar.subscribe, liveCalendar.get, liveCalendar.get);
}

/** Where the calendar is for: the fix, else where the world was last cut.
 * The calendar runs on the local clock of wherever the player is. */
export function livePlace(): { lat: number; lng: number } | null {
  const s = gameStore.get();
  const here = s.fix ?? s.centre;
  return here ? { lat: here.lat, lng: here.lng } : null;
}
