// The Collection: Relics and the Forge in one sheet, opened from one rail
// button (components/game/CollectionSheet.tsx). Every place that used to open
// the Relicdex or the Forge bag now opens the Collection on the right tab;
// this is where those openers are routed, so none of them dead-ends.
// Pure (tested in features/game/__tests__/collection.test.ts).

export type CollectionTab = "relics" | "forge";

/**
 * Who is opening it: the rail button; the old Relics openers (the coach's
 * Relics step, an unlock); the old Forge-bag openers (a claimed find's
 * "Open Collection", the More sheet's tile, a "forge" link).
 */
export type CollectionOpener = "rail" | "relics" | "coach-relics" | "forge" | "forge-claim" | "more-forge";

export type CollectionAccess = { relicsOn: boolean; forgeOn: boolean };

/** The tabs the sheet shows, Relics first. */
export function collectionTabs(a: CollectionAccess): CollectionTab[] {
  const tabs: CollectionTab[] = [];
  if (a.relicsOn) tabs.push("relics");
  if (a.forgeOn) tabs.push("forge");
  return tabs;
}

/** Whether the Collection has anything to open (the rail button shows only then). */
export function collectionOpen(a: CollectionAccess): boolean {
  return a.relicsOn || a.forgeOn;
}

/** The tab an opener lands on: its own when the player has it, else whichever the player has, else null (nothing to open). */
export function collectionTabFor(opener: CollectionOpener, a: CollectionAccess): CollectionTab | null {
  const wants: CollectionTab = opener === "forge" || opener === "forge-claim" || opener === "more-forge" ? "forge" : "relics";
  const tabs = collectionTabs(a);
  if (tabs.includes(wants)) return wants;
  return tabs[0] ?? null;
}

/** The rail button's count: everything held, Relics and Forge finds together. */
export function collectionCount(relicsOwned: number | null | undefined, forgeOwned: number | null | undefined): number {
  return Math.max(0, relicsOwned ?? 0) + Math.max(0, forgeOwned ?? 0);
}

/** What VoiceOver reads for the rail button. */
export function collectionLabel(relicsOwned: number, forgeOwned: number, a: CollectionAccess): string {
  const parts = ["Collection"];
  if (a.relicsOn && relicsOwned > 0) parts.push(`${relicsOwned} ${relicsOwned === 1 ? "Relic" : "Relics"}`);
  if (a.forgeOn && forgeOwned > 0) parts.push(`${forgeOwned} Forge ${forgeOwned === 1 ? "find" : "finds"}`);
  return parts.join(", ");
}
