// What the server is told about a fix (sensors audit R3, server branch
// anticheat-location): accuracy_m, fix_age_s, mocked / simulated on every
// located request, and an action refused for want of a fix (need_location,
// retry) sent again once the phone has a fresh one, a few times at most.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GameClient } from "../client.ts";
import {
  fixAgeS,
  fixFields,
  fixIsFresh,
  isNeedLocation,
  NEED_LOCATION_RETRY,
  NEED_LOCATION_TEXT,
  nextLocationRetry,
  shouldProbeSimulated,
  WAITING_FOR_LOCATION,
  withFixFields,
} from "../fixInfo.ts";
import { Identity, signingPayload, utf8ToBytes, verifySignature } from "../identity.ts";
import { parseVerdict } from "../rooms.ts";
import { type Clock, createRoomSession, type RoomFix, type SocketLike } from "../roomsSession.ts";

const NOW = 1_760_000_000_000;

describe("fix fields", () => {
  it("fix_age_s is seconds since the OS took the fix, to 0.1 s, never negative", () => {
    assert.equal(fixAgeS(NOW - 12_345, NOW), 12.3);
    assert.equal(fixAgeS(NOW + 800, NOW), 0); // the phone's clock a little behind the fix's
    assert.equal(fixAgeS(null, NOW), null);
    assert.equal(fixAgeS(Number.NaN, NOW), null);
  });

  it("sends only what is known; mocked and simulated only as booleans", () => {
    assert.deepEqual(fixFields({ accuracy: 8.5, at: NOW - 2000, mocked: false, simulated: true }, NOW), {
      accuracy_m: 8.5,
      fix_age_s: 2,
      mocked: false,
      simulated: true,
    });
    assert.deepEqual(fixFields({ accuracy: 9000, at: NOW, mocked: null }, NOW), { accuracy_m: 5000, fix_age_s: 0 });
    assert.deepEqual(fixFields({ accuracy: Number.NaN, at: Number.NaN }, NOW), {});
    assert.deepEqual(fixFields(null, NOW), {});
  });

  it("decorates a body that says where the player is, and nothing else", () => {
    const f = { accuracy_m: 5, fix_age_s: 1.2, simulated: true };
    assert.deepEqual(withFixFields({ lat: 51.5, lng: -0.12, point_id: "p" }, f), { lat: 51.5, lng: -0.12, point_id: "p", accuracy_m: 5, fix_age_s: 1.2, simulated: true });
    // The caller's own accuracy wins.
    assert.deepEqual(withFixFields({ lat: 1, lng: 2, accuracy_m: 20 }, f), { lat: 1, lng: 2, accuracy_m: 20, fix_age_s: 1.2, simulated: true });
    const noPlace = { device_key: "k", run_id: "r" };
    assert.equal(withFixFields(noPlace, f), noPlace);
    assert.deepEqual(withFixFields({ lat: null, lng: 2 }, f), { lat: null, lng: 2 });
    assert.deepEqual(withFixFields([1, 2], f), [1, 2]);
    assert.equal(withFixFields("x", f), "x");
    assert.deepEqual(withFixFields({ lat: 1, lng: 2 }, null), { lat: 1, lng: 2 });
  });

  it("a fix is fresh for 15 s, well inside the server's 30", () => {
    assert.equal(fixIsFresh({ at: NOW - 10_000 }, NOW), true);
    assert.equal(fixIsFresh({ at: NOW - 16_000 }, NOW), false);
    assert.equal(fixIsFresh({}, NOW), false);
    assert.equal(fixIsFresh(null, NOW), false);
  });

  it("iOS is asked whether the location is simulated at most once a minute", () => {
    assert.equal(shouldProbeSimulated(null, NOW), true);
    assert.equal(shouldProbeSimulated(NOW - 30_000, NOW), false);
    assert.equal(shouldProbeSimulated(NOW - 60_000, NOW), true);
    assert.equal(shouldProbeSimulated(NOW + 5_000, NOW), true); // the clock went back
  });
});

