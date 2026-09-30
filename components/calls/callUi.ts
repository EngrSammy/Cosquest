// Is the ongoing call minimized (small green bar) or full screen?
// A tiny shared value, so the call overlay and the green bar agree.
import { useSyncExternalStore } from "react";

let minimized = false;
const listeners = new Set<() => void>();

export function setCallMinimized(value: boolean) {
  if (minimized === value) {
    return;
  }

  minimized = value;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function useCallMinimized() {
  return useSyncExternalStore(
    subscribe,
    () => minimized,
    () => minimized,
  );
}
