// Forge in the world (cq 056): everything published in the Forge (weapons,
// characters, environments, stations) used by the game with no app change.
// The contract is costquest-backend docs/forge/CONTRACT.md (contract 2): each
// catalogue entry says what it is (type, role), which files to fetch per LOD,
// how big it is and where its pivot sits, which animation clips it has and
// what it does in play (`gameplay`). The app only ever reads that, so a new
// element published tomorrow is picked up by the same code.
//
// Pure: no React, no files, no network (the client is passed in). The device
// half (download, cache, the 3D view) is forgeWorldDevice.ts and
// components/game/ForgeModel.tsx. Tested in __tests__/forgeWorld.test.ts.
import { GameError, type GameClient } from "./client.ts";
import { type ForgeElement, type ForgeFile, forgeKind, parseForgeElement } from "./forge.ts";

export type ForgeType = "weapon" | "character" | "environment" | "station";
export const FORGE_TYPES: readonly ForgeType[] = ["weapon", "character", "environment", "station"];

export type ForgeFileRef = { file: string; url: string; bytes?: number | null; sha256?: string | null };
export type ForgeLod = { lod: number; glb: ForgeFileRef | null; usdz: ForgeFileRef | null };
export type ForgeClip = { name: string; duration_s: number | null; loop: boolean };

export type ForgeGameplay = {
  /** weapon */
  class?: string | null;
  kind?: string | null;
  damage?: number | null;
  range_m?: number | null;
  cooldown_s?: number | null;
  /** character: hero | npc | guardian | boss */
  role?: string | null;
  avatar?: boolean | null;
  /** environment: ground | backdrop | prop */
  placement?: string | null;
  radius_m?: number | null;
  /** station */
  site_id?: string | null;
};

