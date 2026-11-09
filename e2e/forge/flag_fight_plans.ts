// Headless fight plans for the Forge catalogue link, both states (cq 234),
// built with the app's own rules (held.ts, attach.ts) from a LOCAL game
// backend, the way Fight3D's castWeapons builds the Godot config on a phone:
//
//   on:  a new player claims a real weapon near Trafalgar and equips it; the
//        hero (Armstrong, as served by /v1/catalogue) holds that file;
//   off: the same player, the app flag off: Armstrong holds his own
//        (the bundled Forge Warhammer), the catalogue is not read.
//
//   node e2e/forge/flag_fight_plans.ts --base http://127.0.0.1:47699 --dl <dir> --out <plans dir> --cast <dir with pose/ and deck/>
// Then: godot ... -s res://tools/shots.gd -- --plan=<plans dir>/flag_on.json (see docs/game3d/WEAPONS.md).
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { GameClient } from "../../app/features/game/client.ts";
import { claimDrop, equipForge, fetchCatalogue, fetchDrops, type ForgeEntry, FORGE_TYPES, forgeWorldOf, pickGlb } from "../../app/features/game/forgeWorld.ts";
import { Identity } from "../../app/features/game/identity.ts";
import { type AttachManifest, gripFor, readGlb } from "../../app/features/game3d/attach.ts";
import { catalogueOn, type Held, heldFor, isPlaceholderWeapon } from "../../app/features/game3d/held.ts";

const arg = (k: string, d = "") => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const base = arg("--base", "http://127.0.0.1:47699");
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error("LOCAL stack only");
const dl = resolve(arg("--dl", "/tmp/flag-dl"));
const out = resolve(arg("--out", "/tmp/flag-plans"));
const cast = resolve(arg("--cast"));
const app = new URL("../../app/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("game3d/data/attach.json", app), "utf8")) as AttachManifest;
mkdirSync(dl, { recursive: true });
mkdirSync(out, { recursive: true });

async function fetchTo(url: string, name: string): Promise<string> {
  const r = await fetch(new URL(url, base));
  if (r.status !== 200) throw new Error(`${url}: ${r.status}`);
  const p = join(dl, name);
  writeFileSync(p, new Uint8Array(await r.arrayBuffer()));
  return p;
}

const client = new GameClient({ baseUrl: base, identity: () => new Identity(id, "device") });
const id = randomBytes(32).toString("hex");
const me = forgeWorldOf((await client.roamMe()) as never);
const entries: ForgeEntry[] = (await fetchCatalogue(client, FORGE_TYPES, null)).elements;
const now = Date.now();
const drops = (await fetchDrops(client, 51.5074, -0.1278, 1000)).filter((d) => {
  const e = entries.find((x) => x.id === d.element_id);
  return e && e.type === "weapon" && !isPlaceholderWeapon(e) && !/hammer|shield/i.test(e.name) && (!d.expires_at || Date.parse(d.expires_at) > now + 10_000);
});
if (!drops.length) throw new Error("no real weapon drops near Trafalgar right now");
await claimDrop(client, drops[0].id, drops[0].lat, drops[0].lng);
await equipForge(client, "weapon", drops[0].element_id);
const equipped = entries.find((e) => e.id === drops[0].element_id)!;
const hero = entries.find((e) => e.type === "character" && e.name === "Armstrong")!;
const heroFile = await fetchTo(pickGlb(hero, 1)!.url, "armstrong_catalogue_lod1.glb");
const heroGlb = readGlb(new Uint8Array(readFileSync(heroFile))).json;

async function weaponOf(h: Held | null) {
  if (!h) return undefined;
  const file = h.source === "default" ? resolve(new URL(`assets/weapons/${h.slug}.glb`, app).pathname) : await fetchTo(pickGlb(h.entry!, 1)!.url, `${h.entry!.id}_lod1.glb`);
  const g = gripFor(manifest, "Armstrong", h.cls, heroGlb)!;
  return { glb: file, class: h.cls, bone: g.bone, matrix: g.matrix, name: h.name, source: h.source };
}

const shots = [
  { t: 0.6, name: "front", close: "front" },
  { t: 0.63, name: "side", close: "side" },
  { t: 0.67, name: "full", close: "full" },
  { t: 1.6, name: "attack" },
  { t: 2.6, name: "fight" },
];
const own = (k: string) => manifest.characters[k].default_weapon!;
for (const appFlag of [true, false]) {
  const linkOn = catalogueOn(appFlag, me.on);
  const pair = heldFor(manifest, { characterName: "Armstrong", mine: true, equipped, linkOn });
  const w = await weaponOf(pair.main);
  const cfg = {
    hero_glb: appFlag ? heroFile : join(cast, "pose/armstrong/lod1.glb"),
    ally_glb: join(cast, "pose/vanessa/lod1.glb"),
    enemy_glb: join(cast, "deck/hoof/lod1.glb"),
    hero_name: "Armstrong", ally_name: "Vanessa", enemy_name: "Hoof", point_name: "Trafalgar Square",
    hero_key: "armstrong", ally_key: "vanessa", enemy_key: "hoof",
    seed: 234, render_scale: 1.0, duration_s: 45, load_thread: false,
    hero_weapon: w,
    ally_weapon: { glb: resolve(new URL(`assets/weapons/${own("vanessa")}.glb`, app).pathname), class: "rifle" },
    enemy_weapon: { glb: resolve(new URL(`assets/weapons/${own("hoof")}.glb`, app).pathname), class: "staff" },
  };
  const name = appFlag ? "flag_on" : "flag_off";
  const plan = {
    config: cfg,
    input: [{ t: 0.0, face: 200 }, { t: 1.0, stick: [0, 1] }, { t: 1.4, stick: [0, 0] }, { t: 1.5, attack: true }, { t: 2.0, attack: true }],
    shots: shots.map((s) => ({ ...s, name: `${name}_${s.name}` })),
    quit_s: 2.8,
  };
  writeFileSync(join(out, `${name}.json`), JSON.stringify(plan));
  console.log(`${name}: server forge_world=${me.on}, app flag=${appFlag}, link=${linkOn}: Armstrong holds ${w?.name} (${w?.source}, ${w?.class}) from ${w?.glb.replace(dl, "<dl>")}`);
}