describe("need_location", () => {
  it("is the server's retryable refusal for want of a fix", () => {
    assert.equal(isNeedLocation({ ok: false, code: "need_location", retry: true, reason: NEED_LOCATION_TEXT }), true);
    assert.equal(isNeedLocation({ ok: false, reason: NEED_LOCATION_TEXT }), true);
    assert.equal(isNeedLocation({ ok: false, code: "need_location", retry: false }), false);
    assert.equal(isNeedLocation({ ok: false, code: "too_far", reason: "out of range of that point (120 m away)" }), false);
    assert.equal(isNeedLocation({ ok: true, code: "need_location" }), false);
    assert.equal(isNeedLocation(null), false);
  });

  it("a parsed verdict keeps the code and retry", () => {
    const v = parseVerdict({ client_seq: 3, ok: false, code: "need_location", retry: true, reason: NEED_LOCATION_TEXT, deltas: {} });
    assert.equal(v?.code, "need_location");
    assert.equal(v?.retry, true);
    assert.equal(isNeedLocation(v), true);
  });

  it("three more sends inside 20 s, then stop", () => {
    assert.equal(nextLocationRetry(1, 0), NEED_LOCATION_RETRY.waitMs[0]);
    assert.equal(nextLocationRetry(2, 2000), NEED_LOCATION_RETRY.waitMs[1]);
    assert.equal(nextLocationRetry(3, 6000), NEED_LOCATION_RETRY.waitMs[2]);
    assert.equal(nextLocationRetry(4, 12000), null);
    assert.equal(nextLocationRetry(1, 19_000), null); // over the budget
    assert.equal(nextLocationRetry(0, 0), null);
    assert.equal(nextLocationRetry(1, Number.NaN), null);
  });
});

// ---------- against a fake server ----------

const SEED = "33".repeat(32);
type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

function fakeServer(answer: (call: Call) => unknown, locationFields?: () => ReturnType<typeof fixFields> | null) {
  const id = new Identity(SEED, "device");
  const calls: Call[] = [];
  const fetch = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    const call = { url, method: init.method, headers: init.headers, body: init.body };
    calls.push(call);
    const text = JSON.stringify(answer(call) ?? {});
    return { ok: true, status: 200, text: async () => text };
  };
  return { client: new GameClient({ baseUrl: "https://g.example", identity: () => id, fetch, sleep: async () => {}, locationFields }), calls, id };
}

function fakeClock(start = NOW) {
  let now = start;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: Clock = {
    now: () => now,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (t) => {
      timers.delete(t as unknown as number);
    },
  };
  return {
    clock,
    async advance(ms: number) {
      now += ms;
      for (const [id, t] of [...timers]) {
        if (t.at <= now) {
          timers.delete(id);
          t.fn();
        }
      }
      await flush();
    },
  };
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise<void>((r) => setImmediate(r));
};

const noSocket = (): SocketLike => ({ send() {}, close() {}, onopen: null, onmessage: null, onclose: null, onerror: null });

