// Rooms: the Room routes, the Events game a Room is (join, events, the live
// link), aiming and reach, the outbox, and one player's session, against a
// fake server and a fake socket (no network). The live staging check is
// rooms.live.test.ts.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GameClient } from "../client.ts";
import { Identity, signingPayload, utf8ToBytes, verifySignature } from "../identity.ts";
import {
  aimTargets,
  ANCHOR_REACH_M,
  anchorTitle,
  beaconId,
  createRoom,
  findRoom,
  friendlyReason,
  gameIdFromBeacon,
  type GameAnchor,
  INITIAL_FIGHT,
  joinGame,
  liveRooms,
  liveSocketUrl,
  nearbyRooms,
  nearestActionable,
  normaliseCode,
  onLive,
  onVerdict,
  parseLiveMessage,
  parseVerdict,
  presetSide,
  respawnSecondsLeft,
  roomEnded,
  sendEvents,
  statusFromReason,
  timeLeft,
} from "../rooms.ts";
import { type Clock, createRoomSession, createRoomsModel, QUEUED_REASON, RoomOutbox, type SocketLike } from "../roomsSession.ts";

const SEED = "22".repeat(32);

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

function fakeFetch(routes: (call: Call) => { status?: number; body: unknown } | undefined) {
  const calls: Call[] = [];
  const fetch = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    const call = { url, method: init.method, headers: init.headers, body: init.body };
    calls.push(call);
    const answer = routes(call) ?? { status: 404, body: { detail: "Not Found" } };
    const text = typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body);
    const status = answer.status ?? 200;
    return { ok: status >= 200 && status < 300, status, text: async () => text };
  };
  return { fetch, calls };
}

function clientWith(routes: (call: Call) => { status?: number; body: unknown } | undefined) {
  const id = new Identity(SEED, "device");
  const { fetch, calls } = fakeFetch(routes);
  return { client: new GameClient({ baseUrl: "https://g.example", identity: () => id, fetch, sleep: async () => {} }), calls, id };
}

/** Timers that run only when the test says so. */
function fakeClock(start = 1_760_000_000_000) {
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
  for (let i = 0; i < 10; i++) await new Promise<void>((r) => setImmediate(r));
};

const HERE = { lat: 51.5, lng: -0.12 };
/** `m` metres north (+) and east (+) of HERE. */
const at = (north: number, east: number) => ({
  lat: HERE.lat + north / 111320,
  lng: HERE.lng + east / (111320 * Math.cos((HERE.lat * Math.PI) / 180)),
});

