// Gesture arbitration: when the world swipe may start, where, and where it lands.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COMMIT_FRACTION,
  EDGE_WIDTH,
  FLICK_VELOCITY,
  chatLayer,
  crossedCommit,
  edgeZone,
  gameLayer,
  inRect,
  progressFor,
  settleDuration,
  settleTarget,
  worldSwipeAllowed,
  type SwipeContext,
} from "../gesture.ts";

const base: SwipeContext = {
  page: "chat",
  gameAvailable: true,
  keyboardVisible: false,
  callFullscreen: false,
  settling: false,
};

describe("worldSwipeAllowed", () => {
  it("allows the swipe from the chat tabs when the game is there", () => {
    assert.equal(worldSwipeAllowed(base), true);
  });
  it("never while typing (the keyboard is up)", () => {
    assert.equal(worldSwipeAllowed({ ...base, keyboardVisible: true }), false);
  });
  it("never over a full-screen call", () => {
    assert.equal(worldSwipeAllowed({ ...base, callFullscreen: true }), false);
    assert.equal(worldSwipeAllowed({ ...base, page: "game", callFullscreen: true }), false);
  });
  it("never into a game that is not there (web, Expo Go)", () => {
    assert.equal(worldSwipeAllowed({ ...base, gameAvailable: false }), false);
  });
  it("not while the last swipe is still settling", () => {
    assert.equal(worldSwipeAllowed({ ...base, settling: true }), false);
  });
  it("always lets the player leave the game, keyboard or not", () => {
    assert.equal(worldSwipeAllowed({ ...base, page: "game", keyboardVisible: true }), true);
    assert.equal(worldSwipeAllowed({ ...base, page: "game", gameAvailable: false }), true);
  });
});

describe("edgeZone", () => {
  const screen = { width: 390, height: 844, topInset: 47, bottomInset: 34 };
  it("puts the chat's zone on the RIGHT edge, clear of the header and the tab bar", () => {
    const zone = edgeZone({ page: "chat", ...screen });
    assert.equal(zone.x, 390 - EDGE_WIDTH);
    assert.equal(zone.width, EDGE_WIDTH);
    assert.ok(zone.y >= 47 + 44, "below the header");
    assert.ok(zone.y + zone.height <= 844 - 34 - 68, "above the floating tab bar");
    // A carousel swipe that starts mid-screen is never the world swipe.
    assert.equal(inRect(zone, 200, 400), false);
    assert.equal(inRect(zone, 380, 400), true);
    // The header's right-hand button keeps its taps.
    assert.equal(inRect(zone, 380, 60), false);
  });
  it("puts the game's zone on the LEFT edge", () => {
    const zone = edgeZone({ page: "game", ...screen });
    assert.equal(zone.x, 0);
    assert.equal(inRect(zone, 5, 500), true);
    assert.equal(inRect(zone, 100, 500), false);
    // The game's player chip (top left) and its bottom cards keep their taps.
    assert.equal(inRect(zone, 5, 47 + 30), false);
    assert.equal(inRect(zone, 5, 844 - 34 - 40), false);
  });
  it("never has a negative height on a tiny window", () => {
    const zone = edgeZone({ page: "chat", width: 300, height: 120, topInset: 40, bottomInset: 30 });
    assert.equal(zone.height, 0);
  });
});

describe("progressFor", () => {
  it("follows the finger 1:1 from the chat (leftward)", () => {
    assert.equal(progressFor("chat", -195, 390), 0.5);
    assert.equal(progressFor("chat", 50, 390), 0, "rightward from chat does nothing");
    assert.equal(progressFor("chat", -900, 390), 1, "clamped");
  });
  it("follows the finger 1:1 from the game (rightward)", () => {
    assert.equal(progressFor("game", 195, 390), 0.5);
    assert.equal(progressFor("game", -40, 390), 1);
  });
  it("is safe with no width", () => {
    assert.equal(progressFor("chat", -10, 0), 0);
    assert.equal(progressFor("game", 10, 0), 1);
  });
});

