// The three characters of a 3D fight as GLB files on this phone (cq 061),
// through cq 056's Forge cache (forgeWorldDevice): each model downloaded once
// per version and checked against its sha256. Glue, not unit tested; the
// choices themselves are pure (fight3d.ts pickCast, fightLod).
//
//   hero   the Forge avatar the player wears
//   ally   a squadded-up friend's worn hero (setup.ally), else another
//          published hero
//   enemy  the point's Guardian (a boss for a raid): the character a duel
//          start named (for a Siege, the holder's own worn hero with the
//          weapon they equipped), else the one the server would name here
//
// Anything missing (no Forge, offline, a download that fails or is slow) is
// an empty path, and Godot stands a mannequin in its place.
import { type ForgeEntry, forgeWorldOf, pickGlb } from "@/features/game/forgeWorld";
import { DEVICE_CLASS, ensureFile, forgeWorld, refreshCatalogue, refreshInventory } from "@/features/game/forgeWorldDevice";
import { gameStore } from "@/features/game/runtime";

import { fightLod, localPath, pickCast, wornAvatarId } from "./fight3d";
import { fightWeapons, heldInputs } from "./heldDevice";

/** `weaponId`: the Forge weapon this fighter holds (a Siege holder's own equipped one), else its own. */
export type CastMember = { path: string | null; name: string | null; id: string | null; weaponId?: string | null };
export type Cast = { hero: CastMember; ally: CastMember; enemy: CastMember; lod: number };

function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      },
    );
  });
}

async function fileOf(entry: ForgeEntry | null, lod: number): Promise<string | null> {
  if (!entry) return null;
  const f = pickGlb(entry, lod);
  return f ? ensureFile(entry, f) : null;
}

/**
 * The cast and their files. Waits at most `waitMs` for the catalogue and the
 * downloads (they are usually cached already: the versus card, the bag and
 * the avatar use the same files).
 */
export async function fightCast(opts: {
  pointId: string | null;
  role: "guardian" | "boss";
  enemyId?: string | null;
  enemyName?: string | null;
  /** A friend squadded up in person: their worn hero and their name over it. */
  ally?: { id: string | null; name: string } | null;
  /** The Forge weapon the opponent holds (a Siege holder's own equipped one). */
  enemyWeaponId?: string | null;
  lodOverride: number | null;
  waitMs?: number;
}): Promise<Cast> {
  const wait = opts.waitMs ?? 15000;
  // The catalogue and the bag, both fresh: the hero you wear now (a Wear a
  // moment ago, or on another phone) is the one you fight as.
  await within(Promise.all([refreshCatalogue(), refreshInventory()]), Math.min(wait, 5000), undefined);
  const s = forgeWorld.get();
  const avatarId = wornAvatarId(s.inventory, forgeWorldOf(gameStore.get().me));
  const { hero, ally, enemy } = pickCast(s.entries, { avatarId, enemyId: opts.enemyId, allyId: opts.ally?.id, role: opts.role, key: opts.pointId });
  const lod = fightLod(DEVICE_CLASS, opts.lodOverride);
  const [heroPath, allyPath, enemyPath] = await within(Promise.all([fileOf(hero, lod), fileOf(ally, lod), fileOf(enemy, lod)]), wait, [null, null, null] as (string | null)[]);
  const player = gameStore.playerName?.() || null;
  return {
    hero: { path: heroPath, name: player ?? hero?.name ?? null, id: hero?.id ?? null },
    ally: { path: allyPath, name: opts.ally?.name ?? ally?.name ?? null, id: ally?.id ?? null },
    enemy: { path: enemyPath, name: opts.enemyName ?? enemy?.name ?? null, id: enemy?.id ?? null, weaponId: opts.enemyWeaponId ?? null },
    lod,
  };
}

/**
 * Weapons in hand (cq 234): each fighter's <role>_weapon / <role>_offhand for
 * the Godot config ({glb, class, bone, matrix}, see app/game3d/fight.gd). The
 * hero holds the player's choice; the ally and the Guardian their own. Never
 * throws and never waits long: a fighter with nothing here fights
 * empty-handed, as before.
 */
export async function castWeapons(cast: Cast, waitMs = 4000): Promise<Record<string, unknown>> {
  const work = (async () => {
    const inputs = await heldInputs();
    const s = forgeWorld.get();
    const equipped = s.inventory?.equipped.weapon ?? forgeWorldOf(gameStore.get().me).equipped.weapon;
    const out: Record<string, unknown> = {};
    for (const role of ["hero", "ally", "enemy"] as const) {
      const m = cast[role];
      // A Siege holder's hero holds the weapon they equipped, as the player's own does.
      const theirs = role === "enemy" && m.weaponId ? m.weaponId : null;
      const w = await fightWeapons(forgeWorld.entry(m.id), m.path, role === "hero" || !!theirs, theirs ? { equipped: theirs, linkOn: inputs.linkOn, localPick: null } : { equipped, ...inputs }).catch(
        () => ({}) as Awaited<ReturnType<typeof fightWeapons>>,
      );
      if (w.main) out[`${role}_weapon`] = { ...w.main, glb: localPath(w.main.glb) };
      if (w.offhand) out[`${role}_offhand`] = { ...w.offhand, glb: localPath(w.offhand.glb) };
    }
    return out;
  })();
  return within(work, waitMs, {});
}
