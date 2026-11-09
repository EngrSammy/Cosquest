// The world store and the prewarm policy.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LOW_MEMORY_BYTES, prewarmDecision } from "../prewarm.ts";
import { createWorldStore, factionVeilColor } from "../worldState.ts";

describe("world store", () => {
  it("an open request mounts the game and carries the spot once", () => {
    const store = createWorldStore();
    let calls = 0;
    store.subscribe(() => calls++);
    store.openGame({ raidId: "r1" });
    assert.equal(store.get().gameMounted, true);
    assert.equal(store.get().openSerial, 1);
    assert.deepEqual(store.takeOpen(), { target: { raidId: "r1" } });
    assert.equal(store.takeOpen(), null, "taken once");
    assert.ok(calls >= 2);
  });
  it("a bare open (the handle, cosquest://play) has no spot", () => {
    const store = createWorldStore();
    store.openGame();
    assert.deepEqual(store.takeOpen(), { target: null });
  });
  it("an open made before the pager exists waits for it", () => {
    const store = createWorldStore();
    store.openGame({ shrineId: "s1" });
    // ... sign-in, the pager mounts later and takes it then.
    assert.deepEqual(store.takeOpen(), { target: { shrineId: "s1" } });
  });
  it("back to chat can carry a conversation, and cancels a pending open", () => {
    const store = createWorldStore();
    store.openGame({ duelId: "d1" });
    store.openChat("c1");
    assert.equal(store.get().closeSerial, 1);
    assert.equal(store.takeOpen(), null, "the later request wins");
    assert.deepEqual(store.takeClose(), { chatId: "c1" });
    assert.equal(store.takeClose(), null);
  });
  it("an open cancels a pending back-to-chat", () => {
    const store = createWorldStore();
    store.openChat(null);
    store.openGame(null);
    assert.equal(store.takeClose(), null);
  });
  it("settles, marks ready, and resets on sign-out without rewinding the serials", () => {
    const store = createWorldStore();
    store.openGame(null);
    store.settled("game");
    store.markGameReady();
    assert.equal(store.get().page, "game");
    assert.equal(store.get().gameReady, true);
    store.reset();
    assert.equal(store.get().page, "chat");
    assert.equal(store.get().gameMounted, false);
    assert.equal(store.get().gameReady, true, "the native world outlives a sign-out");
    assert.equal(store.get().pendingOpen, null);
    assert.equal(store.get().openSerial, 1);
  });
  it("unsubscribes", () => {
    const store = createWorldStore();
    let calls = 0;
    const off = store.subscribe(() => calls++);
    off();
    store.mountGame();
    assert.equal(calls, 0);
  });
});

describe("faction veil colour", () => {
  it("prefers the game faction, then the chat's, then the sky", () => {
    // The deck faction wins; a realm maps to its deck faction; realm colours never tint the map.
    assert.equal(factionVeilColor("marvel", "icons"), "#7C5CF0");
    assert.equal(factionVeilColor("anime", null), "#D633A8");
    assert.equal(factionVeilColor(null, "icons"), "#7C5CF0");
    assert.equal(factionVeilColor("nope", "nope"), "#1F7FC2");
  });
});

describe("prewarm policy", () => {
  const ok = { physicalMemory: 6 * 1024 ** 3, gameAvailable: true, hadMemoryWarning: false };
  it("warms on phones with room", () => {
    assert.deepEqual(prewarmDecision(ok), { prewarm: true, reason: "enough-memory" });
  });
  it("waits for the first swipe on a 3 GB phone", () => {
    assert.equal(prewarmDecision({ ...ok, physicalMemory: 3 * 1024 ** 3 }).prewarm, false);
    assert.equal(prewarmDecision({ ...ok, physicalMemory: LOW_MEMORY_BYTES }).prewarm, true);
  });
  it("never after a memory warning, in low power, or without a game", () => {
    assert.equal(prewarmDecision({ ...ok, hadMemoryWarning: true }).reason, "memory-warning");
    assert.equal(prewarmDecision({ ...ok, lowPower: true }).reason, "low-power");
    assert.equal(prewarmDecision({ ...ok, gameAvailable: false }).reason, "no-game");
  });
  it("warms when memory is unknown", () => {
    assert.equal(prewarmDecision({ ...ok, physicalMemory: null }).prewarm, true);
  });
});