describe("rooms: the pure parts", () => {
  it("cleans a typed code the way the sheet does", () => {
    assert.equal(normaliseCode("ab-c 2 34xyz"), "ABC234");
    assert.equal(normaliseCode("é9k"), "9K");
  });

  it("says how long a Room has left, and drops ended ones nearest first", () => {
    const now = Date.parse("2026-10-14T12:00:00Z");
    assert.equal(timeLeft("2026-10-14T12:00:40.123456+00:00", now), "40 s left");
    assert.equal(timeLeft("2026-10-14T12:06:30+00:00", now), "7 min left");
    assert.equal(timeLeft("2026-10-14T11:59:00+00:00", now), "Ending");
    assert.equal(timeLeft(null, now), "Live");
    assert.equal(roomEnded("2026-10-14T11:59:00+00:00", now), true);
    const rooms = liveRooms(
      [
        { game_id: "far", lat: 0, lng: 0, distance_m: 300, ends_at: "2026-10-14T12:10:00+00:00" },
        { game_id: "gone", lat: 0, lng: 0, distance_m: 5, ends_at: "2026-10-14T11:00:00+00:00" },
        { game_id: "near", lat: 0, lng: 0, distance_m: 20, ends_at: "2026-10-14T12:10:00+00:00" },
      ],
      now,
    );
    assert.deepEqual(
      rooms.map((r) => r.game_id),
      ["near", "far"],
    );
  });

  it("presets the side from the Roam faction by id or display name", () => {
    const sides = [{ name: "Anime" }, { name: "DC" }, { name: "Marvel" }];
    assert.equal(presetSide(sides, ["dc", "DC"]), "DC");
    assert.equal(presetSide(sides, [null, "Marvel"]), "Marvel");
    assert.equal(presetSide(sides, ["gaming"]), null);
  });

  it("names beacons and the live link like iOS", () => {
    assert.equal(beaconId({ game_id: "g1" }), "room:g1");
    assert.equal(gameIdFromBeacon("room:g1"), "g1");
    assert.equal(gameIdFromBeacon("p1"), null);
    assert.equal(liveSocketUrl("https://g.example/", "g1", "ab"), "wss://g.example/v1/games/g1/ws?device_key=ab");
    assert.equal(liveSocketUrl("http://localhost:8000", "g1", "ab"), "ws://localhost:8000/v1/games/g1/ws?device_key=ab");
  });

  it("aims like Targeting.swift: a 35 degree cone, never your own side or the downed", () => {
    const map = {
      me: { ...HERE, faction: "DC", state: "active" },
      ahead: { ...at(8, 0), faction: "Marvel", state: "active" },
      wide: { ...at(5, 5.5), faction: "Marvel", state: "active" }, // ~48 degrees off north
      friend: { ...at(4, 0), faction: "DC", state: "active" },
      down: { ...at(3, 0), faction: "Anime", state: "active" },
    };
    const players = {
      me: { tokens: 100, state: "active", faction: "DC", handle: "Ada" },
      ahead: { tokens: 100, state: "active", faction: "Marvel", handle: "Bo" },
      wide: { tokens: 100, state: "active", faction: "Marvel" },
      friend: { tokens: 100, state: "active", faction: "DC" },
      down: { tokens: 0, state: "respawning", faction: "Anime" },
    };
    const t = aimTargets({ here: HERE, heading: 0, playerId: "me", faction: "DC", map, players });
    assert.deepEqual(
      t.map((x) => x.id),
      ["ahead"],
    );
    assert.equal(t[0].label, "Bo");
    assert.ok(Math.abs(t[0].distance - 8) < 0.2);
    assert.equal(t[0].isPrecise, false);
    // Turned east, the wide one is in the cone; no compass, nobody.
    assert.deepEqual(
      aimTargets({ here: HERE, heading: 50, playerId: "me", faction: "DC", map, players }).map((x) => x.id),
      ["wide"],
    );
    assert.deepEqual(aimTargets({ here: HERE, heading: null, playerId: "me", faction: "DC", map, players }), []);
  });

  it("acts on a point only within arm's reach (6 m), nearest first", () => {
    const anchors: GameAnchor[] = [
      { id: "w", asset: "axe", kind: "weapon", ...at(4, 0), payload: { name: "Axe" } },
      { id: "s", asset: "shrine", kind: "capture_point", ...at(2, 0), payload: { label: "Shrine A" } },
      { id: "t", asset: "supply_chest", kind: "trivia", ...at(10, 0), payload: { q: "?", choices: ["a", "b"] } },
    ];
    assert.equal(nearestActionable(anchors, HERE)?.anchor.id, "s");
    assert.equal(nearestActionable(anchors, at(10, 0))?.anchor.id, "t");
    assert.equal(nearestActionable(anchors, at(30, 0)), null);
    assert.equal(ANCHOR_REACH_M, 6);
    assert.equal(anchorTitle(anchors[0], {}, "DC"), "Pick up the Axe");
    assert.equal(anchorTitle(anchors[1], { s: "DC" }, "DC"), "Your side holds this point");
    assert.equal(anchorTitle(anchors[1], { s: "Marvel" }, "DC"), "Take this point");
  });

  it("turns engine reasons into player copy, and keeps unknown ones in the server's words", () => {
    const now = Date.parse("2026-10-14T12:00:00Z");
    const r = friendlyReason("respawn locked until 2026-10-14T12:00:12.345678+00:00", now);
    assert.equal(r.text, "You can respawn in 12s");
    assert.equal(r.respawnAt, Date.parse("2026-10-14T12:00:12Z"));
    assert.equal(friendlyReason("out of range (14.2m)").text, "Too far away. Get closer");
    assert.equal(friendlyReason("friendly fire").text, "That's your own side");
    assert.equal(friendlyReason(QUEUED_REASON).text, "No signal. Sent when you're back online");
    assert.equal(friendlyReason("This event costs 50 CosCoins to enter.").text, "This event costs 50 CosCoins to enter.");
    assert.equal(statusFromReason("game is settled, not live"), "settled");
  });

  it("reads verdicts flat and nested (a replayed event)", () => {
    assert.deepEqual(parseVerdict({ client_seq: 3, ok: true, reason: "", deltas: { a: 15, b: -15 }, drained: 15 }), {
      client_seq: 3,
      ok: true,
      reason: "",
      deltas: { a: 15, b: -15 },
      drained: 15,
      downed: null,
      correct: null,
      duplicate: null,
    });
    const dup = parseVerdict({ client_seq: 4, duplicate: true, result: { ok: false, reason: "hit on cooldown" } });
    assert.equal(dup?.ok, false);
    assert.equal(dup?.reason, "hit on cooldown");
    assert.equal(dup?.duplicate, true);
    assert.equal(parseVerdict({ ok: true }), null);
  });

  it("parses the live link's messages and drops what it does not know", () => {
    const hello = parseLiveMessage(JSON.stringify({ t: "hello", you: "p1", factions: [{ faction: "DC", tokens: 100 }], players: { p1: { tokens: 100, state: "active", faction: "DC", handle: "Ada" } }, captures: {} }));
    assert.equal(hello?.t, "hello");
    assert.equal(parseLiveMessage(JSON.stringify({ t: "uwb", from: "x" })), null);
    assert.equal(parseLiveMessage("not json"), null);
    const map = parseLiveMessage(JSON.stringify({ t: "map", players: { a: { lat: 1, lng: 2, faction: "DC", state: "active" }, b: { lat: "x" } } }));
    assert.deepEqual(map?.t === "map" ? Object.keys(map.players) : [], ["a"]);
  });
});

