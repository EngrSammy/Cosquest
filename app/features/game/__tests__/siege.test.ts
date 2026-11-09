// Sieges, holds and spawns (features/game/siege.ts): the look, the wire, the
// routes against a fake roam_siege server (no network), and the fight's state
// as SiegeView steps it.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GameClient } from "../client.ts";
import { Identity, signingPayload, utf8ToBytes, verifySignature } from "../identity.ts";
import {
  beatOf,
  effectLabel,
  effectsOf,
  expiresAt,
  focusTone,
  gradeTone,
  guardianHp,
  hitLabel,
  holdLine,
  holdOf,
  holdStrength,
  hpShare,
  initialSiege,
  isGone,
  isSiege,
  isWandering,
  nextAtFrom,
  parseSiegeAnswer,
  parseSiegeState,
  pinTint,
  pointAfterSiege,
  radarCounts,
  radarParts,
  radarText,
  removedChoices,
  rewardRows,
  ringOf,
  roundsLine,
  SIEGE_ROUND_SECONDS,
  SIEGE_ROUNDS,
  siegeAfter,
  siegeAnswer,
  siegeBegin,
  siegeDrop,
  siegeFaction,
  siegeFailed,
  siegeLanded,
  siegeOf,
  siegePick,
  siegePlaysAsDuel,
  siegeRewardSummary,
  siegeStart,
  siegeStarted,
  spanText,
  spawnLineLabel,
  spawnLineText,
  spawnsNext,
  totalRounds,
} from "../siege.ts";
import { flattenExtra, type QuestPoint, type RoamMe } from "../wire.ts";

const SEED = "33".repeat(32);
const T0 = Date.parse("2026-10-19T12:00:00Z");
const names: Record<string, string> = { anime: "Anime", marvel: "Marvel", dc: "DC" };
const factionName = (id: string) => names[id] ?? id;

function point(over: Partial<QuestPoint> = {}): QuestPoint {
  return {
    id: "L1",
    name: "Big Ben",
    lat: 51.5007,
    lng: -0.1246,
    source: "landmark",
    place_kind: "landmark",
    tier: "rare",
    realm: "movies",
    challenge: "trivia",
    extra: { holder: "anime", holder_name: "Anime", hold_strength: "72", siege_guardian_hp: "48" },
    ...over,
  };
}

const me = (faction: string | null, siege_mode?: string) => ({ faction, features: { duel: { siege_mode } } }) as unknown as RoamMe;

describe("holds", () => {
  it("reads the holder and a strength that never hides a flag", () => {
    assert.equal(holdStrength(point()), 72);
    assert.equal(holdStrength(point({ extra: { holder: "anime" } })), 100);
    assert.equal(holdStrength(point({ extra: { holder: "anime", hold_strength: "x" } })), 100);
    assert.equal(holdStrength(point({ extra: { holder: "anime", hold_strength: "140" } })), 100);
    assert.equal(holdStrength(point({ extra: { holder: "anime", hold_strength: "-3" } })), 0);
  });
  it("mine, rival or unheld", () => {
    assert.deepEqual(holdOf(point(), "anime"), { state: "mine", holderFaction: "anime", holderName: "Anime", strength: 72 });
    assert.equal(holdOf(point(), "dc").state, "rival");
    assert.equal(holdOf(point(), null).state, "rival");
    assert.equal(holdOf(point({ extra: { holder: "marvel" } }), "dc", factionName).holderName, "Marvel");
    assert.deepEqual(holdOf(point({ extra: { holder: "" } }), "dc"), { state: "unheld", holderFaction: null, holderName: null, strength: 0 });
    assert.equal(holdOf(point({ extra: null }), "dc").state, "unheld");
  });
  it("words the line as HoldLine does", () => {
    const ours = holdLine(point(), { faction: "anime" }, factionName);
    assert.equal(ours?.text, "Held by your faction: defend it");
    assert.equal(ours?.accessibilityLabel, "Held by your faction, strength 72 of 100. Play it to defend it.");
    assert.equal(ours?.strength, 72);
    const theirs = holdLine(point(), { faction: "dc" }, factionName);
    assert.equal(theirs?.text, "Held by Anime");
    assert.equal(theirs?.accessibilityLabel, "Held by Anime, strength 72 of 100.");
    assert.equal(theirs?.faction, "anime");
    const open = holdLine(point({ extra: {} }), { faction: "dc" }, factionName);
    assert.deepEqual([open?.kind, open?.text, open?.faction, open?.strength], ["unclaimed", "Unclaimed: take it for DC", "dc", null]);
    assert.equal(holdLine(point({ extra: {}, source: "starter" }), { faction: "dc" }, factionName), null, "a starter is never held");
    assert.equal(holdLine(point({ extra: {} }), { faction: null }, factionName), null, "no faction, nothing to take it for");
  });
  it("pin tint: raid, else holder, else tier", () => {
    assert.deepEqual(pinTint(point({ source: "raid" })), { kind: "raid" });
    assert.deepEqual(pinTint(point()), { kind: "holder", faction: "anime" });
    assert.deepEqual(pinTint(point({ extra: {} })), { kind: "tier", tier: "rare" });
  });
});

