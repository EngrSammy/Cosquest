// Boss raids (features/game/raids.ts): the wire, the look, the routes and the
// polling session, against a fake roam_raids server (no network). The live
// staging check is raids.live.test.ts.
import { HELD_LINE } from "../duelFlow.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GameClient } from "../client.ts";
import { Identity, signingPayload, utf8ToBytes, verifySignature } from "../identity.ts";
import {
  crewByDamage,
  createRaidSession,
  currentQuestion,
  isRaidPoint,
  lobbyClockText,
  minutesLeftText,
  nearestBoss,
  normaliseRaidState,
  raidAnswer,
  raidDuelBlurb,
  raidDuelInfo,
  raidDuelReward,
  raidHp,
  raidJoin,
  raidLineText,
  raidPlayerCount,
  raidPlaysAsDuel,
  raidState,
  raidTint,
  raidUntil,
  rewardItems,
  revealRows,
  rulesText,
  secondsLeft,
  type RaidState,
} from "../raids.ts";
import type { DuelOutcome, DuelStart, QuestPoint, RoamMe } from "../wire.ts";

const SEED = "22".repeat(32);
const T0 = Date.parse("2026-10-14T15:10:00Z");

function point(over: Partial<QuestPoint> = {}): QuestPoint {
  return {
    id: "R4292_-7_2026101415",
    name: "Ink Colossus",
    lat: 51.507,
    lng: -0.128,
    source: "raid",
    place_kind: "raid",
    tier: "epic",
    realm: "movies",
    challenge: "blitz",
    extra: { raid_until: "2026-10-14T15:30:00+00:00", raid_players: "3" },
    ...over,
  };
}

describe("raids: look", () => {
  it("knows a boss and when it leaves", () => {
    const p = point();
    assert.equal(isRaidPoint(p), true);
    assert.equal(raidTint(p), "#c221d6");
    assert.equal(raidTint(point({ source: "landmark" })), null);
    assert.equal(raidUntil(p), Date.parse("2026-10-14T15:30:00Z"));
    assert.equal(raidPlayerCount(p), 3);
  });
  it("reads the boss's health from either key, and only whole numbers", () => {
    assert.equal(raidHp(point()), null);
    assert.deepEqual(raidHp(point({ extra: { raid_hp: "5000", raid_hp_max: "6000" } })), { left: 5000, max: 6000 });
    assert.deepEqual(raidHp(point({ extra: { hp_left: "4", hp_max: "10" } })), { left: 4, max: 10 });
    assert.equal(raidHp(point({ extra: { raid_hp: "5", raid_hp_max: "0" } })), null);
    assert.equal(raidHp(point({ extra: { raid_hp: "x", raid_hp_max: "10" } })), null);
  });
  it("writes the point card's line as iOS does", () => {
    assert.equal(raidLineText(point(), T0), "BOSS RAID · 3 players · 20 min left");
    assert.equal(raidLineText(point({ extra: { raid_players: "1", raid_until: "2026-10-14T15:10:30Z" } }), T0), "BOSS RAID · 1 player · 1 min left");
    assert.equal(raidLineText(point({ extra: { raid_until: "2026-10-14T15:00:00Z" } }), T0), "BOSS RAID · leaving now");
    assert.equal(raidLineText(point({ extra: null }), T0), "BOSS RAID");
    assert.equal(minutesLeftText(T0 + 61000, T0), "2 min left");
  });
  it("the banner's boss is the nearest one still out", () => {
    const gone = point({ id: "a", extra: { raid_until: "2026-10-14T15:00:00Z" } });
    const shrine = point({ id: "b", source: "landmark" });
    const out = point({ id: "c" });
    const noClock = point({ id: "d", extra: {} });
    assert.equal(nearestBoss([gone, shrine, out, noClock], T0)?.id, "c");
    assert.equal(nearestBoss([gone, shrine, noClock], T0)?.id, "d");
    assert.equal(nearestBoss([gone, shrine], T0), null);
  });
  it("a boss is a duel when the server says so", () => {
    const me = (mode: string | null) => ({ features: { duel: { raid_mode: mode } } }) as unknown as RoamMe;
    assert.equal(raidPlaysAsDuel(point(), me("quiz")), false);
    assert.equal(raidPlaysAsDuel(point(), me("duel")), true);
    assert.equal(raidPlaysAsDuel(point({ challenge: "duel" }), null), true);
    assert.equal(raidPlaysAsDuel(point({ source: "landmark", challenge: "duel" }), me("duel")), false);
  });
});

