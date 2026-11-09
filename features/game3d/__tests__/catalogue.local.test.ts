// The Forge catalogue link (cq 234) against a LOCAL game backend, both flag
// states, no phone: what the bag lists, what each cast character holds, and
// that the held weapon merges under the hand bone of the character file the
// server serves (the Filament path; Godot reads the same bone and matrix).
// Never staging, never production. Off unless asked for:
//
//   CQ_LOCAL_GAME=http://127.0.0.1:47699 CQ_LOCAL_EXPECT=placeholder-only|full \
//     [CQ_LOCAL_GAME_OFF=http://127.0.0.1:47698] node --test features/game3d/__tests__/catalogue.local.test.ts
//
// CQ_LOCAL_GAME has the server's forge_world ON; CQ_LOCAL_GAME_OFF (optional)
// is the same database with forge_world OFF. CQ_LOCAL_EXPECT says what was
// imported (tools/forge_import.py): only the untextured Ember Blade, or the
// nine cq 234 weapons and the eight cast characters as well.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { GameClient } from "../../game/client.ts";
import { claimDrop, equipForge, fetchCatalogue, fetchDrops, fetchInventory, type ForgeEntry, forgeWorldOf, FORGE_TYPES, pickGlb } from "../../game/forgeWorld.ts";
import { Identity } from "../../game/identity.ts";
import { type AttachManifest, findHandBones, gripFor, mergeWeaponGlb, readGlb } from "../attach.ts";
import { bagItems, catalogueOn, heldFor, isPlaceholderWeapon, realWeapons, starterSet } from "../held.ts";

const BASE = process.env.CQ_LOCAL_GAME ?? "";
const BASE_OFF = process.env.CQ_LOCAL_GAME_OFF ?? "";
const EXPECT = process.env.CQ_LOCAL_EXPECT ?? "full";
const local = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE);

