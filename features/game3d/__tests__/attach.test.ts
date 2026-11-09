import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { characterKey, computeAttach, findHandBones, globalMatrices, GRIP_CLASSES, gripClassOf, gripFor, IDENTITY, invert, mergeWeaponGlb, mul, nodeMatrix, poseAt, readGlb, sceneBox, staticAttach, type AttachManifest, type Gltf, writeGlb } from "../attach.ts";
import * as attachMod from "../attach.ts";
import { bagItems, catalogueFlag, catalogueOn, catalogueTwin, dropShown, heldFor, isPlaceholderWeapon, ownWeapon, realWeapons, STARTER, starterEntry, starterSet } from "../held.ts";

const manifest = JSON.parse(readFileSync(new URL("../../../game3d/data/attach.json", import.meta.url), "utf8")) as AttachManifest;

const near = (a: number[], b: number[], eps = 1e-4) => a.every((x, i) => Math.abs(x - b[i]) < eps);

/** A tiny skinned rig facing +Z: hips, a right arm hanging down-out, a left arm. */
function rig(): Gltf {
  return {
    scene: 0,
    scenes: [{ nodes: [0, 7] }],
    nodes: [
      { name: "Armature", children: [1] },
      { name: "Hips", translation: [0, 1, 0], children: [2, 4] },
      { name: "RightForeArm", translation: [-0.3, 0.2, 0], children: [3] },
      { name: "RightHand", translation: [-0.1, -0.25, 0], rotation: [0, 0, -0.9238795, 0.3826834] },
      { name: "LeftForeArm", translation: [0.3, 0.2, 0], children: [5] },
      { name: "LeftHand", translation: [0.1, -0.25, 0] },
      { name: "unused" },
      { name: "mesh", mesh: 0, skin: 0 },
    ],
    skins: [{ joints: [1, 2, 3, 4, 5] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  };
}

test("grip class: name words first, then the backend kind", () => {
  assert.equal(gripClassOf("Hunter's Crossbow", "bow"), "crossbow");
  assert.equal(gripClassOf("Repeater Rifle", "bow"), "rifle");
  assert.equal(gripClassOf("Knight's Round Shield", "gauntlet"), "shield");
  assert.equal(gripClassOf("Crown Greatsword", "blade"), "greatsword");
  assert.equal(gripClassOf("Storm Throwing Axe", "axe"), "axe");
  assert.equal(gripClassOf("Moonlit Katana", "blade"), "sword");
  assert.equal(gripClassOf("Something", "staff"), "staff");
  assert.equal(gripClassOf("Star Gauntlet Shield", "gauntlet"), "shield");
  assert.equal(gripClassOf(null, null), "sword");
});

test("character keys match the manifest's", () => {
  assert.equal(characterKey("Nebul-X"), "nebulx");
  assert.equal(characterKey("Cat-Boy"), "catboy");
  assert.equal(characterKey("Crystal-Z"), "crystalz");
  for (const k of Object.keys(manifest.characters)) assert.equal(characterKey(manifest.characters[k].name), k);
});

test("matrices: TRS, multiply, inverse", () => {
  const m = nodeMatrix({ translation: [1, 2, 3], rotation: [0, 0.7071068, 0, 0.7071068], scale: [2, 2, 2] });
  assert.ok(near(mul(m, invert(m)), IDENTITY));
  assert.ok(near(mul(IDENTITY, m), m));
});

test("hand bones are found by Mixamo and common names, joints only", () => {
  assert.deepEqual(findHandBones(rig()), { r: 3, l: 5 });
  const g = rig();
  g.nodes![3].name = "mixamorig:RightHand";
  g.nodes![5].name = "hand.L";
  assert.deepEqual(findHandBones(g), { r: 3, l: 5 });
  g.skins = [{ joints: [1, 2, 4] }];
  assert.equal(findHandBones(g).r, null);
});

test("every class gets a grip; the weapon keeps real size and sits at the palm", () => {
  const g = rig();
  const a = computeAttach(g, "Test", manifest.classes);
  assert.ok(a);
  assert.equal(a!.bone_r, "RightHand");
  assert.equal(a!.bone_l, "LeftHand");
  for (const c of GRIP_CLASSES) assert.ok(a!.grips[c], c);
  const H = globalMatrices(g).get(3)!;
  const W = mul(H, a!.grips.sword!.matrix);
  // unit axes (no scale) and the origin at the palm
  for (const c of [0, 1, 2]) assert.ok(Math.abs(Math.hypot(W[c * 4], W[c * 4 + 1], W[c * 4 + 2]) - 1) < 1e-4);
  assert.ok(near([W[12], W[13], W[14]], a!.palm_r!, 1e-3));
  // a staff stands up (its +Y close to world up)
  const S = mul(H, a!.grips.staff!.matrix);
  assert.ok(S[5] > 0.95, `staff up ${S[5]}`);
  // a sword points forward (+Z) more than sideways, and up a little
  assert.ok(W[6] > 0.7 && W[5] > 0.2, `sword ${W.slice(4, 7)}`);
  // the shield is on the left hand
  assert.equal(a!.grips.shield!.bone, "LeftHand");
});

test("swapping the main hand puts one-handed weapons on the left", () => {
  const a = computeAttach(rig(), "Test", manifest.classes, "t", null, "l");
  assert.equal(a!.grips.sword!.bone, "LeftHand");
  assert.equal(a!.grips.shield!.bone, "RightHand");
});

test("static models hold at a point on the model", () => {
  const a = staticAttach("Hoof", [-0.45, 0.8, 0.03], manifest.classes);
  assert.equal(a.grips.staff!.bone, "");
  assert.ok(near(a.grips.staff!.matrix.slice(12, 15), [-0.45, 0.8, 0.03]));
  assert.equal(a.grips.shield, undefined);
});

test("the manifest covers the cast and nothing else", () => {
  assert.deepEqual(Object.keys(manifest.characters).sort(), ["armstrong", "bobo", "catboy", "crystalz", "elvis", "hoof", "nebulx", "vanessa"]);
  for (const k of ["commando", "blade", "killua", "pmon"]) assert.equal(manifest.characters[k], undefined);
  for (const [k, c] of Object.entries(manifest.characters)) {
    assert.ok(c.grips.sword?.matrix.length === 16, k);
    if (c.default_weapon) assert.ok(manifest.weapons[c.default_weapon], `${k} default ${c.default_weapon}`);
  }
  assert.ok(Object.keys(manifest.weapons).length >= 8);
  for (const c of ["sword", "hammer", "staff", "rifle"]) assert.ok(Object.values(manifest.weapons).some((w) => w.grip === c), c);
  assert.equal(gripFor(manifest, "Armstrong", "hammer")?.bone, "RightHand");
  assert.equal(gripFor(manifest, "Nobody", "hammer"), null);
  assert.equal(gripFor(manifest, "Nobody", "hammer", rig())?.bone, "RightHand");
});

/** A GLB with one float accessor (positions) and a JSON body. */
function glb(json: Gltf, floats: number[]): Uint8Array {
  const bin = new Uint8Array(new Float32Array(floats).buffer);
  return writeGlb({ ...json, buffers: [{ byteLength: bin.length }] }, bin);
}

test("GLB read/write round trip", () => {
  const b = glb({ asset: { version: "2.0" }, nodes: [{ name: "a" }] }, [1, 2, 3]);
  const r = readGlb(b);
  assert.equal(r.json.nodes![0].name, "a");
  assert.deepEqual(Array.from(new Float32Array(r.bin.slice().buffer)), [1, 2, 3]);
  assert.throws(() => readGlb(new Uint8Array(20)));
});

test("the idle clip's first frame poses the rig", () => {
  const g = rig();
  g.accessors = [{ bufferView: 0, componentType: 5126, type: "VEC4" }];
  g.bufferViews = [{ buffer: 0, byteOffset: 0, byteLength: 16 }];
  g.animations = [{ name: "idle", channels: [{ sampler: 0, target: { node: 3, path: "rotation" } }], samplers: [{ input: 0, output: 0 }] }];
  const bin = new Uint8Array(new Float32Array([0, 0, 0, 1]).buffer);
  const posed = poseAt(g, bin);
  assert.deepEqual(posed.nodes![3].rotation, [0, 0, 0, 1]);
  assert.deepEqual(g.nodes![3].rotation, [0, 0, -0.9238795, 0.3826834]);
  assert.equal(poseAt(g, null), g);
});

test("merging puts the weapon under the hand bone with its own buffers", () => {
  const ch = glb(
    { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "Root", children: [1] }, { name: "RightHand" }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 1, type: "VEC3" }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 12 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }] },
    [0, 0, 0],
  );
  const wp = glb(
    { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "grip", children: [1] }, { name: "blade", mesh: 0 }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 1, type: "VEC3" }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 12 }],
      images: [{ bufferView: 0, mimeType: "image/png" }], textures: [{ source: 0, sampler: 0 }], samplers: [{}],
      materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }] },
    [7, 8, 9],
  );
  const m = [...IDENTITY];
  m[13] = 0.05;
  const out = readGlb(mergeWeaponGlb(ch, wp, "RightHand", m));
  const j = out.json;
  const hand = j.nodes![1];
  const holder = j.nodes![hand.children![0]];
  assert.equal(holder.name, "weapon_attach");
  assert.deepEqual(holder.matrix, m);
  assert.equal(j.nodes![holder.children![0]].name, "grip");
  const blade = j.nodes!.find((n) => n.name === "blade")!;
  assert.equal(blade.mesh, 1);
  const prim = (j.meshes as { primitives: { attributes: { POSITION: number }; material: number }[] }[])[1].primitives[0];
  assert.equal(prim.attributes.POSITION, 1);
  assert.equal(prim.material, 0);
  const acc = (j.accessors as { bufferView: number }[])[1];
  const view = (j.bufferViews as { byteOffset: number }[])[acc.bufferView];
  assert.deepEqual(Array.from(new Float32Array(out.bin.slice(view.byteOffset, view.byteOffset + 12).buffer)), [7, 8, 9]);
  assert.equal((j.textures as { source: number }[])[0].source, 0);
  assert.throws(() => mergeWeaponGlb(ch, wp, "LeftHand", m));
  // a static model: the weapon becomes a scene root
  const st = readGlb(mergeWeaponGlb(ch, wp, "", m)).json;
  assert.equal(st.scenes![0].nodes!.length, 2);
});

