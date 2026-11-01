// "Bigtooth Joined · Wagm Joined" under the big pin: the latest joiners,
// checked every 20 seconds while the home page is open.
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { useAppSelector } from "@/store/hooks";

import { apiRequest } from "./api";

export type RecentJoin = { username: string | null; name: string; faction: string | null; you: boolean; at: string };

export function useRecentJoins(questId: string | null) {
  const token = useAppSelector((state) => state.auth.token);
  const [joins, setJoins] = useState<RecentJoin[]>([]);

  useFocusEffect(
    useCallback(() => {
      setJoins([]);
      if (!questId || !token) return;
      let alive = true;
      const load = () =>
        apiRequest<{ joins: RecentJoin[] }>(`/api/quests/${questId}/joins`, { token })
          .then((data: any) => alive && setJoins(Array.isArray(data?.joins) ? data.joins : []))
          .catch(() => {});
      load();
      const timer = setInterval(load, 20000);
      return () => {
        alive = false;
        clearInterval(timer);
      };
    }, [questId, token]),
  );

  return joins;
}
