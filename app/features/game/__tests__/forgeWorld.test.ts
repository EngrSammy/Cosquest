// Forge in the world (cq 056): the contract-2 catalogue as the app reads it
// (and an old server's catalogue, which must still work), the delta merge,
// LOD by device class, clip fallbacks, and the drops / bag / claim bodies.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  avatarChoices,
  boundsOf,
  clipIndex,
  deviceClassOf,
  fighterCharacter,
  fighterWeapon,
  forgeWorldOf,
  liveDrops,
  mergeCatalogue,
  parseCatalogueUpdate,
  parseClaim,
  parseDrops,
  parseForgeEntry,
  parseInventory,
  pickGlb,
  pointForge,
  wantedLod,
} from "../forgeWorld.ts";

// What staging served on 2026-10-21 (contract 1): no lods, a min/max box.
const OLD = {
  bounds_m: [
    [-0.7547, 0.0, -0.7549],
    [0.7547, 3.5, 0.7549],
  ],
  files: [
    { bytes: 2910752, file: "c__lod0.glb", lod: 0, sha256: "aa", url: "/v1/catalogue/files/x/1/c__lod0.glb" },
    { bytes: 3708447, file: "c__lod0.usdz", lod: 0, sha256: "ab", url: "/v1/catalogue/files/x/1/c__lod0.usdz" },
    { bytes: 907484, file: "c__lod1.glb", lod: 1, sha256: "ba", url: "/v1/catalogue/files/x/1/c__lod1.glb" },
    { bytes: 242408, file: "c__lod2.glb", lod: 2, sha256: "ca", url: "/v1/catalogue/files/x/1/c__lod2.glb" },
  ],
  id: "x",
  name: "Celestial Compass Monument",
  rarity: "common",
  rigged: null,
  role: null,
  stats: { place_kind: "museum" },
  type: "station",
  version: 1,
};

const HERO = {
  id: "h",
  type: "character",
  name: "Street Kid",
  version: 2,
  role: "hero",
  rigged: true,
  files: [{ file: "k__lod1.glb", lod: 1, url: "/u/k__lod1.glb", sha256: "11" }],
  contract: 2,
  lods: [
    { lod: 0, glb: { file: "k__lod0.glb", url: "/u/k__lod0.glb", bytes: 5, sha256: "00" }, usdz: null },
    { lod: 1, glb: { file: "k__lod1.glb", url: "/u/k__lod1.glb", bytes: 4, sha256: "11" }, usdz: null },
    { lod: 2, glb: { file: "k__lod2.glb", url: "/u/k__lod2.glb", bytes: 3, sha256: "22" }, usdz: null },
  ],
  scale: { bounds_m: [0.9, 1.8, 0.4], height_m: 1.8, units: "m", up: "+Y" },
  pivot: "base-centre",
  animations: [
    { name: "idle", duration_s: 2, loop: true },
    { name: "walk", duration_s: 1, loop: true },
    { name: "celebrate", duration_s: 2, loop: false },
  ],
  skeleton: "humanoid-mixamo",
  gameplay: { role: "hero", avatar: true, clips: ["idle", "walk", "celebrate"] },
  updated_at: "2026-10-21T10:00:00+00:00",
};

