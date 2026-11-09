// The Warden's best next move, the tray's order and words, and the coach's
// steps (features/game/guide.ts, coach.ts; costquest-ios RoamGuide.swift).
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { coachStepFor, firstShrineLine, parseIdList, starterKindOf, unlockOfStep, unlockStep } from "../coach.ts";
import {
  bestNext,
  cardLabel,
  cardStatus,
  hereCount,
  minutesText,
  rechargeText,
  realmLine,
  relativeBearing,
  suggestedId,
  trayOrder,
} from "../guide.ts";
import type { QuestPoint, RoamMe } from "../wire.ts";

const NOW = Date.parse("2026-01-01T12:00:00Z");
const iso = (ms: number) => new Date(NOW + ms).toISOString();
const pt = (id: string, extra: Partial<QuestPoint> = {}): QuestPoint => ({
  id,
  name: `Place ${id}`,
  lat: 0,
  lng: 0,
  source: "landmark",
  place_kind: "landmark",
  tier: "common",
  realm: "dc",
  challenge: "trivia",
  ...extra,
});
const me = (level: number, o: Partial<RoamMe> = {}) =>
  ({ faction: "dc", tutorial_done: true, dailies: [], standing: { level }, ...o }) as unknown as RoamMe;
const dist = (m: Record<string, number>) => (p: QuestPoint) => m[p.id] ?? null;

describe("bestNext", () => {
  it("prefers a rarer, nearer point and skips the starter, cooling and far ones", () => {
    const pts = [
      pt("a", { tier: "common" }),
      pt("b", { tier: "epic" }),
      pt("s", { source: "starter", tier: "epic" }),
      pt("c", { tier: "epic", cooling_until: iso(60000) }),
      pt("far", { tier: "epic" }),
    ];
    const r = bestNext({ points: pts, me: me(1), distanceOf: dist({ a: 20, b: 100, s: 1, c: 1, far: 950 }), now: NOW });
    assert.equal(r?.point.id, "b");
    assert.equal(r?.reason, null);
  });

  it("distance costs a point per 250 m", () => {
    const pts = [pt("near", { tier: "rare" }), pt("far", { tier: "epic" })];
    // epic 3 - 800/250 = -0.2; rare 2 - 0 = 2.
    assert.equal(bestNext({ points: pts, me: me(1), distanceOf: dist({ near: 0, far: 800 }), now: NOW })?.point.id, "near");
  });

  it("a daily that wants a kind pulls toward it and names the quest", () => {
    const m = me(1, { dailies: [{ id: "blitz", title: "Win a Blitz", progress: 0, target: 1, done: false, reward: { xp: 1, coins: 0 } }] });
    const pts = [pt("t", { tier: "rare" }), pt("bl", { challenge: "blitz" })];
    const r = bestNext({ points: pts, me: m, distanceOf: dist({ t: 10, bl: 10 }), now: NOW });
    assert.equal(r?.point.id, "bl");
    assert.equal(r?.reason, "Win a Blitz");
  });

  it("the war and the codex add to the score once they are open", () => {
    const rival = pt("r", { extra: { holder: "marvel" } });
    const own = pt("o", { extra: { holder: "dc", codex: "owned" } });
    const d = dist({ r: 100, o: 100 });
    assert.equal(bestNext({ points: [own, rival], me: me(3), distanceOf: d, now: NOW })?.point.id, "r");
    // Before level 3 the holder is no reason: the nearer-first order wins on a tie by being first.
    assert.equal(bestNext({ points: [own, rival], me: me(1), distanceOf: d, now: NOW })?.point.id, "o");
  });

  it("a wanderer about to leave and a boss are pulled up", () => {
    const wander = pt("w", { source: "wander", extra: { expires_at: iso(5 * 60000) } });
    const late = pt("l", { source: "wander", extra: { expires_at: iso(60 * 60000) } });
    const d = dist({ w: 100, l: 100 });
    assert.equal(bestNext({ points: [late, wander], me: me(1), distanceOf: d, now: NOW })?.point.id, "w");
    const boss = pt("boss", { source: "raid" });
    assert.equal(bestNext({ points: [wander, boss], me: me(5), distanceOf: dist({ w: 100, boss: 100 }), now: NOW })?.point.id, "boss");
  });

  it("nothing in range is null", () => {
    assert.equal(bestNext({ points: [pt("x")], me: me(1), distanceOf: dist({}), now: NOW }), null);
    assert.equal(bestNext({ points: [], me: me(1), distanceOf: dist({}), now: NOW }), null);
  });
});

