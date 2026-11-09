// Unlocks by level (costquest-ios Roam/RoamGuide.swift RoamUnlock).
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PRODUCTION_GAME_SERVER, STAGING_GAME_SERVER } from "../config.ts";
import { pendingUnlock, unlockAllFor, unlocked, visiblePoints } from "../unlocks.ts";
import type { QuestPoint, RoamMe } from "../wire.ts";

const at = (level: number) => ({ standing: { level } }) as unknown as RoamMe;

describe("unlocks", () => {
  it("open at the iOS levels", () => {
    assert.equal(unlocked(at(1), "codex"), false);
    assert.equal(unlocked(at(2), "codex"), true);
    assert.equal(unlocked(at(2), "walking"), true);
    assert.equal(unlocked(at(3), "battle"), true);
    assert.equal(unlocked(at(3), "friends"), false);
    assert.equal(unlocked(at(4), "friends"), true);
    assert.equal(unlocked(at(4), "raids"), false);
    assert.equal(unlocked(at(5), "raids"), true);
    assert.equal(unlocked(null, "codex"), false);
  });
  it("introduces one at a time, in order", () => {
    assert.equal(pendingUnlock(at(1), new Set()), null);
    assert.equal(pendingUnlock(at(3), new Set()), "codex");
    assert.equal(pendingUnlock(at(3), new Set(["codex", "relics"])), "war");
    assert.equal(pendingUnlock(at(9), new Set(["codex", "relics", "war", "battle", "walking", "friends", "raids"])), null);
  });
  it("hides bosses until level 5", () => {
    const pts = [{ id: "a", source: "raid" }, { id: "b", source: "osm" }] as unknown as QuestPoint[];
    assert.deepEqual(visiblePoints(pts, at(4)).map((p) => p.id), ["b"]);
    assert.deepEqual(visiblePoints(pts, at(5)).map((p) => p.id), ["a", "b"]);
  });
  it("opens everything only in a test build that is not on production", () => {
    assert.equal(unlockAllFor("1", STAGING_GAME_SERVER), true);
    assert.equal(unlockAllFor("1", PRODUCTION_GAME_SERVER), false);
    assert.equal(unlockAllFor(undefined, STAGING_GAME_SERVER), false);
  });
});
