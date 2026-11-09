// How big a bitmap the world map's ground may be (WorldMap.tsx Ground).
//
// react-native-svg draws the ground into one bitmap the size of the view in
// pixels. The board is up to 1,800 points square, so on a 560 dpi phone (3.5
// pixels per point) that is 6,300 px square, 159 MB: Android refuses to draw
// a bitmap over 100 MB and the app crashed as the map opened ("Canvas: trying
// to draw too large bitmap", found by the polish run on a 1440x3120 screen;
// the 420 dpi journey emulator stayed just under). iOS draws it too, at a
// similar memory cost. So the ground is drawn at most MAX_GROUND_PX square and
// scaled up to the board; at 3.5x that is about 2.3 pixels per point.
export const MAX_GROUND_PX = 4096;

/** The size to draw the ground at (points), the scale back up to `size`, and the offset so the scaled view covers 0..size. */
export function groundRaster(size: number, pixelRatio: number, maxPx = MAX_GROUND_PX): { drawn: number; scale: number; offset: number } {
  const scale = Math.max(1, (size * Math.max(1, pixelRatio)) / maxPx);
  const drawn = size / scale;
  // RN scales about the view's centre: centre the small view on the board.
  return { drawn, scale, offset: (size - drawn) / 2 };
}
