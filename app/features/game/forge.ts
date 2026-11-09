// The Forge catalogue: the weapons the Forge portal has published, shown in
// the Relicdex next to the player's Relics. costquest-ios Net/ForgeCatalogue.swift
// (wire, tolerant decoding) and Features/ForgeFeature.swift (ForgeCatalogueModel,
// ForgeLook).
//
// Read only, as on iOS: GET v1/catalogue is public and unsigned
// (costquest-backend app/forge.py `catalogue`), and the server has no route
// for a player to acquire, equip or trade a Forge weapon. A Forge weapon is
// labelled as such and shown with its stats; nothing is granted.
//
// The 3D model (iOS, through the native CostQuestModelView island): the pure
// rules for which file to fetch, where it lives in the cache, whether the
// download can be trusted and when the 3D view shows are below
// (forgePreviewFile ... forgeUses3d); the download itself is forgeDevice.ts.
// Everywhere else the screens draw the weapon in 2D, or the server's own
// thumbnail of it when the build made one.
// Pure: the client is passed in (tested in __tests__/forge.test.ts).
import { GameError, type GameClient } from "./client.ts";
import type { NativeIsland } from "./config.ts";

export type ForgeStats = { damage?: number | null; range_m?: number | null; cooldown_s?: number | null };
export type ForgeFile = { file: string; lod?: number | null; bytes?: number | null; sha256?: string | null; url: string };
export type ForgeThumbnail = { file: string; sha256?: string | null; url: string };
/**
 * The 3/4 render of the model under the Golden key on cream (day1-ui, art
 * direction 5 "Same characters everywhere"): `url` a square bust (a weapon:
 * the whole piece), `full` a characters-only full-body sprite on a clear page.
 * The server answers ?w=96|128|256|512 as WebP. Absent until it is rendered.
 */
export type ForgePortrait = { url: string; sha256?: string | null; full?: { url: string; sha256?: string | null } | null };

export type ForgeElement = {
  id: string;
  /** weapon | character | environment */
  type: string;
  name: string;
  version: number;
  realm?: string | null;
  /** common | rare | epic | legendary */
  rarity?: string | null;
  role?: string | null;
  rigged?: boolean | null;
  published_at?: string | null;
  stats?: ForgeStats | null;
  files: ForgeFile[];
  thumbnail?: ForgeThumbnail | null;
  portrait?: ForgePortrait | null;
};

/** The catalogue's `portrait`, or null when it is missing or odd. */
export function parsePortrait(v: unknown): ForgePortrait | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.url !== "string" || !o.url) return null;
  const f = o.full && typeof o.full === "object" ? (o.full as Record<string, unknown>) : null;
  return {
    url: o.url,
    sha256: optStr(o.sha256),
    full: f && typeof f.url === "string" && f.url ? { url: f.url, sha256: optStr(f.sha256) } : null,
  };
}

/** Where the catalogue came from (ForgeCatalogueStore.Source, without the disk cache). */
export type ForgeSource = "network" | "memory" | "unavailable" | "none";

const optStr = (v: unknown): string | null => (typeof v === "string" ? v : null);
const optNum = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * One element, or null. id, type, name and version are required; everything
 * else is optional and tolerant: one odd field in a new server build must not
 * empty the whole catalogue.
 */
export function parseForgeElement(raw: unknown): ForgeElement | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.type !== "string" || typeof r.name !== "string") return null;
  if (typeof r.version !== "number" || !Number.isInteger(r.version)) return null;
  const s = r.stats && typeof r.stats === "object" ? (r.stats as Record<string, unknown>) : null;
  const files = (Array.isArray(r.files) ? r.files : []).flatMap((f): ForgeFile[] => {
    if (!f || typeof f !== "object") return [];
    const x = f as Record<string, unknown>;
    if (typeof x.file !== "string" || typeof x.url !== "string") return [];
    return [{ file: x.file, url: x.url, lod: optNum(x.lod), bytes: optNum(x.bytes), sha256: optStr(x.sha256) }];
  });
  const t = r.thumbnail && typeof r.thumbnail === "object" ? (r.thumbnail as Record<string, unknown>) : null;
  return {
    id: r.id,
    type: r.type,
    name: r.name,
    version: r.version,
    realm: optStr(r.realm),
    rarity: optStr(r.rarity),
    role: optStr(r.role),
    rigged: typeof r.rigged === "boolean" ? r.rigged : null,
    published_at: optStr(r.published_at),
    stats: s ? { damage: optNum(s.damage), range_m: optNum(s.range_m), cooldown_s: optNum(s.cooldown_s) } : null,
    files,
    thumbnail: t && typeof t.file === "string" && typeof t.url === "string" ? { file: t.file, url: t.url, sha256: optStr(t.sha256) } : null,
    portrait: parsePortrait(r.portrait),
  };
}

