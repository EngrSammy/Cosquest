// The phone side of the Forge's 3D models (iOS, ForgeCatalogueStore.syncWeapons):
// each weapon's lod0 model is downloaded once per version into the cache,
// checked against the catalogue's sha256 and handed to the native
// CostQuestModelView as a file:// uri. The rules (which file, where, whether
// to trust it, when 3D shows) are pure and tested in forge.ts; this file is
// the glue, like stepsDevice.ts, so it is not unit tested.
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { useSyncExternalStore } from "react";

import { CostQuestModelView } from "@/modules/costquest-game/src";

import { resolveIslandsOff } from "./config.ts";
import {
  digestOk,
  type ForgeElement,
  forgeFileUrl,
  forgeHostOf,
  forgeModelPath,
  forgePreviewFile,
  forgePrune,
  forgeUses3d,
  hexOf,
  sizeOk,
} from "./forge.ts";
import { GAME_SERVER } from "./runtime.ts";

const ISLANDS_OFF = resolveIslandsOff(process.env.EXPO_PUBLIC_GAME_2D);

/** The native 3D view exists on this build and its island is not turned off. */
export const FORGE_3D_AVAILABLE = CostQuestModelView !== null && !ISLANDS_OFF.has("forgeModel");

/** Whether this weapon can be shown in 3D at all (a model to fetch, a view to show it in). */
export function weaponHas3d(el: ForgeElement): boolean {
  return forgeUses3d(el, { viewAvailable: CostQuestModelView !== null, islandsOff: ISLANDS_OFF });
}

// ---------- the models on disk, by element id ----------

let models: Record<string, string> = {};
const listeners = new Set<() => void>();
const setModels = (patch: Record<string, string>) => {
  models = { ...models, ...patch };
  listeners.forEach((l) => l());
};

/** Verified models on this phone, id -> file:// uri (ForgeCatalogueModel.models). */
export function useForgeModels(): Record<string, string> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => models,
    () => models,
  );
}

const host = forgeHostOf(GAME_SERVER);
const root = () => new Directory(Paths.cache, "forge", host);

function fileOf(el: ForgeElement, name: string): File {
  // forgeModelPath is ["forge", host, id, version, file]; the first two are `root()`.
  const [, , id, version, file] = forgeModelPath(host, el, name);
  return new File(root(), id, version, file);
}

async function sha256Of(file: File): Promise<string> {
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await file.bytes());
  return hexOf(new Uint8Array(digest));
}

/** A file already on disk is used only if it matches its digest (or, with none given, was finished). */
async function verified(file: File, marker: File, expected: string | null | undefined): Promise<boolean> {
  if (!file.exists) return false;
  if (!expected) return marker.exists;
  try {
    return digestOk(await sha256Of(file), expected);
  } catch {
    return false;
  }
}

const inFlight = new Map<string, Promise<string | null>>();

/**
 * The weapon's preview model as a file:// uri: from the cache when it is there
 * and verified, else downloaded (never longer than the size rule allows) and
 * verified. A download that does not match its digest is deleted and never
 * shown. Null when there is no model or anything failed.
 */
export function ensureForgeModel(el: ForgeElement): Promise<string | null> {
  const f = forgePreviewFile(el);
  if (!f) return Promise.resolve(null);
  const key = `${el.id}@${el.version}`;
  const running = inFlight.get(key);
  if (running) return running;
  const work = (async (): Promise<string | null> => {
    try {
      const dest = fileOf(el, f.file);
      const marker = fileOf(el, `${f.file}.ok`);
      if (await verified(dest, marker, f.sha256)) return dest.uri;
      if (!sizeOk(f.bytes)) return null;
      const dir = dest.parentDirectory;
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      if (dest.exists) dest.delete();
      if (marker.exists) marker.delete();
      await File.downloadFileAsync(forgeFileUrl(GAME_SERVER, f.url), dest);
      if (!sizeOk(f.bytes, dest.size)) {
        dest.delete();
        return null;
      }
      if (f.sha256 && !digestOk(await sha256Of(dest), f.sha256)) {
        dest.delete();
        return null;
      }
      marker.create({ overwrite: true });
      return dest.uri;
    } catch {
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, work);
  return work;
}

/**
 * Bring every weapon's model onto the phone (syncWeapons): what is cached shows at
 * once, the rest follows the download, and, once the server has spoken, versions the
 * catalogue has moved past are dropped.
 */
export async function syncForgeModels(weapons: ForgeElement[], authoritative: boolean): Promise<void> {
  if (!FORGE_3D_AVAILABLE) return;
  for (const w of weapons) {
    if (!weaponHas3d(w) || models[w.id]) continue;
    const uri = await ensureForgeModel(w);
    if (uri) setModels({ [w.id]: uri });
  }
  // Offline, or on a 404, what is on disk is all there is and it stays.
  if (!authoritative) return;
  try {
    const dir = root();
    if (!dir.exists) return;
    const onDisk: Record<string, string[]> = {};
    for (const entry of dir.list()) {
      if (!(entry instanceof Directory) || entry.name.startsWith(".")) continue;
      onDisk[entry.name] = entry
        .list()
        .filter((v) => v instanceof Directory && !v.name.startsWith("."))
        .map((v) => v.name);
    }
    for (const parts of forgePrune(weapons, onDisk)) new Directory(root(), ...parts).delete();
  } catch {
    // The cache is the system's to reclaim anyway.
  }
}
