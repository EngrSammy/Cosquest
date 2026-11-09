import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createIdBatcher, previewSummary } from "../idBatcher.ts";

function fakeTimers() {
  let queue: { fn: () => void; at: number }[] = [];
  let now = 0;
  return {
    timers: {
      set: (fn: () => void, ms: number) => {
        const t = { fn, at: now + ms };
        queue.push(t);
        return t;
      },
      clear: (h: unknown) => {
        queue = queue.filter((t) => t !== h);
      },
    },
    advance(ms: number) {
      now += ms;
      const due = queue.filter((t) => t.at <= now);
      queue = queue.filter((t) => t.at > now);
      due.forEach((t) => t.fn());
    },
  };
}

describe("socket preview batching (audit B5)", () => {
  it("20 previews from one busy group in a burst become one refresh", () => {
    const clock = fakeTimers();
    const flushed: string[][] = [];
    const b = createIdBatcher(400, (ids) => flushed.push(ids), clock.timers);
    for (let i = 0; i < 20; i++) b.add("group-1");
    clock.advance(399);
    assert.equal(flushed.length, 0);
    clock.advance(1);
    assert.deepEqual(flushed, [["group-1"]]);
  });
  it("several chats in one window flush together, each once", () => {
    const clock = fakeTimers();
    const flushed: string[][] = [];
    const b = createIdBatcher(400, (ids) => flushed.push(ids), clock.timers);
    ["a", "b", "a", "c", "b"].forEach((id) => b.add(id));
    clock.advance(400);
    assert.deepEqual(flushed, [["a", "b", "c"]]);
  });
  it("a steady stream still refreshes every window (timed from the first id)", () => {
    const clock = fakeTimers();
    const flushed: string[][] = [];
    const b = createIdBatcher(400, (ids) => flushed.push(ids), clock.timers);
    for (let t = 0; t < 1200; t += 100) {
      b.add("g");
      clock.advance(100);
    }
    assert.equal(flushed.length, 3);
  });
  it("cancel drops what is pending (sign-out)", () => {
    const clock = fakeTimers();
    const flushed: string[][] = [];
    const b = createIdBatcher(400, (ids) => flushed.push(ids), clock.timers);
    b.add("a");
    b.cancel();
    clock.advance(1000);
    assert.equal(flushed.length, 0);
  });
  it("reads a preview that carries the chat, and ignores the bare one", () => {
    assert.equal(previewSummary({ conversationId: "x" }), null);
    assert.deepEqual(previewSummary({ conversationId: "x", chat: { id: "x", unreadCount: 2 } }), { id: "x", unreadCount: 2 });
    assert.equal(previewSummary(null), null);
  });
});
