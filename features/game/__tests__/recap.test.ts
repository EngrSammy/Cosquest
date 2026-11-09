import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cardSubtitle, hasDayToTell, shareText, tiles } from "../recap.ts";
import type { RoamMe } from "../wire.ts";

describe("recap", () => {
  it("tells a day only when a point was played", () => {
    assert.equal(hasDayToTell(null), false);
    assert.equal(hasDayToTell({ today: { points_played: 0, correct: 0, xp: 0 } } as RoamMe), false);
    assert.equal(hasDayToTell({ today: { points_played: 2, correct: 1, xp: 30 } } as RoamMe), true);
  });
  it("words the card", () => {
    assert.equal(cardSubtitle(5, "Scout", "Marvel"), "Level 5 Scout · Marvel");
    assert.equal(cardSubtitle(5, "Scout"), "Level 5 Scout");
    assert.deepEqual(tiles({ points_played: 4, correct: 3, xp: 90 }), [
      { value: "4", label: "points" },
      { value: "3", label: "right" },
      { value: "90", label: "XP" },
    ]);
  });
  it("shares the numbers, the best stop and the story", () => {
    const t = shareText({ name: "Ada", level: 5, rank: "Scout", faction: "Marvel", today: { points_played: 1, correct: 1, xp: 30, best_place: "Tower Bridge" }, story: " A fine day. " });
    assert.equal(t.split("\n")[0], "My CostQuest day: 1 point, 1 right, 30 XP.");
    assert.ok(t.includes("Best stop: Tower Bridge"));
    assert.ok(t.endsWith("A fine day."));
    assert.ok(!shareText({ name: "Ada", level: 1, rank: "R", today: { points_played: 2, correct: 0, xp: 0 } }).includes("Best stop"));
  });
});
