// The phone side of Forge in the world (cq 056): the catalogue kept fresh and
// on disk, every model file downloaded once per version and checked against
// its sha256, the drops near the player, and their bag. The rules are pure
// and tested in forgeWorld.ts; this file is glue (expo-file-system,
// expo-crypto, the game store), like forgeDevice.ts, so it is not unit tested.
//
// Nothing here knows any element by name: whatever the server publishes is
// fetched, cached and shown by type and role, which is what lets a new Forge
// asset appear with no app release.
import * as Crypto from "expo-crypto";
import { Image } from "expo-image";
import { Directory, File, Paths } from "expo-file-system";
import { useSyncExternalStore } from "react";
import { Dimensions, PixelRatio } from "react-native";

import { getPref, setPref } from "@/utils/prefsStorage";

import { cachedSizeOk, digestOk, forgeComponent, forgeFileUrl, forgeHostOf, hexOf, sizeOk } from "./forge.ts";
import {
  claimDrop,
  type DeviceClass,
  deviceClassOf,
  equipForge,
  fetchCatalogue,
  fetchDrops,
  fetchInventory,
  type ForgeClaim,
  type ForgeDrop,
  type ForgeEntry,
  type ForgeFileRef,
  type ForgeInventory,
  type ForgePurpose,
  forgeWorldOf,
  FORGE_TYPES,
  liveDrops,
  mergeCatalogue,
  parseForgeEntry,
  pickGlb,
  wantedLod,
  wantsFullRead,
} from "./forgeWorld.ts";
import { gameStore, GAME_SERVER, useGame } from "./runtime.ts";
import { arLod, pickUsdz } from "./summon.ts";

/** The catalogue is cacheable for 60 s on the server; asking more often only costs 304s. */
const CATALOGUE_EVERY_MS = 60_000;
const DROPS_EVERY_MS = 30_000;
const CATALOGUE_KEY = `cq.forge.catalogue.v2.${forgeHostOf(GAME_SERVER)}`;

export const DEVICE_CLASS: DeviceClass = (() => {
  const { width, height } = Dimensions.get("window");
  return deviceClassOf({ pixelRatio: PixelRatio.get(), width, height, override: process.env.EXPO_PUBLIC_FORGE_LOD ?? null });
})();

export type ForgeWorldState = {
  /** Every published entry of every type, newest version. */
  entries: ForgeEntry[];
  cursor: string | null;
  drops: ForgeDrop[];
  inventory: ForgeInventory | null;
  /** The server's switch (features.forge_world in /me). */
  on: boolean;
};

let state: ForgeWorldState = { entries: [], cursor: null, drops: [], inventory: null, on: false };
const listeners = new Set<() => void>();
function set(patch: Partial<ForgeWorldState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useForgeWorld<T>(select: (s: ForgeWorldState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state), () => select(state));
}
export const forgeWorld = {
  get: () => state,
  entry: (id: string | null | undefined): ForgeEntry | null => (id ? (state.entries.find((e) => e.id === id) ?? null) : null),
};

// ---------- the catalogue: from disk at once, then polled ----------

let loaded = false;
let lastCatalogue = -Infinity;
/** When the whole catalogue was last read (wantsFullRead). */
let lastFullRead = -Infinity;
let catalogueBusy = false;

async function loadFromDisk() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await getPref(CATALOGUE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { entries?: unknown[]; cursor?: string | null };
    const entries = (saved.entries ?? []).map(parseForgeEntry).filter((e): e is ForgeEntry => e !== null);
    if (entries.length && !state.entries.length) set({ entries, cursor: saved.cursor ?? null });
  } catch {
    // A bad cache is no cache.
  }
}

/** Ask the server what changed since the last answer (all of it the first time). Never throws. */
export async function refreshCatalogue(force = false): Promise<void> {
  await loadFromDisk();
  if (catalogueBusy || (!force && Date.now() - lastCatalogue < CATALOGUE_EVERY_MS)) return;
  catalogueBusy = true;
  try {
    const full = wantsFullRead(state.entries, lastFullRead, Date.now());
    const since = full ? null : state.cursor;
    const update = await fetchCatalogue(gameStore.client, FORGE_TYPES, since);
    lastCatalogue = Date.now();
    if (since === null) lastFullRead = lastCatalogue;
    const entries = mergeCatalogue(state.entries, update, since === null);
    set({ entries, cursor: update.cursor ?? state.cursor });
    void setPref(CATALOGUE_KEY, JSON.stringify({ entries, cursor: update.cursor ?? state.cursor }));
    void prefetchOpponents(entries);
  } catch {
    // Offline, or a server from before contract 2: keep what we have.
  } finally {
    catalogueBusy = false;
  }
}

