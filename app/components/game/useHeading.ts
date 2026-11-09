// Which way the phone faces. One compass subscription per user of it, only
// while enabled.
//   useHeading(enabled)        degrees as React state, re-rendering only on a
//                              turn of a few degrees (bearing arrows).
//   watchCompass(onReading)    every reading, no React state (the heading-up
//                              map, components/game/useHeadingUp.ts, which
//                              smooths them itself and turns the camera).
// True north when the phone knows it, magnetic otherwise.
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

import { readingDeg } from "@/features/game/headingUp";

const MIN_TURN = 6;

export type CompassReading = { deg: number; accuracy: number | null; at: number };

/**
 * Starts the compass; onReading gets every valid reading, onError once if the
 * phone has no compass (or no permission). Returns stop(), safe to call at any
 * time, also before the subscription has arrived.
 */
export function watchCompass(onReading: (r: CompassReading) => void, onError?: () => void): () => void {
  if (Platform.OS === "web") {
    onError?.();
    return () => {};
  }
  let alive = true;
  let sub: Location.LocationSubscription | null = null;
  Location.watchHeadingAsync((h) => {
    if (!alive) return;
    const deg = readingDeg(h);
    if (deg === null) return;
    onReading({ deg, accuracy: typeof h.accuracy === "number" ? h.accuracy : null, at: Date.now() });
  })
    .then((s) => {
      if (alive) sub = s;
      else s.remove();
    })
    .catch(() => {
      if (alive) onError?.();
    });
  return () => {
    alive = false;
    sub?.remove();
    sub = null;
  };
}

export function useHeading(enabled: boolean): number | null {
  const [heading, setHeading] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    return watchCompass(({ deg }) => {
      setHeading((prev) => {
        if (prev === null) return deg;
        const turn = Math.abs(((deg - prev + 540) % 360) - 180);
        return turn >= MIN_TURN ? deg : prev;
      });
    });
  }, [enabled]);
  return enabled ? heading : null;
}
