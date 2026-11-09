// The game's UI kit, React side: the scheme the game is drawn in (it follows
// the map: cream paper over the day map, ink over the dusk map, never dark
// on day), the surfaces for it, and the two kinds of depth the kit uses.
// The numbers are features/game/lookTokens.ts ("Sunlit Real Places").
import { createContext, createElement, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { Platform, type ViewStyle } from "react-native";

import { SchemeOverride, useBaseScheme, useChatScheme } from "@/constants/chatTheme";
import { SURFACES, type Surfaces } from "@/features/game/lookTokens";
import { effectiveHour, hourForScheme, mapStyle, type MapStyle, timeOfDay } from "@/features/game/mapStyle";

import { useWorldClock } from "./prefs";

export * from "@/features/game/lookTokens";

/** The map's colours for the hour the town is lit for, looked at again each minute. */
export function useMapStyle(): MapStyle {
  const clock = useWorldClock();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  // The phone's own light or dark: the game's override is this very style.
  const dark = useBaseScheme() === "dark";
  const hour = hourForScheme(clock, effectiveHour(clock, now), dark);
  // Only a change of bucket makes a new style (and redraws the ground).
  const bucket = timeOfDay(hour);
  return useMemo(() => mapStyle(hour), [bucket]); // eslint-disable-line react-hooks/exhaustive-deps
}

const MapLook = createContext<MapStyle | null>(null);

/** The map's style: GameSchemeProvider's, or worked out here (a preview with no provider). */
export function useMapLook(): MapStyle {
  const shared = useContext(MapLook);
  const own = useMapStyle();
  return shared ?? own;
}

/**
 * Wraps the game: everything inside is drawn light over the day map and dark
 * over the dusk map (themedStyles, useInk and useLook all follow it).
 */
export function GameSchemeProvider({ children }: { children: ReactNode }) {
  const look = useMapStyle();
  return createElement(MapLook.Provider, { value: look }, createElement(SchemeOverride.Provider, { value: look.dark ? "dark" : "light" }, children));
}

export type Look = Surfaces & { dark: boolean };

/** The surfaces for the scheme the game is drawn in. */
export function useLook(): Look {
  const dark = useChatScheme() === "dark";
  return useMemo(() => ({ ...SURFACES[dark ? "dark" : "light"], dark }), [dark]);
}

function shadow(y: number, blur: number, opacity: number, elevation: number): ViewStyle {
  return Platform.select<ViewStyle>({
    web: { boxShadow: `0px ${y}px ${blur}px rgba(16,24,40,${opacity})` },
    android: { elevation },
    default: { shadowColor: "#101828", shadowOpacity: opacity, shadowRadius: blur / 2, shadowOffset: { width: 0, height: y } },
  });
}

/**
 * Depth (6.2): cards and sheets on light paper sit on `low`; floating map
 * controls on `float`. On dark paper a hairline replaces the shadow.
 */
export const ELEVATION = {
  none: {} as ViewStyle,
  low: shadow(2, 8, 0.08, 2),
  float: shadow(6, 16, 0.18, 6),
} as const;