describe("siege: look", () => {
  it("reads the Guardian's HP from any of its keys, whole numbers only", () => {
    assert.equal(guardianHp(point()), 48);
    assert.equal(guardianHp(point({ extra: { "siege.guardian_hp": "30" } })), 30);
    assert.equal(guardianHp(point({ extra: { guardian_hp: "12" } })), 12);
    assert.equal(guardianHp(point({ extra: { guardian_hp: "12.5" } })), null);
    assert.equal(guardianHp(point({ extra: {} })), null);
    // A nested siege object, flattened as the client does.
    const nested = point({ extra: flattenExtra({ holder: "marvel", siege: { guardian_hp: 60, faction: "marvel", faction_name: "Marvel" } }) });
    assert.equal(guardianHp(nested), 60);
    assert.equal(siegeFaction(nested), "marvel");
    assert.equal(siegeOf(nested, me("dc"))?.factionName, "Marvel");
  });
  it("is a siege only against a rival, never on a boss or a starter", () => {
    assert.deepEqual(siegeOf(point(), me("dc")), { guardianHp: 48, faction: "anime", factionName: "Anime" });
    assert.equal(siegeOf(point(), me("anime")), null, "your own faction's Guardian");
    assert.equal(isSiege(point(), null), true, "no faction yet: a Guardian is a Guardian");
    assert.equal(isSiege(point({ source: "raid" }), me("dc")), false);
    assert.equal(isSiege(point({ source: "starter" }), me("dc")), false);
    assert.equal(isSiege(point({ extra: { holder: "anime" } }), me("dc")), false, "no Guardian HP, no siege");
    assert.equal(isSiege(point({ extra: { siege_guardian_hp: "40", siege_faction: "dc", holder: "anime" } }), me("dc")), false, "siege_faction wins over the holder");
    assert.equal(siegeOf(point({ extra: { siege_guardian_hp: "40", holder: "marvel" } }), me("dc"), factionName)?.factionName, "Marvel");
  });
  it("plays as a duel when the server says so", () => {
    assert.equal(siegePlaysAsDuel(me("dc", "duel")), true);
    assert.equal(siegePlaysAsDuel(me("dc", "quiz")), false);
    assert.equal(siegePlaysAsDuel(me("dc")), false);
    assert.equal(siegePlaysAsDuel(null), false);
  });
  it("grades and labels", () => {
    assert.deepEqual([gradeTone("Flawless"), gradeTone("Brilliant"), gradeTone("Good"), gradeTone(null)], ["sun", "mint", "sky", "sky"]);
    assert.equal(hitLabel({ damage: 11.6, grade: "Flawless" }), "-12  FLAWLESS!");
    assert.equal(hitLabel({ damage: null, grade: null }), "-0");
    assert.equal(effectLabel("surge"), "SURGE ×2");
    assert.equal(effectLabel("cleave"), "CLEAVE");
    assert.deepEqual([focusTone(100), focusTone(50), focusTone(25)], ["mint", "sun", "berry"]);
  });
});