/**
 * Guardians and bosses show on the versus card, which is up for under two
 * seconds: their light LOD and thumbnail are fetched as soon as the
 * catalogue names them, one at a time, so the card has them at once.
 */
async function prefetchOpponents(entries: ForgeEntry[]) {
  for (const e of entries) {
    if (e.type !== "character" || (e.gameplay.role !== "guardian" && e.gameplay.role !== "boss")) continue;
    const f = glbFor(e, "thumb");
    if (f) await ensureFile(e, f);
    const t = thumbUrl(e, 256);
    if (t) await Image.prefetch(t).catch(() => false);
  }
}

// ---------- the switch, the drops and the bag ----------

/** Read the switch from /me. Called by the poller; cheap. */
export function syncSwitch(): boolean {
  const on = forgeWorldOf(gameStore.get().me).on;
  if (on !== state.on) set({ on, ...(on ? {} : { drops: [] }) });
  return on;
}

let lastDrops = -Infinity;
export async function refreshDrops(force = false): Promise<void> {
  if (!syncSwitch()) return;
  const fix = gameStore.get().fix;
  if (!fix || (!force && Date.now() - lastDrops < DROPS_EVERY_MS)) return;
  lastDrops = Date.now();
  try {
    set({ drops: liveDrops(await fetchDrops(gameStore.client, fix.lat, fix.lng), Date.now()) });
  } catch {
    // Keep the last ones; they carry their own expiry.
  }
}

export async function refreshInventory(): Promise<ForgeInventory | null> {
  if (!syncSwitch()) return null;
  try {
    const inventory = await fetchInventory(gameStore.client);
    set({ inventory });
    return inventory;
  } catch {
    return state.inventory;
  }
}

export async function claim(drop: ForgeDrop): Promise<ForgeClaim> {
  const fix = gameStore.get().fix;
  const got = await claimDrop(gameStore.client, drop.id, fix?.lat ?? drop.lat, fix?.lng ?? drop.lng);
  set({
    drops: state.drops.map((d) => (d.id === drop.id ? { ...d, claimed: true } : d)),
    ...(got.inventory ? { inventory: got.inventory } : {}),
  });
  if (got.element && !state.entries.some((e) => e.id === got.element?.id && e.version === got.element?.version)) {
    set({ entries: mergeCatalogue(state.entries, { elements: [got.element], removed: [], cursor: null, contract: 2 }, false) });
  }
  if (!got.inventory) void refreshInventory();
  void gameStore.refreshMe?.();
  return got;
}

export async function equip(slot: "weapon" | "avatar", elementId: string | null): Promise<void> {
  const inv = await equipForge(gameStore.client, slot, elementId);
  set({ inventory: inv ?? (state.inventory ? { ...state.inventory, equipped: { ...state.inventory.equipped, [slot]: elementId } } : null) });
  if (!inv) void refreshInventory();
  void gameStore.refreshMe?.();
}

/** The equipped ids: the bag when loaded, else /me's block. */
export function useEquipped(): { weapon: string | null; avatar: string | null } {
  const inv = useForgeWorld((s) => s.inventory);
  // Subscribed, so the HUD, the profile and the bag follow a fresh /me too
  // (before the bag has loaded, /me is the only answer).
  const me = forgeWorldOf(useGame((s) => s.me));
  return inv?.equipped ?? me.equipped;
}

let timer: ReturnType<typeof setInterval> | null = null;
/** Start polling (idempotent). The game root calls it while the game is on screen. */
export function startForgeWorld(): () => void {
  void refreshCatalogue();
  if (syncSwitch()) {
    void refreshDrops(true);
    void refreshInventory();
  }
  if (!timer) {
    timer = setInterval(() => {
      void refreshCatalogue();
      void refreshDrops();
    }, 10_000);
  }
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
}

// ---------- model files: once per version, verified ----------

const host = forgeHostOf(GAME_SERVER);
const root = () => new Directory(Paths.cache, "forge", host);

async function sha256Of(file: File): Promise<string> {
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await file.bytes());
  return hexOf(new Uint8Array(digest));
}

/**
 * A model download that has not finished in this long is given up (the box
 * then offers a retry). expo-file-system's download has no timeout of its
 * own, so a stalled connection left the 3D box loading for ever.
 */
export const DOWNLOAD_TIMEOUT_MS = 25_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    work.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

