// The ground's layers as SVG paths, in a ground answer's own metres (x east,
// y = -north): what both the single board (WorldMap Ground) and each tile
// (GroundTiles) draw inside their <Svg>.
//
// "Sunlit Real Places" 6.4: the same land use as the 3D world (park, wood,
// plaza stone, water with its shore), roads with a hierarchy (every casing
// under every fill, majors wider and warmer), tree canopies, and buildings
// lifted off the ground in 2.5D: a soft contact shadow, the wall, the roof.
import { G, Path } from "react-native-svg";

import type { MapLayers } from "@/features/game/mapPaths";
import type { MapStyle } from "@/features/game/mapStyle";

/** Road casing, metres each side of the fill. */
const CASING_MAJOR = 1.4;
const CASING_MINOR = 0.9;

export function GroundPaths({ layers, look }: { layers: MapLayers | null; look: MapStyle }) {
  if (!layers) return null;
  const roads = layers.roads.filter((r) => r.kind !== "rail");
  const rails = layers.roads.filter((r) => r.kind === "rail");
  const shade = look.dark ? "rgba(8,12,24,0.35)" : "rgba(60,48,30,0.12)";
  return (
    <>
      <Path d={layers.paved} fill={look.plaza} />
      <Path d={layers.green} fill={look.park} />
      <Path d={layers.wood} fill={look.wood} />
      <Path d={layers.water} fill={look.water} stroke={look.shore} strokeWidth={1.4} strokeLinejoin="round" />
      {layers.waterways.map((w, i) => (
        <Path key={`ww${i}`} d={w.d} stroke={look.water} strokeWidth={w.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ))}
      {rails.map((r, i) => (
        <Path key={`rl${i}`} d={r.d} stroke={look.rail} strokeWidth={1.6} strokeDasharray="5 3" strokeLinecap="butt" fill="none" />
      ))}
      {/* Every casing first, so junctions join cleanly; then the fills, paths, minors, majors on top. */}
      {roads.map((r, i) =>
        r.kind === "path" ? null : (
          <Path
            key={`rc${i}`}
            d={r.d}
            stroke={r.kind === "major" ? look.roadMajorCasing : look.roadMinorCasing}
            strokeWidth={r.width + 2 * (r.kind === "major" ? CASING_MAJOR : CASING_MINOR)}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ),
      )}
      {roads
        .filter((r) => r.kind === "path")
        .map((r, i) => (
          <Path key={`rp${i}`} d={r.d} stroke={look.path} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ))}
      {roads
        .filter((r) => r.kind === "minor")
        .map((r, i) => (
          <Path key={`rm${i}`} d={r.d} stroke={look.roadMinor} strokeWidth={r.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ))}
      {roads
        .filter((r) => r.kind === "major")
        .map((r, i) => (
          <Path key={`rM${i}`} d={r.d} stroke={look.roadMajor} strokeWidth={r.width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ))}
      {layers.trees ? <Path d={layers.trees} fill={look.wood} opacity={0.9} /> : null}
      {/* 2.5D: per height bucket, a soft shadow on the ground, the wall, then the roof lifted north. */}
      {layers.blocks.map((b, i) => (
        <G key={`b${i}`}>
          <Path d={b.d} fill={shade} transform={`translate(${b.lift * 0.5} ${b.lift * 0.35})`} />
          <Path d={b.d} fill={look.buildingSide} />
          <Path d={b.d} fill={look.buildingSide} transform={`translate(0 ${-b.lift / 2})`} />
          <Path d={b.d} fill={look.buildingTop} stroke={look.buildingEdge} strokeWidth={0.6} transform={`translate(0 ${-b.lift})`} />
        </G>
      ))}
    </>
  );
}