describe("parseForgeEntry", () => {
  it("reads an old server's entry: LODs from files, size from the min/max box, defaults by type", () => {
    const e = parseForgeEntry(OLD);
    assert.ok(e);
    assert.equal(e.contract, 1);
    assert.deepEqual(
      e.lods.map((l) => [l.lod, l.glb?.file ?? null, l.usdz?.file ?? null]),
      [
        [0, "c__lod0.glb", "c__lod0.usdz"],
        [1, "c__lod1.glb", null],
        [2, "c__lod2.glb", null],
      ],
    );
    assert.deepEqual(e.bounds_m?.map((x) => Math.round(x * 1000) / 1000), [1.509, 3.5, 1.51]);
    assert.equal(e.height_m, 3.5);
    assert.equal(e.pivot, "base-centre");
    assert.equal(e.rigged, false);
    assert.deepEqual(e.animations, []);
  });

  it("reads contract 2: lods, clips, gameplay, rigged", () => {
    const e = parseForgeEntry(HERO);
    assert.ok(e);
    assert.equal(e.contract, 2);
    assert.equal(e.lods.length, 3);
    assert.equal(e.height_m, 1.8);
    assert.equal(e.rigged, true);
    assert.equal(e.gameplay.avatar, true);
    assert.deepEqual(
      e.animations.map((a) => [a.name, a.loop]),
      [
        ["idle", true],
        ["walk", true],
        ["celebrate", false],
      ],
    );
  });

  it("does not believe rigged without an idle clip", () => {
    const e = parseForgeEntry({ ...HERO, animations: [{ name: "dance", duration_s: 1, loop: true }] });
    assert.equal(e?.rigged, false);
  });

  it("derives a weapon's kind from its name when the server has none, and drops junk", () => {
    const w = parseForgeEntry({ id: "w", type: "weapon", name: "Storm Throwing Axe", version: 1, files: [], stats: { damage: 16 } });
    assert.equal(w?.gameplay.kind, "axe");
    assert.equal(w?.gameplay.damage, 16);
    assert.equal(w?.pivot, "grip");
    assert.equal(parseForgeEntry({ id: "w", type: "weapon", name: "x" }), null);
    assert.equal(parseForgeEntry(null), null);
  });

  it("accepts a flat size and refuses nonsense bounds", () => {
    assert.deepEqual(boundsOf({ scale: { bounds_m: [1, 2, 3] } }), [1, 2, 3]);
    assert.equal(boundsOf({ bounds_m: [1, -2, 3] }), null);
    assert.equal(boundsOf({ bounds_m: "big" }), null);
  });
});

describe("catalogue polling", () => {
  it("parses an update with removed ids and a cursor", () => {
    const u = parseCatalogueUpdate({ contract: 2, cursor: "c1", elements: [HERO, { bad: 1 }], removed: ["gone", 7] });
    assert.equal(u.elements.length, 1);
    assert.deepEqual(u.removed, ["gone"]);
    assert.equal(u.cursor, "c1");
    assert.throws(() => parseCatalogueUpdate({ nope: true }));
  });

  it("merges a delta: new in, newer version replaces, removed out; a full answer replaces all", () => {
    const a = parseForgeEntry(OLD)!;
    const h1 = parseForgeEntry({ ...HERO, version: 1, updated_at: "2026-10-20T00:00:00Z" })!;
    const h2 = parseForgeEntry(HERO)!;
    const gone = parseForgeEntry({ ...OLD, id: "gone", name: "Gone" })!;
    const merged = mergeCatalogue([a, h1, gone], { elements: [h2], removed: ["gone"], cursor: null, contract: 2 }, false);
    assert.deepEqual(
      merged.map((e) => [e.id, e.version]),
      [
        ["h", 2],
        ["x", 1],
      ],
    );
    assert.deepEqual(
      mergeCatalogue(merged, { elements: [a], removed: [], cursor: null, contract: 2 }, true).map((e) => e.id),
      ["x"],
    );
  });
});

describe("LOD by device", () => {
  it("classes phones and picks the wanted LOD", () => {
    assert.equal(deviceClassOf({ pixelRatio: 1.5, width: 360, height: 640 }), "low");
    assert.equal(deviceClassOf({ pixelRatio: 2.625, width: 411, height: 891 }), "mid");
    assert.equal(deviceClassOf({ pixelRatio: 3, width: 430, height: 932 }), "high");
    assert.equal(deviceClassOf({ pixelRatio: 3, width: 430, height: 932, override: "low" }), "low");
    assert.equal(wantedLod("high", "closeup"), 0);
    assert.equal(wantedLod("low", "closeup"), 1);
    assert.equal(wantedLod("low", "scene"), 2);
    assert.equal(wantedLod("high", "thumb"), 2);
  });

  it("falls back to the nearest lighter LOD, then heavier", () => {
    const e = parseForgeEntry(OLD)!;
    assert.equal(pickGlb(e, 1)?.file, "c__lod1.glb");
    const only0 = { lods: [{ lod: 0, glb: { file: "a.glb", url: "/a" }, usdz: null }] };
    assert.equal(pickGlb(only0, 2)?.file, "a.glb");
    const gap = { lods: [0, 2].map((lod) => ({ lod, glb: { file: `${lod}.glb`, url: "/" }, usdz: null })) };
    assert.equal(pickGlb(gap, 1)?.file, "2.glb");
    assert.equal(pickGlb({ lods: [] }, 0), null);
  });
});

