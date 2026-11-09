// Which weapon a character holds (cq 234), and the app's own default set.
//
// Every character on screen holds a weapon: in the 3D fight, the Collection's Forge tab,
// the Wear list, the versus card and the avatar. Where it comes from:
//   - the player's own avatar holds the weapon the player equipped, when the
//     Forge catalogue link is on (the server's `forge_world` feature AND this
//     build's EXPO_PUBLIC_FORGE_CATALOGUE=1) and that weapon is a real one;
//   - else its own weapon: the cast's from app/game3d/data/attach.json (the
//     deck's own where the deck shows one), a sword for anyone else.
// The default set is bundled with the app (app/assets/weapons/, the same
// files as the Forge packs imported into the catalogue), so a fresh install
// with an empty or placeholder-only catalogue still shows real weapons.
// With the link off, the catalogue screens behave exactly as before
// (the bag lists what the server says is owned, nothing filtered).
//
// Pure: tested in __tests__/held.test.ts. The files are heldDevice.ts.
import type { ForgeEntry } from "../game/forgeWorld.ts";

import { type AttachManifest, characterKey, type GripClass, gripClassOf } from "./attach.ts";

/** The app flag (EXPO_PUBLIC_FORGE_CATALOGUE): "1", "true" or "on". */
export function catalogueFlag(raw: string | undefined | null): boolean {
  return ["1", "true", "on", "yes"].includes(String(raw ?? "").trim().toLowerCase());
}

/**
 * This build's half of the link from its EXPO_PUBLIC_FORGE_CATALOGUE: on unless
 * the build says otherwise. Unset meant off until build 18, and the TestFlight
 * builds 15 to 17 never set it, so the hero held the starter weapon instead of
 * the equipped one. The server's `forge_world` is the real switch (catalogueOn).
 */
export function appCatalogueFlag(raw: string | undefined | null): boolean {
  return raw === undefined || raw === null || String(raw).trim() === "" ? true : catalogueFlag(raw);
}

/** The link is on when both say so: this build's flag and the server's feature. */
export function catalogueOn(appFlag: boolean, serverOn: boolean): boolean {
  return appFlag && serverOn;
}

/**
 * A placeholder weapon: one file served as every LOD (the pack check's
 * "placeholder LODs" warning), or no thumbnail and a tiny model (the
 * untextured Ember Blade v1 is 9.7 KB with no texture). Hidden when the link
 * is on: Mark should never meet a grey blade.
 */
export function isPlaceholderWeapon(e: Pick<ForgeEntry, "type" | "lods" | "thumbnail">): boolean {
  if (e.type !== "weapon") return false;
  const glbs = e.lods.map((l) => l.glb).filter((g): g is NonNullable<typeof g> => !!g);
  if (!glbs.length) return true;
  // The app's own starter set (bundled, textured) serves one file for every LOD on purpose.
  if (glbs.every((g) => g.url.startsWith("bundle:"))) return false;
  const shas = new Set(glbs.map((g) => g.sha256 ?? g.file));
  if (glbs.length > 1 && shas.size === 1) return true;
  const smallest = Math.min(...glbs.map((g) => g.bytes ?? Infinity));
  return !e.thumbnail && smallest < 16 * 1024;
}

/** The catalogue's weapons the game uses: everything published but the placeholders. */
export function realWeapons<T extends Pick<ForgeEntry, "type" | "lods" | "thumbnail">>(entries: readonly T[]): T[] {
  return entries.filter((e) => e.type === "weapon" && !isPlaceholderWeapon(e));
}

/** A default weapon's catalogue twin: the same pack imported into the Forge (same name). */
export function catalogueTwin<T extends Pick<ForgeEntry, "type" | "name">>(entries: readonly T[], name: string): T | null {
  return entries.find((e) => e.type === "weapon" && e.name === name) ?? null;
}

export type Held = {
  /** default: a bundled weapon (slug); catalogue: a Forge entry */
  source: "default" | "catalogue";
  slug: string | null;
  entry: ForgeEntry | null;
  name: string;
  cls: GripClass;
};
export type HeldPair = { main: Held | null; offhand: Held | null };

const ONE_HANDED: GripClass[] = ["sword", "dagger", "axe"];

function bundled(m: AttachManifest, slug: string | null | undefined): Held | null {
  const w = slug ? m.weapons[slug] : null;
  return w && slug ? { source: "default", slug, entry: null, name: w.name, cls: w.grip } : null;
}

/** The character's own weapon (no player choice): the manifest's default, a sword for a character it doesn't know. */
export function ownWeapon(m: AttachManifest, characterName: string | null | undefined): Held | null {
  const c = m.characters[characterKey(characterName)];
  if (c) return bundled(m, c.default_weapon);
  return bundled(m, "knight_sword");
}

