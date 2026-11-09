import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { replyQuote } from "../replyQuote.ts";

describe("reply quote", () => {
  it("reads the backend's { senderName, preview } quote", () => {
    assert.deepEqual(
      replyQuote({ senderName: "ada", preview: "Only if you help me finish the Storm cape" }),
      { name: "ada", text: "Only if you help me finish the Storm cape" },
    );
  });
  it("still reads a full message", () => {
    assert.deepEqual(replyQuote({ sender: { username: "bo" }, content: "Hi" }), {
      name: "bo",
      text: "Hi",
    });
  });
  it("falls back to the media label, then to placeholders", () => {
    assert.deepEqual(replyQuote({ senderName: "tunde" }, "Voice message"), {
      name: "tunde",
      text: "Voice message",
    });
    assert.deepEqual(replyQuote({ id: "x", senderName: null, preview: "" } as never), {
      name: "Reply",
      text: "Message",
    });
  });
});
