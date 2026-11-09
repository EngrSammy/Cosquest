import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  boardPlaceText,
  cardLabel,
  cardSubline,
  clock,
  clockLabel,
  dailyBlock,
  dailySub,
  orderPoints,
  pocketSub,
  resetTime,
  resultChips,
  resultHeadline,
  runAllowance,
  runPointOf,
  runQuestPoints,
  runReveal,
  type RunPoint,
  type RunState,
  sequenceLine,
  signed,
  stakeLine,
  stakeOf,
  stakeText,
  tierOfValue,
} from "../run.ts";

const P = (o: Partial<RunPoint>): RunPoint => ({ idx: 0, id: "p", name: "Big Ben", value: 100, done: false, earned: 0, hidden: false, forbidden: false, lat: 51.5, lng: -0.12, kind: "trivia", ...o });
const R = (points: RunPoint[], mode = "daily"): RunState => ({
  run_id: "r1",
  mode,
  region: "london",
  day: "2026-10-19",
  started_at: "",
  ends_at: "",
  remaining_s: 900,
  score: 300,
  finished: false,
  powers: { radar: 1, surge: 1 },
  surge_armed: false,
  points,
});
const names = (k: string) => ({ trivia: "Trivia", duel: "Duel" })[k] ?? k;

describe("quest run", () => {
  it("speaks the clock and the values", () => {
    assert.equal(clock(247.2), "4:08");
    assert.equal(clock(-3), "0:00");
    assert.equal(clockLabel(61), "1 minutes 1 seconds left");
    assert.equal(clockLabel(0), "Time's up");
    assert.equal(signed(240), "+240");
    assert.equal(signed(-150), "−150");
    assert.deepEqual([100, 200, 300, 400].map(tierOfValue), ["common", "rare", "epic", "epic"]);
  });
  it("resets at midnight UTC", () => {
    const at = resetTime(Date.UTC(2026, 9, 19, 22, 5), (d) => d.toISOString());
    assert.equal(at, "2026-10-20T00:00:00.000Z");
  });
  it("says why a daily run cannot start, and what is left", () => {
    assert.equal(dailyBlock(null), "Turn on location to run the streets.");
    assert.ok(dailyBlock({ accuracy: 80 })!.startsWith("Waiting for a precise location"));
    assert.equal(dailyBlock({ accuracy: 12 }), null);
    assert.equal(dailySub(null, 2), "Walk to points nearby. On today's Bounty Board. 2 left today.");
    assert.equal(dailySub(null, 0), "That's today's runs done. Back tomorrow.");
    assert.equal(pocketSub(1), "Indoors, no walking. XP only. 1 left today.");
    assert.deepEqual(runAllowance({ features: { run: { daily_runs_left: 2, pocket_runs_left: 0 } } }), { daily: 2, pocket: 0 });
    assert.deepEqual(runAllowance(null), { daily: null, pocket: null });
  });
  it("orders the route: open, then hidden, then best value per metre", () => {
    const pts = [P({ idx: 0, value: 100 }), P({ idx: 1, value: 400 }), P({ idx: 2, value: 400, done: true }), P({ idx: 3, value: 300, hidden: true })];
    const d = (p: RunPoint) => ({ 0: 50, 1: 800, 2: 10, 3: 5 })[p.idx as 0 | 1 | 2 | 3];
    assert.deepEqual(orderPoints(pts, d).map((p) => p.idx), [0, 1, 3, 2]);
  });
  it("labels the cards", () => {
    assert.equal(cardSubline(P({ hidden: true }), names), "Use Radar to find it");
    assert.equal(cardSubline(P({ forbidden: true }), names), "Forbidden Zone");
    assert.equal(cardSubline(P({ kind: null }), names), "Duel");
    assert.equal(cardLabel(P({ done: true, earned: -120 }), { inReach: false, pocket: false, distance: 10, challengeName: names }), "Big Ben, done, lost 120 points");
    assert.equal(cardLabel(P({}), { inReach: true, pocket: true, distance: null, challengeName: names }), "Big Ben, 100 points, Trivia, ready to play");
    assert.equal(cardLabel(P({}), { inReach: false, pocket: false, distance: 1234, challengeName: names }), "Big Ben, 100 points, Trivia, 1.2 km away");
  });
  it("puts the daily run on the map, not the pocket run", () => {
    const run = R([P({ idx: 4 }), P({ idx: 5, hidden: true }), P({ idx: 6, done: true })]);
    const q = runQuestPoints(run);
    assert.deepEqual(q.map((p) => p.id), ["run:4", "run:6"]);
    assert.equal(q[1].cooling_until, "9999-12-31T00:00:00Z");
    assert.equal(runQuestPoints(R([P({})], "pocket")).length, 0);
    assert.equal(runPointOf(run, "run:5")?.idx, 5);
    assert.equal(runPointOf(run, "shrine:5"), null);
  });
  it("stakes half, and words the result", () => {
    assert.equal(stakeOf(301), 150);
    assert.ok(stakeText(0, false).startsWith("Nothing to stake yet"));
    assert.ok(stakeText(150, true).includes("Win the fight"));
    assert.equal(resultHeadline({ late: true, earned: 0 }), "Time's up");
    assert.equal(resultHeadline({ late: false, earned: 240 }), "+240");
    assert.deepEqual(resultChips({ correct: 4, total: 5, earned: 300, speed_mult: 1.25, surged: true }), ["4 of 5", "Speed ×1.25", "Surge ×1.5"]);
    assert.equal(stakeLine({ stake: 90, won: false }), "Stake lost: −90");
    assert.equal(sequenceLine(4, 4), "All 4 in the right order.");
  });
  it("draws the reveal from the marks only", () => {
    assert.deepEqual(runReveal("trivia", { reveal: { marks: [true] } }, 2, []), { correct: [2], marks: [true] });
    assert.deepEqual(runReveal("trivia", { reveal: { marks: [false] } }, 2, []), { correct: [-1], marks: [false] });
    assert.deepEqual(runReveal("blitz", { reveal: { marks: [true, false] } }, null, [1, 3]), { correct: [1, -1], marks: [true, false] });
    assert.equal(runReveal("sequence", { reveal: {} }, null, []), null);
  });
  it("places the player on the board", () => {
    assert.equal(boardPlaceText(12, { world: false }), "#12 today in your city");
    assert.equal(boardPlaceText(1204, { world: true }), "about #1,204 worldwide today");
    assert.equal(boardPlaceText(1204, { world: true, approx: false }), "#1,204 worldwide today");
  });
});

