// The TypeScript client against the real STAGING game server: the signing
// scheme, a signed write, a point fetch, and (if a point is in reach) the
// challenge flow. Never production. Off unless asked for:
//
//   CQ_LIVE_STAGING=1 node --test features/game/__tests__/staging.live.test.ts
//
// Each run makes a fresh throwaway player (a random key) on staging.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { GameClient, GameError } from "../client.ts";
import { STAGING_GAME_SERVER } from "../config.ts";
import { Identity } from "../identity.ts";

const live = process.env.CQ_LIVE_STAGING === "1";
// Trafalgar Square: a dense, stable set of points on staging.
const HERE = { lat: 51.5074, lng: -0.1278 };

describe("staging game server (live)", { skip: !live && "set CQ_LIVE_STAGING=1" }, () => {
  const identity = new Identity(randomBytes(32).toString("hex"), "device");
  const client = new GameClient({ baseUrl: STAGING_GAME_SERVER, identity: () => identity });

  it("is staging, and up", async () => {
    assert.match(client.baseUrl, /staging/);
    assert.equal((await client.health()).status, "ok");
  });

  it("a signed write is accepted (the signing scheme matches the server)", async () => {
    await client.saveProfile("TS Interop", { face: 1, mark: 2, tint: "#3FA7D6" });
    const me = await client.chooseFaction("gaming");
    assert.equal(me.faction, "gaming");
    assert.equal(me.device_key, identity.publicKeyHex);
  });

  it("a bad signature is refused with the server's reason", async () => {
    const wrong = new Identity(randomBytes(32).toString("hex"), "device");
    const liar = new GameClient({
      baseUrl: STAGING_GAME_SERVER,
      identity: () => ({ ...wrong, publicKeyHex: identity.publicKeyHex, signedHeaders: (m: string, p: string, b: Uint8Array) => ({ ...wrong.signedHeaders(m, p, b), "X-Device-Key": identity.publicKeyHex }) }) as unknown as Identity,
    });
    await assert.rejects(liar.chooseFaction("dc"), (error: unknown) => error instanceof GameError && error.status === 401);
  });

  it("signed GET of the points around a place", async () => {
    const got = await client.questPoints(HERE.lat, HERE.lng);
    assert.ok(got.points.length > 0, "points near Trafalgar Square");
    const me = await client.roamMe();
    assert.equal(me.faction, "gaming");
    assert.ok(Array.isArray(me.dailies));
  });

  it("opens the nearest point as the server's mode says (duel or quiz)", async () => {
    const me = await client.roamMe();
    const { points } = await client.questPoints(HERE.lat, HERE.lng);
    const near = [...points].sort((a, b) => (a.distance_m ?? 1e9) - (b.distance_m ?? 1e9))[0];
    const asDuel = me.features?.duel?.point_mode === "duel" || near.challenge === "duel";
    if (asDuel) {
      const start = await client.duelStart({ mode: "point", target: near.id, lat: near.lat, lng: near.lng, accuracy_m: 5 });
      assert.equal(start.mode, "point");
      assert.ok(start.duel_id.length >= 8);
      assert.ok(start.setup && typeof start.setup === "object");
    } else {
      const attempt = await client.openPoint(near.id, near.lat, near.lng, 5);
      assert.ok(attempt.attempt_id);
    }
  });
});

describe("a Guardian Duel against staging, at real speed (live)", { skip: !live && "set CQ_LIVE_STAGING=1" }, () => {
  it("the ported engine's fight is judged won or lost, never held", { timeout: 150000 }, async () => {
    const { DuelRunner, InputKind, setupFromServer } = await import("../duel/index.ts");
    const identity = new Identity(randomBytes(32).toString("hex"), "device");
    const client = new GameClient({ baseUrl: STAGING_GAME_SERVER, identity: () => identity });
    await client.saveProfile("TS Duelist", { face: 1, mark: 1, tint: "#33C773" });
    await client.chooseFaction("gaming");
    const { points } = await client.questPoints(HERE.lat, HERE.lng);
    const p = points.find((x) => x.tier === "common") ?? points[0];
    const start = await client.duelStart({ mode: "point", target: p.id, lat: p.lat, lng: p.lng, accuracy_m: 5 });
    const setup = setupFromServer(start.setup, start.seed_text);
    // A simple player: walk in, then strike, block now and then, special when charged.
    let tick = 0;
    const runner = new DuelRunner(setup, {
      input: {
        next() {
          tick++;
          const me = runner.sim.state.p1;
          const them = runner.sim.state.p2;
          if (me.meter >= 100 && tick % 30 === 0) return InputKind.Special1;
          if (Math.abs(me.x - them.x) > 1300) return InputKind.MoveToward;
          if (tick % 90 === 0) return InputKind.HoldStart;
          if (tick % 90 === 20) return InputKind.HoldEnd;
          return tick % 9 === 0 ? InputKind.Tap : InputKind.None;
        },
      },
    });
    let last = performance.now();
    while (!runner.over) {
      await new Promise((r) => setTimeout(r, 16));
      const now = performance.now();
      runner.advance(now - last);
      last = now;
    }
    const payload = runner.finishPayload();
    assert.match(payload.hash, /^[0-9a-f]{16}$/);
    const outcome = await client.duelFinish(start.duel_id, payload);
    console.log(`[live duel] ${outcome.status} in ${payload.result.ticks} ticks, hp ${payload.result.p1_hp}/${payload.result.p2_hp}, ${payload.inputs.length} inputs, reward ${JSON.stringify(outcome.point?.reward ?? null)}${outcome.message ? `, ${outcome.message}` : ""}`);
    assert.ok(outcome.status === "won" || outcome.status === "lost", `judged ${outcome.status}: ${outcome.message ?? ""}`);
  });
});