// ---------- held.ts ----------

const weapon = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    id: "w1", type: "weapon", name: "Moonlit Katana", version: 1, files: [], contract: 2, bounds_m: null, height_m: null, pivot: "grip",
    animations: [], skeleton: null, updated_at: null, gameplay: { kind: "blade" },
    thumbnail: { file: "t.png", url: "/t.png" },
    lods: [0, 1, 2].map((lod) => ({ lod, usdz: null, glb: { file: `k${lod}.glb`, url: `/k${lod}.glb`, bytes: 90000 - lod * 1000, sha256: `s${lod}` } })),
    ...over,
  }) as never;

test("the link needs both switches; the flag reads 1/true/on", () => {
  assert.equal(catalogueFlag("1"), true);
  assert.equal(catalogueFlag("on"), true);
  assert.equal(catalogueFlag(undefined), false);
  assert.equal(catalogueFlag("0"), false);
  assert.equal(catalogueOn(true, true), true);
  assert.equal(catalogueOn(true, false), false);
  assert.equal(catalogueOn(false, true), false);
});

test("the untextured placeholder blade is hidden; real weapons are not", () => {
  const ember = weapon({
    name: "Ember Blade", thumbnail: null,
    lods: [0, 1, 2].map((lod) => ({ lod, usdz: null, glb: { file: `e${lod}.glb`, url: "/e", bytes: 9760, sha256: "bc73" } })),
  });
  assert.equal(isPlaceholderWeapon(ember), true);
  assert.equal(isPlaceholderWeapon(weapon({ thumbnail: null, lods: [{ lod: 0, usdz: null, glb: { file: "x", url: "/x", bytes: 9000, sha256: "a" } }] })), true);
  assert.equal(isPlaceholderWeapon(weapon({ lods: [] })), true);
  assert.equal(isPlaceholderWeapon(weapon()), false);
  assert.equal(isPlaceholderWeapon(weapon({ type: "character", lods: [] })), false);
  assert.deepEqual(realWeapons([ember, weapon()]).map((e: { name: string }) => e.name), ["Moonlit Katana"]);
  assert.equal(catalogueTwin([weapon()], "Moonlit Katana") !== null, true);
});

