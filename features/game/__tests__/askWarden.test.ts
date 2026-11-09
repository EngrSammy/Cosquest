import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { askPrompt, contextLines, plainAnswer, RULEBOOK, rulesFor, settleAnswer } from "../askWarden.ts";

describe("ask the warden", () => {
  it("chooses the rule by keyword, two at most", () => {
    assert.deepEqual(rulesFor("why was that refused?").map((r) => r.topic), ["cooldown"]);
    assert.deepEqual(rulesFor("how do I score?").map((r) => r.topic), ["scoring"]);
    assert.deepEqual(rulesFor("what is the capital of France").map((r) => r.topic), ["scoring", "cooldown"]);
    assert.equal(rulesFor("can I hit my teammate from too far away").length, 2);
    assert.deepEqual(rulesFor("hm", "outside the boundary").map((r) => r.topic), ["the venue boundary"]);
  });
  it("answers from the rulebook without a model", () => {
    assert.equal(plainAnswer("respawn?", { title: "CostQuest" }), RULEBOOK[5].text);
  });
  it("tells the model what is true now", () => {
    const lines = contextLines({ title: "CostQuest", faction: "Marvel", isOnline: false, nearby: ["Big Ben"] });
    assert.equal(lines[0], 'The game is "CostQuest".');
    assert.ok(lines.includes("They are not carrying a weapon."));
    assert.ok(lines.includes("Nearby points they could use: Big Ben."));
    assert.ok(lines.at(-1)!.includes("no connection"));
    const p = askPrompt({ title: "CostQuest" }, [{ id: 1, fromPlayer: true, text: "hi" }, { id: 2, fromPlayer: false, text: "hello" }], "How do I score?");
    assert.ok(p.startsWith("<|im_start|>system\nYou are the CostQuest Proctor."));
    assert.ok(p.includes("<|im_start|>user\nhi<|im_end|>"));
    assert.ok(p.endsWith("<|im_start|>assistant\n<think>\n\n</think>\n\n"));
  });
  it("falls back to the rule when the model says nothing useful", () => {
    assert.deepEqual(settleAnswer("  ok ", "RULE"), { text: "RULE", rule: null });
    assert.deepEqual(settleAnswer("<think>x</think>Tokens are the score.", "RULE"), { text: "Tokens are the score.", rule: "RULE" });
    assert.deepEqual(settleAnswer(null, "RULE"), { text: "RULE", rule: null });
  });
});
