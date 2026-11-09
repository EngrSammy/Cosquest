// Relics: the faction weapons a player collects, powers up with shards and
// equips for a siege. The pure half of costquest-ios Features/RelicsFeature.swift
// (its wire shapes, RelicLook, RelicsModel): the screens are
// components/game/Relic*.tsx.
//
// The server decides every drop, level and shard (costquest-backend
// app/roam_relics.py). This reads GET v1/roam/relics, asks for an equip, a
// level or the starter, and shows a refusal in the server's own words.
// Pure: the client is passed in (tested in __tests__/relics.test.ts).
import { GameError, type GameClient } from "./client.ts";
import type { Faction, Relic, RoamExtra, RoamMe } from "./wire.ts";

// ---------- wire ----------

/** wire.ts's Relic, with the fields the server also sends (roam_relics.public). */
export type RelicFull = Relic & {
  level: number;
  shards: number;
  power_now: number;
  next_level_cost?: number | null;
  found_at?: string | null;
};

/** An entry in the whole catalogue: enough to draw a silhouette. */
export type RelicStub = { id: string; name: string; faction: string; rarity: string; kind?: string | null };

export type RelicsPayload = {
  owned: RelicFull[];
  equipped: string | null;
  catalogue_size: number;
  catalogue: RelicStub[];
};

const str = (v: unknown, fallback: string): string => (typeof v === "string" ? v : fallback);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const optStr = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** One relic, tolerant like Relic.init(from:): missing fields take iOS's defaults. Null without an id and a name. */
export function parseRelic(raw: unknown): RelicFull | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.name !== "string") return null;
  const power = num(r.power) ?? 10;
  const level = num(r.level) ?? 1;
  return {
    id: r.id,
    name: r.name,
    faction: str(r.faction, ""),
    rarity: str(r.rarity, "common"),
    kind: str(r.kind, "blade"),
    power,
    ability: str(r.ability, ""),
    lore: optStr(r.lore),
    ability_text: optStr(r.ability_text),
    faction_name: optStr(r.faction_name),
    level,
    shards: num(r.shards) ?? 0,
    power_now: num(r.power_now) ?? power,
    next_level_cost: num(r.next_level_cost),
    found_at: optStr(r.found_at),
  };
}

export function parseRelicsPayload(raw: unknown): RelicsPayload {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const owned = (Array.isArray(r.owned) ? r.owned : []).map(parseRelic).filter((x): x is RelicFull => x !== null);
  const catalogue = (Array.isArray(r.catalogue) ? r.catalogue : [])
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && typeof (s as { id?: unknown }).id === "string")
    .map((s) => ({
      id: s.id as string,
      name: str(s.name, s.id as string),
      faction: str(s.faction, ""),
      rarity: str(s.rarity, "common"),
      kind: optStr(s.kind),
    }));
  return {
    owned,
    equipped: optStr(r.equipped),
    catalogue_size: num(r.catalogue_size) ?? catalogue.length,
    catalogue,
  };
}

/** Equip, level and starter all answer with the relic, sometimes wrapped (RelicReply). */
export function relicFromReply(raw: unknown): RelicFull | null {
  if (raw && typeof raw === "object") {
    const w = raw as { relic?: unknown; equipped?: unknown };
    const inner = parseRelic(w.relic) ?? parseRelic(w.equipped);
    if (inner) return inner;
  }
  return parseRelic(raw);
}

// ---------- the server's routes ----------

export async function fetchRelics(client: GameClient): Promise<RelicsPayload> {
  const key = client.deviceKey();
  const raw = await client.retrying(() => client.request<unknown>("GET", "v1/roam/relics", { query: { device_key: key } }));
  return parseRelicsPayload(raw);
}

/** Put a relic in hand. 404 "You don't have that Relic." is the server's to say. */
export async function equipRelic(client: GameClient, relicId: string): Promise<RelicFull | null> {
  const raw = await client.request<unknown>("POST", "v1/roam/relics/equip", {
    body: { device_key: client.deviceKey(), relic_id: relicId },
    signed: true,
  });
  return relicFromReply(raw);
}

/** Spend shards on a level. Not retried: 409 "Needs 20 shards" is an answer. */
export async function levelRelic(client: GameClient, relicId: string): Promise<RelicFull | null> {
  const raw = await client.request<unknown>("POST", "v1/roam/relics/level", {
    body: { device_key: client.deviceKey(), relic_id: relicId },
    signed: true,
  });
  return relicFromReply(raw);
}

/** The first relic (a common of the player's faction). Idempotent on the server. */
export async function claimStarterRelic(client: GameClient): Promise<RelicFull | null> {
  const raw = await client.request<unknown>("POST", "v1/roam/relics/starter", {
    body: { device_key: client.deviceKey() },
    signed: true,
  });
  return relicFromReply(raw);
}

// ---------- look (RelicLook) ----------