describe("rooms: the fight's state (GameSession.handle)", () => {
  const board = {
    factions: [
      { faction: "Marvel", tokens: 85 },
      { faction: "DC", tokens: 115 },
    ],
    players: {
      p1: { tokens: 115, state: "active", faction: "DC", handle: "Ada" },
      p2: { tokens: 85, state: "active", faction: "Marvel", handle: "Bo" },
    },
    captures: { s1: "DC" },
  };

  it("takes the server's numbers from hello and every scoreboard", () => {
    const s = onLive(INITIAL_FIGHT, { t: "hello", you: "p1", board }, 1000);
    assert.equal(s.playerId, "p1");
    assert.equal(s.tokens, 115);
    assert.equal(s.faction, "DC");
    assert.equal(s.factionScores[0].faction, "DC");
    assert.equal(s.captures.s1, "DC");
  });

  it("says when someone takes from you, and when you go down", () => {
    let s = onLive(INITIAL_FIGHT, { t: "hello", you: "p1", board }, 1000);
    s = onLive(s, { t: "event", kind: "hit", actor: "p2", deltas: { p2: 15, p1: -15 } }, 2000);
    assert.equal(s.tokens, 100);
    assert.equal(s.feed[0].text, "Bo took 15 from you.");
    assert.equal(s.moment?.text, "Hit by Bo, -15");
    // FieldModel: taking damage is a heavy impact, not a warning.
    assert.equal(s.moment?.feel, "heavy");
    // Our own event echoed back changes nothing (the verdict already did).
    assert.equal(onLive(s, { t: "event", kind: "hit", actor: "p1", deltas: { p1: 15 } }, 2100), s);
    s = onLive({ ...s, held: { name: "Axe", range: null, damage: null } }, { t: "downed", player: "p1", by: "p2" }, 3000);
    assert.equal(s.state, "respawning");
    assert.equal(s.held, null);
    assert.equal(s.feed[0].text, "You were downed by Bo.");
  });

  it("moves the balance on our own verdict, unless a newer scoreboard already did", () => {
    const s = onLive(INITIAL_FIGHT, { t: "hello", you: "p1", board }, 1000);
    const hit = { client_seq: 1, ok: true, deltas: { p1: 15, p2: -15 }, drained: 15 };
    const after = onVerdict(s, "hit", hit, 2000, 2100, { target: "p2" });
    assert.equal(after.tokens, 130);
    assert.equal(after.feed[0].text, "Took 15 from Bo.");
    // The scoreboard landed after we sent: it already holds the hit.
    assert.equal(onVerdict(s, "hit", hit, 500, 2100, { target: "p2" }).tokens, 115);
    const refused = onVerdict(s, "respawn", { client_seq: 2, ok: false, reason: "respawn locked until 2026-10-14T12:00:20+00:00" }, 0, Date.parse("2026-10-14T12:00:00Z"));
    assert.equal(respawnSecondsLeft(refused, Date.parse("2026-10-14T12:00:00Z")), 20);
    const ended = onVerdict(s, "capture", { client_seq: 3, ok: false, reason: "game is finished, not live" }, 0, 0);
    assert.equal(ended.gameStatus, "finished");
  });
});