// As SiegeFeature.swift decodes them (and roam_siege.py writes them).
const START = {
  siege_id: "s1",
  point_id: "L1",
  point_name: "Big Ben",
  faction_attacked: "anime",
  faction_attacked_name: "Anime",
  ability: "surge",
  resumed: false,
  relic: { id: "r1", name: "Ink Blade", faction: "dc", rarity: "rare", kind: "blade", power: 14, ability: "surge" },
  guardian_hp: 48,
  max_hp: 48,
  focus: 100,
  round: 0,
  rounds: 7,
  phase: "fight",
  question: { id: "q0", q: "Who?", choices: ["A", "B", "C", "D"], removed: [1, 2], seconds: 15, remaining_s: 14.5, round: 0 },
  seconds: 15,
  remaining_s: 14.5,
  deadline: "2026-10-19T12:00:15+00:00",
};

describe("siege: wire", () => {
  it("reads a start, and refuses one Swift would refuse", () => {
    const s = parseSiegeState(START);
    assert.equal(s.siege_id, "s1");
    assert.equal(s.relic?.name, "Ink Blade");
    assert.deepEqual(s.question?.removed, [1, 2]);
    assert.equal(totalRounds(s), 7);
    assert.equal(totalRounds({ rounds: null, max_rounds: 5 }), 5);
    assert.equal(totalRounds(null), SIEGE_ROUNDS);
    assert.throws(() => parseSiegeState({ ...START, guardian_hp: undefined }), /Guardian's HP/);
    assert.throws(() => parseSiegeState({ ...START, siege_id: 4 }), /an id/);
    assert.throws(() => parseSiegeState(null));
  });
  it("reads an answer, its reward and the drop wherever it is", () => {
    const relic = { kind: "relic", relic: { id: "r9", name: "Star Axe", faction: "dc", rarity: "epic", kind: "axe", power: 20, ability: "cleave" }, new: true };
    const r = parseSiegeAnswer({
      correct: true,
      grade: "Flawless",
      damage: 22,
      guardian_hp: 0,
      focus: 80,
      phase: "won",
      answer_index: 3,
      round: 2,
      effects: ["cleave", 7],
      reward: { xp: 240, faction_points: 60, lines: [{ label: "Hold taken", xp: 200, coins: 0, faction_points: 60 }, { label: "Speed", xp: 40 }], extras: [{ kind: "codex", title: "Card" }, relic] },
    });
    assert.deepEqual(r.effects, ["cleave"]);
    assert.equal(r.next, null);
    assert.equal(r.reward?.lines?.[1].faction_points, 0);
    assert.equal(siegeDrop(r.reward)?.title, "Star Axe", "title falls back to the relic's name");
    assert.equal(siegeDrop({ relic: { kind: "relic", title: "Top" }, extras: [relic as never] })?.title, "Top");
    assert.equal(siegeDrop(null), null);
    assert.throws(() => parseSiegeAnswer({ guardian_hp: 1, focus: 1, phase: "fight" }), /verdict/);
  });
});

// ---------- a fake roam_siege server ----------

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

function fakeSiegeServer(opts: { key?: number[]; refuse?: { status: number; detail: unknown } } = {}) {
  const key = opts.key ?? [0, 1, 2, 3, 0, 1, 2];
  const calls: Call[] = [];
  let hp = 48;
  let focus = 100;
  let failNext = 0;
  const question = (round: number) => ({ id: `q${round}`, q: `Question ${round}?`, choices: ["A", "B", "C", "D"], removed: round === 0 ? [1, 2] : null, seconds: 15, remaining_s: 15, round });
  const fetch = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    const reply = (status: number, body: unknown) => ({ ok: status < 300, status, text: async () => JSON.stringify(body) });
    if (failNext > 0) {
      failNext--;
      throw new Error("offline");
    }
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : {};
    if (u.pathname === "/v1/roam/siege/start") {
      if (opts.refuse) return reply(opts.refuse.status, { detail: opts.refuse.detail });
      return reply(200, { ...START, guardian_hp: hp, focus, question: question(0) });
    }
    if (u.pathname === "/v1/roam/siege/answer") {
      const right = key[body.round] === body.choice;
      if (right) hp = Math.max(0, hp - 24);
      else focus = Math.max(0, focus - 30);
      const phase = hp === 0 ? "won" : focus === 0 || body.round >= 6 ? "lost" : "fight";
      return reply(200, {
        correct: right,
        grade: right ? "Brilliant" : null,
        damage: right ? 24 : 0,
        guardian_hp: hp,
        focus,
        struck: !right,
        blocked: false,
        phase,
        next: phase === "fight" ? question(body.round + 1) : null,
        answer_index: key[body.round],
        round: body.round,
        reward: phase === "won" ? { xp: 240, faction_points: 60, lines: [] } : null,
        extras: phase === "lost" ? [{ kind: "codex", title: "Card" }] : null,
      });
    }
    if (u.pathname === "/v1/roam/spawns/next") return reply(200, { next_at: "2026-10-19T12:04:00+00:00", in_s: 240, alive: 2 });
    return reply(404, { detail: "Not Found" });
  };
  return { fetch, calls, offline: (n: number) => (failNext = n) };
}