export const RELIC_MAX_LEVEL = 10;
export const RARITY_ORDER = ["legendary", "epic", "rare", "common"];
/** RelicdexSheet.factions: the five houses, in iOS's order. */
export const RELIC_FACTIONS = ["anime", "marvel", "dc", "movies", "gaming"];
export const RELIC_KINDS = ["blade", "axe", "bow", "staff", "hammer", "gauntlet"] as const;

const capitalised = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** A faction's name from the server's config (store.factionName, but pure: pass the config in). */
export function factionLabel(factions: Faction[] | null | undefined, id: string): string {
  return factions?.find((f) => f.id === id)?.name ?? capitalised(id);
}

export function rarityName(r: string): string {
  return capitalised(r);
}

export function kindName(k: string): string {
  return capitalised(k);
}

export function abilityName(a: string): string {
  return capitalised(a);
}

/** The ability in a line, when the server did not send ability_text. */
export function abilityLine(a: string): string {
  switch (a) {
    case "cleave":
      return "+50% damage on a Flawless answer.";
    case "ward":
      return "Blocks the Guardian's first strike in every siege.";
    case "focus":
      return "+4 seconds on every question.";
    case "insight":
      return "Removes two wrong answers on the first question.";
    case "surge":
      return "Double damage from the third right answer in a row.";
    default:
      return "A power of its own.";
  }
}

/** Ionicons for the abilities (the SF Symbols on iOS). */
export function abilityIcon(a: string): "flash" | "shield" | "timer" | "eye" | "flame" | "sparkles" {
  switch (a) {
    case "cleave":
      return "flame";
    case "ward":
      return "shield";
    case "focus":
      return "timer";
    case "insight":
      return "eye";
    case "surge":
      return "flash";
    default:
      return "sparkles";
  }
}

export function levelNow(r: Pick<RelicFull, "level">): number {
  return r.level ?? 1;
}

export function powerNow(r: Pick<RelicFull, "power" | "power_now">): number {
  return Math.round(r.power_now ?? r.power);
}

/** Shards the next level costs: the server's number, else level × 10 as it computes it. */
export function levelCost(r: Pick<RelicFull, "level" | "next_level_cost">): number {
  return r.next_level_cost ?? levelNow(r) * 10;
}

export function isMaxed(r: Pick<RelicFull, "level">): boolean {
  return levelNow(r) >= RELIC_MAX_LEVEL;
}

/** Whether the Level up button is worth pressing. The server still decides. */
export function canLevel(r: Pick<RelicFull, "level" | "shards" | "next_level_cost">): boolean {
  return !isMaxed(r) && (r.shards ?? 0) >= levelCost(r);
}

export function rarityRank(r: string): number {
  const i = RARITY_ORDER.indexOf(r);
  return i < 0 ? 9 : i;
}