describe("raids: wire", () => {
  it("tolerates a sparse state", () => {
    const s = normaliseRaidState({ lobby_id: "L", phase: "fight", questions: [{ id: "q1", q: "?", choices: ["a", "b"] }] });
    assert.equal(s.boss_name, "The boss");
    assert.equal(s.questions[0].clue, null);
    assert.deepEqual(s.you, { member: false, damage: 0, answered: [], answered_count: 0 });
    assert.equal(s.reveal, null);
    assert.equal(s.reward, null);
    assert.equal(normaliseRaidState(null).phase, "lobby");
  });
  it("reads the end of a fight: the key, the reward, the crew", () => {
    const s = normaliseRaidState({
      lobby_id: "L",
      phase: "won",
      questions: [
        { id: "a", q: "One?", choices: ["x", "y"] },
        { id: "b", q: "Two?", choices: ["p", "q"] },
      ],
      reveal: { correct: [1, 7] },
      reward: { xp: 300, coins: 30, faction_points: 60, items: { retry: 1, fifty: 1 } },
      players: [
        { handle: "Ada", damage: 10, you: false },
        { handle: "Bo", damage: 30, you: true },
        { handle: "Cy", damage: 10, you: false },
      ],
      fight_seconds: 45,
      damage_per_hit: 32,
    });
    assert.deepEqual(revealRows(s), [
      { q: "One?", answer: "y" },
      { q: "Two?", answer: null },
    ]);
    assert.deepEqual(rewardItems(s.reward!, { retry: "Retry token" }).map((r) => r.text), ["1 × Fifty", "1 × Retry token"]);
    assert.deepEqual(crewByDamage(s.players).map((p) => p.handle), ["Bo", "Ada", "Cy"]);
    assert.equal(rulesText(s), "5 questions · 45 seconds · each right answer hits for 32");
  });
  it("the lobby's clock line", () => {
    const s = normaliseRaidState({ window_ends_at: "2026-10-14T15:30:00.000123+00:00" });
    assert.equal(lobbyClockText(s, T0), "The boss leaves in 20 min");
    assert.equal(lobbyClockText(s, Date.parse("2026-10-14T15:31:00Z")), "The boss is leaving: start now!");
    assert.equal(lobbyClockText(normaliseRaidState({}), T0), null);
  });
});

// ---------- a fake roam_raids server ----------

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

function fakeRaidServer(opts: { key?: number[]; refuseJoin?: { status: number; detail: unknown } } = {}) {
  const key = opts.key ?? [1, 2, 3, 0, 1];
  const calls: Call[] = [];
  let phase = "lobby";
  let hp = 100;
  let damage = 0;
  const answers: Record<string, number> = {};
  let failNext = 0;
  const questions = key.map((_, i) => ({ id: `q${i}`, q: `Question ${i}?`, choices: ["A", "B", "C", "D"], clue: null }));
  const state = () => ({
    kind: "quiz",
    lobby_id: "R1_2_2026101415",
    boss_name: "Lag Hydra",
    realm: "gaming",
    phase,
    hp,
    max_hp: 100,
    players: [{ handle: "You", damage, you: true }],
    max_players: 20,
    window_ends_at: "2026-10-14T15:30:00+00:00",
    fight_seconds: 45,
    seconds_left: phase === "fight" ? 40 : 0,
    damage_per_hit: 32,
    questions: phase === "lobby" ? [] : questions,
    reveal: phase === "won" || phase === "lost" ? { correct: key } : null,
    reward: phase === "won" ? { xp: 300, coins: 30, faction_points: 60, items: { retry: 1, fifty: 1 } } : null,
    you: { member: true, damage, answered: Object.keys(answers).map(Number).sort(), answered_count: Object.keys(answers).length },
  });
  const fetch = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    const reply = (status: number, body: unknown) => ({ ok: status < 300, status, text: async () => JSON.stringify(body) });
    if (failNext > 0) {
      failNext--;
      throw new Error("offline");
    }
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(init.body) : {};
    if (path === "/v1/roam/raids/join") {
      if (opts.refuseJoin) return reply(opts.refuseJoin.status, { detail: opts.refuseJoin.detail });
      return reply(200, state());
    }
    if (path === "/v1/roam/raids/start") {
      if (phase === "lobby") phase = "fight";
      return reply(200, state());
    }
    if (path === "/v1/roam/raids/state") return reply(200, state());
    if (path === "/v1/roam/raids/answer") {
      const q = String(body.question);
      let accepted = false;
      let hit = false;
      let dealt = 0;
      if (phase === "fight" && !(q in answers)) {
        accepted = true;
        hit = key[body.question] === body.choice;
        dealt = hit ? 32 : 0;
        answers[q] = body.choice;
        damage += dealt;
        hp = Math.max(0, hp - dealt);
        if (hp === 0) phase = "won";
      }
      return reply(200, { accepted, hit, damage: dealt, state: state() });
    }
    return reply(404, { detail: "Not Found" });
  };
  return {
    fetch,
    calls,
    setPhase: (p: string) => (phase = p),
    offline: (n: number) => (failNext = n),
  };
}