describe("settleTarget", () => {
  it("commits past the line on a slow release", () => {
    assert.equal(settleTarget({ from: "chat", progress: COMMIT_FRACTION + 0.01, velocityX: 0 }), "game");
    assert.equal(settleTarget({ from: "chat", progress: COMMIT_FRACTION - 0.01, velocityX: 0 }), "chat");
    assert.equal(settleTarget({ from: "game", progress: 1 - COMMIT_FRACTION - 0.01, velocityX: 0 }), "chat");
    assert.equal(settleTarget({ from: "game", progress: 0.9, velocityX: 0 }), "game");
  });
  it("a flick commits after a short travel", () => {
    assert.equal(settleTarget({ from: "chat", progress: 0.1, velocityX: -FLICK_VELOCITY - 1 }), "game");
    assert.equal(settleTarget({ from: "game", progress: 0.9, velocityX: FLICK_VELOCITY + 1 }), "chat");
  });
  it("a twitch is not a flick", () => {
    assert.equal(settleTarget({ from: "chat", progress: 0.02, velocityX: -2000 }), "chat");
  });
  it("a flick back cancels, even past the line", () => {
    assert.equal(settleTarget({ from: "chat", progress: 0.6, velocityX: FLICK_VELOCITY + 1 }), "chat");
    assert.equal(settleTarget({ from: "game", progress: 0.3, velocityX: -FLICK_VELOCITY - 1 }), "game");
  });
});

describe("crossedCommit (the haptic tick)", () => {
  it("ticks once crossing toward the game, once crossing back", () => {
    assert.equal(crossedCommit("chat", 0.3, 0.36), 1);
    assert.equal(crossedCommit("chat", 0.36, 0.5), 0);
    assert.equal(crossedCommit("chat", 0.5, 0.3), -1);
  });
  it("mirrors from the game", () => {
    assert.equal(crossedCommit("game", 0.7, 0.6), 1);
    assert.equal(crossedCommit("game", 0.6, 0.7), -1);
  });
});

describe("the look", () => {
  it("settles faster for a short remainder and fast under reduce motion", () => {
    assert.ok(settleDuration(0.9, "game", false) < settleDuration(0.1, "game", false));
    assert.ok(settleDuration(0, "game", false) < 300, "a programmatic open stays under 300 ms");
    assert.equal(settleDuration(0.5, "game", true), 160);
  });
  it("drifts, shrinks and dims the chat; reduce motion only dims", () => {
    const full = chatLayer(1, 400, false);
    assert.ok(full.translateX < 0 && full.scale < 1 && full.dim > 0);
    const calm = chatLayer(1, 400, true);
    assert.equal(calm.translateX, 0);
    assert.equal(calm.scale, 1);
    assert.ok(calm.dim > 0);
  });
  it("slides the game in under a faction veil that lifts as it arrives", () => {
    assert.equal(gameLayer(0, 400, false).translateX, 400);
    assert.equal(gameLayer(1, 400, false).translateX, 0);
    assert.equal(gameLayer(0.3, 400, false).veil, 1);
    assert.equal(gameLayer(1, 400, false).veil, 0);
    const calm = gameLayer(0.5, 400, true);
    assert.equal(calm.translateX, 0);
    assert.equal(calm.opacity, 0.5);
  });
});

describe("android gesture exclusion", () => {
  it("takes at most 200 dp of the edge, centred on the doorway, inside the edge zone", async () => {
    const { androidGestureExclusion, edgeZone } = await import("../gesture.ts");
    const opts = { width: 412, height: 915, topInset: 48, bottomInset: 24 };
    for (const page of ["chat", "game"] as const) {
      const [rect] = androidGestureExclusion({ ...opts, page });
      const zone = edgeZone({ ...opts, page });
      assert.ok(rect.height <= 200);
      assert.ok(rect.y >= zone.y && rect.y + rect.height <= zone.y + zone.height + 1);
      const doorway = Math.max(48 + 72, 915 * 0.42 - 28) + 28;
      assert.ok(rect.y <= doorway && doorway <= rect.y + rect.height, "covers the handle / bubble");
      assert.equal(page === "chat" ? rect.x + rect.width : rect.x, page === "chat" ? 412 : 0);
    }
  });
  it("nothing when there is no edge zone (tiny window)", async () => {
    const { androidGestureExclusion } = await import("../gesture.ts");
    assert.deepEqual(androidGestureExclusion({ page: "chat", width: 300, height: 150, topInset: 40, bottomInset: 40 }), []);
  });
});
