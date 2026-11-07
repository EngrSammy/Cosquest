// Which calls are ringing on the phone's own call screen right now (by our
// call id), so the in-app ringing screen stays out of the way: one ring only.
import { useEffect, useState } from "react";

const ids = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function markNativeCall(callId: string) {
  if (!ids.has(callId)) {
    ids.add(callId);
    emit();
  }
}

export function clearNativeCall(callId: string) {
  if (ids.delete(callId)) emit();
}

export function useNativeCallIds() {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return ids;
}