/** Rarest first, then by name (the Relicdex grid's order). */
export function byRarityThenName<T extends { rarity?: string | null; name: string }>(a: T, b: T): number {
  return rarityRank(a.rarity ?? "") - rarityRank(b.rarity ?? "") || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

/** The player's own faction first: its Relics drop twice as often. */
export function factionsInOrder(mine: string | null | undefined): string[] {
  return [...RELIC_FACTIONS].sort((a, b) => (a === mine ? 0 : 1) - (b === mine ? 0 : 1));
}

export function catalogueOf(p: RelicsPayload, faction: string): RelicStub[] {
  return p.catalogue.filter((s) => s.faction === faction).sort(byRarityThenName);
}

export function ownedRelic(p: RelicsPayload | null, id: string): RelicFull | null {
  return p?.owned.find((r) => r.id === id) ?? null;
}

export function equippedRelic(p: RelicsPayload | null): RelicFull | null {
  return p?.equipped ? ownedRelic(p, p.equipped) : null;
}

/** The equipped relic from the Relicdex, or from `me` before it has been fetched. */
export function equippedFor(p: RelicsPayload | null, me: RoamMe | null | undefined): RelicFull | null {
  return equippedRelic(p) ?? parseRelic(me?.features?.relics?.equipped ?? null);
}

export function totalShards(p: RelicsPayload): number {
  return p.owned.reduce((n, r) => n + (r.shards ?? 0), 0);
}

/** Where an unfound relic turns up (RelicDetail.hint). */
export function lockedHint(rarity: string | null | undefined): string {
  switch (rarity) {
    case "legendary":
      return "One in each faction. Legendary points drop Relics half the time, and a siege won at one can hold it.";
    case "epic":
      return "Epic points and won sieges are where these turn up.";
    default:
      return "Answer right at any Quest Point and a Relic may drop. Rarer points drop more often.";
  }
}

export type RelicDrop = { relic: RelicFull; isNew: boolean; shards: number };

/** A reward's relic extra ({"kind":"relic","relic":{...},"new":bool,"shards":n}), or null. */
export function relicDrop(extra: RoamExtra | null | undefined): RelicDrop | null {
  if (!extra || extra.kind !== "relic") return null;
  const relic = parseRelic(extra.relic);
  if (!relic) return null;
  return { relic, isNew: extra.new ?? true, shards: extra.shards ?? 0 };
}

export function hasRelicDrop(extras: RoamExtra[] | null | undefined): boolean {
  return (extras ?? []).some((x) => relicDrop(x) !== null);
}

// ---------- the one model (RelicsModel) ----------

export type RelicsState = {
  /** Whose relics these are (the player's key), so a sign-in never shows the last player's. */
  forKey: string | null;
  payload: RelicsPayload | null;
  loading: boolean;
  failed: boolean;
  /** An equip or level in flight. */
  busy: boolean;
  /** The server's refusal, in its own words ("Needs 12 shards"). */
  problem: string | null;
  /** Bumped on each level the server granted, to celebrate it. */
  levelled: { id: string; serial: number } | null;
};

const EMPTY: RelicsState = { forKey: null, payload: null, loading: false, failed: false, busy: false, problem: null, levelled: null };

function message(error: unknown): string {
  if (error instanceof GameError) return error.message;
  return "Can't reach CosQuest right now.";
}

/**
 * One relics model for the whole game: the rail badge, the Relicdex and the
 * drop card show the same equipped relic. Immutable snapshots, read through
 * useSyncExternalStore (relicsLive.ts).
 */
export function createRelicsStore(deps: { client: GameClient; me: () => RoamMe | null; playerKey: () => string | null }) {
  let state: RelicsState = EMPTY;
  let starterAsked = false;
  let serial = 0;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<RelicsState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };
  /** A different player since the last look: forget the last one's relics. */
  const sameKey = () => {
    const key = deps.playerKey();
    if (key !== state.forKey) {
      starterAsked = false;
      state = { ...EMPTY, forKey: key };
    }
    return key;
  };
  /** The server's answer to an equip or a level, shown before the refetch lands. */
  const fold = (relic: RelicFull | null, equipped: boolean) => {
    const p = state.payload;
    if (!relic || !p) return;
    const owned = p.owned.map((r) => (r.id === relic.id ? relic : r));
    set({ payload: { ...p, owned, equipped: equipped ? relic.id : p.equipped } });
  };
  let inflight: Promise<void> | null = null;
  let again = false;

  async function load(): Promise<void> {
    const key = sameKey();
    if (!key) return;
    set({ loading: true });
    do {
      again = false;
      try {
        const payload = await fetchRelics(deps.client);
        if (deps.playerKey() !== key) return;
        set({ payload, failed: false });
      } catch {
        if (deps.playerKey() !== key) return;
        set({ failed: true });
      }
    } while (again);
    set({ loading: false });
    // Everyone starts with one. The server grants it once; asking again is
    // harmless, and covers a player who onboarded before Relics.
    if (state.payload && state.payload.owned.length === 0 && deps.me()?.tutorial_done && !starterAsked) {
      starterAsked = true;
      try {
        await claimStarterRelic(deps.client);
        if (deps.playerKey() !== key) return;
        const payload = await fetchRelics(deps.client);
        if (deps.playerKey() === key) set({ payload, failed: false });
      } catch {
        starterAsked = false;
      }
    }
  }

  const store = {
    get: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },

    /**
     * Fetch the Relicdex. A call while one is in flight is not dropped: the
     * fetch runs once more after it, so an equip never shows the hand from
     * before it.
     */
    refresh(): Promise<void> {
      if (inflight) {
        again = true;
        return inflight;
      }
      inflight = load().finally(() => {
        inflight = null;
      });
      return inflight;
    },

    async equip(relicId: string): Promise<boolean> {
      if (state.busy) return false;
      set({ busy: true, problem: null });
      try {
        const relic = await equipRelic(deps.client, relicId);
        fold(relic, true);
        await store.refresh();
        return true;
      } catch (error) {
        set({ problem: message(error) });
        return false;
      } finally {
        set({ busy: false });
      }
    },

    /** The levelled relic, or null with the server's reason in `problem`. */
    async levelUp(relicId: string): Promise<RelicFull | null> {
      if (state.busy) return null;
      set({ busy: true, problem: null });
      try {
        const relic = await levelRelic(deps.client, relicId);
        fold(relic, false);
        set({ levelled: { id: relicId, serial: ++serial } });
        await store.refresh();
        return relic ?? ownedRelic(state.payload, relicId);
      } catch (error) {
        set({ problem: message(error) });
        return null;
      } finally {
        set({ busy: false });
      }
    },

    /** Call when the player may have changed (sign-in, sign-out). */
    syncPlayer() {
      const before = state;
      sameKey();
      if (state !== before) listeners.forEach((l) => l());
    },

    clearProblem() {
      if (state.problem) set({ problem: null });
    },

    /** A drop arrived with an answer: fetch, so the Relicdex and badge have it. */
    noteDrop() {
      void store.refresh();
    },
  };
  return store;
}

export type RelicsStore = ReturnType<typeof createRelicsStore>;
