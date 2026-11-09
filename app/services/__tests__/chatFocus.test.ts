import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { setChatFocus, takeChatFocus } from "../chatFocus.ts";

describe("chat focus", () => {
  it("hands the found message to its own chat once", () => {
    setChatFocus("chat-1", "msg-9");
    assert.equal(takeChatFocus("chat-2"), null);
    assert.equal(takeChatFocus("chat-1"), "msg-9");
    assert.equal(takeChatFocus("chat-1"), null);
  });
  it("keeps the latest search per chat", () => {
    setChatFocus("chat-1", "msg-1");
    setChatFocus("chat-1", "msg-2");
    assert.equal(takeChatFocus("chat-1"), "msg-2");
    assert.equal(takeChatFocus(undefined), null);
  });
});
