// Friends against the real STAGING game server: two throwaway players meet
// at one spot, one shows a code, the other types it; then a gift crosses.
// Only calls a normal player makes. Never production. Off unless asked for:
//
//   CQ_LIVE_STAGING=1 node --test features/game/__tests__/friends.live.test.ts
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { GameClient, GameError } from "../client.ts";
import { STAGING_GAME_SERVER } from "../config.ts";
import { createFriendsModel } from "../friends.ts";
import { Identity } from "../identity.ts";

const live = process.env.CQ_LIVE_STAGING === "1";
const HERE = { lat: 51.5074, lng: -0.1278 };
// About 5 km north: well past the server's 100 m.
const AWAY = { lat: 51.5524, lng: -0.1278 };

describe("friends on staging (live)", { skip: !live && "set CQ_LIVE_STAGING=1" }, () => {
  const a = new Identity(randomBytes(32).toString("hex"), "device");
  const b = new Identity(randomBytes(32).toString("hex"), "device");
  const ca = new GameClient({ baseUrl: STAGING_GAME_SERVER, identity: () => a });
  const cb = new GameClient({ baseUrl: STAGING_GAME_SERVER, identity: () => b });
  let bHere = AWAY;
  const ma = createFriendsModel({ client: () => ca, here: () => HERE });
  const mb = createFriendsModel({ client: () => cb, here: () => bHere });

  it("a code, refused from afar, accepted beside, then a gift", { timeout: 60000 }, async () => {
    assert.match(ca.baseUrl, /staging/);
    await ca.saveProfile("TS Friend A", { face: 1, mark: 1, tint: "#3FA7D6" });
    await cb.saveProfile("TS Friend B", { face: 2, mark: 1, tint: "#33C773" });

    await ma.makeCode();
    const code = ma.get().code?.code ?? "";
    console.log(`[live friends] code ${code}, ttl ${ma.get().code?.ttl_s}s`);
    assert.match(code, /^[A-HJKMNP-Z2-9]{6}$/);

    await ma.add(code);
    console.log(`[live friends] own code: ${ma.get().message}`);
    assert.equal(ma.get().message, "That's your own code. Show it to a friend.");

    assert.equal(await mb.add(code), null);
    console.log(`[live friends] from 5 km: ${mb.get().message}`);
    assert.equal(mb.get().message, "Friends are added in person. Stand next to them and try again.");

    bHere = HERE;
    const added = await mb.add(code.toLowerCase());
    console.log(`[live friends] beside: ${JSON.stringify(added)}`);
    assert.equal(added?.added, true);
    assert.equal(added?.friend_key, a.publicKeyHex);
    assert.equal(mb.get().message, "You and TS Friend A are now friends!");

    await ma.refresh();
    const f = ma.get().payload?.friends.find((x) => x.friend_key === b.publicKeyHex);
    console.log(`[live friends] A's list: ${JSON.stringify(ma.get().payload)}`);
    assert.ok(f, "B is in A's list");
    assert.equal(f.can_gift_today, true);

    assert.equal(await ma.gift(f), true);
    assert.equal(ma.canGift(ma.get().payload!.friends[0]), false);
    assert.equal(await ma.gift(f), false);
    console.log(`[live friends] second gift: ${ma.get().message}`);

    await mb.refresh();
    assert.equal(mb.pending(), 1);
    const gifts = await mb.claim();
    console.log(`[live friends] B opened: ${JSON.stringify(gifts)}`);
    assert.equal(gifts?.length, 1);
    assert.equal(gifts?.[0].from, "TS Friend A");
    assert.equal(mb.pending(), 0);
  });

  it("an unknown code says nothing about why", async () => {
    try {
      await cb.request("POST", "v1/roam/social/add", { body: { device_key: b.publicKeyHex, code: "ZZZZZZ", ...HERE }, signed: true });
      assert.fail("accepted a made-up code");
    } catch (error) {
      assert.ok(error instanceof GameError);
      console.log(`[live friends] made-up code: ${error.status} ${error.message}`);
      assert.equal(error.status, 404);
    }
  });
});
