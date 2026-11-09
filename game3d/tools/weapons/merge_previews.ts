// The GLBs the Filament previews load (Forge bag, Wear list, versus card,
// avatar), made off the phone with the app's own code: for each cast
// character, heldFor() picks the weapon and mergeWeaponGlb() puts it under
// the hand bone, as heldDevice.heldGlb does on a phone. For evidence renders
// (tools/preview.gd). Run from app/:
//
//   node game3d/tools/weapons/merge_previews.ts <cq060 models dir> <out dir> [--pick <slug>]
//
// <cq060 models dir> holds pose/<slug>/lod1.glb (and deck/hoof/lod1.glb).
// Writes <out>/<slug>__plain.glb (as before cq 234) and <slug>__held.glb,
// and <out>/previews.json: each file's box as Filament fits it (sceneBox),
// for tools/preview.gd.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { type AttachManifest, gripFor, mergeWeaponGlb, readGlb, sceneBox } from "../../../features/game3d/attach.ts";
import { heldFor } from "../../../features/game3d/held.ts";

const [models, out] = process.argv.slice(2);
const pickAt = process.argv.indexOf("--pick");
const pick = pickAt > 0 ? process.argv[pickAt + 1] : null;
if (!models || !out) {
  console.error("usage: node game3d/tools/weapons/merge_previews.ts <models dir> <out dir> [--pick <slug>]");
  process.exit(2);
}
const app = new URL("../../../", import.meta.url);
const m = JSON.parse(readFileSync(new URL("game3d/data/attach.json", app), "utf8")) as AttachManifest;
mkdirSync(out, { recursive: true });
const plan: { glb: string; name: string; center: number[]; longest: number }[] = [];
const fit = (file: string, name: string) => {
  const b = sceneBox(readGlb(new Uint8Array(readFileSync(file))).json)!;
  plan.push({ glb: resolve(file), name, center: [0, 1, 2].map((k) => (b.lo[k] + b.hi[k]) / 2), longest: Math.max(...[0, 1, 2].map((k) => b.hi[k] - b.lo[k])) });
};
for (const [key, c] of Object.entries(m.characters)) {
  const src = join(models, key === "hoof" ? "deck" : "pose", key, "lod1.glb");
  let bytes: Uint8Array = new Uint8Array(readFileSync(src));
  copyFileSync(src, join(out, `${key}__plain.glb`));
  const pair = heldFor(m, { characterName: c.name, mine: !!pick, equipped: null, linkOn: true, localPick: pick });
  const got: string[] = [];
  for (const h of [pair.main, pair.offhand]) {
    if (!h?.slug) continue;
    const grip = gripFor(m, c.name, h.cls, readGlb(bytes).json);
    if (!grip) continue;
    bytes = mergeWeaponGlb(bytes, new Uint8Array(readFileSync(new URL(`assets/weapons/${h.slug}.glb`, app))), grip.bone, grip.matrix);
    got.push(`${h.name} (${h.cls}) on ${grip.bone || "the model"}`);
  }
  writeFileSync(join(out, `${key}__held.glb`), bytes);
  fit(join(out, `${key}__plain.glb`), `${key}__plain`);
  fit(join(out, `${key}__held.glb`), `${key}__held`);
  console.log(`${key}: ${got.join(" + ") || "her own staff (part of the model)"}`);
}
writeFileSync(join(out, "previews.json"), JSON.stringify(plan, null, 1));