test("who holds what", () => {
  // the cast hold their own: Armstrong the deck's hammer, Vanessa the rifle
  assert.equal(heldFor(manifest, { characterName: "Armstrong", mine: false, equipped: null, linkOn: true }).main?.cls, "hammer");
  assert.equal(heldFor(manifest, { characterName: "Vanessa", mine: false, equipped: null, linkOn: true }).main?.cls, "rifle");
  // someone the manifest doesn't know: a sword
  assert.equal(ownWeapon(manifest, "Street Kid")?.slug, "knight_sword");
  // the player's equipped Forge weapon, only with the link on
  const mineOn = heldFor(manifest, { characterName: "Armstrong", mine: true, equipped: weapon(), linkOn: true });
  assert.equal(mineOn.main?.source, "catalogue");
  assert.equal(mineOn.main?.cls, "sword");
  const mineOff = heldFor(manifest, { characterName: "Armstrong", mine: true, equipped: weapon(), linkOn: false });
  assert.equal(mineOff.main?.slug, "forge_warhammer");
  // someone else's avatar never shows my weapon
  assert.equal(heldFor(manifest, { characterName: "Armstrong", mine: false, equipped: weapon(), linkOn: true }).main?.source, "default");
  // a placeholder is never held
  const ember = weapon({ thumbnail: null, lods: [{ lod: 0, usdz: null, glb: { file: "e", url: "/e", bytes: 9760, sha256: "x" } }] });
  assert.equal(heldFor(manifest, { characterName: "Bobo", mine: true, equipped: ember, linkOn: true }).main?.slug, "war_axe");
  // the starter set pick, and a shield goes in the off hand with a one-hander
  assert.equal(heldFor(manifest, { characterName: "Bobo", mine: true, equipped: null, linkOn: true, localPick: "arcane_staff" }).main?.cls, "staff");
  // with the link off the starter set is not listed, so an old pick does not count
  assert.equal(heldFor(manifest, { characterName: "Bobo", mine: true, equipped: null, linkOn: false, localPick: "arcane_staff" }).main?.slug, "war_axe");
  const sh = heldFor(manifest, { characterName: "Bobo", mine: true, equipped: null, linkOn: true, localPick: "knight_shield" });
  assert.equal(sh.offhand?.cls, "shield");
  assert.equal(sh.main?.slug, "war_axe");
  const sh2 = heldFor(manifest, { characterName: "Armstrong", mine: true, equipped: null, linkOn: true, localPick: "knight_shield" });
  assert.equal(sh2.main?.slug, "knight_sword");
  assert.equal(starterSet(manifest).length, Object.keys(manifest.weapons).length);
});

