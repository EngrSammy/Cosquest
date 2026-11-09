// Writes app/game3d/data/attach.json (cq 234): per cast character the hand
// bones and every weapon class's grip matrix, per class the pose, per
// weapon the bundled file. Run from app/:
//
//   node game3d/tools/weapons/make_attach.ts <cast dir> [<weapons out dir>]
//
// <cast dir> holds <slug>/lod1.glb for the cast (cq 060's pose set; Hoof's
// deck model has no rig, so it gets no grips and holds nothing).
// <weapons out dir> is build_weapons.py's --out (its build_report.json gives
// the weapons' sizes).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { type AttachManifest, computeAttach, staticAttach, type GripClass, type GripPose, readGlb, type WeaponInfo } from "../../../features/game3d/attach.ts";

const here = dirname(fileURLToPath(import.meta.url));
const [castDir, weaponsOut] = process.argv.slice(2);
if (!castDir) {
  console.error("usage: node game3d/tools/weapons/make_attach.ts <cast dir> [<weapons out dir>]");
  process.exit(2);
}

const grips = JSON.parse(readFileSync(join(here, "grips.json"), "utf8")) as Record<string, GripPose | string>;
const classes = Object.fromEntries(Object.entries(grips).filter(([k]) => !k.startsWith("_"))) as Record<GripClass, GripPose>;
const spec = JSON.parse(readFileSync(join(here, "weapons.json"), "utf8")) as { weapons: { slug: string; name: string; grip: GripClass; kind: string; length_m: number }[] };

// Static models (no skeleton): the right hand's grip point in model space
// (glTF, metres), read off front and side renders of the model.
const STATIC_HANDS: Record<string, { glb: string; palm: [number, number, number] }> = {
  hoof: { glb: "deck/hoof/lod1.glb", palm: [-0.455, 0.815, 0.035] },
};

// Characters whose model already holds something in the right hand: the
// weapon classes swap hands for them.
const MAIN_LEFT: Record<string, string> = {
  nebulx: "Her own orb staff is part of the model, in her right hand: weapons go in her left hand.",
};

// The cast (not the four likeness characters), their display names and the
// weapon each holds when the player has equipped none: the deck's own where
// the deck shows one (Armstrong's hammer, the staffs of Nebul-X, Crystal-Z
// and Hoof), else one class each so every class is seen.
const CAST: [string, string, string][] = [
  ["armstrong", "Armstrong", "forge_warhammer"],
  ["bobo", "Bobo", "war_axe"],
  ["catboy", "Cat-Boy", "rogue_dagger"],
  ["crystalz", "Crystal-Z", "arcane_staff"],
  ["elvis", "Elvis", "crown_greatsword"],
  ["hoof", "Hoof", "arcane_staff"],
  ["nebulx", "Nebul-X", ""],
  ["vanessa", "Vanessa", "repeater_rifle"],
];

const weapons: Record<string, WeaponInfo> = {};
for (const w of spec.weapons) {
  weapons[w.slug] = { name: w.name, grip: w.grip, kind: w.kind, file: `weapons/${w.slug}.glb`, thumb: `weapons/${w.slug}.png`, length_m: w.length_m };
}

const characters: AttachManifest["characters"] = {};
for (const [slug, name, def] of CAST) {
  if (STATIC_HANDS[slug]) {
    characters[slug] = {
      ...staticAttach(name, STATIC_HANDS[slug].palm, classes),
      rig: "none: cq060 deck model, static (the rig gate failed); the hand is a fixed point on the model",
      default_weapon: def || null,
      note: `model ${STATIC_HANDS[slug].glb}; no left hand, so no shield`,
    };
    console.log(slug, "static hand", JSON.stringify(STATIC_HANDS[slug].palm));
    continue;
  }
  const p = join(castDir, slug, "lod1.glb");
  if (!existsSync(p)) {
    console.error(`skip ${slug}: no ${p}`);
    continue;
  }
  const { json, bin } = readGlb(new Uint8Array(readFileSync(p)));
  const main = MAIN_LEFT[slug] ? "l" : "r";
  const a = computeAttach(json, name, classes, "cq060 pose set, humanoid-mixamo auto-rig (no finger bones); grips fitted to the idle clip's first frame", bin, main);
  if (a && MAIN_LEFT[slug]) a.note = MAIN_LEFT[slug];
  if (a) {
    characters[slug] = { ...a, default_weapon: def || null };
  } else {
    characters[slug] = {
      name, rig: "none (cq060 deck model, static: the rig gate failed)", bone_r: null, bone_l: null, grips: {}, default_weapon: null,
      note: "No skeleton, so no hand to hold a weapon: it fights empty-handed until it is rigged.",
    };
  }
  console.log(slug, a ? `${a.bone_r}/${a.bone_l} palm_r=${JSON.stringify(a.palm_r)}` : "no rig");
}

const out: AttachManifest & { _doc: string; generated_by: string } = {
  _doc: "Weapons in hand (cq 234). Per character: the hand bones and, per weapon class, the weapon root's transform in the hand bone's space (4x4, column-major, metres). Per class: the pose it was made from. Per weapon: the bundled default (app/assets/weapons). Read by the Godot fight (fighter.gd) and the Filament previews (features/game3d/attach.ts). docs/game3d/WEAPONS.md.",
  generated_by: "node game3d/tools/weapons/make_attach.ts",
  version: 1,
  classes,
  characters,
  weapons,
};
const dest = join(here, "..", "..", "data", "attach.json");
writeFileSync(dest, JSON.stringify(out, null, 1) + "\n");
if (weaponsOut) console.log("weapons from", weaponsOut);
console.log("wrote", dest);