describe("suggestedId and trayOrder", () => {
  it("the starter is next until the first fight is done", () => {
    const pts = [pt("a", { tier: "epic" }), pt("s", { source: "starter" })];
    const d = dist({ a: 10, s: 5 });
    assert.equal(suggestedId({ points: pts, me: me(1, { tutorial_done: false }), distanceOf: d, now: NOW }), "s");
    assert.equal(suggestedId({ points: pts, me: me(1), distanceOf: d, now: NOW }), "a");
  });

  it("shows ten, the suggested card first only when it is among them", () => {
    const pts = Array.from({ length: 14 }, (_, i) => pt(`p${i}`));
    assert.equal(trayOrder(pts, null).length, 10);
    assert.deepEqual(trayOrder(pts, "p4").map((p) => p.id).slice(0, 3), ["p4", "p0", "p1"]);
    assert.equal(trayOrder(pts, "p12").map((p) => p.id).includes("p12"), false);
    assert.equal(trayOrder(pts, "p0")[0].id, "p0");
    // The input is not reordered.
    assert.equal(pts[0].id, "p0");
  });

  it("counts what can be played now", () => {
    const pts = [pt("a"), pt("b", { cooling_until: iso(60000) }), pt("c")];
    assert.equal(hereCount(pts, (p) => p.id !== "c", NOW), 1);
  });
});

describe("the card's words", () => {
  it("status falls through cooling, expiry, boss, holder, new, starter, guardian, tier", () => {
    const s = (p: QuestPoint, newCard = false) => cardStatus(p, { now: NOW, newCard });
    assert.deepEqual(s(pt("a", { cooling_until: iso(5 * 60000 - 1) })), { fact: "Ready in 5 min", tone: "mist" });
    assert.equal(s(pt("a", { cooling_until: iso(1000) })).fact, "Ready in 1 min");
    assert.equal(s(pt("a", { extra: { expires_at: iso(12 * 60000) } })).fact, "Gone in 12 min");
    assert.equal(s(pt("a", { source: "raid" })).fact, "Boss raid");
    const held = s(pt("a", { extra: { holder: "marvel" } }));
    assert.deepEqual(held, { fact: "Marvel", tone: "holder", holder: "marvel" });
    assert.equal(s(pt("a", { extra: { holder: "marvel", holder_name: "House Marvel" } })).fact, "House Marvel");
    assert.equal(s(pt("a"), true).fact, "New card");
    assert.equal(s(pt("a", { source: "starter" })).fact, "Start here");
    assert.equal(s(pt("a", { challenge: "duel", extra: { guardian: "Zed" } })).fact, "Zed");
    assert.equal(s(pt("a", { challenge: "duel" })).fact, "Keeper of Place a");
    assert.deepEqual(s(pt("a", { tier: "rare" })), { fact: "Rare", tone: "tier" });
  });

  it("minutes and recharge round up like the Swift", () => {
    assert.equal(minutesText(NOW + 61000, NOW), "2 min");
    assert.equal(minutesText(NOW - 1000, NOW), "1 min");
    assert.equal(rechargeText({ cooling_until: iso(30000) }, NOW), "Ready in a minute");
    assert.equal(rechargeText({ cooling_until: iso(3 * 60000) }, NOW), "Ready in 3 min");
    assert.equal(rechargeText({ cooling_until: null }, NOW), "Recharging");
  });

  it("the accessibility label reads like the Swift", () => {
    const o = { inReach: false, distanceText: "120 m", cooling: true, suggested: true };
    assert.equal(cardLabel(pt("a", { tier: "rare", challenge: "blitz" }), o), "Place a, Rare, Blitz, 120 m, recharging, the Warden's best next move");
    assert.equal(
      cardLabel(pt("a", { tier: "epic", challenge: "duel" }), { ...o, inReach: true, cooling: false, suggested: false }),
      "Place a, Duel, Keeper of Place a, Hard, in reach",
    );
  });

  it("the third line of the card", () => {
    const name = (id: string) => (id === "dc" ? "DC" : id);
    assert.equal(realmLine(pt("a"), name), "DC questions");
    assert.equal(realmLine(pt("a", { realm: "marvel" }), name), "Marvel questions");
    assert.equal(realmLine(pt("a", { challenge: "duel", extra: { guardian: "Zed" } }), name), "DC Guardian · Zed");
    assert.equal(realmLine(pt("a", { source: "raid" }), name), "Boss · fight it with your crew");
  });

  it("bearing is relative to where the phone faces", () => {
    assert.equal(relativeBearing(90, 0), 90);
    assert.equal(relativeBearing(10, 350), 20);
    assert.equal(relativeBearing(350, 10), 340);
    assert.equal(relativeBearing(90, null), null);
    assert.equal(relativeBearing(null, 10), null);
  });
});

