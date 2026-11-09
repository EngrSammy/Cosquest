// The world map's camera, shared with everything standing on the board.
//
// WorldMap turns and zooms the whole board (the streets are drawn once, the
// camera is a transform). Things standing on it (Quest Point pins, Room
// beacons, Forge finds, the player's face) should stay upright and about the
// same size on screen whatever the camera does, as in Pokemon GO: <MapPin>
// counter-turns and counter-scales its contents about the spot they stand on.
import { createContext, type ReactNode, useContext } from "react";
import { StyleSheet } from "react-native";
import Animated, { type SharedValue, useAnimatedStyle } from "react-native-reanimated";

export type MapCamera = {
  /** Board zoom (1 = MAP_SCALE points per metre). */
  zoom: SharedValue<number>;
  /** Board rotation, radians (0 = north up). */
  rot: SharedValue<number>;
};

export const MapCameraContext = createContext<MapCamera | null>(null);

/**
 * How much of the zoom a pin takes on: 0 keeps it exactly the same size on
 * screen, 1 scales it with the streets. A little growth when zooming in reads
 * as "closer" without pins swamping the map.
 */
const PIN_ZOOM_SHARE = 0.35;

/** The box a pin is drawn in; the spot it marks is the box's bottom centre. */
export const PIN_BOX = 96;
/** Where, inside the box, a pin's own left/top should be measured from (the spot). */
export const PIN_SPOT = { left: PIN_BOX / 2, top: PIN_BOX } as const;

/** The counter-transform for something standing on the board (worklet-safe). */
export function useUpright() {
  const cam = useContext(MapCameraContext);
  return useAnimatedStyle(() => {
    if (!cam) return {};
    const s = cam.zoom.get();
    return { transform: [{ rotate: `${-cam.rot.get()}rad` }, { scale: Math.pow(s, PIN_ZOOM_SHARE - 1) }] };
  });
}

/**
 * Stands its children on the board at (left, top) board points, upright and
 * screen-sized. Children place themselves relative to PIN_SPOT (the spot).
 */
export function MapPin({ left, top, zIndex, children }: { left: number; top: number; zIndex?: number; children: ReactNode }) {
  const upright = useUpright();
  return (
    <Animated.View pointerEvents="box-none" style={[styles.box, { left: left - PIN_BOX / 2, top: top - PIN_BOX, zIndex }, upright]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: "absolute",
    width: PIN_BOX,
    height: PIN_BOX,
    // Turn and scale about the spot the pin marks, not the box's middle.
    transformOrigin: [PIN_BOX / 2, PIN_BOX, 0],
  },
});
