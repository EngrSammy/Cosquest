// Opens the Report sheet from anywhere (a post's ⋯ menu, a chat message's
// menu, a profile's menu). The sheet itself is mounted once in app/_layout.tsx.
import { useSyncExternalStore } from "react";

import type { ReportTarget } from "@/services/reports";

export type ReportRequest = { targetType: ReportTarget; targetId: string; what: string };

let current: ReportRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function openReport(request: ReportRequest) {
  current = request;
  emit();
}

export function closeReport() {
  current = null;
  emit();
}

export function useReportRequest() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => current,
  );
}
