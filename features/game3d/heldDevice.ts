// The phone side of weapons in hand (cq 234): the bundled default weapons as
// files, the weapon a character holds (held.ts decides), and that weapon put
// into the character's GLB under its hand bone (attach.ts mergeWeaponGlb) so
// the Filament previews show it with no per-frame work. Also the fight
// config's weapon fields for Godot. Glue (expo-asset, expo-file-system, the
// stores), not unit tested; the rules are in held.ts and attach.ts.
import { Asset } from "expo-asset";
import { Directory, File, Paths } from "expo-file-system";
import { useEffect, useState, useSyncExternalStore } from "react";

import type { ForgeEntry } from "@/features/game/forgeWorld";
import { pickGlb } from "@/features/game/forgeWorld";
import { ensureFile, forgeWorld, useEquipped, useForgeWorld } from "@/features/game/forgeWorldDevice";
import { getPref, setPref } from "@/utils/prefsStorage";

import ATTACH from "../../game3d/data/attach.json";
import { type AttachManifest, type Gltf, gripFor, mergeWeaponGlb, previewGripFor, readGlb } from "./attach";
import { appCatalogueFlag, catalogueOn, type Held, type HeldPair, heldFor, starterEntry as starterEntryOf } from "./held";

export const MANIFEST = ATTACH as unknown as AttachManifest;

/** This build's half of the catalogue link (the server's `forge_world` is the other). */
export const FORGE_CATALOGUE = appCatalogueFlag(process.env.EXPO_PUBLIC_FORGE_CATALOGUE);

/** The bundled default set (app/assets/weapons, built by game3d/tools/weapons/build_weapons.py). */
/* eslint-disable @typescript-eslint/no-require-imports -- bundled assets are require()d for Metro */
const BUNDLE: Record<string, { glb: number; png: number }> = {
  knight_sword: { glb: require("../../assets/weapons/knight_sword.glb"), png: require("../../assets/weapons/knight_sword.png") },
  crown_greatsword: { glb: require("../../assets/weapons/crown_greatsword.glb"), png: require("../../assets/weapons/crown_greatsword.png") },
  war_axe: { glb: require("../../assets/weapons/war_axe.glb"), png: require("../../assets/weapons/war_axe.png") },
  forge_warhammer: { glb: require("../../assets/weapons/forge_warhammer.glb"), png: require("../../assets/weapons/forge_warhammer.png") },
  arcane_staff: { glb: require("../../assets/weapons/arcane_staff.glb"), png: require("../../assets/weapons/arcane_staff.png") },
  rogue_dagger: { glb: require("../../assets/weapons/rogue_dagger.glb"), png: require("../../assets/weapons/rogue_dagger.png") },
  hunter_crossbow: { glb: require("../../assets/weapons/hunter_crossbow.glb"), png: require("../../assets/weapons/hunter_crossbow.png") },
  repeater_rifle: { glb: require("../../assets/weapons/repeater_rifle.glb"), png: require("../../assets/weapons/repeater_rifle.png") },
  knight_shield: { glb: require("../../assets/weapons/knight_shield.glb"), png: require("../../assets/weapons/knight_shield.png") },
};
/* eslint-enable @typescript-eslint/no-require-imports */

/** The bundled thumbnail (an image source for expo-image), or null. */
export const bundledThumb = (slug: string | null | undefined): number | null => (slug ? (BUNDLE[slug]?.png ?? null) : null);

const assetUris = new Map<string, Promise<string | null>>();
/** A bundled weapon's GLB as a file:// uri (copied out of the APK once by expo-asset). */
export function bundledFile(slug: string): Promise<string | null> {
  const mod = BUNDLE[slug]?.glb;
  if (!mod) return Promise.resolve(null);
  let p = assetUris.get(slug);
  if (!p) {
    p = Asset.fromModule(mod)
      .downloadAsync()
      .then((a) => a.localUri ?? null)
      .catch(() => null);
    assetUris.set(slug, p);
  }
  return p;
}

/** The GLB of whatever is held: a bundled file, or the catalogue entry's file (LOD 1, downloaded and checked once). */
export async function heldFile(h: Held | null): Promise<string | null> {
  if (!h) return null;
  if (h.source === "default" && h.slug) return bundledFile(h.slug);
  if (h.entry) {
    const f = pickGlb(h.entry, 1);
    return f ? ensureFile(h.entry, f) : null;
  }
  return null;
}

export { STARTER } from "./held";

/** A starter-set weapon as a catalogue-shaped entry (held.ts starterEntry). */
export const starterEntry = (slug: string): ForgeEntry | null => starterEntryOf(MANIFEST, slug);

// ---------- the player's pick from the starter set ----------

const PICK_KEY = "cq.weapon.held.v1";
let localPick: string | null = null;
let pickLoaded = false;
const pickListeners = new Set<() => void>();
async function loadPick() {
  if (pickLoaded) return;
  pickLoaded = true;
  const v = await getPref(PICK_KEY).catch(() => null);
  if (v && MANIFEST.weapons[v]) {
    localPick = v;
    pickListeners.forEach((l) => l());
  }
}
/** Hold one of the starter set (null: the character's own). Kept on the phone only: the 3D fight is practice. */
export function setLocalPick(slug: string | null) {
  localPick = slug && MANIFEST.weapons[slug] ? slug : null;
  void setPref(PICK_KEY, localPick ?? "");
  pickListeners.forEach((l) => l());
}
export function useLocalPick(): string | null {
  useEffect(() => void loadPick(), []);
  return useSyncExternalStore(
    (l) => {
      pickListeners.add(l);
      return () => {
        pickListeners.delete(l);
      };
    },
    () => localPick,
    () => localPick,
  );
}

