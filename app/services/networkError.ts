// What people see when the chat backend can't be reached at all.
//
// fetch() rejects with the platform's own words when there is no answer:
// "fetch failed: java.net.ConnectException: Failed to connect to
// localhost/127.0.0.1:4120", "java.io.IOException: unexpected end of stream",
// "Network request failed". Sign-in and other screens showed that text as is.
// apiRequest turns it into a plain sentence, and retries a GET once (a pooled
// connection the server already closed fails like this the first time).

export const OFFLINE_MESSAGE = "Can't reach CosQuest right now. Check your connection and try again.";

/** True for errors fetch() throws when no HTTP answer came back. */
export function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError") return false;
  return (
    error instanceof TypeError ||
    /fetch failed|network request failed|failed to connect|connectexception|unexpected end of stream|socket|timeout|unable to resolve host|ECONN|ENOTFOUND/i.test(
      error.message,
    )
  );
}

/** Only requests that change nothing are retried without asking. */
export function canRetrySilently(method: string): boolean {
  return method === "GET";
}

// No answer in time (audit B7). fetch() itself never gives up: on a dead
// connection, or while the free-tier chat API wakes up, a screen could spin
// for minutes. Every chat API call now stops after 15 s (uploads 60 s) and says
// the same plain sentence as no answer at all; apiRequest retries a GET once.
export const REQUEST_TIMEOUT_MS = 15_000;
export const UPLOAD_TIMEOUT_MS = 60_000;

/** Thrown when a request gets no full answer in time (isNetworkFailure: true). */
export class RequestTimeoutError extends Error {
  constructor(ms: number) {
    super(`Request timeout: no answer in ${ms} ms`);
    this.name = "RequestTimeoutError";
  }
}

type FetchLike = (url: string, init: RequestInit & { signal: AbortSignal }) => Promise<Response>;

/**
 * fetch, with the body read as JSON (null if it isn't), cut off after `ms`.
 * The clock covers the whole answer, the body included.
 */
export async function fetchJson(
  url: string,
  init: RequestInit,
  ms: number = REQUEST_TIMEOUT_MS,
  fetchFn: FetchLike = fetch as FetchLike,
): Promise<{ response: Response; data: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetchFn(url, { ...init, signal: controller.signal });
    const data = await response.json().catch((error: unknown) => {
      if (controller.signal.aborted) throw error;
      return null;
    });
    return { response, data };
  } catch (error) {
    if (controller.signal.aborted) throw new RequestTimeoutError(ms);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