function setup(opts: Parameters<typeof fakeSiegeServer>[0] = {}) {
  const id = new Identity(SEED, "device");
  const server = fakeSiegeServer(opts);
  const client = new GameClient({ baseUrl: "https://g.example", identity: () => id, fetch: server.fetch, sleep: async () => {} });
  return { id, server, client };
}

const signedOk = (id: Identity, call: Call, path: string) =>
  verifySignature(id.publicKeyHex, signingPayload("POST", path, utf8ToBytes(call.body ?? ""), Number(call.headers["X-Nonce"])), call.headers["X-Signature"]);

describe("siege: routes", () => {
  it("starts signed, with the body iOS sends (SiegeStartBody)", async () => {
    const { id, client, server } = setup();
    const s = await siegeStart(client, point(), { lat: 51.5, lng: -0.12, accuracy: -3 });
    assert.equal(s.phase, "fight");
    const call = server.calls[0];
    assert.equal(call.method, "POST");
    assert.equal(call.url, "https://g.example/v1/roam/siege/start");
    const body = JSON.parse(call.body ?? "{}");
    assert.deepEqual(Object.keys(body), ["device_key", "point_id", "lat", "lng", "accuracy_m"]);
    assert.deepEqual([body.device_key, body.point_id, body.accuracy_m], [id.publicKeyHex, "L1", 0]);
    assert.ok(signedOk(id, call, "/v1/roam/siege/start"));
  });
  it("answers signed, with the body iOS sends (SiegeAnswerBody)", async () => {
    const { id, client, server } = setup();
    const r = await siegeAnswer(client, "s1", 0, 0, 2345.6);
    assert.deepEqual([r.correct, r.guardian_hp, r.next?.round], [true, 24, 1]);
    const call = server.calls[0];
    const body = JSON.parse(call.body ?? "{}");
    assert.deepEqual(Object.keys(body), ["device_key", "siege_id", "round", "choice", "elapsed_ms"]);
    assert.deepEqual([body.siege_id, body.round, body.choice, body.elapsed_ms], ["s1", 0, 0, 2346]);
    assert.ok(signedOk(id, call, "/v1/roam/siege/answer"));
  });
  it("a refusal comes back in the server's words, and is not retried", async () => {
    const { client, server } = setup({ refuse: { status: 429, detail: { reason: "Rest up: you can siege again in 9 minutes." } } });
    await assert.rejects(siegeStart(client, point(), { lat: 0, lng: 0, accuracy: 5 }), /Rest up: you can siege again in 9 minutes\./);
    assert.equal(server.calls.length, 1);
  });
  it("waits for a location before starting", async () => {
    const { client, server } = setup();
    await assert.rejects(siegeStart(client, point(), null), /Waiting for your location/);
    assert.equal(server.calls.length, 0);
  });
  it("asks for the next spawn unsigned, lat and lng in the query, with one retry", async () => {
    const { client, server } = setup();
    server.offline(1);
    const r = await spawnsNext(client, 51.5, -0.12);
    assert.deepEqual(r, { next_at: "2026-10-19T12:04:00+00:00", in_s: 240, alive: 2 });
    assert.equal(server.calls.length, 2);
    const call = server.calls[1];
    assert.equal(call.method, "GET");
    assert.equal(call.url, "https://g.example/v1/roam/spawns/next?lat=51.5&lng=-0.12");
    assert.equal(call.headers["X-Signature"], undefined);
    assert.equal(nextAtFrom(r, T0), T0 + 240000);
    assert.equal(nextAtFrom({ alive: 0 }, T0), null);
    assert.equal(nextAtFrom(null, T0), null);
  });
});