test("the bag: link off lists what you own, as before; link on hides placeholders and adds the starter set", () => {
  const ember = weapon({
    id: "ember", name: "Ember Blade", thumbnail: null,
    lods: [0, 1, 2].map((lod) => ({ lod, usdz: null, glb: { file: `e${lod}.glb`, url: "/e", bytes: 9760, sha256: "bc73" } })),
  });
  const sword = weapon({ id: "ks", name: "Knight's Arming Sword" });
  const hero = weapon({ id: "h1", type: "character", name: "Armstrong", lods: [] });
  const entries = [ember, sword, hero];
  const owned = [{ element_id: "ember", count: 1 }, { element_id: "ks", count: 2 }, { element_id: "h1", count: 1 }, { element_id: "gone", count: 1 }];
  const off = bagItems(manifest, { entries, owned, linkOn: false });
  assert.deepEqual(off.list, [{ id: "ember", count: 1 }, { id: "ks", count: 2 }, { id: "h1", count: 1 }]);
  assert.equal(off.starters.length, 0);
  const on = bagItems(manifest, { entries, owned, linkOn: true });
  assert.deepEqual(on.owned.map((o) => o.element_id), ["ks", "h1"]);
  // nine starters less the sword you own from the Forge
  const n = starterSet(manifest).length;
  assert.equal(on.starters.length, n - 1);
  assert.ok(on.starters.every((e) => e.id.startsWith(STARTER) && e.type === "weapon" && e.name !== "Knight's Arming Sword"));
  assert.equal(on.list.length, 2 + n - 1);
  // a fresh install, placeholder-only catalogue: real weapons all the same
  const fresh = bagItems(manifest, { entries: [ember], owned: [{ element_id: "ember", count: 1 }], linkOn: true });
  assert.equal(fresh.list.length, n);
  assert.ok(fresh.starters.every((e) => !isPlaceholderWeapon(e)), "a starter is never mistaken for a placeholder");
  assert.equal(starterEntry(manifest, "nope"), null);
  // drops: placeholders never drop with the link on; off, as before
  assert.equal(dropShown({ claimed: false, element_id: "ember" }, entries, false), true);
  assert.equal(dropShown({ claimed: false, element_id: "ember" }, entries, true), false);
  assert.equal(dropShown({ claimed: false, element_id: "ks" }, entries, true), true);
  assert.equal(dropShown({ claimed: true, element_id: "ks" }, entries, false), false);
});