describe("clips", () => {
  it("finds a clip by name with fallbacks to idle, then the first", () => {
    const names = ["idle", "walk", "celebrate"];
    assert.equal(clipIndex(names, "walk"), 1);
    assert.equal(clipIndex(names, "celebrate"), 2);
    assert.equal(clipIndex(names, "dance"), 0);
    assert.equal(clipIndex(["Armature|walk", "Armature|idle"], "idle"), 1);
    assert.equal(clipIndex(["run"], "walk"), 0);
    assert.equal(clipIndex([], "idle"), -1);
  });
});

describe("the world", () => {
  it("is off unless /me says it is on", () => {
    assert.equal(forgeWorldOf(null).on, false);
    assert.equal(forgeWorldOf({ features: {} }).on, false);
    const on = forgeWorldOf({ features: { forge_world: { on: true, equipped: { weapon: "w", avatar: null }, owned_count: 3 } } });
    assert.deepEqual(on, { on: true, equipped: { weapon: "w", avatar: null }, owned_count: 3 });
  });

  it("parses drops and keeps only live, unclaimed ones", () => {
    const drops = parseDrops({
      drops: [
        { id: "F1", element_id: "w", version: 1, name: "Axe", rarity: "rare", type: "weapon", lat: 51.5, lng: -0.12, expires_at: "2026-10-21T10:30:00Z", claimed: false },
        { id: "F2", element_id: "w", lat: 51.5, lng: -0.12, expires_at: "2026-10-21T09:00:00Z" },
        { id: "F3", element_id: "w", lat: 51.5, lng: -0.12, claimed: true },
        { id: "bad", lat: "x" },
      ],
    });
    assert.equal(drops.length, 3);
    assert.deepEqual(
      liveDrops(drops, Date.parse("2026-10-21T10:00:00Z")).map((d) => d.id),
      ["F1"],
    );
    assert.deepEqual(parseDrops(null), []);
  });

  it("parses the bag and a claim", () => {
    const inv = parseInventory({ owned: [{ element_id: "w", name: "Axe", type: "weapon", count: 2 }, { nope: 1 }], equipped: { weapon: "w" } });
    assert.equal(inv.owned.length, 1);
    assert.equal(inv.equipped.weapon, "w");
    assert.equal(inv.equipped.avatar, null);
    const c = parseClaim({ reward: { element: HERO, duplicate: true, coins: 25 }, inventory: { owned: [], equipped: {} } });
    assert.equal(c.element?.id, "h");
    assert.equal(c.duplicate, true);
    assert.equal(c.coins, 25);
    assert.ok(c.inventory);
  });

  it("reads a point's station or environment, and a fighter's Forge art", () => {
    assert.deepEqual(pointForge({ forge: { station: { element_id: "s", version: 1 } } }), { station: { element_id: "s", version: 1 }, environment: null, guardian: null });
    assert.deepEqual(pointForge({ id: "p" }), { station: null, environment: null, guardian: null });
    assert.deepEqual(fighterCharacter({ character: { element_id: "c", version: 2, name: "Knight" } }), { element_id: "c", version: 2 });
    assert.equal(fighterCharacter({ character: null }), null);
    assert.deepEqual(fighterWeapon({ forge_weapon: { element_id: "w", version: 1, name: "Axe", kind: "axe" } }), { element_id: "w", version: 1, name: "Axe", kind: "axe" });
  });

  it("offers heroes as avatars, not guardians", () => {
    const hero = parseForgeEntry(HERO)!;
    const guard = parseForgeEntry({ ...HERO, id: "g", role: "guardian", gameplay: { role: "guardian" } })!;
    assert.deepEqual(
      avatarChoices([guard, hero]).map((e) => e.id),
      ["h"],
    );
  });
});