describe("siege: the fight (SiegeView's state)", () => {
  it("starts from the point's HP, then the server's", () => {
    let m = initialSiege(point());
    assert.deepEqual([m.phase, m.hp, m.maxHp, m.focus], ["intro", 48, 48, 100]);
    assert.equal(initialSiege(point({ extra: {} })).hp, 40, "iOS's 40 when the point names none");
    m = siegeBegin(m);
    assert.equal(m.phase, "starting");
    assert.equal(siegeBegin(m), m, "Attack only counts from the intro");
    m = siegeStarted(m, parseSiegeState({ ...START, guardian_hp: 30, max_hp: 0 }), T0);
    assert.deepEqual([m.phase, m.hp, m.maxHp, m.round, m.seconds], ["fight", 30, 1, 0, 15]);
    assert.equal(m.deadline, T0 + 14500, "the server's seconds left, on this phone's clock");
    assert.deepEqual(ringOf(m, T0 + 500), { shown: 14, fraction: 14 / 15, hot: false });
    assert.equal(ringOf(m, T0 + 10000).hot, true);
    assert.equal(ringOf(m, T0 + 99999).shown, 0);
    assert.equal(hpShare(m), 1);
  });
  it("a siege already over goes straight to the result", () => {
    const m = siegeStarted(siegeBegin(initialSiege(point())), parseSiegeState({ ...START, phase: "lost", question: null, reward: { xp: 10 } }), T0);
    assert.deepEqual([m.phase, m.won, m.reward?.xp], ["result", false, 10]);
  });
  it("the 50/50 shows only in round 0, and goes at the reveal", () => {
    const m = siegeStarted(initialSiege(point()), parseSiegeState(START), T0);
    assert.deepEqual(removedChoices(m), [1, 2]);
    assert.deepEqual(removedChoices({ ...m, reveal: 0 }), []);
    assert.deepEqual(removedChoices({ ...m, round: 1 }), []);
  });
  it("a pick counts once, with the time it took; a timeout sends -1", () => {
    const m = siegeStarted(initialSiege(point()), parseSiegeState(START), T0);
    const p = siegePick(m, 2, T0 + 3210);
    assert.ok(p);
    assert.deepEqual(p.send, { siegeId: "s1", round: 0, choice: 2, elapsedMs: 3210 });
    assert.deepEqual([p.model.phase, p.model.picked], ["judging", 2]);
    assert.equal(siegePick(p.model, 1, T0 + 4000), null, "no second answer while judging");
    assert.equal(siegePick(m, -1, T0 + 15000)?.model.picked, null);
    assert.equal(siegePick(initialSiege(point()), 0, T0), null, "nothing to answer before the start");
  });
  it("stages each beat and counts the run for the Surge", () => {
    const hit = parseSiegeAnswer({ correct: true, grade: "Good", damage: 10, guardian_hp: 20, focus: 100, phase: "fight", round: 0, answer_index: 1 });
    const blocked = parseSiegeAnswer({ correct: false, blocked: true, guardian_hp: 20, focus: 100, phase: "fight" });
    const struck = parseSiegeAnswer({ correct: false, struck: true, guardian_hp: 20, focus: 70, phase: "fight" });
    assert.deepEqual([beatOf(hit), beatOf(blocked), beatOf(struck)], ["hit", "blocked", "struck"]);
    let m = siegeStarted(initialSiege(point()), parseSiegeState(START), T0);
    m = siegeLanded(m, hit);
    assert.deepEqual([m.hp, m.run, m.reveal, m.roundsUsed], [20, 1, 1, 1]);
    m = siegeLanded(m, struck);
    assert.deepEqual([m.run, m.focus], [0, 70]);
    assert.deepEqual(effectsOf({ effects: null, grade: "Good" }, "surge", 3), ["surge"]);
    assert.deepEqual(effectsOf({ effects: null, grade: "Good" }, "surge", 2), []);
    assert.deepEqual(effectsOf({ effects: null, grade: "Flawless" }, "cleave", 1), ["cleave"]);
    assert.deepEqual(effectsOf({ effects: ["ward"], grade: "Flawless" }, "cleave", 1), ["ward"], "the server's effects win");
  });
  it("plays a whole siege against the fake server: three rounds, taken", async () => {
    const { client } = setup({ key: [0, 3, 2, 1, 0, 0, 0] });
    let now = T0;
    let m = siegeBegin(initialSiege(point()));
    m = siegeStarted(m, await siegeStart(client, point(), { lat: 0, lng: 0, accuracy: 5 }), now);
    // Right, wrong, right: 48 - 24 - 24 = 0 in round 2, so the fourth is never asked.
    const picks = [0, 1, 2, 1];
    for (const choice of picks) {
      if (m.phase !== "fight") break;
      now += 2000;
      const p = siegePick(m, choice, now);
      assert.ok(p);
      m = p.model;
      const r = await siegeAnswer(client, p.send.siegeId, p.send.round, p.send.choice, p.send.elapsedMs);
      m = siegeLanded(m, r);
      m = siegeAfter(m, r, now);
    }
    assert.deepEqual([m.phase, m.won, m.hp, m.focus, m.roundsUsed], ["result", true, 0, 70, 3]);
    assert.equal(roundsLine(m), "3 rounds · 70 focus left");
    assert.deepEqual(rewardRows(m), [{ label: "Hold taken", xp: 240 }]);
    const summary = siegeRewardSummary(m, point(), null, null);
    assert.deepEqual([summary.headline, summary.win, summary.xp, summary.factionPoints, summary.coins], ["Taken!", true, 240, 60, 0]);
  });
  it("a lost siege keeps its extras as the reward", () => {
    const m0 = siegeStarted(initialSiege(point()), parseSiegeState(START), T0);
    const r = parseSiegeAnswer({ correct: false, guardian_hp: 48, focus: 0, phase: "lost", round: 6, extras: [{ kind: "codex", title: "Card" }] });
    const m = siegeAfter(siegeLanded(m0, r), r, T0);
    assert.deepEqual([m.phase, m.won, m.roundsUsed, m.reward?.extras?.[0].title], ["result", false, 7, "Card"]);
    assert.deepEqual(rewardRows(m), []);
    assert.equal(roundsLine({ roundsUsed: 1, focus: 5 }), "1 round · 5 focus left");
    assert.equal(siegeRewardSummary(m, point(), null, null).headline, "Repelled");
  });
  it("a failure keeps the reason", () => {
    const m = siegeFailed(initialSiege(point()), "Get closer: 180 m away.");
    assert.deepEqual([m.phase, m.failure], ["failed", "Get closer: 180 m away."]);
  });
  it("the point flies your colours at once after a win", () => {
    const p = pointAfterSiege(point({ extra: { holder: "anime", siege_guardian_hp: "48", "siege.faction": "anime", holder_since: "x" } }), "dc", "DC");
    assert.deepEqual(p.extra, { holder: "dc", holder_name: "DC", hold_strength: "60", holder_since: "x" });
  });
  it("iOS's numbers", () => {
    assert.deepEqual([SIEGE_ROUNDS, SIEGE_ROUND_SECONDS], [7, 15]);
  });
});

