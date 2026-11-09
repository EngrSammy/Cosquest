// The journal's words and orders, as RoamSheets.swift and CodexFeature.swift write them.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  countChips,
  dailyLabel,
  dailyProgressText,
  detailRows,
  endsIn,
  groupByRealm,
  orderSets,
  playedText,
  regionName,
  resetTime,
  setLabel,
  streakLine,
  streakTitle,
  tileLabel,
  warBarWidth,
  warFooter,
} from "../journal.ts";
import type { CodexCard } from "../wire.ts";

const card = (over: Partial<CodexCard> = {}): CodexCard => ({
  point_id: "p1",
  point_name: "Cafe Nero",
  realm: "marvel",
  realm_name: "Marvel",
  tier: "rare",
  region: "london",
  region_name: "London",
  foil: false,
  first_at: "2026-10-01T10:00:00.123456+00:00",
  times: 1,
  ...over,
});

describe("journal: dailies", () => {
  it("words the streak as the sheet does", () => {
    assert.equal(streakTitle({ days: 0, best: 0, played_today: false }), "Start a streak");
    assert.equal(streakTitle({ days: 1, best: 1, played_today: true }), "1 day streak");
    assert.equal(streakTitle({ days: 4, best: 9, played_today: false }), "4 day streak");
    assert.equal(streakLine({ days: 0, best: 0, played_today: false }), "Play any point today to start one.");
    assert.equal(streakLine({ days: 3, best: 3, played_today: false }), "Play any point today to keep it going.");
    assert.equal(streakLine({ days: 3, best: 3, played_today: true }), "Played today. Come back tomorrow to keep it going.");
  });
  it("shows Done or n of m", () => {
    const d = { id: "a", title: "Win 3", progress: 1, target: 3, done: false, reward: { xp: 40, coins: 0 } };
    assert.equal(dailyProgressText(d), "1 of 3");
    assert.equal(dailyProgressText({ ...d, done: true, progress: 3 }), "Done");
    assert.equal(dailyLabel(d), "Win 3, 1 of 3, plus 40 XP");
  });
  it("shows tomorrow's UTC midnight in the player's clock", () => {
    const now = new Date(Date.UTC(2026, 9, 19, 23, 30));
    assert.match(resetTime(now, "en-US", "UTC"), /^12:00\s?AM$/);
    assert.match(resetTime(now, "en-US", "America/New_York"), /^8:00\s?PM$/);
  });
});

describe("journal: war", () => {
  it("calls the world your area", () => {
    assert.equal(regionName("world"), "Your area");
    assert.equal(regionName("london"), "London");
  });
  it("counts days then hours", () => {
    const now = Date.parse("2026-10-19T00:00:00Z");
    assert.equal(endsIn("2026-10-22T00:00:00.123456+00:00", now), "Ends in 3 days");
    assert.equal(endsIn("2026-10-20T06:00:00Z", now), "Ends in 1 day");
    assert.equal(endsIn("2026-10-19T05:30:00Z", now), "Ends in 5h");
    assert.equal(endsIn("2026-10-19T00:10:00Z", now), "Ends in 1h");
    assert.equal(endsIn("nonsense", now), "");
  });
  it("measures bars against the top house, never under 10", () => {
    assert.equal(warBarWidth(50, 100, 200), 100);
    assert.equal(warBarWidth(1, 1000, 200), 10);
    assert.equal(warBarWidth(0, 0, 200), 10);
    assert.equal(warBarWidth(100, 100, 200), 200);
  });
  it("words the footer", () => {
    assert.match(warFooter({ total: 0, players: 0 }), /^No points yet this week/);
    assert.match(warFooter({ total: 10, players: 1 }), /^1 player this week/);
    assert.match(warFooter({ total: 10, players: 7 }), /^7 players this week/);
  });
});

describe("journal: codex", () => {
  it("puts unfinished sets first, nearest to done first", () => {
    const sets = [
      { id: "a", title: "A", progress: 5, target: 5, done: true },
      { id: "b", title: "B", progress: 1, target: 5, done: false },
      { id: "c", title: "C", progress: 4, target: 5, done: false },
    ];
    assert.deepEqual(orderSets(sets).map((s) => s.id), ["c", "b", "a"]);
    assert.equal(sets[0].id, "a", "the server's list is left alone");
    assert.equal(setLabel(sets[0]), "A, 5 of 5, complete");
    assert.equal(setLabel(sets[1]), "B, 1 of 5");
  });
  it("groups by realm in the houses' order, newest first inside", () => {
    const cards = [card({ point_id: "1", realm: "gaming" }), card({ point_id: "2", realm: "anime" }), card({ point_id: "3", realm: "gaming" }), card({ point_id: "4", realm: "zeta" })];
    const g = groupByRealm(cards);
    assert.deepEqual(g.map((x) => x.realm), ["anime", "gaming", "zeta"]);
    assert.deepEqual(g[1].cards.map((c) => c.point_id), ["1", "3"]);
  });
  it("words the chips and the tile", () => {
    assert.deepEqual(countChips({ by_realm: {}, total: 1, foils: 0 }), ["1 card"]);
    assert.deepEqual(countChips({ by_realm: {}, total: 3, foils: 1 }), ["3 cards", "1 foil"]);
    assert.deepEqual(countChips({ by_realm: {}, total: 3, foils: 2 }), ["3 cards", "2 foils"]);
    assert.equal(tileLabel(card({ foil: true })), "Foil card, Cafe Nero, Rare");
    assert.equal(tileLabel(card()), "Cafe Nero, Rare");
    assert.equal(playedText(1), "Once");
    assert.equal(playedText(4), "4 times");
  });
  it("fills the detail rows, dropping First won when the date does not read", () => {
    const rows = detailRows(card({ times: 2 }), "en-US");
    assert.deepEqual(rows.slice(0, 3), [["Fandom", "Marvel"], ["City", "London"], ["Played", "2 times"]]);
    assert.deepEqual(rows[3], ["First won", "Oct 1, 2026"]);
    assert.equal(detailRows(card({ first_at: "soon" })).length, 3);
    assert.deepEqual(detailRows(card({ realm_name: null, region_name: null, realm: "dc", region: "paris" }))[0], ["Fandom", "Dc"]);
  });
});