describe("coach", () => {
  const none = new Set<string>();
  const base = { playerName: "Sam", hasStarter: true, hasSiege: false, done: none, introduced: none };

  it("the first shrine comes first, and only with a starter beside the player", () => {
    const m = me(1, { tutorial_done: false });
    assert.equal(coachStepFor({ ...base, me: m })?.id, "first-shrine");
    assert.match(coachStepFor({ ...base, me: m })?.line ?? "", /^Sam, your first Guardian/);
    assert.equal(coachStepFor({ ...base, me: m, hasStarter: false }), null);
    assert.equal(coachStepFor({ ...base, me: null }), null);
  });

  it("the first point's verb matches what its card does", () => {
    const m = me(1, { tutorial_done: false });
    assert.equal(coachStepFor({ ...base, me: m, starterKind: "duel" })?.line, "Sam, your first Guardian is right beside you. Tap its card to fight.");
    assert.equal(coachStepFor({ ...base, me: m, starterKind: "trivia" })?.line, "Sam, your first Quest Point is right beside you. Tap its card to answer.");
    assert.equal(firstShrineLine("Sam", "rebus"), "Sam, your first Quest Point is right beside you. Tap its card to answer.");
    assert.equal(firstShrineLine("Sam", "blitz"), "Sam, your first Quest Point is right beside you. Tap its card to play.");
    assert.equal(firstShrineLine("Sam", "sequence"), "Sam, your first Quest Point is right beside you. Tap its card to play.");
    // The kind as a tap plays it: the server's point_mode can turn any point into a duel, or a duel into a quiz.
    const starter = pt("s", { source: "starter", challenge: "trivia" });
    assert.equal(starterKindOf(starter, m), "trivia");
    assert.equal(starterKindOf(starter, me(1, { tutorial_done: false, features: { duel: { point_mode: "duel" } } } as Partial<RoamMe>)), "duel");
    assert.equal(starterKindOf(pt("d", { source: "starter", challenge: "duel" }), me(1, { features: { duel: { point_mode: "quiz" } } } as Partial<RoamMe>)), "trivia");
    assert.equal(starterKindOf(null, m), null);
  });

  it("then each unlock once, in order, then the siege", () => {
    const m = me(3);
    assert.equal(coachStepFor({ ...base, me: m })?.id, "unlock-codex");
    const seen = new Set(["codex", "relics"]);
    assert.equal(coachStepFor({ ...base, me: m, introduced: seen })?.id, "unlock-war");
    seen.add("war");
    assert.equal(coachStepFor({ ...base, me: m, introduced: seen })?.id, "unlock-battle");
    seen.add("battle");
    seen.add("walking");
    assert.equal(coachStepFor({ ...base, me: m, introduced: seen }), null);
    assert.equal(coachStepFor({ ...base, me: m, introduced: seen, hasSiege: true })?.id, "siege");
    assert.equal(coachStepFor({ ...base, me: m, introduced: seen, hasSiege: true, done: new Set(["siege"]) }), null);
    // The siege waits for the war to open.
    assert.equal(coachStepFor({ ...base, me: me(2), introduced: new Set(["codex", "relics", "walking"]), hasSiege: true }), null);
  });

  it("buttons say Show me or Got it as the Swift does", () => {
    assert.deepEqual([unlockStep("war").action, unlockStep("war").later, unlockStep("war").target], ["Show me", "Later", "war"]);
    assert.deepEqual([unlockStep("codex").action, unlockStep("codex").later], ["Got it", ""]);
    assert.deepEqual([unlockStep("raids").action, unlockStep("raids").target], ["Got it", null]);
    assert.equal(unlockOfStep("unlock-battle"), "battle");
    assert.equal(unlockOfStep("siege"), null);
    assert.equal(unlockOfStep("unlock-nope"), null);
  });

  it("reads a stored list defensively", () => {
    assert.deepEqual(parseIdList('["a","b"]'), ["a", "b"]);
    assert.deepEqual(parseIdList('["a",1]'), ["a"]);
    assert.deepEqual(parseIdList("nope"), []);
    assert.deepEqual(parseIdList(null), []);
    assert.deepEqual(parseIdList('{"a":1}'), []);
  });
});

describe("the Nearby tray's state chip", async () => {
  const { trayChipState } = await import("../guide.ts");
  const base: QuestPoint = { id: "x", name: "X", lat: 0, lng: 0, source: "landmark", place_kind: "", tier: "common", realm: "dc", challenge: "trivia" };
  const now = Date.parse("2026-11-01T12:00:00Z");
  const o = { ready: false, cooling: false, newCard: false, now };
  it("shows a rest as minutes left, before anything else", () => {
    const p = { ...base, cooling_until: "2026-11-01T12:05:30Z", source: "raid" };
    assert.deepEqual(trayChipState(p, { ...o, cooling: true, ready: true }), { text: "6 MIN", tone: "rest", timer: true });
  });
  it("says READY when it can be played now", () => {
    assert.deepEqual(trayChipState(base, { ...o, ready: true }), { text: "READY", tone: "ready" });
  });
  it("times a raid, and names one without a clock", () => {
    assert.deepEqual(trayChipState({ ...base, source: "raid", extra: { expires_at: "2026-11-01T12:14:00Z" } }, o), { text: "14 MIN", tone: "raid", timer: true });
    assert.deepEqual(trayChipState({ ...base, source: "raid" }, o), { text: "RAID", tone: "raid" });
  });
  it("marks new cards, the starter and holders; a plain point gets no chip", () => {
    assert.equal(trayChipState(base, { ...o, newCard: true })?.text, "NEW");
    assert.equal(trayChipState({ ...base, source: "starter" }, o)?.text, "START");
    assert.deepEqual(trayChipState({ ...base, extra: { holder: "marvel", holder_name: "Marvel" } }, o), { text: "MARVEL", tone: "holder", holder: "marvel" });
    assert.equal(trayChipState(base, o), null);
  });
});