/**
 * What a character holds. `mine`: it is the player's avatar, so the player's
 * choice counts: the equipped Forge weapon (link on, a real weapon), else a
 * default weapon held from the bag's starter set (`localPick`, link on), else its own.
 * A shield goes in the off hand, with the character's own one-handed weapon
 * (or a sword) in the main hand.
 */
export function heldFor(
  m: AttachManifest,
  input: { characterName: string | null | undefined; mine: boolean; equipped: ForgeEntry | null; linkOn: boolean; localPick?: string | null },
): HeldPair {
  let pick: Held | null = null;
  if (input.mine && input.linkOn && input.equipped && input.equipped.type === "weapon" && !isPlaceholderWeapon(input.equipped)) {
    const e = input.equipped;
    pick = { source: "catalogue", slug: null, entry: e, name: e.name, cls: gripClassOf(e.name, e.gameplay?.kind ?? null) };
  } else if (input.mine && input.linkOn && input.localPick) {
    // The starter set is only listed with the link on, so a pick made then
    // does not linger (unseen, unremovable) once the link is off.
    pick = bundled(m, input.localPick);
  }
  const own = ownWeapon(m, input.characterName);
  if (!pick) {
    if (own?.cls === "shield") return { main: bundled(m, "knight_sword"), offhand: own };
    return { main: own, offhand: null };
  }
  if (pick.cls === "shield") {
    const main = own && ONE_HANDED.includes(own.cls) ? own : bundled(m, "knight_sword");
    return { main, offhand: pick };
  }
  return { main: pick, offhand: null };
}

/** The starter set as the bag lists it: every bundled weapon, in the manifest's order. */
export function starterSet(m: AttachManifest): { slug: string; name: string; cls: GripClass }[] {
  return Object.entries(m.weapons).map(([slug, w]) => ({ slug, name: w.name, cls: w.grip }));
}

/** "starter:<slug>": the bag's id for a starter-set weapon (never a catalogue id). */
export const STARTER = "starter:";

/**
 * A starter-set weapon as a catalogue-shaped entry, so the bag and the 3D
 * view treat it like any other: its file and thumbnail are "bundle:<slug>"
 * (ForgeModel resolves those from the app, not the server).
 */
export function starterEntry(m: AttachManifest, slug: string): ForgeEntry | null {
  const w = m.weapons[slug];
  if (!w) return null;
  const glb = { file: `${slug}.glb`, url: `bundle:${slug}`, bytes: null, sha256: null };
  return {
    id: STARTER + slug, type: "weapon", name: w.name, version: 1, rarity: "common", files: [],
    thumbnail: { file: `${slug}.png`, url: `bundle:${slug}` },
    contract: 2, lods: [0, 1, 2].map((lod) => ({ lod, glb, usdz: null })), bounds_m: null, height_m: w.length_m,
    pivot: "grip", animations: [], skeleton: null, updated_at: null, rigged: false,
    gameplay: { kind: w.kind },
  };
}

export type BagOwned = { element_id: string; count: number };
export type BagItems = {
  /** what the server says you own, as the Items tab lists it */
  owned: BagOwned[];
  /** the starter weapons listed after them (none with the link off) */
  starters: ForgeEntry[];
  /** the Items tab, in order */
  list: { id: string; count?: number }[];
};

/**
 * The bag's Items tab. Link off: exactly as before cq 234 (every owned
 * element the catalogue knows, nothing filtered or added). Link on:
 * placeholder weapons hidden, then the starter set, less any you also own
 * from the Forge under the same name (the same pack, imported).
 */
export function bagItems(m: AttachManifest, input: { entries: readonly ForgeEntry[]; owned: readonly BagOwned[]; linkOn: boolean }): BagItems {
  const { entries, linkOn } = input;
  const byId = new Map(entries.map((e) => [e.id, e]));
  const owned = input.owned.filter((o) => {
    const e = byId.get(o.element_id);
    return !!e && (!linkOn || !isPlaceholderWeapon(e));
  });
  const ownedNames = new Set(owned.map((o) => byId.get(o.element_id)?.name));
  const starters = linkOn
    ? starterSet(m)
        .map((w) => starterEntry(m, w.slug))
        .filter((e): e is ForgeEntry => !!e && !ownedNames.has(e.name))
    : [];
  return {
    owned,
    starters,
    list: [...owned.map((o) => ({ id: o.element_id, count: o.count })), ...starters.map((e) => ({ id: e.id }))],
  };
}

/** A Forge drop on the map: placeholders never drop with the link on. */
export function dropShown(d: { claimed: boolean; element_id: string }, entries: readonly ForgeEntry[], linkOn: boolean): boolean {
  if (d.claimed) return false;
  if (!linkOn) return true;
  const e = entries.find((x) => x.id === d.element_id);
  return !(e && isPlaceholderWeapon(e));
}