/** One catalogue entry as the game uses it: the old element plus contract 2's keys. */
export type ForgeEntry = ForgeElement & {
  contract: number;
  lods: ForgeLod[];
  bounds_m: [number, number, number] | null;
  height_m: number | null;
  /** base-centre (characters, environments, stations) or grip (weapons) */
  pivot: string;
  animations: ForgeClip[];
  skeleton: string | null;
  gameplay: ForgeGameplay;
  updated_at: string | null;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function fileRef(v: unknown): ForgeFileRef | null {
  const o = obj(v);
  if (!o || typeof o.url !== "string") return null;
  const file = str(o.file) ?? o.url.split("/").pop() ?? "";
  return { file, url: o.url, bytes: num(o.bytes), sha256: str(o.sha256) };
}

/** LODs from `lods` (contract 2), else rebuilt from the old `files` list, so an old server still works. */
export function lodsOf(raw: Record<string, unknown>, files: ForgeFile[]): ForgeLod[] {
  if (Array.isArray(raw.lods)) {
    const out = raw.lods.flatMap((l): ForgeLod[] => {
      const o = obj(l);
      const lod = o ? num(o.lod) : null;
      if (!o || lod === null) return [];
      return [{ lod, glb: fileRef(o.glb), usdz: fileRef(o.usdz) }];
    });
    if (out.length) return out.sort((a, b) => a.lod - b.lod);
  }
  const by = new Map<number, ForgeLod>();
  for (const f of files) {
    const lod = f.lod ?? 0;
    const cur = by.get(lod) ?? { lod, glb: null, usdz: null };
    const ref = { file: f.file, url: f.url, bytes: f.bytes ?? null, sha256: f.sha256 ?? null };
    if (f.file.endsWith(".glb")) cur.glb = ref;
    else if (f.file.endsWith(".usdz")) cur.usdz = ref;
    by.set(lod, cur);
  }
  return [...by.values()].sort((a, b) => a.lod - b.lod);
}

const isVec3 = (v: unknown): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number" && Number.isFinite(x));

/**
 * The model's size in metres. `scale.bounds_m` (contract 2) is a size; the
 * renderer's own `bounds_m` is a [[min], [max]] box (what staging serves), so
 * a size is taken from it when that is all there is.
 */
export function boundsOf(raw: Record<string, unknown>): [number, number, number] | null {
  const scale = obj(raw.scale);
  for (const b of [scale?.bounds_m, raw.bounds_m]) {
    if (isVec3(b) && b.every((x) => x > 0)) return [b[0], b[1], b[2]];
    if (Array.isArray(b) && b.length === 2 && isVec3(b[0]) && isVec3(b[1])) {
      const size = [0, 1, 2].map((i) => (b[1] as number[])[i] - (b[0] as number[])[i]);
      if (size.every((x) => x > 0)) return [size[0], size[1], size[2]];
    }
  }
  return null;
}

function clipsOf(v: unknown): ForgeClip[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((c): ForgeClip[] => {
    const o = obj(c);
    const name = o ? str(o.name) : typeof c === "string" ? c : null;
    if (!name) return [];
    return [{ name, duration_s: o ? num(o.duration_s) : null, loop: o ? o.loop !== false : true }];
  });
}

/**
 * One entry, or null when it lacks what the game can't do without (id, type,
 * name, version). Everything else is tolerant: an odd field in a newer server
 * must not drop the element, and an older server (no contract 2 keys) gets
 * every value derived from what it does send.
 */
export function parseForgeEntry(raw: unknown): ForgeEntry | null {
  const base = parseForgeElement(raw);
  if (!base) return null;
  const r = raw as Record<string, unknown>;
  const g = obj(r.gameplay) ?? {};
  const stats = obj(r.stats) ?? {};
  const bounds = boundsOf(r);
  const scale = obj(r.scale);
  const animations = clipsOf(r.animations);
  const type = base.type;
  const kind = str(g.kind) ?? str(stats.kind) ?? (type === "weapon" ? forgeKind(base.name) : null);
  const role = str(g.role) ?? base.role ?? null;
  const gameplay: ForgeGameplay = {
    class: str(g.class),
    kind,
    damage: num(g.damage) ?? base.stats?.damage ?? null,
    range_m: num(g.range_m) ?? base.stats?.range_m ?? null,
    cooldown_s: num(g.cooldown_s) ?? base.stats?.cooldown_s ?? null,
    role,
    avatar: typeof g.avatar === "boolean" ? g.avatar : type === "character" ? role === "hero" : null,
    placement: str(g.placement) ?? str(stats.placement) ?? (type === "environment" ? "ground" : null),
    radius_m: num(g.radius_m) ?? num(stats.radius_m),
    site_id: str(g.site_id) ?? str(stats.site_id),
  };
  return {
    ...base,
    contract: num(r.contract) ?? 1,
    lods: lodsOf(r, base.files),
    bounds_m: bounds,
    height_m: num(scale?.height_m) ?? (bounds ? bounds[1] : null),
    pivot: str(r.pivot) ?? (type === "weapon" ? "grip" : "base-centre"),
    animations,
    skeleton: str(r.skeleton),
    // Rigged means a skeleton the game can play idle on; a claim without clips is not believed.
    rigged: base.rigged === true && (animations.length === 0 || animations.some((a) => a.name === "idle")),
    gameplay,
    updated_at: str(r.updated_at) ?? base.published_at ?? null,
  };
}

export type CatalogueUpdate = { elements: ForgeEntry[]; removed: string[]; cursor: string | null; contract: number };

/** GET v1/catalogue?types=...&since=... (or an old server's whole list). */
export function parseCatalogueUpdate(raw: unknown): CatalogueUpdate {
  const o = obj(raw);
  if (!o || !Array.isArray(o.elements)) throw new GameError("decoding", "The server sent something unexpected.");
  return {
    elements: o.elements.map(parseForgeEntry).filter((e): e is ForgeEntry => e !== null),
    removed: Array.isArray(o.removed) ? o.removed.filter((x): x is string => typeof x === "string") : [],
    cursor: str(o.cursor),
    contract: num(o.contract) ?? 1,
  };
}

/**
 * The catalogue after an update: removed ids gone, new or newer versions in.
 * A full answer (no `since`) replaces everything; a delta only touches what it names.
 */
export function mergeCatalogue(prev: readonly ForgeEntry[], update: CatalogueUpdate, full: boolean): ForgeEntry[] {
  if (full) return [...update.elements];
  const gone = new Set(update.removed);
  const by = new Map(prev.filter((e) => !gone.has(e.id)).map((e) => [e.id, e]));
  for (const e of update.elements) {
    const cur = by.get(e.id);
    if (!cur || cur.version !== e.version || (e.updated_at ?? "") >= (cur.updated_at ?? "")) by.set(e.id, e);
  }
  return [...by.values()].sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

// ---------- LOD by device class ----------

export type DeviceClass = "low" | "mid" | "high";
/** What the model is shown as: a small thing in a list, a scene, or one model filling the screen. */
export type ForgePurpose = "thumb" | "scene" | "closeup";

/**
 * A device class from what every phone can say about itself. Under 2x
 * density or a small screen is "low" (older Androids), 3x and a big screen
 * "high", else "mid". `override` (EXPO_PUBLIC_FORGE_LOD=low|mid|high) wins.
 */
export function deviceClassOf(d: { pixelRatio: number; width: number; height: number; override?: string | null }): DeviceClass {
  if (d.override === "low" || d.override === "mid" || d.override === "high") return d.override;
  const short = Math.min(d.width, d.height);
  if (d.pixelRatio < 2 || short < 340) return "low";
  if (d.pixelRatio >= 3 && short >= 390) return "high";
  return "mid";
}

/** The level of detail wanted: 0 is the full mesh, 2 the lightest. */
export function wantedLod(cls: DeviceClass, purpose: ForgePurpose): number {
  if (purpose === "thumb") return 2;
  if (purpose === "closeup") return cls === "low" ? 1 : 0;
  return cls === "high" ? 1 : cls === "mid" ? 1 : 2;
}

/**
 * The GLB to load: the wanted LOD, else the nearest lighter one, else the
 * nearest heavier one. Null when the entry has no GLB at all.
 */
export function pickGlb(entry: Pick<ForgeEntry, "lods">, lod: number): (ForgeFileRef & { lod: number }) | null {
  const withGlb = entry.lods.filter((l) => l.glb);
  if (!withGlb.length) return null;
  const lighter = withGlb.filter((l) => l.lod >= lod).sort((a, b) => a.lod - b.lod)[0];
  const pick = lighter ?? withGlb.sort((a, b) => b.lod - a.lod)[0];
  return { ...(pick.glb as ForgeFileRef), lod: pick.lod };
}

// ---------- animation ----------

/**
 * The index of a clip among the clips the model itself reports (names come
 * from the GLB), with the contract's fallbacks: walk -> idle, celebrate ->
 * idle, anything -> the first clip. -1 for a model with no clips.
 */
export function clipIndex(names: readonly string[], wanted: string | null | undefined): number {
  if (!names.length) return -1;
  const lower = names.map((n) => n.toLowerCase());
  const find = (n: string) => lower.findIndex((x) => x === n || x.endsWith(`|${n}`) || x.startsWith(`${n}`));
  for (const n of [wanted ?? "idle", "idle"]) {
    const i = find(n.toLowerCase());
    if (i >= 0) return i;
  }
  return 0;
}

// ---------- the world: is it on, what is near, what is mine ----------

export type ForgeWorldMe = { on: boolean; equipped: { weapon: string | null; avatar: string | null }; owned_count: number };

/** The forge_world block of /me (features.forge_world), or off. The server's flag is the only switch. */
export function forgeWorldOf(me: { features?: Record<string, unknown> | null } | null | undefined): ForgeWorldMe {
  const b = obj(me?.features?.forge_world);
  const eq = obj(b?.equipped);
  return {
    on: !!b && b.on !== false,
    equipped: { weapon: str(eq?.weapon), avatar: str(eq?.avatar) },
    owned_count: num(b?.owned_count) ?? 0,
  };
}

export type ForgeDrop = {
  id: string;
  element_id: string;
  version: number | null;
  name: string;
  rarity: string | null;
  type: string;
  kind: string | null;
  thumbnail_url: string | null;
  lat: number;
  lng: number;
  expires_at: string | null;
  claimed: boolean;
};

export function parseDrops(raw: unknown): ForgeDrop[] {
  const list = obj(raw)?.drops;
  if (!Array.isArray(list)) return [];
  return list.flatMap((d): ForgeDrop[] => {
    const o = obj(d);
    if (!o) return [];
    const id = str(o.id);
    const el = str(o.element_id);
    const lat = num(o.lat);
    const lng = num(o.lng);
    if (!id || !el || lat === null || lng === null) return [];
    return [
      {
        id,
        element_id: el,
        version: num(o.version),
        name: str(o.name) ?? "Forge find",
        rarity: str(o.rarity),
        type: str(o.type) ?? "weapon",
        kind: str(o.kind),
        thumbnail_url: str(o.thumbnail_url),
        lat,
        lng,
        expires_at: str(o.expires_at),
        claimed: o.claimed === true,
      },
    ];
  });
}

/** Drops still worth drawing: not claimed by me, not expired. */
export function liveDrops(drops: readonly ForgeDrop[], nowMs: number): ForgeDrop[] {
  return drops.filter((d) => !d.claimed && (!d.expires_at || Date.parse(d.expires_at) > nowMs));
}

export type ForgeOwned = { element_id: string; version: number | null; name: string; type: string; rarity: string | null; kind: string | null; count: number };
export type ForgeInventory = { owned: ForgeOwned[]; equipped: { weapon: string | null; avatar: string | null } };

export function parseInventory(raw: unknown): ForgeInventory {
  const o = obj(raw) ?? {};
  const eq = obj(o.equipped);
  const owned = (Array.isArray(o.owned) ? o.owned : []).flatMap((x): ForgeOwned[] => {
    const r = obj(x);
    const id = r ? str(r.element_id) : null;
    if (!r || !id) return [];
    return [{ element_id: id, version: num(r.version), name: str(r.name) ?? "Forge item", type: str(r.type) ?? "weapon", rarity: str(r.rarity), kind: str(r.kind), count: num(r.count) ?? 1 }];
  });
  return { owned, equipped: { weapon: str(eq?.weapon), avatar: str(eq?.avatar) } };
}

export type ForgeClaim = { element: ForgeEntry | null; duplicate: boolean; coins: number; inventory: ForgeInventory | null };

export function parseClaim(raw: unknown): ForgeClaim {
  const o = obj(raw) ?? {};
  const rw = obj(o.reward) ?? {};
  return {
    element: parseForgeEntry(rw.element),
    duplicate: rw.duplicate === true,
    coins: num(rw.coins) ?? 0,
    inventory: o.inventory ? parseInventory(o.inventory) : null,
  };
}

/** A refusal's words for the claim card (GameError already carries the server's `reason`). */
export function refusalText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : "Something went wrong.";
}

/** How often a phone re-reads the whole catalogue while a model still waits for its portrait. */
export const PORTRAIT_REREAD_MS = 10 * 60_000;

/**
 * Whether the next catalogue poll should be a full read instead of a delta.
 * A portrait is rendered minutes after a publish (tools/portrait_sync.py) and
 * does not move the element's published_at, so a `since` poll never brings it:
 * while a character or weapon has none, the whole list is read again now and
 * then (it is ~20 entries and a 304 when nothing changed).
 */
export function wantsFullRead(entries: readonly Pick<ForgeEntry, "type" | "portrait">[], lastFullAt: number, now: number): boolean {
  if (!entries.length) return true;
  const missing = entries.some((e) => (e.type === "character" || e.type === "weapon") && !e.portrait);
  return missing && now - lastFullAt >= PORTRAIT_REREAD_MS;
}

/** The Forge model a point carries (annotate: station wins, else a dressing environment). */
export type ForgeRef = { element_id: string; version: number | null };
export function pointForge(p: unknown): { station: ForgeRef | null; environment: ForgeRef | null; guardian: ForgeRef | null } {
  const f = obj(obj(p)?.forge);
  const ref = (v: unknown): ForgeRef | null => {
    const o = obj(v);
    const id = o ? str(o.element_id) : null;
    return o && id ? { element_id: id, version: num(o.version) } : null;
  };
  // guardian (day1-ui): the character a fight here puts up, for the pin's portrait.
  return { station: ref(f?.station), environment: ref(f?.environment), guardian: ref(f?.guardian) };
}

/** The Forge character an AI fighter (Guardian, boss) is drawn as, when the server picked one. */
export function fighterCharacter(fighter: unknown): ForgeRef | null {
  const c = obj(obj(fighter)?.character);
  const id = c ? str(c.element_id) : null;
  return c && id ? { element_id: id, version: num(c.version) } : null;
}

/** The Forge weapon a fighter holds (player_fighter.forge_weapon). */
export function fighterWeapon(fighter: unknown): (ForgeRef & { name: string | null; kind: string | null }) | null {
  const w = obj(obj(fighter)?.forge_weapon);
  const id = w ? str(w.element_id) : null;
  return w && id ? { element_id: id, version: num(w.version), name: str(w.name), kind: str(w.kind) } : null;
}

/** Characters a player may wear as their avatar (heroes), named order. */
export function avatarChoices(entries: readonly ForgeEntry[]): ForgeEntry[] {
  return entries.filter((e) => e.type === "character" && e.gameplay.avatar === true).sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** Rarity -> pin ring colour key, so a legendary drop reads from across the map. */
export function rarityRank(r: string | null | undefined): number {
  return ["common", "rare", "epic", "legendary"].indexOf(r ?? "common");
}

// ---------- the client calls ----------

export async function fetchCatalogue(client: GameClient, types: readonly ForgeType[], since: string | null): Promise<CatalogueUpdate> {
  const query: Record<string, string> = { types: types.join(",") };
  if (since) query.since = since;
  return parseCatalogueUpdate(await client.request<unknown>("GET", "v1/catalogue", { query }));
}

export async function fetchDrops(client: GameClient, lat: number, lng: number, radiusM = 600): Promise<ForgeDrop[]> {
  const raw = await client.request<unknown>("GET", "v1/roam/forge/drops", {
    query: { lat: String(lat), lng: String(lng), radius_m: String(radiusM), device_key: client.deviceKey() },
  });
  return parseDrops(raw);
}

export async function fetchInventory(client: GameClient): Promise<ForgeInventory> {
  return parseInventory(await client.request<unknown>("GET", "v1/roam/forge/inventory", { query: { device_key: client.deviceKey() } }));
}

export async function claimDrop(client: GameClient, dropId: string, lat: number, lng: number): Promise<ForgeClaim> {
  const raw = await client.request<unknown>("POST", "v1/roam/forge/claim", {
    body: { device_key: client.deviceKey(), drop_id: dropId, lat, lng },
    signed: true,
  });
  return parseClaim(raw);
}

export async function equipForge(client: GameClient, slot: "weapon" | "avatar", elementId: string | null): Promise<ForgeInventory | null> {
  const raw = await client.request<unknown>("POST", "v1/roam/forge/equip", {
    body: { device_key: client.deviceKey(), slot, element_id: elementId },
    signed: true,
  });
  const o = obj(raw);
  return o && (o.owned || o.equipped) ? parseInventory(o) : null;
}