describe("rooms: the routes (app/rooms.py, main.py)", () => {
  it("starts a Room signed, with the body iOS sends", async () => {
    const { client, calls, id } = clientWith((c) => (c.url.endsWith("/v1/rooms") ? { body: { game_id: "g1", code: "ABC234", ends_at: "2026-10-14T12:10:00+00:00" } } : undefined));
    const r = await createRoom(client, { lat: 51.5, lng: -0.12, accuracy: -3, minutes: 30, private: true });
    assert.equal(r.code, "ABC234");
    const call = calls[0];
    assert.equal(call.method, "POST");
    assert.deepEqual(JSON.parse(call.body ?? ""), { device_key: id.publicKeyHex, lat: 51.5, lng: -0.12, accuracy_m: 0, minutes: 20, private: true });
    const nonce = Number(call.headers["X-Nonce"]);
    assert.ok(verifySignature(id.publicKeyHex, signingPayload("POST", "/v1/rooms", utf8ToBytes(call.body ?? ""), nonce), call.headers["X-Signature"]));
  });

  it("shows a refusal in the server's words (409 one live Room, 404 no such code)", async () => {
    const { client } = clientWith((c) =>
      c.url.endsWith("/v1/rooms")
        ? { status: 409, body: { detail: { reason: "You already have a live Room.", game_id: "g0", code: "XYZ987" } } }
        : c.url.endsWith("/v1/rooms/code")
          ? { status: 404, body: { detail: { reason: "No live Room with that code." } } }
          : undefined,
    );
    await assert.rejects(createRoom(client, { lat: 1, lng: 1, accuracy: 5, minutes: 10, private: false }), /You already have a live Room\./);
    await assert.rejects(findRoom(client, "abc-234"), /No live Room with that code\./);
  });

  it("finds a Room by code, normalised", async () => {
    const { client, calls } = clientWith(() => ({ body: { game_id: "g9", ends_at: null } }));
    assert.equal((await findRoom(client, "abc 234")).game_id, "g9");
    assert.equal(JSON.parse(calls[0].body ?? "").code, "ABC234");
  });

  it("lists rooms near you, bare or wrapped", async () => {
    const room = { game_id: "g1", lat: 51.5, lng: -0.12, distance_m: 40, players: 2, host_handle: "Ada", ends_at: "2099-01-01T00:00:00+00:00" };
    const bare = clientWith(() => ({ body: [room, { nope: 1 }] }));
    assert.deepEqual(await nearbyRooms(bare.client, 51.5, -0.12), [room]);
    assert.match(bare.calls[0].url, /\/v1\/rooms\/nearby\?lat=51\.5&lng=-0\.12$/);
    const wrapped = clientWith(() => ({ body: { rooms: [room] } }));
    assert.equal((await nearbyRooms(wrapped.client, 51.5, -0.12)).length, 1);
  });

  it("joins with the Roam side and handle, unsigned (no payout)", async () => {
    const { client, calls, id } = clientWith(() => ({ body: { player_id: "p1", faction: "DC", starting_tokens: 100 } }));
    const r = await joinGame(client, "g1", " Ada ", "DC");
    assert.equal(r.player_id, "p1");
    assert.deepEqual(JSON.parse(calls[0].body ?? ""), { handle: "Ada", device_key: id.publicKeyHex, faction: "DC" });
    assert.equal(calls[0].headers["X-Signature"], undefined);
  });

  it("sends events signed and reads one verdict each", async () => {
    const { client, calls, id } = clientWith(() => ({
      body: { results: [{ client_seq: 5, ok: true, reason: "", deltas: {}, weapon: "Axe" }, { client_seq: 6, duplicate: true, result: { ok: true, deltas: { p1: 10 } } }] },
    }));
    const v = await sendEvents(client, "g1", [
      { client_seq: 5, kind: "pickup", payload: { weapon: "Axe" } },
      { client_seq: 6, kind: "capture", payload: { anchor: "s1" } },
    ]);
    assert.equal(v.length, 2);
    assert.equal(v[1].deltas?.p1, 10);
    const call = calls[0];
    assert.match(call.url, /\/v1\/games\/g1\/events$/);
    assert.equal(JSON.parse(call.body ?? "").device_key, id.publicKeyHex);
    assert.ok(verifySignature(id.publicKeyHex, signingPayload("POST", "/v1/games/g1/events", utf8ToBytes(call.body ?? ""), Number(call.headers["X-Nonce"])), call.headers["X-Signature"]));
  });
});

