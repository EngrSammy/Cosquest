// Performance markers for the polish measurements (docs/polish/BASELINE.md).
// Only in test builds made with EXPO_PUBLIC_PERF_MARKS=1; everywhere else every
// function here returns at once. The lines go to logcat (tag ReactNativeJS)
// with the phone's clock, and e2e/perf/ reads them:
//   [perf] mark <name> <epoch ms>        a moment (e.g. the first usable screen)
//   [perf] span <name> <ms>              perfStart(name) .. perfEnd(name)
//   [perf] renders {"Bubble":120,...}    render counts so far, every 2 s if changed
//   [perf] js <frames> <long> <worst>    JS frames in the last 2 s, how many took
//                                        over 50 ms, the worst one (ms)
const ON = process.env.EXPO_PUBLIC_PERF_MARKS === "1";

const once = new Set<string>();
const started = new Map<string, number>();
const renders: Record<string, number> = {};
let rendersDirty = false;

/** A moment, logged once per name for the life of the app. */
export function perfMarkOnce(name: string) {
  if (!ON || once.has(name)) return;
  once.add(name);
  console.log(`[perf] mark ${name} ${Date.now()}`);
}

export function perfStart(name: string) {
  if (!ON) return;
  started.set(name, Date.now());
}

export function perfEnd(name: string) {
  if (!ON) return;
  const at = started.get(name);
  if (at === undefined) return;
  started.delete(name);
  console.log(`[perf] span ${name} ${Date.now() - at}`);
}

/** Counts the renders of the calling component (a hook, so it runs on every render). */
export function useRenderCount(name: string) {
  "use no memo";
  if (!ON) return;
  renders[name] = (renders[name] ?? 0) + 1;
  rendersDirty = true;
}

if (ON) {
  setInterval(() => {
    if (!rendersDirty) return;
    rendersDirty = false;
    console.log(`[perf] renders ${JSON.stringify(renders)}`);
  }, 2000);

  // The JS thread's frame rate: one requestAnimationFrame per frame it manages.
  let last = 0;
  let frames = 0;
  let long = 0;
  let worst = 0;
  const tick = (now: number) => {
    if (last) {
      const dt = now - last;
      frames += 1;
      if (dt > 50) long += 1;
      if (dt > worst) worst = dt;
    }
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setInterval(() => {
    console.log(`[perf] js ${frames} ${long} ${Math.round(worst)}`);
    frames = 0;
    long = 0;
    worst = 0;
  }, 2000);
}