describe("located requests", () => {
  it("a signed Roam body carries the fix fields, inside the signature", async () => {
    const { client, calls, id } = fakeServer(() => ({ ok: true }), () => ({ accuracy_m: 6, fix_age_s: 0.4, simulated: true }));
    await client.spin("p1", 51.5, -0.12, 6);
    const call = calls[0];
    assert.deepEqual(JSON.parse(call.body ?? ""), { device_key: id.publicKeyHex, point_id: "p1", lat: 51.5, lng: -0.12, accuracy_m: 6, fix_age_s: 0.4, simulated: true });
    assert.ok(verifySignature(id.publicKeyHex, signingPayload("POST", "/v1/roam/items/spin", utf8ToBytes(call.body ?? ""), Number(call.headers["X-Nonce"])), call.headers["X-Signature"]));
  });

  it("a body with no position is sent as it was", async () => {
    const { client, calls } = fakeServer(() => ({ stance: "guard" }), () => ({ accuracy_m: 6, fix_age_s: 0.4 }));
    await client.setStance("guard");
    assert.equal("fix_age_s" in JSON.parse(calls[0].body ?? ""), false);
  });

  it("a Room action on an old fix asks for a fresh one first, and says how old it is", async () => {
    const t = fakeClock();
    const { client, calls } = fakeServer((c) => {
      const events = JSON.parse(c.body ?? "{}").events as { client_seq: number }[];
      return { results: events.map((e) => ({ client_seq: e.client_seq, ok: true, deltas: {} })) };
    });
    let asked = 0;
    const session = createRoomSession({
      client,
      gameId: "g1",
      clock: t.clock,
      openSocket: noSocket,
      freshFix: async () => {
        asked++;
        return { lat: 51.5001, lng: -0.12, accuracy: 7, at: t.clock.now() - 500, simulated: true };
      },
    });
    // A phone standing still: the watch's last fix is two minutes old.
    session.setPosition({ lat: 51.5, lng: -0.12, accuracy: 9, at: NOW - 120_000 } satisfies RoomFix, null);
    const v = await session.capture("s1");
    assert.equal(v.ok, true);
    assert.equal(asked, 1);
    const payload = JSON.parse(calls[0].body ?? "").events[0].payload;
    assert.deepEqual(payload, { anchor: "s1", lat: 51.5001, lng: -0.12, accuracy_m: 7, fix_age_s: 0.5, simulated: true });

    // A fresh fix is used as it is.
    session.setPosition({ lat: 51.5, lng: -0.12, accuracy: 9, at: t.clock.now() - 1000 }, null);
    await session.capture("s1");
    assert.equal(asked, 1);
  });

  it("need_location: waits, gets a fix and sends the same action again", async () => {
    const t = fakeClock();
    let refusals = 2;
    const { client, calls } = fakeServer((c) => {
      const events = JSON.parse(c.body ?? "{}").events as { client_seq: number }[];
      return {
        results: events.map((e) =>
          refusals-- > 0
            ? { client_seq: e.client_seq, ok: false, code: "need_location", retry: true, reason: NEED_LOCATION_TEXT, deltas: {} }
            : { client_seq: e.client_seq, ok: true, deltas: {}, anchor: "s1", faction: "DC" },
        ),
      };
    });
    let asked = 0;
    const session = createRoomSession({
      client,
      gameId: "g1",
      clock: t.clock,
      openSocket: noSocket,
      freshFix: async () => {
        asked++;
        return { lat: 51.5, lng: -0.12, accuracy: 5, at: t.clock.now() };
      },
    });
    session.setPosition({ lat: 51.5, lng: -0.12, accuracy: 5, at: NOW }, null);
    let done = false;
    const pending = session.capture("s1").then((v) => {
      done = true;
      return v;
    });
    await flush();
    assert.equal(calls.length, 1);
    assert.ok(session.get().fight.feed.some((f) => f.text === WAITING_FOR_LOCATION));
    await t.advance(NEED_LOCATION_RETRY.waitMs[0]);
    assert.equal(calls.length, 2);
    assert.equal(done, false);
    await t.advance(NEED_LOCATION_RETRY.waitMs[1]);
    const v = await pending;
    assert.equal(v.ok, true);
    assert.equal(calls.length, 3);
    assert.equal(asked, 2);
  });

  it("need_location for good: stops after three resends and shows the server's words", async () => {
    const t = fakeClock();
    const { client, calls } = fakeServer((c) => {
      const events = JSON.parse(c.body ?? "{}").events as { client_seq: number }[];
      return { results: events.map((e) => ({ client_seq: e.client_seq, ok: false, code: "need_location", retry: true, reason: NEED_LOCATION_TEXT, deltas: {} })) };
    });
    const session = createRoomSession({ client, gameId: "g1", clock: t.clock, openSocket: noSocket, freshFix: async () => ({ lat: 51.5, lng: -0.12, accuracy: 5, at: t.clock.now() }) });
    session.setPosition({ lat: 51.5, lng: -0.12, accuracy: 5, at: NOW }, null);
    const pending = session.capture("s1");
    for (const w of NEED_LOCATION_RETRY.waitMs) await t.advance(w);
    await t.advance(10_000);
    const v = await pending;
    assert.equal(v.ok, false);
    assert.equal(calls.length, 1 + NEED_LOCATION_RETRY.tries);
    assert.equal(session.get().fight.feed[0]?.refusal, true);
  });
});