describe("rooms: the outbox (EventOutbox.swift)", () => {
  it("numbers events by a clock that never repeats and delivers each verdict", async () => {
    const { clock } = fakeClock();
    const sent: number[][] = [];
    const box = new RoomOutbox(async (events) => {
      sent.push(events.map((e) => e.client_seq));
      return events.map((e) => ({ client_seq: e.client_seq, ok: true }));
    }, clock);
    const [a, b] = await Promise.all([box.submit("pickup", { weapon: "Axe" }), box.submit("capture", { anchor: "s" })]);
    assert.equal(a.ok && b.ok, true);
    assert.equal(b.client_seq, a.client_seq + 1);
    assert.ok(a.client_seq >= 1_760_000_000_000);
    // Self-clocked: the first went alone, the second rode the next request.
    assert.deepEqual(sent, [[a.client_seq], [b.client_seq]]);
  });

  it("drops a refused batch with the server's reason, and keeps a retryable one", async () => {
    const t = fakeClock();
    let mode: "refuse" | "down" | "up" = "refuse";
    const { client } = clientWith((c) => {
      if (!c.url.endsWith("/events")) return undefined;
      if (mode === "refuse") return { status: 409, body: { detail: "game is finished, not live" } };
      if (mode === "down") return { status: 503, body: { detail: "busy" } };
      const events = JSON.parse(c.body ?? "").events as { client_seq: number }[];
      return { body: { results: events.map((e) => ({ client_seq: e.client_seq, ok: true })) } };
    });
    const box = new RoomOutbox((events) => sendEvents(client, "g1", events), t.clock, 10000);
    const refused = await box.submit("hit", { target: "p2", range_m: 4 });
    assert.equal(refused.ok, false);
    assert.equal(refused.reason, "game is finished, not live");
    assert.equal(box.depth, 0);

    mode = "down";
    let answer: { ok: boolean; reason?: string | null } | null = null;
    void box.submit("respawn", {}).then((v) => (answer = v));
    await flush();
    assert.equal(box.depth, 1);
    mode = "up";
    await t.advance(300);
    assert.equal(answer!.ok, true);
    assert.equal(box.depth, 0);
  });

  it("tells a caller it is queued after the wait, without dropping the event", async () => {
    const t = fakeClock();
    const box = new RoomOutbox(() => new Promise(() => {}), t.clock, 10000);
    let answer: { reason?: string | null } | null = null;
    void box.submit("hit", {}).then((v) => (answer = v));
    await t.advance(10001);
    assert.equal(answer!.reason, QUEUED_REASON);
    assert.equal(box.depth, 1);
  });
});