import { spinBanner, spinReady } from "../wire.ts";

describe("spin", () => {
  it("rests, then is ready again", () => {
    const at = Date.UTC(2026, 9, 19, 12, 0);
    assert.equal(spinReady({ extra: null }, at), true);
    assert.equal(spinReady({ extra: { spin_ready_at: "2026-10-19T12:05:00Z" } }, at), false);
    assert.equal(spinReady({ extra: { spin_ready_at: "2026-10-19T11:55:00Z" } }, at), true);
  });
  it("names what went into the bag", () => {
    assert.deepEqual(spinBanner({ items: { time: 1, fifty: 2 }, xp: 5, streak_bonus: false, names: { fifty: "50/50", time: "Extra time" } }), {
      title: "+5 XP",
      subtitle: "1× Extra time  2× 50/50",
    });
    assert.deepEqual(spinBanner({ items: {}, xp: 10, streak_bonus: true, names: {} }), { title: "Spin streak! ×2", subtitle: "Bag full" });
  });
});

import { freshLoss, holdsLostOf } from "../wire.ts";

describe("holds lost", () => {
  it("tells each loss once", () => {
    const me = { features: { siege: { holds_lost: [{ point_id: "a", at: "t1", by_faction: "dc" }, { point_id: "b", at: "t2" }] } } };
    assert.equal(holdsLostOf(me).length, 2);
    assert.equal(freshLoss(holdsLostOf(me), new Set())?.point_id, "a");
    assert.equal(freshLoss(holdsLostOf(me), new Set(["at1"]))?.point_id, "b");
    assert.equal(freshLoss(holdsLostOf(null), new Set()), null);
  });
});

describe("run: the server's switch", () => {
  it("shows Quest Runs only when /me carries features.run (production runs with run OFF)", async () => {
    const { runOn } = await import("../run.ts");
    assert.equal(runOn({ features: { run: { daily_runs_left: 1 } } }), true);
    assert.equal(runOn({ features: { trivia: {} } }), false);
    assert.equal(runOn(null), false);
  });
});