function manualTimers() {
  let queue: { fn: () => void; ms: number }[] = [];
  return {
    schedule(fn: () => void, ms: number) {
      const job = { fn, ms };
      queue.push(job);
      return () => {
        queue = queue.filter((j) => j !== job);
      };
    },
    get pending() {
      return queue.length;
    },
    /** Fire every timer due now, and let their requests settle. */
    async fire() {
      const due = queue;
      queue = [];
      for (const j of due) j.fn();
      await settle();
    },
  };
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

function setupSession(opts: Parameters<typeof fakeRaidServer>[0] = {}) {
  const id = new Identity(SEED, "device");
  const server = fakeRaidServer(opts);
  const client = new GameClient({ baseUrl: "https://g.example", identity: () => id, fetch: server.fetch, sleep: async () => {} });
  const timers = manualTimers();
  let now = T0;
  const finished: RaidState[] = [];
  const swings: boolean[] = [];
  const session = createRaidSession({
    client,
    pointId: "R1_2_2026101415",
    fix: () => ({ lat: 51.5, lng: -0.12, accuracy: 12 }),
    now: () => now,
    schedule: timers.schedule,
    onFinished: (s) => finished.push(s),
    onSwing: (hit) => swings.push(hit),
  });
  return { id, server, client, timers, session, finished, swings, advance: (ms: number) => (now += ms) };
}

describe("raids: routes", () => {
  it("joins signed, with the body iOS sends (RaidJoinBody)", async () => {
    const { id, client, server } = setupSession();
    const s = await raidJoin(client, "R1_2_2026101415", { lat: 51.5, lng: -0.12, accuracy: 9000 });
    assert.equal(s.phase, "lobby");
    const call = server.calls[0];
    assert.equal(call.method, "POST");
    assert.equal(call.url, "https://g.example/v1/roam/raids/join");
    const body = JSON.parse(call.body ?? "{}");
    assert.deepEqual(Object.keys(body), ["device_key", "point_id", "lat", "lng", "accuracy_m"]);
    assert.equal(body.device_key, id.publicKeyHex);
    assert.equal(body.accuracy_m, 5000);
    const payload = signingPayload("POST", "/v1/roam/raids/join", utf8ToBytes(call.body ?? ""), Number(call.headers["X-Nonce"]));
    assert.ok(verifySignature(id.publicKeyHex, payload, call.headers["X-Signature"]));
  });
  it("reads the state unsigned, with the key only in the query", async () => {
    const { id, client, server } = setupSession();
    await raidState(client, "R1_2_2026101415");
    const call = server.calls[0];
    assert.equal(call.method, "GET");
    assert.equal(call.url, `https://g.example/v1/roam/raids/state?lobby_id=R1_2_2026101415&device_key=${id.publicKeyHex}`);
    assert.equal(call.headers["X-Signature"], undefined);
  });
  it("a swing is marked by the server", async () => {
    const { client, server } = setupSession();
    server.setPhase("fight");
    const hit = await raidAnswer(client, "L", 0, 1);
    assert.deepEqual([hit.accepted, hit.hit, hit.damage, hit.state.hp], [true, true, 32, 68]);
    const again = await raidAnswer(client, "L", 0, 1);
    assert.equal(again.accepted, false);
    assert.equal(JSON.parse(server.calls[0].body ?? "{}").question, 0);
  });
  it("a refusal comes back in the server's words", async () => {
    const { client } = setupSession({ refuseJoin: { status: 403, detail: { reason: "Get closer: 180 m away.", distance_m: 180 } } });
    await assert.rejects(raidJoin(client, "R", { lat: 0, lng: 0, accuracy: 5 }), /Get closer: 180 m away\./);
  });
});

describe("raids: the session (RaidModel)", () => {
  it("joins, polls once a second, starts, swings, and stops when the boss falls", async () => {
    const { session, timers, server, finished, swings, advance } = setupSession();
    const seen: string[] = [];
    session.subscribe(() => seen.push(session.get().state?.phase ?? "-"));
    await session.run();
    assert.equal(session.get().state?.phase, "lobby");
    assert.equal(timers.pending, 1, "a poll is scheduled");
    await timers.fire();
    assert.equal(server.calls.filter((c) => c.url.includes("/state")).length, 1);

    await session.start();
    let snap = session.get();
    assert.equal(snap.state?.phase, "fight");
    assert.equal(snap.fightEndsAt, T0 + 40000, "the clock is rebased on the server's seconds_left");
    assert.equal(secondsLeft(snap, T0 + 500), 40);
    advance(1000);
    assert.equal(currentQuestion(snap), 0);

    // A double tap sends one swing.
    await Promise.all([session.answer(0, 1), session.answer(0, 2)]);
    snap = session.get();
    assert.equal(server.calls.filter((c) => c.url.endsWith("/answer")).length, 1);
    assert.deepEqual([snap.lastHit, snap.lastDamage, snap.swings], [true, 32, 1]);
    assert.equal(currentQuestion(snap), 1);

    await session.answer(1, 0); // wrong
    assert.equal(session.get().lastHit, false);
    await session.answer(2, 3); // right
    await session.answer(3, 0); // right
    assert.equal(session.get().state?.hp, 4);
    await session.answer(4, 1); // right: the boss falls
    snap = session.get();
    assert.equal(snap.state?.phase, "won");
    assert.equal(snap.fightEndsAt, null);
    assert.equal(currentQuestion(snap), null);
    assert.deepEqual(swings, [true, false, true, true, true]);
    assert.equal(finished.length, 1, "the end is announced once");
    assert.deepEqual(snap.state?.reward?.items, { retry: 1, fifty: 1 });

    await timers.fire(); // the poll that was waiting sees it over and stops
    assert.equal(timers.pending, 0);
    assert.equal(finished.length, 1);
    assert.ok(seen.includes("fight"));
  });

  it("a failed swing frees the question again, with the reason", async () => {
    const { session, server } = setupSession();
    await session.run();
    await session.start();
    server.offline(2); // the request and its one retry
    await session.answer(0, 1);
    const snap = session.get();
    assert.deepEqual(snap.pending, []);
    assert.equal(snap.notice, "Can't reach CosQuest right now.");
    assert.equal(currentQuestion(snap), 0);
    session.stop();
  });

  it("says the line is shaky only when polls keep failing", async () => {
    const { session, timers, server } = setupSession();
    await session.run();
    server.offline(2); // one poll (with its retry)
    await timers.fire();
    assert.equal(session.get().notice, null);
    server.offline(2);
    await timers.fire();
    assert.equal(session.get().notice, "Connection is shaky…");
    await timers.fire();
    assert.equal(session.get().notice, null, "a good poll clears it");
    session.stop();
    assert.equal(timers.pending, 0);
  });

  it("an older reply never replaces a newer state", async () => {
    const id = new Identity(SEED, "device");
    const server = fakeRaidServer();
    // Hold the state polls back until told.
    const held: (() => void)[] = [];
    const slow = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
      if (url.includes("/state")) await new Promise<void>((r) => held.push(r));
      return server.fetch(url, init);
    };
    const client = new GameClient({ baseUrl: "https://g.example", identity: () => id, fetch: slow });
    const session = createRaidSession({ client, pointId: "R", fix: () => ({ lat: 0, lng: 0, accuracy: 5 }), schedule: () => () => {} });
    await session.join();
    const poll = session.refresh(); // asked in the lobby...
    await settle();
    await session.start(); // ...the fight starts meanwhile
    server.setPhase("lobby"); // what the slow poll will (wrongly, by now) say
    held.forEach((r) => r());
    await poll;
    assert.equal(session.get().state?.phase, "fight");
  });

  it("can't join: the server's words, and Try again", async () => {
    const { session, timers } = setupSession({ refuseJoin: { status: 409, detail: { reason: "This boss has already been fought this hour." } } });
    await session.run();
    assert.equal(session.get().failure, "This boss has already been fought this hour.");
    assert.equal(timers.pending, 0, "nothing polls without a lobby");
  });

  it("waits for a location before joining", async () => {
    const id = new Identity(SEED, "device");
    const server = fakeRaidServer();
    const client = new GameClient({ baseUrl: "https://g.example", identity: () => id, fetch: server.fetch });
    const session = createRaidSession({ client, pointId: "R", fix: () => null, schedule: () => () => {} });
    await session.run();
    assert.equal(session.get().failure, "Waiting for your location.");
    assert.equal(server.calls.length, 0);
  });

  it("pauses off screen and catches up on return", async () => {
    const { session, timers, server } = setupSession();
    await session.run();
    session.pause();
    assert.equal(timers.pending, 0);
    server.setPhase("fight");
    session.resume();
    await settle();
    assert.equal(session.get().state?.phase, "fight");
    assert.equal(timers.pending, 1);
    session.stop();
  });
});

