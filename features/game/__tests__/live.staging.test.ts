// The live feature against the real STAGING game server: the calendar for a
// place, read by live.ts, and the stamp card in /me. Read-only, public
// routes, a throwaway key. Never production. Off unless asked for:
//
//   CQ_LIVE_STAGING=1 node --test features/game/__tests__/live.staging.test.ts
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";

import { GameClient } from "../client.ts";
import { STAGING_GAME_SERVER } from "../config.ts";
import { Identity } from "../identity.ts";
import { bannerAt, eventEnd, eventStart, fetchLiveCalendar, stampsFrom, whenText } from "../live.ts";

const live = process.env.CQ_LIVE_STAGING === "1";
// Trafalgar Square (London's clock).
const HERE = { lat: 51.5074, lng: -0.1278 };

describe("live on staging", { skip: !live && "set CQ_LIVE_STAGING=1" }, () => {
  const identity = new Identity(randomBytes(32).toString("hex"), "device");
  const client = new GameClient({ baseUrl: STAGING_GAME_SERVER, identity: () => identity });

  it("the calendar parses and every event has a start before its end", async () => {
    assert.match(client.baseUrl, /staging/);
    const cal = await fetchLiveCalendar(client, HERE.lat, HERE.lng);
    console.log(`[live] region=${cal.region} tz=${cal.tz} now=${cal.now?.title ?? "-"} next=${cal.next.length}`);
    for (const e of cal.next.slice(0, 3)) console.log(`[live]   ${e.title} ${e.starts_at} → ${whenText(e, { offsetMin: () => 0, hour12: false })} UTC`);
    assert.ok(cal.next.length > 0, "30 days always hold a Wednesday");
    for (const e of cal.next) {
      const s = eventStart(e);
      const t = eventEnd(e);
      assert.ok(s !== null && t !== null && s < t, `${e.key} ${e.starts_at}`);
    }
    const banner = bannerAt(cal, Date.now());
    console.log(`[live] banner now: ${banner ? `${banner.kind} ${banner.event.title}` : "none"}`);
  });

  it("/me carries the stamp card", async () => {
    const me = await client.roamMe();
    const stamps = stampsFrom(me);
    console.log(`[live] stamps: ${JSON.stringify(me.features?.live ?? null)}`);
    assert.ok(stamps, "features.live present");
    assert.equal(stamps.stamps, 0);
  });
});
