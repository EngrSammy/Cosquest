// The home map's colours by the hour: the town is lit for the time you are
// playing in. The hours are costquest-ios Map/TimeOfDay.swift (dawn 5-8, day
// 8-17, dusk 17-20, night); the colours are the art direction's day and dusk
// maps ("Sunlit Real Places", cosquest-review/art-direction tokens.json `map`):
// the 3D world's own ground colours (a park on the map is the same green as a
// park in the fight, a plaza the same stone), lightened toward cream paper by
// day and shifted toward the dusk sky after it. Dawn and day use the day map,
// dusk and night the dusk map. A building is its footprint lifted a little
// off the ground (2.5D), its wall showing below its roof.
//
// The player can fix the hour (Profile, "Time in town": UI/Preferences.swift
// WorldClock), so nobody has to wait until 8pm to see the town at night.
//
// Pure (features/game/__tests__/mapStyle.test.ts).

export type TimeOfDay = "dawn" | "day" | "dusk" | "night";

/** Preferences.WorldClock: "real" follows the phone's clock. */
export type WorldClock = "real" | "morning" | "noon" | "dusk" | "night";

export const WORLD_CLOCKS: { id: WorldClock; label: string; hour: number | null }[] = [
  { id: "real", label: "Follow the clock", hour: null },
  { id: "morning", label: "Morning", hour: 8 },
  { id: "noon", label: "Midday", hour: 13 },
  { id: "dusk", label: "Dusk", hour: 18.4 },
  { id: "night", label: "Night", hour: 22 },
];

export function isWorldClock(v: unknown): v is WorldClock {
  return WORLD_CLOCKS.some((c) => c.id === v);
}

/** TimeOfDay.now: the hour's bucket. */
export function timeOfDay(hour: number): TimeOfDay {
  const h = Math.floor(((hour % 24) + 24) % 24);
  if (h >= 5 && h < 8) return "dawn";
  if (h >= 8 && h < 17) return "day";
  if (h >= 17 && h < 20) return "dusk";
  return "night";
}

/**
 * Task 059: with the app in dark mode and the world on "Follow the clock",
 * the town is lit as at night (a fixed clock the player chose wins).
 */
export function hourForScheme(clock: WorldClock, hour: number, dark: boolean): number {
  if (!dark || clock !== "real") return hour;
  const t = timeOfDay(hour);
  return t === "night" ? hour : 22;
}

/** Preferences.effectiveHour: the fixed hour, or the phone's. */
export function effectiveHour(clock: WorldClock, now: Date): number {
  const fixed = WORLD_CLOCKS.find((c) => c.id === clock)?.hour ?? null;
  return fixed ?? now.getHours() + now.getMinutes() / 60;
}

export type MapStyle = {
  hour: TimeOfDay;
  /** The dusk map (dusk and night): the game's surfaces go dark with it. */
  dark: boolean;
  land: string;
  /** Plazas, squares, pedestrian streets, platforms and piers: the fight's plaza stone. */
  plaza: string;
  /** Parks, grass, gardens, pitches. */
  park: string;
  /** Woods: the park's green a step deeper. */
  wood: string;
  water: string;
  /** The water's edge line. */
  shore: string;
  sand: string;
  roadMinor: string;
  roadMinorCasing: string;
  roadMajor: string;
  roadMajorCasing: string;
  /** Footways and paths: a thin pale line. */
  path: string;
  rail: string;
  buildingTop: string;
  buildingSide: string;
  /** The roof's outline: a hair lighter (dusk) or darker (day) than the roof. */
  buildingEdge: string;
  /** Landmark footprints. */
  landmark: string;
  /** Place names on the map, with a halo of the paper colour. */
  label: string;
  labelHalo: string;
  /** Where a tile is still loading: the land, a shade off. */
  grid: string;
  /** The sky at the top of the map: the world's preset `upper` to `horizon`, so the map and the fight share a sky. */
  skyUpper: string;
  skyHorizon: string;
  /** Lit windows after dark; null by day. */
  windows: string | null;
  /** The attribution and other small print over the map. */
  ink: string;
};

type Palette = Omit<MapStyle, "hour" | "dark" | "windows" | "ink">;

/** tokens.json map.day / map.dusk (authoritative), plus the derived wood, path, rail, edge and grid. */
const DAY: Palette = {
  land: "#E9E2D2",
  plaza: "#F1E6CF",
  park: "#A9D08A",
  wood: "#93C277",
  water: "#7CC4E4",
  shore: "#5AAED6",
  sand: "#EEDDB4",
  roadMinor: "#FFFFFF",
  roadMinorCasing: "#D6CFC0",
  roadMajor: "#FFE7B0",
  roadMajorCasing: "#E0C68A",
  path: "#FBF6EA",
  rail: "#B9AF9E",
  buildingTop: "#DCD3C2",
  buildingSide: "#C4B8A3",
  buildingEdge: "#CBC0AC",
  landmark: "#F2D9A6",
  label: "#5A6878",
  labelHalo: "#FFFDF8",
  grid: "#E1D9C7",
  // world.time.golden.sky
  skyUpper: "#86AEE0",
  skyHorizon: "#F2DDC2",
};

const DUSK: Palette = {
  land: "#2B3552",
  plaza: "#364262",
  park: "#2F5A4A",
  wood: "#2A5243",
  water: "#1C3E66",
  shore: "#2A527E",
  sand: "#4A4A5C",
  roadMinor: "#46557A",
  roadMinorCasing: "#222B44",
  roadMajor: "#5A6A94",
  roadMajorCasing: "#222B44",
  path: "#3F4D70",
  rail: "#56607E",
  buildingTop: "#3A4767",
  buildingSide: "#2A3550",
  buildingEdge: "#4A5879",
  landmark: "#6A5A3A",
  label: "#A3AFBE",
  labelHalo: "#121A26",
  grid: "#323C5B",
  // world.time.dusk.sky
  skyUpper: "#56609E",
  skyHorizon: "#F0A47E",
};

/** The map's colours for an hour of the day: the day map at dawn and by day, the dusk map at dusk and at night. */
export function mapStyle(hour: number): MapStyle {
  const t = timeOfDay(hour);
  const dark = t === "dusk" || t === "night";
  return {
    hour: t,
    dark,
    ...(dark ? DUSK : DAY),
    windows: dark ? "#FFC27A" : null,
    ink: dark ? "rgba(243,240,232,0.7)" : "rgba(28,43,58,0.6)",
  };
}