const inFlight = new Map<string, Promise<string | null>>();
const ready = new Map<string, string>();

/**
 * One file of an entry as a file:// uri. The cache is keyed by element id,
 * version and the file's sha256, so a new version is a new file and a file is
 * hashed once, when it lands (a marker named after its digest says it was
 * checked). A download that does not match is deleted and never shown.
 */
export function ensureFile(entry: Pick<ForgeEntry, "id" | "version">, f: ForgeFileRef): Promise<string | null> {
  const key = `${entry.id}@${entry.version}/${f.file}`;
  const known = ready.get(key);
  if (known) return Promise.resolve(known);
  const running = inFlight.get(key);
  if (running) return running;
  const work = (async (): Promise<string | null> => {
    try {
      const dir = new Directory(root(), forgeComponent(entry.id), String(entry.version));
      const dest = new File(dir, forgeComponent(f.file));
      const marker = new File(dir, `${forgeComponent(f.file)}.${(f.sha256 ?? "nosha").slice(0, 16)}.ok`);
      if (dest.exists && marker.exists && cachedSizeOk(f.bytes, dest.size)) {
        ready.set(key, dest.uri);
        return dest.uri;
      }
      if (marker.exists) marker.delete();
      if (!sizeOk(f.bytes)) return null;
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      if (dest.exists) dest.delete();
      await withTimeout(File.downloadFileAsync(forgeFileUrl(GAME_SERVER, f.url), dest, { idempotent: true }), DOWNLOAD_TIMEOUT_MS);
      if (!sizeOk(f.bytes, dest.size) || (f.sha256 && !digestOk(await sha256Of(dest), f.sha256))) {
        dest.delete();
        return null;
      }
      marker.create({ overwrite: true });
      ready.set(key, dest.uri);
      return dest.uri;
    } catch (e) {
      if (__DEV__) console.warn(`[forge] ${f.file}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, work);
  return work;
}

/** The GLB for this purpose on this phone, and its LOD. */
export function glbFor(entry: ForgeEntry, purpose: ForgePurpose, lod?: number) {
  return pickGlb(entry, lod ?? wantedLod(DEVICE_CLASS, purpose));
}

/** The USDZ for "See it here" on this phone (summon.ts arLod), or null. */
export function usdzFor(entry: ForgeEntry) {
  return pickUsdz(entry, arLod(DEVICE_CLASS));
}

/**
 * The model's picture (WebP at a width), or null: its 3/4 portrait when the
 * server has rendered one (art direction 5: the same render on the map, in
 * the Collection and on the versus card), else the build's own thumbnail.
 */
export function thumbUrl(entry: Pick<ForgeEntry, "thumbnail" | "portrait"> | null | undefined, width: 128 | 256 | 512 | 768 = 256): string | null {
  const p = entry?.portrait?.url;
  if (p) return withWidth(forgeFileUrl(GAME_SERVER, p), portraitWidth(width));
  const url = entry?.thumbnail?.url;
  if (!url) return null;
  return withWidth(forgeFileUrl(GAME_SERVER, url), width);
}

/** The full-body sprite on a clear page (characters with a portrait only), for the map marker. */
export function figureUrl(entry: Pick<ForgeEntry, "portrait"> | null | undefined, width: 128 | 256 | 512 = 256): string | null {
  const f = entry?.portrait?.full?.url;
  return f ? withWidth(forgeFileUrl(GAME_SERVER, f), width) : null;
}

const withWidth = (abs: string, w: number) => `${abs}${abs.includes("?") ? "&" : "?"}w=${w}`;

export function absUrl(url: string | null | undefined): string | null {
  return url ? forgeFileUrl(GAME_SERVER, url) : null;
}

/** Versions on disk the catalogue has moved past, removed (best effort, once per session). */
export function pruneCache(): void {
  try {
    const dir = root();
    if (!dir.exists) return;
    const live = new Map(state.entries.map((e) => [forgeComponent(e.id), String(e.version)]));
    for (const el of dir.list()) {
      if (!(el instanceof Directory)) continue;
      const keep = live.get(el.name);
      if (keep === undefined) continue; // Not in the list yet (offline): leave it.
      for (const v of el.list()) if (v instanceof Directory && v.name !== keep) v.delete();
    }
  } catch {
    // The cache is the system's to reclaim anyway.
  }
}

/** The portrait widths the server answers (?w=); a thumbnail's 768 asks for 512. */
function portraitWidth(w: number): 96 | 128 | 256 | 512 {
  return w <= 96 ? 96 : w <= 128 ? 128 : w <= 256 ? 256 : 512;
}
