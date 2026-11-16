// A horizontal row that slides by itself, one card every few seconds (the
// home page's Ongoing row). It pauses for a while when the person touches
// it, loops back to the start, and stays still with Reduce Motion on.
import { useCallback, useEffect, useRef } from "react";
import { AccessibilityInfo, type FlatList } from "react-native";

export function useAutoScroll(count: number, step: number, everyMs = 4000) {
  const ref = useRef<FlatList<any>>(null);
  const index = useRef(0);
  const pausedUntil = useRef(0);
  const still = useRef(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        if (alive) still.current = on;
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (on) => {
      still.current = on;
    });
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  useEffect(() => {
    index.current = 0;
    if (count < 2) return;
    const timer = setInterval(() => {
      if (still.current || Date.now() < pausedUntil.current) return;
      index.current = (index.current + 1) % count;
      ref.current?.scrollToOffset({ offset: index.current * step, animated: true });
    }, everyMs);
    return () => clearInterval(timer);
  }, [count, step, everyMs]);

  /** The person touched the row: wait before sliding again, from where they are. */
  const pause = useCallback(() => {
    pausedUntil.current = Date.now() + 8000;
  }, []);
  const settle = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      index.current = Math.max(0, Math.round(event.nativeEvent.contentOffset.x / step));
    },
    [step],
  );

  return { ref, pause, settle };
}