/** The catalogue body, element by element, dropping the ones that do not parse. */
export function parseForgeCatalogue(raw: unknown): ForgeElement[] {
  const elements = raw && typeof raw === "object" ? (raw as { elements?: unknown }).elements : null;
  if (!Array.isArray(elements)) throw new GameError("decoding", "The server sent something unexpected.");
  return elements.map(parseForgeElement).filter((e): e is ForgeElement => e !== null);
}

const RARITY_ORDER = ["legendary", "epic", "rare", "common"];
const rank = (r: string | null | undefined) => {
  const i = RARITY_ORDER.indexOf(r ?? "");
  return i < 0 ? 9 : i;
};

/** The weapons, rarest first, then by name (ForgeCatalogueModel.refresh). */
export function forgeWeapons(elements: ForgeElement[]): ForgeElement[] {
  return elements
    .filter((e) => e.type === "weapon")
    .sort((a, b) => rank(a.rarity) - rank(b.rarity) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * The Forge has no weapon kind yet, so the silhouette is read from the name,
 * the way a player would (ForgeLook.kind).
 */
export function forgeKind(name: string): string {
  const n = name.toLowerCase();
  const words: [string, string][] = [
    ["axe", "axe"],
    ["cleaver", "axe"],
    ["bow", "bow"],
    ["staff", "staff"],
    ["wand", "staff"],
    ["hammer", "hammer"],
    ["mace", "hammer"],
    ["gauntlet", "gauntlet"],
    ["fist", "gauntlet"],
  ];
  for (const [word, kind] of words) if (n.includes(word)) return kind;
  return "blade";
}

/** 15 → "15", 2.5 → "2.5", nothing → "—" (ForgeLook.number). */
export function forgeNumber(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "-";
  return Math.round(v) === v ? String(v) : v.toFixed(1);
}

/** The thumbnail's absolute URL (the server answers ?w=128|256|512|768 as WebP), or null. */
export function forgeThumbnailUrl(baseUrl: string, el: ForgeElement, width?: 128 | 256 | 512 | 768): string | null {
  // The 3/4 portrait first (the same render as the map and the versus card), else the build's thumbnail.
  const portrait = el.portrait?.url;
  const url = portrait ?? el.thumbnail?.url;
  if (!url) return null;
  const abs = /^https?:\/\//.test(url) ? url : `${baseUrl.replace(/\/+$/, "")}/${url.replace(/^\/+/, "")}`;
  const w = width && portrait ? Math.min(width, 512) : width;
  return w ? `${abs}${abs.includes("?") ? "&" : "?"}w=${w}` : abs;
}

/**
 * The published weapons. A server from before the Forge answers 404: no
 * Forge section, not an error worth a word.
 */
export async function fetchForgeCatalogue(client: GameClient): Promise<{ weapons: ForgeElement[]; source: ForgeSource }> {
  try {
    const raw = await client.request<unknown>("GET", "v1/catalogue", { query: { type: "weapon" } });
    return { weapons: forgeWeapons(parseForgeCatalogue(raw)), source: "network" };
  } catch (error) {
    if (error instanceof GameError && error.status === 404) return { weapons: [], source: "unavailable" };
    throw error;
  }
}

export type ForgeState = { weapons: ForgeElement[]; source: ForgeSource | null; loading: boolean };

/** The server's own max-age is a minute: a refresh inside it is skipped. */
export const FORGE_REFRESH_MS = 60_000;

/**
 * The catalogue for the screens (ForgeCatalogueModel). Cheap to call often.
 * Never throws: a screen that cannot get the catalogue keeps the last one it
 * had this session, or shows no Forge section.
 */
export function createForgeStore(deps: { client: GameClient; now?: () => number }) {
  const now = deps.now ?? (() => Date.now());
  let state: ForgeState = { weapons: [], source: null, loading: false };
  let last = -Infinity;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<ForgeState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };
  return {
    get: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    weapon: (id: string) => state.weapons.find((w) => w.id === id) ?? null,
    async refresh(force = false): Promise<void> {
      if (state.loading) return;
      if (!force && now() - last < FORGE_REFRESH_MS) return;
      set({ loading: true });
      try {
        const got = await fetchForgeCatalogue(deps.client);
        last = now();
        set({ weapons: got.weapons, source: got.source });
      } catch {
        set({ source: state.weapons.length ? "memory" : "none" });
      } finally {
        set({ loading: false });
      }
    },
  };
}

export type ForgeStore = ReturnType<typeof createForgeStore>;

// ---------- the 3D model: which file, where, can it be trusted ----------

/** Larger than any model the Forge makes today by two orders of magnitude; a bigger file is a mistake, not a weapon. */
export const FORGE_MAX_FILE_BYTES = 64 * 1024 * 1024;

/**
 * The file a close-up preview wants (ForgeElement.previewFile): of the .glb
 * and .usdz files the lowest level of detail (lod0, the best mesh), USDZ
 * preferred over glTF when a build has both. Null when there is neither.
 */
export function forgePreviewFile(el: ForgeElement): ForgeFile | null {
  const usable = el.files.filter((f) => f.file.endsWith(".usdz") || f.file.endsWith(".glb"));
  if (!usable.length) return null;
  const lowest = Math.min(...usable.map((f) => f.lod ?? 0));
  const atLowest = usable.filter((f) => (f.lod ?? 0) === lowest);
  return atLowest.find((f) => f.file.endsWith(".usdz")) ?? atLowest[0];
}

/** A name from the wire reduced to one bare path component (ForgeCatalogueStore.component). */
export function forgeComponent(s: string): string {
  const last = s.split(/[\\/]/).filter(Boolean).pop() ?? "";
  return last === "" || last === ".." || last === "." ? "_" : last;
}

/**
 * Where a model lives under the cache, as path segments: per server, then the
 * element, then its version, then the file. Keyed by id and version, so a new
 * version is a new file and an old one is never shown again.
 */
export function forgeModelPath(host: string, el: ForgeElement, file: string): string[] {
  return ["forge", forgeComponent(host), forgeComponent(el.id), String(el.version), forgeComponent(file)];
}

/** A server host (and port) as one cache folder name, from its base URL. */
export function forgeHostOf(baseUrl: string): string {
  const m = /^https?:\/\/([^/?#]+)/i.exec(baseUrl);
  return (m ? m[1] : baseUrl).replace(":", "_");
}

/** A file's absolute URL: an absolute one as it is, a path against the server. */
export function forgeFileUrl(baseUrl: string, url: string): string {
  return /^https?:\/\//.test(url) ? url : `${baseUrl.replace(/\/+$/, "")}/${url.replace(/^\/+/, "")}`;
}

/** Bytes as lowercase hex (what the catalogue's sha256 is written in). */
export function hexOf(bytes: ArrayLike<number>): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += (bytes[i] & 255).toString(16).padStart(2, "0");
  return out;
}

/** The digest check: no digest in the catalogue means nothing to check; otherwise it must match, in any case. */
export function digestOk(actualHex: string, expected: string | null | undefined): boolean {
  return !expected || actualHex.toLowerCase() === expected.toLowerCase();
}

/** Whether a download of this size may be kept (a file the catalogue sized too big is never fetched). */
export function sizeOk(bytes: number | null | undefined, actual?: number): boolean {
  if (bytes != null && bytes > FORGE_MAX_FILE_BYTES) return false;
  return actual === undefined || actual <= FORGE_MAX_FILE_BYTES;
}

/**
 * Whether a cached file that was checked when it landed is still whole: not empty, and the
 * catalogue's size when it gives one. A crash or power loss right after the download can
 * leave the "checked" marker on disk while the file's data never made it (seen on the
 * emulator: 0-byte GLBs with their markers, loaded as capsules). Costs a stat, not a hash.
 */
export function cachedSizeOk(bytes: number | null | undefined, onDisk: number | null | undefined): boolean {
  if (!onDisk || onDisk <= 0) return false;
  return bytes == null || bytes <= 0 || onDisk === bytes;
}

/**
 * Whether this weapon's card shows the 3D model: the native view exists on
 * this build, its island is not turned off (EXPO_PUBLIC_GAME_2D), and the
 * weapon has a model to fetch.
 */
export function forgeUses3d(el: ForgeElement, opts: { viewAvailable: boolean; islandsOff: ReadonlySet<NativeIsland> }): boolean {
  return opts.viewAvailable && !opts.islandsOff.has("forgeModel") && forgePreviewFile(el) !== null;
}

/**
 * What to do with the cache once the server has spoken: the id folders the
 * catalogue no longer lists, and the version folders it has moved past
 * (ForgeCatalogueStore.prune). `onDisk` maps an element folder to its version folders.
 */
export function forgePrune(weapons: ForgeElement[], onDisk: Record<string, string[]>): string[][] {
  const live = new Map(weapons.map((w) => [forgeComponent(w.id), String(w.version)]));
  const out: string[][] = [];
  for (const [id, versions] of Object.entries(onDisk)) {
    const keep = live.get(id);
    if (keep === undefined) out.push([id]);
    else for (const v of versions) if (v !== keep) out.push([id, v]);
  }
  return out;
}

/** The card's tag and subtitle (ForgeTile "FORGE · 3D", ForgeWeaponDetail "· drag to turn"). */
export function forgeTileTag(has3d: boolean): string {
  return has3d ? "FORGE · 3D" : "FORGE";
}

export function forgeDetailSubtitle(version: number, has3d: boolean): string {
  return `Weapon · version ${version}${has3d ? " · drag to turn" : ""}`;
}
