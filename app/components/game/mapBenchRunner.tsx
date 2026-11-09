// Runs the world map's scripted smoothness bench (features/game/mapBench.ts)
// and its frame probe: UI thread frame times from a Reanimated frame
// callback, JS thread frame times from requestAnimationFrame, per phase.
// Dev and test builds only; costs nothing until cosquest://mapbench.
import { File, Paths } from "expo-file-system";
import { useEffect, useRef } from "react";
import { runOnJS, useFrameCallback, useSharedValue } from "react-native-reanimated";

import {
  addFrame,
  benchCounters,
  benchInput,
  type BenchInput,
  emptyStats,
  type FrameStats,
  MAP_BENCH_ON,
  onMapBench,
  PHASES,
  statsLine,
  takeMapBench,
  totalStats,
} from "@/features/game/mapBench";

/** What the bench drives: the same functions the map's gestures call (all worklets). */
export type BenchOps = {
  touchDown: () => void;
  panBy: (dx: number, dy: number) => void;
  fling: (vx: number, vy: number) => void;
  pinchBy: (fx: number, fy: number, scaleChange: number) => void;
  twistBy: (ax: number, ay: number, rotChange: number) => void;
  doubleTap: (x: number, y: number) => void;
};

const log = (line: string) => {
  // console.error: the only level a Release build sends to the device log.
  console.error(`[mapbench] ${line}`);
};

export function useMapBench(ops: BenchOps, width: number, height: number, ready: boolean, recentre: () => void, extra: () => Record<string, number>) {
  const running = useSharedValue(false);
  const t0 = useSharedValue(-1);
  const prev = useSharedValue(0);
  const phase = useSharedValue(0);
  const ui = useSharedValue<FrameStats[]>(emptyStats());
  const js = useRef<FrameStats[]>(emptyStats());
  const touching = useSharedValue(false);

  const jsRunning = useRef(false);
  const finish = (uiStats: FrameStats[]) => {
    jsRunning.current = false;
    running.set(false);
    frame.setActive(false);
    const jsStats = js.current;
    const lines: string[] = [];
    PHASES.forEach((name, i) => {
      lines.push(`UI ${statsLine(name, uiStats[i])}`);
      lines.push(`JS ${statsLine(name, jsStats[i])}`);
    });
    lines.push(`UI ${statsLine("ALL", totalStats(uiStats))}`);
    lines.push(`JS ${statsLine("ALL", totalStats(jsStats))}`);
    const counters = { ...benchCounters, ...extra() };
    lines.push(`counters ${JSON.stringify(counters)}`);
    lines.forEach(log);
    try {
      const f = new File(Paths.document, "mapbench.json");
      f.write(JSON.stringify({ at: new Date().toISOString(), ui: uiStats, js: jsStats, counters, lines }, null, 1));
    } catch (e) {
      log(`could not write the file: ${String(e)}`);
    }
    recentre();
  };

  const frame = useFrameCallback((info) => {
    "worklet";
    if (!running.get()) return;
    const now = info.timestamp;
    if (t0.get() < 0) {
      t0.set(now);
      prev.set(0);
      return;
    }
    const at = now - t0.get();
    const inp: BenchInput = benchInput(prev.get(), at, width, height);
    prev.set(at);
    if (info.timeSincePreviousFrame !== null && at > 50) {
      const dt = info.timeSincePreviousFrame;
      const p = phase.get();
      ui.modify((s) => {
        "worklet";
        addFrame(s, p, dt);
        return s;
      });
    }
    phase.set(inp.phase);
    if (inp.done) {
      running.set(false);
      runOnJS(finish)(ui.get());
      return;
    }
    // A finger is down while the script pans, pinches or twists; it lifts on a fling.
    const moving = inp.pan !== null || inp.pinch !== null || inp.twist !== null;
    if (moving && !touching.get()) {
      touching.set(true);
      ops.touchDown();
    }
    if (inp.pan) ops.panBy(inp.pan.dx, inp.pan.dy);
    if (inp.pinch) ops.pinchBy(inp.pinch.fx, inp.pinch.fy, inp.pinch.scaleChange);
    if (inp.twist) ops.twistBy(inp.twist.ax, inp.twist.ay, inp.twist.rotChange);
    if (inp.fling) {
      ops.fling(inp.fling.vx, inp.fling.vy);
      touching.set(false);
    } else if (!moving) touching.set(false);
    if (inp.doubleTap) ops.doubleTap(inp.doubleTap.x, inp.doubleTap.y);
  }, false);

  const start = () => {
    js.current = emptyStats();
    for (const k of Object.keys(benchCounters)) delete benchCounters[k];
    ui.set(emptyStats());
    t0.set(-1);
    prev.set(0);
    phase.set(0);
    touching.set(false);
    log(`start ${width}x${height}`);
    running.set(true);
    jsRunning.current = true;
    frame.setActive(true);
    // The JS thread's frames, by the phase the UI thread is in.
    let last = 0;
    const tick = (now: number) => {
      if (!jsRunning.current) return;
      if (last) addFrame(js.current, phase.get(), now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const readyRef = useRef(ready);
  readyRef.current = ready;
  useEffect(() => {
    if (!MAP_BENCH_ON) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      if (!readyRef.current || running.get() || timer) return;
      if (!takeMapBench()) return;
      // Let the map settle (first tiles, the camera on the player) first.
      timer = setTimeout(() => {
        timer = null;
        start();
      }, 4000);
    };
    check();
    const off = onMapBench(check);
    const poll = setInterval(check, 1000);
    return () => {
      off();
      clearInterval(poll);
      if (timer) clearTimeout(timer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