class FakeSocket implements SocketLike {
  url: string;
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  push(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

describe("rooms: one player's session", () => {
  it("lobby, join, live link, an action and the end of the game", async () => {
    const t = fakeClock();
    const anchors = [{ id: "w1", asset: "axe", kind: "weapon", lat: 51.5, lng: -0.12, payload: { name: "Axe" } }];
    const { client, calls } = clientWith((c) => {
      if (c.url.endsWith("/v1/games/g1")) return { body: { game_id: "g1", title: "Ada's Room", status: "live", factions: [{ name: "DC", color: "#2973ED", players: 1 }], ends_at: "2099-01-01T00:00:00+00:00" } };
      if (c.url.endsWith("/anchors")) return { body: anchors };
      if (c.url.endsWith("/join")) return { body: { player_id: "p1", faction: "DC", starting_tokens: 100 } };
      if (c.url.endsWith("/state"))
        return {
          body: {
            factions: [{ faction: "DC", tokens: 100 }, { faction: "Marvel", tokens: 100 }],
            players: { p1: { tokens: 100, state: "active", faction: "DC", handle: "Ada" }, p2: { tokens: 100, state: "active", faction: "Marvel", handle: "Bo" } },
            captures: {},
          },
        };
      if (c.url.endsWith("/events")) {
        const events = JSON.parse(c.body ?? "").events as { client_seq: number; payload: Record<string, unknown> }[];
        return { body: { results: events.map((e) => ({ client_seq: e.client_seq, ok: true, reason: "", deltas: {}, weapon: e.payload.weapon })) } };
      }
      return undefined;
    });
    const sockets: FakeSocket[] = [];
    const session = createRoomSession({
      client,
      gameId: "g1",
      clock: t.clock,
      openSocket: (url) => {
        const s = new FakeSocket(url);
        sockets.push(s);
        return s;
      },
    });
    await session.load();
    assert.equal(session.get().terms?.title, "Ada's Room");
    assert.equal(session.get().anchors.length, 1);

    assert.equal(await session.join("Ada", "DC"), true);
    assert.equal(session.get().fight.tokens, 100);
    assert.equal(sockets.length, 1);
    assert.match(sockets[0].url, /^wss:\/\/g\.example\/v1\/games\/g1\/ws\?device_key=[0-9a-f]{64}$/);

    sockets[0].push({ t: "hello", you: "p1", factions: [{ faction: "DC", tokens: 100 }], players: { p1: { tokens: 100, state: "active", faction: "DC", handle: "Ada" } }, captures: {} });
    assert.equal(session.get().fight.connected, true);

    // A newcomer on the live map that the board has not named: the board is asked for once.
    sockets[0].push({ t: "map", players: { p1: { lat: 51.5, lng: -0.12, faction: "DC", state: "active" }, p2: { lat: 51.50004, lng: -0.12, faction: "Marvel", state: "active" } } });
    sockets[0].push({ t: "map", players: { p2: { lat: 51.50004, lng: -0.12, faction: "Marvel", state: "active" } } });
    await flush();
    assert.equal(calls.filter((c) => c.url.endsWith("/state")).length, 1);
    assert.equal(session.get().fight.players.p2?.handle, "Bo");

    // Position at a walking pace: once a second at most.
    session.setPosition({ lat: 51.5, lng: -0.12 }, 90);
    session.setPosition({ lat: 51.5, lng: -0.12 }, 91);
    assert.equal(sockets[0].sent.length, 1);
    assert.deepEqual(JSON.parse(sockets[0].sent[0]), { t: "pos", lat: 51.5, lng: -0.12, alt: 0, heading: 90 });

    const v = await session.pickUp(session.get().anchors[0] as GameAnchor);
    assert.equal(v.ok, true);
    assert.equal(session.get().fight.held?.name, "Axe");
    const ev = JSON.parse(calls.find((c) => c.url.endsWith("/events"))?.body ?? "").events[0];
    assert.equal(ev.kind, "pickup");
    assert.deepEqual(ev.payload, { weapon: "Axe", lat: 51.5, lng: -0.12 });

    // The link drops and comes back on its own.
    sockets[0].onclose?.();
    assert.equal(session.get().fight.connected, false);
    await t.advance(600);
    assert.equal(sockets.length, 2);

    sockets[1].push({ t: "game", status: "finished" });
    assert.equal(session.get().fight.gameStatus, "finished");
    const late = await session.capture("s1");
    assert.equal(late.ok, false);

    session.leave();
    assert.equal(sockets[1].closed, true);
  });

  it("a capture's verdict says at once that your side holds the shrine", () => {
    const v = parseVerdict({ client_seq: 7, ok: true, reason: "", deltas: { p1: 10 }, anchor: "s1", faction: "Gaming" });
    assert.ok(v);
    const s = { ...INITIAL_FIGHT, playerId: "p1", faction: "Gaming", tokens: 100 };
    const next = onVerdict(s, "capture", v, 1, 2);
    assert.equal(next.captures.s1, "Gaming");
    assert.equal(next.tokens, 110);
    assert.equal(anchorTitle({ id: "s1", kind: "capture_point", asset: "", lat: 0, lng: 0, payload: {} } as unknown as GameAnchor, next.captures, next.faction), "Your side holds this point");
  });

  it("leaving while the join is in flight opens no live link", async () => {
    const { client } = clientWith((c) => (c.url.endsWith("/join") ? { body: { player_id: "p1", faction: "DC", starting_tokens: 100 } } : c.url.endsWith("/anchors") ? { body: [] } : undefined));
    const sockets: FakeSocket[] = [];
    const session = createRoomSession({
      client,
      gameId: "g1",
      openSocket: (u) => {
        const s = new FakeSocket(u);
        sockets.push(s);
        return s;
      },
    });
    const joining = session.join("Ada", "DC");
    session.leave();
    assert.equal(await joining, false);
    assert.equal(sockets.length, 0);
  });

  it("a refused join is said in the server's words", async () => {
    const { client } = clientWith((c) => (c.url.endsWith("/join") ? { status: 402, body: { detail: { reason: "This event costs 50 CosCoins to enter.", entry_coins: 50 } } } : undefined));
    const session = createRoomSession({ client, gameId: "g1", openSocket: (u) => new FakeSocket(u) });
    assert.equal(await session.join("Ada", null), false);
    assert.equal(session.get().problem, "This event costs 50 CosCoins to enter.");
  });
});

describe("rooms: the Battle sheet's model (RoomsModel)", () => {
  it("starts a Room where you stand and keeps its code", async () => {
    const { client } = clientWith((c) => {
      if (c.url.endsWith("/v1/rooms")) return { body: { game_id: "g1", code: "ABC234", ends_at: "2099-01-01T00:00:00+00:00" } };
      if (c.url.includes("/v1/rooms/nearby")) return { body: [{ game_id: "g1", lat: 51.5, lng: -0.12, distance_m: 0, ends_at: "2099-01-01T00:00:00+00:00" }] };
      return undefined;
    });
    const model = createRoomsModel({ client: () => client, here: () => ({ ...HERE, accuracy: 8 }) });
    const r = await model.start(10, false);
    assert.equal(r?.code, "ABC234");
    assert.equal(model.liveHosting()?.game_id, "g1");
    await flush();
    assert.equal(model.get().nearby.length, 1);
  });

  it("without a fix it waits, and says so", async () => {
    const { client, calls } = clientWith(() => undefined);
    const model = createRoomsModel({ client: () => client, here: () => null });
    assert.equal(await model.start(10, false), null);
    assert.equal(model.get().problem, "Waiting for your location.");
    await model.refresh();
    assert.equal(calls.length, 0);
  });
});