// ---------- what a character holds ----------

/** Is the link on now (this build's flag and the server's feature)? */
export function useCatalogueOn(): boolean {
  const serverOn = useForgeWorld((s) => s.on);
  return catalogueOn(FORGE_CATALOGUE, serverOn);
}

/** What this character holds; `mine` when it is the avatar the player wears. */
export function useHeld(character: ForgeEntry | null, mine: boolean): HeldPair {
  const equipped = useEquipped();
  const linkOn = useCatalogueOn();
  const pick = useLocalPick();
  const weaponEntry = useForgeWorld((s) => (equipped.weapon ? (s.entries.find((e) => e.id === equipped.weapon) ?? null) : null));
  if (!character || character.type !== "character") return { main: null, offhand: null };
  return heldFor(MANIFEST, { characterName: character.name, mine, equipped: weaponEntry, linkOn, localPick: pick });
}

const heldKey = (h: Held | null) => (h ? (h.slug ?? `${h.entry?.id}@${h.entry?.version}`) : "-");

const merged = new Map<string, Promise<string | null>>();
/** The merged-GLB cache folder; a new name whenever the grip rules change, so old merges are never shown. */
export const HELD_CACHE_DIR = "forge-held-v2";

/** The character's GLB with its weapons in hand, as a file:// uri; null if it can't be made (show the character alone). */
export function heldGlb(character: ForgeEntry, characterUri: string, pair: HeldPair): Promise<string | null> {
  const key = `${character.id}@${character.version}|${characterUri.split("/").pop()}|${heldKey(pair.main)}|${heldKey(pair.offhand)}`;
  let p = merged.get(key);
  if (p) return p;
  p = (async () => {
    try {
      // v2 (build 18): merged with previewGripFor; files merged by builds 15-17 held the blade up past the head.
      const dir = new Directory(Paths.cache, HELD_CACHE_DIR);
      const name = key.replace(/[^A-Za-z0-9@._-]+/g, "_").slice(0, 180) + ".glb";
      const out = new File(dir, name);
      if (out.exists && (out.size ?? 0) > 0) return out.uri;
      let bytes: Uint8Array = await new File(characterUri).bytes();
      let glb: Gltf | null = null;
      for (const h of [pair.main, pair.offhand]) {
        if (!h) continue;
        const wUri = await heldFile(h);
        if (!wUri) continue;
        if (!MANIFEST.characters[characterKeyOf(character)]) glb = glb ?? readGlb(bytes).json;
        const grip = previewGripFor(MANIFEST, character.name, h.cls, glb);
        if (!grip) continue;
        bytes = mergeWeaponGlb(bytes, await new File(wUri).bytes(), grip.bone, grip.matrix);
      }
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      out.write(bytes);
      return out.uri;
    } catch {
      merged.delete(key);
      return null;
    }
  })();
  merged.set(key, p);
  return p;
}

const characterKeyOf = (e: Pick<ForgeEntry, "name">) => e.name.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * For a 3D preview: the uri to load. The character alone until its weapons
 * are merged in (a moment, once per character, weapon and version), then
 * the merged file. Off for anything that isn't a character.
 */
export function useHeldUri(character: ForgeEntry | null, uri: string | null, mine: boolean, enabled = true): string | null {
  const pair = useHeld(enabled ? character : null, mine);
  const [out, setOut] = useState<{ key: string; uri: string } | null>(null);
  const want = character && uri && (pair.main || pair.offhand) ? `${uri}|${heldKey(pair.main)}|${heldKey(pair.offhand)}` : null;
  useEffect(() => {
    if (!want || !character || !uri) return;
    let alive = true;
    void heldGlb(character, uri, pair).then((m) => {
      if (alive) setOut({ key: want, uri: m ?? uri });
    });
    return () => {
      alive = false;
    };
  }, [want]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!want) return uri;
  return out?.key === want ? out.uri : null;
}

// ---------- the Godot fight ----------

export type FightWeapon = { glb: string; class: string; bone: string; matrix: number[] };

/** The fight config's <role>_weapon / <role>_offhand for one fighter (empty when it holds nothing). */
export async function fightWeapons(character: ForgeEntry | null, characterUri: string | null, mine: boolean, opts: { equipped: string | null; linkOn: boolean; localPick: string | null }): Promise<{ main?: FightWeapon; offhand?: FightWeapon }> {
  if (!character) return {};
  const equipped = opts.equipped ? forgeWorld.entry(opts.equipped) : null;
  const pair = heldFor(MANIFEST, { characterName: character.name, mine, equipped, linkOn: opts.linkOn, localPick: opts.localPick });
  let glb: Gltf | null = null;
  if (!MANIFEST.characters[characterKeyOf(character)] && characterUri) {
    try {
      glb = readGlb(await new File(characterUri).bytes()).json;
    } catch {
      glb = null;
    }
  }
  const out: { main?: FightWeapon; offhand?: FightWeapon } = {};
  for (const [slot, h] of [["main", pair.main], ["offhand", pair.offhand]] as const) {
    if (!h) continue;
    const grip = gripFor(MANIFEST, character.name, h.cls, glb);
    const file = await heldFile(h);
    if (grip && file) out[slot] = { glb: file, class: h.cls, bone: grip.bone, matrix: grip.matrix };
  }
  return out;
}

/** The starter set pick and the link, read once (for the fight config). */
export async function heldInputs(): Promise<{ linkOn: boolean; localPick: string | null }> {
  await loadPick();
  return { linkOn: catalogueOn(FORGE_CATALOGUE, forgeWorld.get().on), localPick };
}
