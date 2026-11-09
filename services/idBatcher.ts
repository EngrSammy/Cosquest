// Many socket events, few requests (audit B5). A busy group sends a
// chat:preview for every message; each one used to fetch that conversation
// again. The ids are collected for a short while and flushed once, each id
// once. Pure (timers injected) so it is unit tested.

export type IdBatcher = { add: (id: string) => void; flushNow: () => void; cancel: () => void };

type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (handle: unknown) => void };

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Collect ids; `flush` gets the unique ids `waitMs` after the first one came
 * in (not after the last, so a steady stream still refreshes every `waitMs`).
 */
export function createIdBatcher(waitMs: number, flush: (ids: string[]) => void, timers: Timers = realTimers): IdBatcher {
  let pending = new Set<string>();
  let handle: unknown = null;
  const flushNow = () => {
    if (handle !== null) timers.clear(handle);
    handle = null;
    if (pending.size === 0) return;
    const ids = [...pending];
    pending = new Set();
    flush(ids);
  };
  return {
    add(id) {
      if (!id) return;
      pending.add(id);
      if (handle === null) handle = timers.set(flushNow, waitMs);
    },
    flushNow,
    cancel() {
      if (handle !== null) timers.clear(handle);
      handle = null;
      pending = new Set();
    },
  };
}

/** A chat:preview that already carries the chat's summary (the backend change in docs/polish/BACKEND-PORT.md). */
export function previewSummary(payload: unknown): Record<string, unknown> | null {
  const chat = (payload as { chat?: unknown } | null)?.chat;
  return chat && typeof chat === "object" && ("id" in chat || "_id" in chat) ? (chat as Record<string, unknown>) : null;
}