test("a held weapon does not move or shrink the character in a preview (the box Filament fits stays centred)", () => {
  // a 1.8 m character (box x -0.3..0.3, y 0..1.8) and a 1 m weapon along its +Y
  const ch = glb(
    { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "Root", children: [1, 2] }, { name: "RightHand", translation: [-0.3, 0.9, 0] }, { name: "body", mesh: 0 }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 2, type: "VEC3", min: [-0.3, 0, -0.15], max: [0.3, 1.8, 0.15] }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 24 }],
      materials: [{}], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }] },
    [-0.3, 0, -0.15, 0.3, 1.8, 0.15],
  );
  const wp = glb(
    { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "grip", children: [1] }, { name: "blade", mesh: 0 }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 2, type: "VEC3", min: [-0.05, -0.1, -0.02], max: [0.05, 0.6, 0.02] }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 24 }],
      materials: [{}], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }] },
    [-0.05, -0.1, -0.02, 0.05, 0.6, 0.02],
  );
  const before = sceneBox(readGlb(ch).json)!;
  // a long weapon held far to one side and forward
  const m = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, -0.3, 0, 0.1, 1]; // pointing forward (+Z) from the hand
  const out = readGlb(mergeWeaponGlb(ch, wp, "RightHand", m)).json;
  const raw = sceneBox(readGlb(mergeWeaponGlb(ch, wp, "RightHand", m)).json)!;
  assert.ok(raw.hi[2] > before.hi[2] + 0.4, "the weapon reaches forward past the body");
  const after = sceneBox(out)!;
  for (const k of [0, 2]) assert.ok(Math.abs((after.lo[k] + after.hi[k]) / 2 - (before.lo[k] + before.hi[k]) / 2) < 1e-4, `centre on axis ${k}`);
  assert.ok(Math.abs(after.hi[1] - after.lo[1] - 1.8) < 1e-4, "the height is untouched");
  // a reach so long that mirroring it would make the box longer than the character is tall: capped, nothing shrinks
  const far = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, -0.3, 0, 1.4, 1];
  const capped = sceneBox(readGlb(mergeWeaponGlb(ch, wp, "RightHand", far)).json)!;
  const longest = (b: { lo: number[]; hi: number[] }) => Math.max(...[0, 1, 2].map((k) => b.hi[k] - b.lo[k]));
  assert.ok(Math.abs(longest(capped) - Math.max(1.8, 1.4 + 0.6 + 0.15)) < 1e-3, "the longest side is the weapon's own reach, not more");
  const bal = out.nodes!.find((n) => n.name === "weapon_balance");
  assert.ok(bal, "the balance node is there");
  // zero-area: two of its three corners are the same point
  assert.equal((out.meshes as { primitives: { mode: number }[] }[]).at(-1)!.primitives[0].mode, 4);
});

// Build 18: the Ember Blade (1 m, curved) sat up past Armstrong's head in the
// Collection preview while the fight showed it in his hand. The preview merged
// with the idle-fitted grip (tip forward AND up the forearm); the fight holds
// with clip_grips. The preview now uses the fight's grip on the same bone.
test("previews hold a weapon as the fight does, and a long blade stays out of the face", () => {
  const { previewGripFor } = attachMod;
  for (const [key, ch] of Object.entries(manifest.characters)) {
    for (const cls of GRIP_CLASSES) {
      const base = gripFor(manifest, ch.name, cls);
      const got = previewGripFor(manifest, ch.name, cls);
      const clip = ch.clip_grips?.[cls];
      if (clip && base && clip.bone === base.bone) assert.deepEqual(got, clip, `${key} ${cls}`);
      else assert.deepEqual(got, base, `${key} ${cls} keeps its own grip (other bone or static)`);
    }
  }
  // Armstrong as served by staging (same file as game3d/cast/armstrong_lod0.glb):
  // a 1.01 m blade in his idle first frame, held with the preview grip.
  const { json, bin } = readGlb(new Uint8Array(readFileSync(new URL("../../../game3d/cast/armstrong_lod0.glb", import.meta.url))));
  const posed = poseAt(json, bin);
  const gm = globalMatrices(posed);
  const at = (name: string) => gm.get((posed.nodes ?? []).findIndex((n) => n.name === name))!;
  const tr = (m: number[], p: number[]) => [0, 1, 2].map((i) => m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2] + m[12 + i]);
  const headY = tr(at("Head"), [0, 0, 0])[1];
  const hand = at("RightHand");
  const rise = (g: { matrix: number[] }) => {
    const W = mul(hand, g.matrix);
    return tr(W, [0, 1.01, 0])[1] - tr(W, [0, 0, 0])[1];
  };
  const old = gripFor(manifest, "Armstrong", "sword")!;
  const now = previewGripFor(manifest, "Armstrong", "sword")!;
  const grip = tr(mul(hand, now.matrix), [0, 0, 0])[1];
  assert.ok(rise(old) > 0.6, `the old grip raised the tip ${rise(old).toFixed(2)} m (the bug)`);
  assert.ok(rise(now) < 0.4, `the tip rises ${rise(now).toFixed(2)} m`);
  assert.ok(grip + rise(now) < headY - 0.4, "the tip stays well below the head");
});
