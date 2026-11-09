import { useEffect, useState } from "react";

import { apiRequest } from "./api";

// ==========================================
// FACTION RANKS
// ==========================================
// The list comes from the backend (GET /api/ranks), so the team can rename
// ranks or change point levels without an app update. Rank is visual only.

export type Rank = {
  key: string;
  name: string;
  short: string;
  // 1 = lowest
  level: number;
  // Insignia, so the badge is recognizable without reading it.
  chevrons: number;
  bars: number;
  star: boolean;
  // Set by hand (an orchestrator), not from points.
  overridden?: boolean;
  // Only in the full list.
  minPoints?: number;
};

let cache: Rank[] | null = null;
let loading: Promise<Rank[]> | null = null;

export async function getRanks(): Promise<Rank[]> {
  if (cache) return cache;
  if (!loading) {
    loading = apiRequest<any>("/api/ranks")
      .then((response) => {
        cache = Array.isArray(response?.ranks) ? response.ranks : [];
        return cache!;
      })
      .catch(() => {
        loading = null;
        return [];
      });
  }
  return loading;
}

// The rank list (empty until it has loaded once).
export function useRanks() {
  const [ranks, setRanks] = useState<Rank[]>(cache || []);

  useEffect(() => {
    let cancelled = false;
    getRanks().then((list) => {
      if (!cancelled) setRanks(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return ranks;
}

// The next rank up from this one (null at the top, or for a hand-set rank).
export function nextRankFor(rank: Rank | null | undefined, ranks: Rank[]) {
  if (!rank || rank.overridden) return null;
  return ranks.find((item) => item.level === rank.level + 1) || null;
}
