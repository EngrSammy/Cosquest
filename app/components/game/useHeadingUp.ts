// The heading-up map (phone hardware design 2.2): while on, the world map's
// turn (WorldMap's camera `rot`) follows the phone's compass, smoothed
// (features/game/headingUp.ts) and eased, so the street ahead is up the screen.
//
// The compass runs only while heading-up is on and the map is in front. Each
// reading goes through the filter on the JS thread; the camera is moved with a
// short timing on its shared value, so there is no React render per reading.
// A twist by hand lets go (WorldMap onTwist); the compass button turns it off
// and the map eases back to north up.
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Easing, type SharedValue, cancelAnimation, withTiming } from "react-native-reanimated";

import {
  CALIBRATE_AFTER_MS,
  COMPASS_START,
  type CompassMode,
  HeadingFilter,
  NO_COMPASS_MS,
  RATE_MS,
  compassReduce,
  needsCalibration,
  rotForHeading,
} from "@/features/game/headingUp";
import { shortAngle } from "@/features/game/mapCameraMath";

import { watchCompass } from "./useHeading";

/** Turning into heading-up, and back to north up (ms). */
const SWING_MS = 420;
/** Each smoothed step glides over a little more than the gap between steps, so steps blend. */
const STEP_MS = Math.round(RATE_MS * 1.8);
/** How long the calibration hint stays up (ms). */
const HINT_MS = 6000;

// Per app run: a phone found without a compass stays without one, and the
// figure-8 hint is shown once.
let compassMissing = false;
let hintShown = false;

export type HeadingUp = {
  mode: CompassMode;
  /** False once the phone turned out to have no compass: hide the button. */
  available: boolean;
  /** The compass button. */
  toggle: () => void;
  /** A twist turned the map by hand. */
  twisted: () => void;
  /** Show "wave your phone in a figure 8". */
  calibrate: boolean;
};

export function useHeadingUp(rot: SharedValue<number>, active: boolean, reduceMotion: boolean): HeadingUp {
  const [state, dispatch] = useReducer(compassReduce, undefined, () => ({ ...COMPASS_START, available: !compassMissing }));
  const [calibrate, setCalibrate] = useState(false);
  const running = state.mode === "heading" && active;
  const reduce = useRef(reduceMotion);
  reduce.current = reduceMotion;

  useEffect(() => {
    if (!running) return;
    const filter = new HeadingFilter();
    let first = true;
    let heard = false;
    let lowSince: number | null = null;
    const missing = () => {
      compassMissing = true;
      dispatch({ t: "unavailable" });
    };
    const stop = watchCompass((r) => {
      if (!heard) {
        heard = true;
        dispatch({ t: "reading" });
      }
      if (needsCalibration(r.accuracy)) {
        lowSince ??= r.at;
        if (!hintShown && r.at - lowSince >= CALIBRATE_AFTER_MS) {
          hintShown = true;
          setCalibrate(true);
        }
      } else {
        lowSince = null;
      }
      const h = filter.push(r.deg, r.at);
      if (h === null) return;
      const target = rotForHeading(h, rot.get());
      if (reduce.current) {
        cancelAnimation(rot);
        rot.set(target);
      } else {
        rot.set(withTiming(target, { duration: first ? SWING_MS : STEP_MS, easing: first ? Easing.inOut(Easing.cubic) : Easing.linear }));
      }
      first = false;
    }, missing);
    const silent = setTimeout(() => {
      if (!heard) {
        stop();
        missing();
      }
    }, NO_COMPASS_MS);
    return () => {
      clearTimeout(silent);
      stop();
    };
  }, [running, rot]);

  useEffect(() => {
    if (!calibrate) return;
    const t = setTimeout(() => setCalibrate(false), HINT_MS);
    return () => clearTimeout(t);
  }, [calibrate]);

  const mode = state.mode;
  const toggle = useCallback(() => {
    if (mode === "heading") {
      // Back to north up, the short way round.
      cancelAnimation(rot);
      rot.set(shortAngle(rot.get()));
      rot.set(reduce.current ? 0 : withTiming(0, { duration: SWING_MS, easing: Easing.inOut(Easing.cubic) }));
      setCalibrate(false);
    }
    dispatch({ t: "tap" });
  }, [mode, rot]);
  const twisted = useCallback(() => dispatch({ t: "twist" }), []);

  return { mode, available: state.available, toggle, twisted, calibrate };
}
