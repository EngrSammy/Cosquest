import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * The same function on every render that always calls the latest `fn`. For
 * handlers passed to memoised list rows (chat bubbles): a new closure each
 * render would re-render every row (audit B3). Call it from events only, not
 * during render.
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const latest = useRef(fn);
  useLayoutEffect(() => {
    latest.current = fn;
  });
  return useCallback((...args: A) => latest.current(...args), []);
}