describe("raids: a boss fought as a duel", () => {
  // As staging answered on 2026-10-14 (raids.live.test.ts).
  const outcome = {
    duel_id: "e9d15dfa-c2b9-4cd2-83a5-98d583607420",
    mode: "raid",
    status: "won",
    repeat: false,
    result: { winner: 1, ticks: 1782, p1_hp: 678, p2_hp: 0 },
    reward: null,
    raid: { damage: 1000, hp_left: 4000, hp_max: 6000, defeated: false, reward: null },
  } as unknown as DuelOutcome;

  it("reads the raid block of the start, beside or inside the setup", () => {
    const raid = { raid_id: "R", boss_name: "Ink Colossus", hp_max: 6000, hp_left: 5000, fighters: 3 };
    assert.equal(raidDuelInfo({ raid, setup: {} } as unknown as DuelStart)?.hp_left, 5000);
    assert.equal(raidDuelInfo({ setup: { raid } } as unknown as DuelStart)?.fighters, 3);
    assert.equal(raidDuelInfo({ setup: {} } as unknown as DuelStart), null);
  });

  it("the reward screen says what the fight did, and pays only what the ledger paid", () => {
    const r = raidDuelReward(outcome, point(), null, null);
    assert.equal(r.headline, "Knocked out!");
    assert.equal(r.win, true);
    assert.equal(r.xp, 0);
    assert.match(r.note ?? "", /^You dealt 1000 damage\. Boss HP 4000 \/ 6000\. Every hit you landed counts/);
    const down = raidDuelReward(
      {
        ...outcome,
        reward: { xp: 350, coins: 30, faction_points: 50, lines: [] },
        raid: { damage: 1000, hp_left: 0, hp_max: 6000, defeated: true },
      } as unknown as DuelOutcome,
      point(),
      null,
      null,
    );
    assert.deepEqual([down.headline, down.xp, down.coins, down.factionPoints], ["Boss down!", 350, 0, 50]);
    assert.match(down.note ?? "", /Ink Colossus is down/);
    const held = raidDuelReward({ ...outcome, status: "held", message: "This fight is being checked." } as DuelOutcome, point(), null, null);
    assert.deepEqual([held.headline, held.win, held.note], ["Checking the score", false, HELD_LINE]);
  });

  it("the briefing line counts the crew", () => {
    assert.match(raidDuelBlurb(point()), /3 fighters have hit it this hour\.$/);
    assert.doesNotMatch(raidDuelBlurb(point({ extra: {} })), /fighter/);
  });
});