describe("spawns", () => {
  const wander = (expires: string | null, over: Partial<QuestPoint> = {}) => point({ source: "wander", extra: expires ? { expires_at: expires } : {}, ...over });

  it("knows a wanderer and when it leaves", () => {
    assert.equal(isWandering(wander(null)), true);
    assert.equal(isWandering(point({ extra: { wander: "1" } })), true);
    assert.equal(isWandering(point()), false);
    assert.equal(expiresAt(wander("2026-10-19T12:05:00.123456+00:00")), Date.parse("2026-10-19T12:05:00.123Z"));
    assert.equal(expiresAt(point()), null);
    assert.equal(isGone(wander("2026-10-19T12:00:00Z"), T0), true);
    assert.equal(isGone(wander("2026-10-19T12:00:01Z"), T0), false);
    assert.equal(isGone(point(), T0), false);
  });
  it("spans: seconds in the last minute, whole minutes rounded up", () => {
    assert.deepEqual([spanText(0), spanText(0.2), spanText(59), spanText(59.5), spanText(60), spanText(61), spanText(600), spanText(-5)], ["0 s", "1 s", "59 s", "1 min", "1 min", "2 min", "10 min", "0 s"]);
  });
  it("words the card's line", () => {
    assert.equal(spawnLineText(wander("2026-10-19T12:12:00Z"), T0), "Wandering · gone in 12 min");
    assert.equal(spawnLineText(wander("2026-10-19T12:00:42Z"), T0), "Wandering · gone in 42 s");
    assert.equal(spawnLineText(wander("2026-10-19T11:59:00Z"), T0), "Wandered off. Look for the next one");
    assert.equal(spawnLineText(point(), T0), null);
    assert.equal(spawnLineLabel(wander("2026-10-19T12:00:42Z"), T0), "Wandering challenge, gone in 42 s");
    assert.equal(spawnLineLabel(wander("2026-10-19T11:59:00Z"), T0), "This wandering challenge has gone");
  });
  it("the radar counts what is here and still here", () => {
    const pts = [
      point({ id: "a" }),
      wander("2026-10-19T12:10:00Z", { id: "b" }),
      wander("2026-10-19T11:50:00Z", { id: "c" }), // gone: counts for nothing
      wander(null, { id: "d" }),
    ];
    const reach = (p: QuestPoint) => p.id === "a" || p.id === "c";
    assert.deepEqual(radarCounts(pts, reach, T0), { reach: 1, wandering: 2 });
    assert.equal(radarText(pts, reach, T0 + 240000, T0), "1 in reach · 2 wandering · next in 4 min");
    assert.equal(radarText(pts, reach, T0 - 1, T0), "1 in reach · 2 wandering");
    assert.equal(radarText([], reach, null, T0), "");
    assert.deepEqual(radarParts(0, 0, T0 + 30000, T0), ["next in 30 s"]);
  });
});
