// Relics and the Forge catalogue against the real STAGING game server, as a
// fresh throwaway player: choose a faction, claim the starter Relic, equip it,
// ask for a level it cannot afford (the server's refusal), read the Forge.
// Never production. Off unless asked for:
//
//   CQ_LIVE_STAGING=1 node --test features/game/__tests__/relics.live.test.ts
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { GameClient, GameError } from "../client.ts";
import { STAGING_GAME_SERVER } from "../config.ts";
import { fetchForgeCatalogue } from "../forge.ts";
import { Identity } from "../identity.ts";
import { claimStarterRelic, equipRelic, fetchRelics, levelRelic } from "../relics.ts";

const live = process.env.CQ_LIVE_STAGING === "1";

describe("relics on staging (live)", { skip: !live && "set CQ_LIVE_STAGING=1" }, () => {
  const identity = new Identity(randomBytes(32).toString("hex"), "device");
  const client = new GameClient({ baseUrl: STAGING_GAME_SERVER, identity: () => identity });

  it("a new player owns nothing and sees the whole catalogue", async () => {
    assert.match(client.baseUrl, /staging/);
    const p = await fetchRelics(client);
    assert.equal(p.owned.length, 0);
    assert.equal(p.equipped, null);
    assert.ok(p.catalogue.length > 0 && p.catalogue_size === p.catalogue.length);
    console.log(`catalogue: ${p.catalogue_size} relics`);
  });

  it("the starter needs a faction, then is granted once (idempotent)", async () => {
    await assert.rejects(claimStarterRelic(client), (e: unknown) => e instanceof GameError && e.status === 409 && /faction/i.test(e.message));
    await client.chooseFaction("gaming");
    const first = await claimStarterRelic(client);
    assert.ok(first);
    assert.equal(first.faction, "gaming");
    assert.equal(first.rarity, "common");
    const again = await claimStarterRelic(client);
    assert.equal(again?.id, first.id);
    const p = await fetchRelics(client);
    assert.equal(p.owned.length, 1);
    assert.equal(p.equipped, first.id, "a first Relic goes straight into the hand");
    console.log(`starter: ${first.name} (${first.kind}), power ${first.power_now}, next level ${first.next_level_cost} shards`);
  });

  it("equips what it owns; refuses what it does not, and a level it cannot pay for", async () => {
    const p = await fetchRelics(client);
    const mine = p.owned[0];
    assert.equal((await equipRelic(client, mine.id))?.id, mine.id);
    const notMine = p.catalogue.find((s) => s.id !== mine.id)!;
    await assert.rejects(equipRelic(client, notMine.id), (e: unknown) => {
      console.log(`equip not owned: ${(e as GameError).status} ${(e as GameError).message}`);
      return e instanceof GameError && e.status === 404;
    });
    await assert.rejects(levelRelic(client, mine.id), (e: unknown) => {
      console.log(`level: ${(e as GameError).status} ${(e as GameError).message}`);
      return e instanceof GameError && e.status === 409 && /shards/.test(e.message);
    });
    const me = await client.roamMe();
    assert.equal(me.features?.relics?.equipped?.id, mine.id);
  });

  it("reads the Forge's published weapons", async () => {
    const got = await fetchForgeCatalogue(client);
    console.log(`forge: ${got.source}, ${got.weapons.length} weapons: ${got.weapons.map((w) => `${w.name} (${w.rarity}, dmg ${w.stats?.damage})`).join(", ")}`);
    assert.ok(got.source === "network" || got.source === "unavailable");
  });
});
