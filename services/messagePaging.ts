// Message history, a page at a time (audit B4). The chat screen loads the
// newest page and asks for older ones as you scroll up.
//
// Two backends answer this:
//  - today's (MCJ-events/COSQUEST): GET .../messages?page=&limit= (offset
//    pages, newest first); it ignores `before`.
//  - with the cursor change (docs/polish/BACKEND-PORT.md): `before=<message
//    id>` returns the page just older than that message, and `page` is ignored.
// Each request sends both, so either backend gives the right page. Overlaps
// (new messages shift offset pages) are dropped by id.

export const MESSAGE_PAGE_SIZE = 50;

export type MessagePaging = { page: number; hasMore: boolean; loading: boolean };

export const FIRST_PAGE: MessagePaging = { page: 1, hasMore: true, loading: false };

/** The query for the page older than what is loaded. */
export function olderPageQuery(oldestId: string | undefined, paging: MessagePaging = FIRST_PAGE, limit = MESSAGE_PAGE_SIZE) {
  return { before: oldestId, page: paging.page + 1, limit };
}

/** Whether there is more history: the server's word if it gives one, else a full page means maybe. */
export function pageHasMore(response: unknown, received: number, limit: number): boolean {
  const r = response as { pagination?: { hasMore?: unknown }; hasMore?: unknown } | null;
  if (typeof r?.pagination?.hasMore === "boolean") return r.pagination.hasMore;
  if (typeof r?.hasMore === "boolean") return r.hasMore;
  return received >= limit;
}

/**
 * Older messages added after what is loaded (both newest first), without
 * duplicates. `added` 0 means the server sent nothing new (a backend that
 * ignores paging and sends the same page again): stop asking.
 */
export function mergeOlder<T extends { id: string }>(loaded: readonly T[], older: readonly T[]): { merged: T[]; added: number } {
  const have = new Set(loaded.map((m) => m.id));
  const fresh = older.filter((m) => !have.has(m.id));
  return { merged: fresh.length ? [...loaded, ...fresh] : (loaded as T[]), added: fresh.length };
}
