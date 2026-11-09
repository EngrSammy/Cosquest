// Rooms against the real STAGING game server: start a private Room (five
// minutes, the shortest), find it by its code, read its terms and arena,
// join it, open the live link, and play three events through the session
// (pick up a weapon, take a shrine, answer a chest), then a second player
// joins and the first fires at them by the live map. Never production. Off
// unless asked for:
//
//   CQ_LIVE_STAGING=1 node --test features/game/__tests__/rooms.live.test.ts
//
// A fresh throwaway player (a random key) each run; only calls any player can
// make. A Room nobody else joins pays nothing when it settles.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { GameClient, GameError } from "../client.ts";
import { STAGING_GAME_SERVER } from "../config.ts";
import { Identity } from "../identity.ts";
import { aimTargets, createRoom, findRoom, nearbyRooms } from "../rooms.ts";
import { createRoomSession, type SocketLike } from "../roomsSession.ts";

const live = process.env.CQ_LIVE_STAGING === "1";
const HERE = { lat: 51.5074, lng: -0.1278 };

const waitFor = async (check: () => boolean, ms = 8000) => {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 100));
  }
};

describe("rooms on staging (live)", { skip: !live && "set CQ_LIVE_STAGING=1" }, () => {
  const identity = new Identity(randomBytes(32).toString("hex"), "device");
  const client = new GameClient({ baseUrl: STAGING_GAME_SERVER, identity: () => identity });

  it("start, find, join and play a private Room", async () => {
    assert.match(client.baseUrl, /staging/);
    const near = await nearbyRooms(client, HERE.lat, HERE.lng);
    assert.ok(Array.isArray(near));
    console.log(`[rooms.live] ${near.length} public room(s) near`);

    await assert.rejects(findRoom(client, "ZZZZ22"), (e: unknown) => {
      console.log(`[rooms.live] bad code: ${(e as Error).message}`);
      return e instanceof GameError && e.status === 404;
    });

    const room = await createRoom(client, { ...HERE, accuracy: 8, minutes: 5, private: true });
    console.log(`[rooms.live] created ${room.game_id} code ${room.code} ends ${room.ends_at}`);
    assert.equal(room.code.length, 6);
    assert.equal((await findRoom(client, room.code.toLowerCase())).game_id, room.game_id);

    const session = createRoomSession({ client, gameId: room.game_id, openSocket: (url) => new WebSocket(url) as unknown as SocketLike });
    await session.load();
    const { terms, anchors } = session.get();
    assert.equal(terms?.status, "live");
    console.log(`[rooms.live] sides ${terms?.factions.map((f) => f.name).join(", ")}; arena ${anchors.map((a) => `${a.kind}:${a.asset}`).join(", ")}`);
    assert.equal(anchors.filter((a) => a.kind === "weapon").length, 3);

    assert.equal(await session.join("TS Rooms", "gaming"), true, session.get().problem ?? "");
    await waitFor(() => session.get().fight.connected);
    const fight = session.get().fight;
    console.log(`[rooms.live] joined as ${fight.playerId} on ${fight.faction} with ${fight.tokens} tokens; live link up`);

    const weapon = anchors.find((a) => a.kind === "weapon")!;
    session.setPosition(weapon, 0);
    const pick = await session.pickUp(weapon);
    console.log(`[rooms.live] pickup ${weapon.payload.name}: ${JSON.stringify(pick)}`);
    assert.equal(pick.ok, true);
    assert.equal(session.get().fight.held?.name, weapon.payload.name ?? weapon.asset);

    const shrine = anchors.find((a) => a.kind === "capture_point")!;
    session.setPosition(shrine, 0);
    const before = session.get().fight.tokens;
    const cap = await session.capture(shrine.id);
    console.log(`[rooms.live] capture: ${JSON.stringify(cap)}`);
    assert.equal(cap.ok, true);
    assert.ok(session.get().fight.tokens >= before);

    const chest = anchors.find((a) => a.kind === "trivia")!;
    const ans = await session.answerTrivia(chest.id, 0);
    console.log(`[rooms.live] trivia: ${JSON.stringify(ans)}`);
    assert.equal(ans.ok, true);
    const again = await session.answerTrivia(chest.id, 1);
    assert.equal(again.ok, false);
    console.log(`[rooms.live] trivia again: ${again.reason} -> "${session.get().fight.feed[0]?.text}"`);

    // A second throwaway player joins on another side, four metres north of
    // the first; the first aims at them by the live map and fires.
    const rivalId = new Identity(randomBytes(32).toString("hex"), "device");
    const rivalClient = new GameClient({ baseUrl: STAGING_GAME_SERVER, identity: () => rivalId });
    const rival = createRoomSession({ client: rivalClient, gameId: room.game_id, openSocket: (url) => new WebSocket(url) as unknown as SocketLike });
    assert.equal(await rival.join("TS Rival", "dc"), true, rival.get().problem ?? "");
    await waitFor(() => rival.get().fight.connected);
    const rivalSpot = { lat: weapon.lat + 4 / 111320, lng: weapon.lng };
    const rivalPlayer = rival.get().fight.playerId!;
    let sawOnMap = true;
    try {
      await waitFor(() => {
        rival.setPosition(rivalSpot, 180);
        session.setPosition(weapon, 0);
        return !!session.get().fight.map[rivalPlayer];
      }, 12000);
    } catch {
      sawOnMap = false;
    }
    const target = aimTargets({ here: weapon, heading: 0, playerId: session.get().fight.playerId, faction: session.get().fight.faction, map: session.get().fight.map, players: session.get().fight.players })[0];
    console.log(`[rooms.live] rival on the live map: ${sawOnMap}; aimed at ${target ? `${target.label} ~${target.distance.toFixed(1)} m` : "nobody"}`);
    const shot = await session.hit(rivalPlayer, target?.distance ?? 4);
    console.log(`[rooms.live] hit: ${JSON.stringify(shot)} -> "${session.get().fight.feed[0]?.text}"`);
    assert.equal(shot.ok, true);
    assert.equal(shot.drained, 15);
    await waitFor(() => rival.get().fight.tokens === 85).catch(() => {});
    console.log(`[rooms.live] rival sees ${rival.get().fight.tokens} tokens, feed "${rival.get().fight.feed[0]?.text}"`);
    const far = await session.hit(rivalPlayer, 40);
    console.log(`[rooms.live] hit at 40 m: ${far.reason} -> "${session.get().fight.feed[0]?.text}"`);
    assert.equal(far.ok, false);

    rival.leave();
    session.leave();
  });
});
