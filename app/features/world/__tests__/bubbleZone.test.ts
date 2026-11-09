// The Chats bubble's place over the game (F-38), shared with the chat's edge
// handle, the coachmark and Android's gesture-exclusion strip.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BUBBLE_HEIGHT, BUBBLE_TUCKED_WIDTH, BUBBLE_WIDTH, bubbleTop, bubbleZone } from "../bubbleZone.ts";
import { androidGestureExclusion } from "../gesture.ts";
import { createWorldStore } from "../worldState.ts";

describe("bubbleZone", () => {
  it("sits at 42% of the screen, below the status bar and the top bar", () => {
    assert.equal(bubbleTop(800, 24), 800 * 0.42 - 28);
    // A short phone with a big inset: never under the top bar.
    assert.equal(bubbleTop(200, 47), 47 + 72);
  });
  it("tucks into the game's side margin over a full-screen game screen", () => {
    const open = bubbleZone(891, 24, false);
    const tucked = bubbleZone(891, 24, true);
    assert.equal(open.width, BUBBLE_WIDTH);
    assert.equal(tucked.width, BUBBLE_TUCKED_WIDTH);
    assert.ok(tucked.width < 18, "inside the 18-point side margin the game screens keep");
    assert.equal(tucked.y, open.y);
    assert.equal(open.height, BUBBLE_HEIGHT + 6);
  });
  it("lines up with Android's gesture-exclusion strip on the game page", () => {
    const [rect] = androidGestureExclusion({ page: "game", width: 411, height: 891, topInset: 24, bottomInset: 24 });
    const centre = bubbleTop(891, 24) + BUBBLE_HEIGHT / 2;
    assert.ok(rect.y <= centre && centre <= rect.y + rect.height);
  });
});

describe("world.gameFocus", () => {
  it("is off until the game says a full-screen screen is up, and tells listeners once per change", () => {
    const store = createWorldStore();
    let calls = 0;
    store.subscribe(() => (calls += 1));
    assert.equal(store.get().gameFocus, false);
    store.setGameFocus(true);
    store.setGameFocus(true);
    assert.equal(store.get().gameFocus, true);
    store.setGameFocus(false);
    assert.equal(calls, 2);
  });
});
