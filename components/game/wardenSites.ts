// Game Warden site facts, fetched once per site version and kept for the session
// (the server answers with an ETag and a 60 s cache; a site's facts change only
// when the Warden rebuilds it, which bumps warden.facts_v on the point).
import { gameStore } from "@/features/game/runtime";
import { siteIdOf, type WardenFacts } from "@/features/game/wardenSite";
import type { QuestPoint } from "@/features/game/wire";

const cache = new Map<string, Promise<WardenFacts | null>>();

/** The site's facts, or null for a point that is not a Warden site (or when the server cannot say). */
export function siteFacts(p: QuestPoint | null | undefined): Promise<WardenFacts | null> {
  const id = siteIdOf(p);
  if (!id || !p) return Promise.resolve(null);
  const key = `${id}#${p.extra?.["warden.facts_v"] ?? ""}`;
  let got = cache.get(key);
  if (!got) {
    got = gameStore.client.wardenFacts(id).catch(() => {
      cache.delete(key);
      return null;
    });
    cache.set(key, got);
  }
  return got;
}
