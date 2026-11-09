// What the chat server can do (task 059). Newer servers answer
// GET /api/meta/capabilities; the current test server does not, and then
// the features it lacks stay hidden (account deletion, reports, block by id).
// Blocking by username works on every server, so Block always shows.
import { useEffect, useState } from "react";

import { apiRequest } from "./api";

export type Capabilities = {
  deleteAccount: boolean;
  reports: boolean;
  reportReasons: string[];
  blockAnywhere: boolean;
  pushTokens: boolean;
  gameEvents: boolean;
  gameResults: boolean;
  /** Known from the server (false: an older server, everything new hidden). */
  known: boolean;
};

const NONE: Capabilities = {
  deleteAccount: false,
  reports: false,
  reportReasons: [],
  blockAnywhere: false,
  pushTokens: true,
  gameEvents: false,
  gameResults: false,
  known: false,
};

let cached: Capabilities | null = null;
let inflight: Promise<Capabilities> | null = null;
const listeners = new Set<(c: Capabilities) => void>();

export function parseCapabilities(body: any): Capabilities {
  const c = body?.capabilities;
  if (!c || typeof c !== "object") return NONE;
  return {
    deleteAccount: c.deleteAccount === true,
    reports: c.reports === true,
    reportReasons: Array.isArray(c.reportReasons) ? c.reportReasons.filter((r: unknown) => typeof r === "string") : [],
    blockAnywhere: c.blockAnywhere === true,
    pushTokens: c.pushTokens !== false,
    gameEvents: c.gameEvents === true,
    gameResults: c.gameResults === true,
    known: true,
  };
}

export async function loadCapabilities(force = false): Promise<Capabilities> {
  if (cached && !force) return cached;
  if (inflight) return inflight;
  inflight = apiRequest<any>("/api/meta/capabilities")
    .then(parseCapabilities)
    .catch((error) => {
      // 404: an older server. Anything else (offline): ask again next time.
      if ((error as any)?.status === 404) return NONE;
      throw error;
    })
    .then((c) => {
      cached = c;
      listeners.forEach((l) => l(c));
      return c;
    })
    .catch(() => NONE)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useCapabilities(): Capabilities {
  const [caps, setCaps] = useState<Capabilities>(cached ?? NONE);
  useEffect(() => {
    listeners.add(setCaps);
    void loadCapabilities().then(setCaps);
    return () => {
      listeners.delete(setCaps);
    };
  }, []);
  return caps;
}
