// Walking rewards against the real STAGING server: the status read and a
// signed report of zero metres (a fresh throwaway player has walked nothing),
// which checks the route, the signature and the wire shape. Never production.
// Off unless asked for:
//
//   CQ_LIVE_STAGING=1 node --test features/game/__tests__/steps.live.test.ts
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { GameClient } from "../client.ts";
import { STAGING_GAME_SERVER } from "../config.ts";
import { Identity } from "../identity.ts";
import { isoDay, reportSteps, stepsStatus, utcMonday } from "../steps.ts";

const live = process.env.CQ_LIVE_STAGING === "1";

describe("steps on staging (live)", { skip: !live && "set CQ_LIVE_STAGING=1" }, () => {
  const identity = new Identity(randomBytes(32).toString("hex"), "device");
  const client = new GameClient({ baseUrl: STAGING_GAME_SERVER, identity: () => identity });

  it("reads this week's status and takes a signed report", async () => {
    assert.match(client.baseUrl, /staging/);
    const week = isoDay(utcMonday(Date.now()));
    const s = await stepsStatus(client);
    assert.equal(s.week_start, week);
    assert.equal(s.meters, 0);
    assert.deepEqual(s.milestones.map((m) => m.km), [5, 25, 50]);
    const r = await reportSteps(client, week, 0);
    assert.equal(r.week_start, week);
    assert.equal(r.meters, 0);
    assert.deepEqual(r.newly, []);
    console.log(JSON.stringify(r));
  });
});