const appDir = new URL("../../../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("game3d/data/attach.json", appDir), "utf8")) as AttachManifest;
const bundled = (slug: string) => new Uint8Array(readFileSync(new URL(`assets/weapons/${slug}.glb`, appDir)));
const CAST = ["Armstrong", "Bobo", "Cat-Boy", "Crystal-Z", "Elvis", "Hoof", "Nebul-X", "Vanessa"];
const count = (g: Record<string, unknown>, k: string) => (Array.isArray(g[k]) ? (g[k] as unknown[]).length : 0);
const LIKENESS = ["Commando", "Blade", "Killua", "P-Mon"];

async function bytesOf(base: string, url: string): Promise<Uint8Array> {
  const r = await fetch(new URL(url, base));
  assert.equal(r.status, 200, url);
  return new Uint8Array(await r.arrayBuffer());
}

describe("the Forge catalogue link on a LOCAL stack", { skip: !local && "set CQ_LOCAL_GAME=http://127.0.0.1:<port>" }, () => {
  const identity = new Identity(randomBytes(32).toString("hex"), "device");
  const client = new GameClient({ baseUrl: BASE, identity: () => identity });
  let entries: ForgeEntry[] = [];

  it("the server's forge_world is on and the catalogue answers", async () => {
    const me = await client.roamMe();
    assert.equal(forgeWorldOf(me as never).on, true);
    entries = (await fetchCatalogue(client, FORGE_TYPES, null)).elements;
    const weapons = entries.filter((e) => e.type === "weapon");
    console.log(`catalogue: ${entries.length} entries, weapons: ${weapons.map((w) => `${w.name}${isPlaceholderWeapon(w) ? " (placeholder)" : ""}`).join(", ")}`);
    assert.ok(weapons.some((w) => w.name === "Ember Blade" && isPlaceholderWeapon(w)), "the untextured Ember Blade is there and is recognised as a placeholder");
    assert.ok(!entries.some((e) => LIKENESS.includes(e.name)), "no likeness character in this catalogue");
  });

  it("app flag ON: the placeholder is hidden and the bag still has real weapons", async () => {
    const linkOn = catalogueOn(true, true);
    const real = realWeapons(entries);
    if (EXPECT === "placeholder-only") assert.equal(real.length, 0);
    else assert.ok(real.length >= 9, `nine cq 234 weapons published, got ${real.length}`);
    const bag = bagItems(manifest, { entries, owned: [], linkOn });
    assert.equal(bag.list.length, starterSet(manifest).length, "a new player's bag: the starter set");
    assert.ok(bag.list.every((x) => !entries.find((e) => e.id === x.id && isPlaceholderWeapon(e))));
    for (const name of CAST) {
      const pair = heldFor(manifest, { characterName: name, mine: false, equipped: null, linkOn });
      // Nebul-X holds her own orb staff (part of her model); everyone else a bundled weapon
      if (name === "Nebul-X") assert.equal(pair.main, null);
      else assert.equal(pair.main?.source, "default", name);
    }
  });

  it("every bundled default is textured, and is the same file the catalogue serves as LOD0", async () => {
    for (const { slug, name } of starterSet(manifest)) {
      const g = readGlb(bundled(slug)).json;
      assert.ok(count(g, "images") >= 1 && count(g, "textures") >= 1, `${slug} embeds its texture`);
      const twin = entries.find((e) => e.type === "weapon" && e.name === name);
      if (EXPECT === "placeholder-only") {
        assert.equal(twin, undefined);
        continue;
      }
      assert.ok(twin, `${name} is in the catalogue`);
      const lod0 = pickGlb(twin, 0)!;
      assert.equal(lod0.sha256, createHash("sha256").update(bundled(slug)).digest("hex"), `${slug}: bundled = catalogue LOD0`);
    }
  });

  it("the held weapon merges under the hand bone of each cast character the server serves", { skip: EXPECT !== "full" && "cast not imported" }, async () => {
    for (const name of CAST) {
      const ch = entries.find((e) => e.type === "character" && e.name === name);
      assert.ok(ch, `${name} published`);
      const file = pickGlb(ch, 1) ?? pickGlb(ch, 0)!;
      const chBytes = await bytesOf(BASE, file.url);
      const own = heldFor(manifest, { characterName: name, mine: false, equipped: null, linkOn: true });
      // Nebul-X: what an equipped weapon would do (her left hand)
      const h = own.main ?? heldFor(manifest, { characterName: name, mine: true, equipped: null, linkOn: true, localPick: "knight_sword" }).main!;
      const grip = gripFor(manifest, name, h.cls, readGlb(chBytes).json);
      assert.ok(grip, `${name}: a grip for ${h.cls}`);
      const out = readGlb(mergeWeaponGlb(chBytes, bundled(h.slug!), grip.bone, grip.matrix)).json;
      const hands = findHandBones(out);
      const bone = grip.bone ? out.nodes!.findIndex((n) => n.name === grip.bone) : -1;
      if (grip.bone) {
        assert.ok(bone >= 0 && [hands.r, hands.l].includes(bone), `${name}: ${grip.bone} is a hand`);
        const kids = out.nodes![bone].children ?? [];
        const holder = kids.find((k) => out.nodes![k].name === "weapon_attach");
        assert.ok(holder !== undefined, `${name}: the weapon hangs off ${grip.bone}`);
        assert.deepEqual(out.nodes![holder].matrix, grip.matrix, `${name}: with the manifest's grip matrix`);
        assert.ok((out.nodes![holder].children ?? []).some((k) => out.nodes![k].name === "grip"), `${name}: the weapon's grip node under it`);
      } else {
        assert.equal(name, "Hoof", "only Hoof (no skeleton) has a fixed socket");
      }
      assert.ok(count(out, "images") > count(readGlb(chBytes).json, "images"), `${name}: the weapon's texture came along`);
      console.log(`${name}: ${h.name} (${h.cls}) on ${grip.bone || "the model"}`);
    }
  });

  it("a real weapon claimed and equipped is held by the player's avatar with the link on, not with it off", { skip: EXPECT !== "full" && "no real weapon to claim" }, async () => {
    const lat = 51.5074;
    const lng = -0.1278;
    const now = Date.now();
    const drops = (await fetchDrops(client, lat, lng, 1000)).filter((d) => {
      const e = entries.find((x) => x.id === d.element_id);
      return e && e.type === "weapon" && !isPlaceholderWeapon(e) && (!d.expires_at || Date.parse(d.expires_at) > now + 10_000);
    });
    assert.ok(drops.length > 0, "a real weapon drops near Trafalgar");
    const d = drops[0];
    const got = await claimDrop(client, d.id, d.lat, d.lng);
    assert.equal(got.element?.id, d.element_id);
    await equipForge(client, "weapon", d.element_id);
    const inv = await fetchInventory(client);
    assert.equal(inv.equipped.weapon, d.element_id);
    const me = forgeWorldOf((await client.roamMe()) as never);
    assert.equal(me.equipped.weapon, d.element_id);
    const equipped = entries.find((e) => e.id === d.element_id)!;
    const on = heldFor(manifest, { characterName: "Armstrong", mine: true, equipped, linkOn: catalogueOn(true, me.on) });
    // a shield goes in the off hand (with a sword in the main hand); anything else in the main hand
    const held = /shield/i.test(equipped.name) ? on.offhand : on.main;
    assert.equal(held?.source, "catalogue");
    assert.equal(held?.entry?.id, equipped.id);
    const off = heldFor(manifest, { characterName: "Armstrong", mine: true, equipped, linkOn: catalogueOn(false, me.on) });
    assert.equal(off.main?.slug, "forge_warhammer", "app flag off: his own hammer, as before");
    assert.equal(off.offhand, null);
    const bagOn = bagItems(manifest, { entries, owned: inv.owned, linkOn: true });
    assert.equal(bagOn.list[0].id, equipped.id, "what you own first");
    assert.ok(!bagOn.starters.some((s) => s.name === equipped.name), "its starter twin is not listed twice");
    const bagOff = bagItems(manifest, { entries, owned: inv.owned, linkOn: false });
    assert.deepEqual(bagOff.list, inv.owned.map((o) => ({ id: o.element_id, count: o.count })), "app flag off: the bag is the server's list");
    console.log(`claimed and equipped ${equipped.name}: held with the link on, Forge Warhammer with it off`);
  });

  it("the server's forge_world OFF: the link is off whatever the app flag says, and the bag is as before", { skip: !BASE_OFF && "set CQ_LOCAL_GAME_OFF" }, async () => {
    const off = new GameClient({ baseUrl: BASE_OFF, identity: () => identity });
    const me = forgeWorldOf((await off.roamMe()) as never);
    assert.equal(me.on, false);
    assert.equal(catalogueOn(true, me.on), false);
    const r = await fetch(`${BASE_OFF}/v1/roam/forge/inventory?device_key=${off.deviceKey()}`);
    assert.equal(r.status, 404, "the forge routes answer as if they did not exist");
    const bag = bagItems(manifest, { entries: [], owned: [], linkOn: catalogueOn(true, me.on) });
    assert.deepEqual(bag.list, []);
    // the cast still hold their own weapons (weapons in hand are not behind the flag)
    assert.equal(heldFor(manifest, { characterName: "Vanessa", mine: true, equipped: null, linkOn: false }).main?.cls, "rifle");
  });
});
