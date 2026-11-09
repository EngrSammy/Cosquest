// WardenCheck: what a model-written line must pass (costquest-ios Warden/WardenCheck.swift).
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fallbackLine, WardenMoment, type WardenStyle } from "../warden.ts";
import { chooseVariant, cleanLine, lineProblem, numbersIn, offVoice } from "../wardenCheck.ts";
import type { ModelManifest } from "../wire.ts";

const arrive = new WardenMoment("arrive", "arcade", [["name", "Ada"], ["place", "Caffè Nero"], ["level", "7"]]);

describe("WardenCheck", () => {
  it("cleans the model's line to the line itself", () => {
    assert.equal(cleanLine('"Caffè Nero is live, Ada."<|im_end|>\nmore'), "Caffè Nero is live, Ada.");
  });
  it("accepts a line built from the facts", () => {
    assert.equal(lineProblem("Caffè Nero is live, Ada. Level 7 starts now.", arrive), null);
  });
  it("refuses invented numbers, words included", () => {
    assert.match(lineProblem("Caffè Nero awaits, Ada, for the twelfth time and 12 more.", arrive) ?? "", /invented numbers \[12\]/);
    assert.ok(numbersIn("four in a row, 1,200 xp").has(4));
    assert.ok(numbersIn("four in a row, 1,200 xp").has(1200));
  });
  it("refuses the wrong length, markup, emoji, other scripts, money and a missing place", () => {
    assert.equal(lineProblem("Too short.", arrive), "too short");
    assert.match(lineProblem(Array(20).fill("word").join(" "), arrive) ?? "", /too long/);
    assert.equal(lineProblem("Caffè Nero is *live* now, Ada.", arrive), "markup");
    assert.equal(lineProblem("Caffè Nero is live now, Ada 🎮", arrive), "emoji");
    assert.equal(lineProblem("Caffè Nero is live now, Ada 你好", arrive), "non-Latin script");
    assert.match(lineProblem("Caffè Nero has cash for you, Ada.", arrive) ?? "", /banned/);
    assert.equal(lineProblem("The shrine is live now, Ada.", arrive), "arrive without the place");
  });
});

describe("WardenCheck: the small model's assistant voice", () => {
  const lost = new WardenMoment("result", "hype", [["name", "ada"], ["place", "Caffè Nero"], ["challenge", "duel"], ["result", "lost"]]);
  const crest = new WardenMoment("arrive", "hype", [["name", "ada"], ["place", "Crest of London"], ["challenge", "duel"]]);
  it("refuses what the 0.5B actually wrote on the host run (2026-10-13)", () => {
    assert.equal(lineProblem("I'm ada, an assistant built for the Crest of London. I run on your device.", crest), "off voice: assistant");
    assert.equal(lineProblem("I won't be able to help you with that. I can't help with duels.", lost), "off voice: can't help");
  });
  it("refuses other assistant and refusal lines, curly apostrophes too", () => {
    for (const line of [
      "I\u2019m sorry, but I cannot do that for you today.",
      "As a language model I have no shrine to guard.",
      "How can I help you at Caffè Nero today, Ada?",
      "Let me know if you want another duel, Ada.",
      "I am just an AI running at Caffè Nero for you.",
      "Feel free to ask about Caffè Nero anytime, Ada.",
    ]) {
      assert.match(lineProblem(line, lost) ?? "", /^off voice: /, line);
    }
  });
  it("lets the Warden's own lines through (the 1.7B on the host run)", () => {
    assert.equal(lineProblem("Crest of London, Ada! A duel, and I can feel the pressure!", crest), null);
    assert.equal(lineProblem("That duel was tough, Ada, but you never gave up! Caffè Nero will remember this one.", lost), null);
  });
  it("never trips on an authored line, in any style", () => {
    const kinds = ["arrive", "correct", "wrong", "siege_won", "siege_lost", "late", "levelup", "rankup", "streak", "daily_done", "hint", "legend", "recap", "nudge", "other"];
    const styles: WardenStyle[] = ["arcade", "mythic", "hype", "trailer", "quippy", "neutral"];
    const names = ["Ada", "Mo", "Priya", "Chidi", "Sam", "Lin", "Tomi", "Zara"];
    let checked = 0;
    for (const kind of kinds) {
      for (const style of styles) {
        for (const name of names) {
          const line = fallbackLine(new WardenMoment(kind, style, [["name", name], ["place", "Camden Lock"], ["level", "7"], ["rank", "Mythic"]]));
          assert.equal(offVoice(line), null, line);
          checked++;
        }
      }
    }
    assert.equal(checked, kinds.length * styles.length * names.length);
  });
});

describe("which model", () => {
  const file = (n: string) => ({ file: n, url: `https://x/${n}`, bytes: 1, sha256: "0".repeat(64) });
  const manifest: ModelManifest = {
    version: "v",
    label: "AIMM 1.7B",
    model: file("big.mq"),
    tokenizer: file("q3.mtok"),
    min_ram_bytes: 6 * 2 ** 30,
    variants: [
      { label: "AIMM 1.7B", model: file("big.mq"), tokenizer: file("q3.mtok"), min_ram_bytes: 6 * 2 ** 30 },
      { label: "AIMM 0.5B", model: file("small.mq"), tokenizer: file("q.mtok"), min_ram_bytes: 3 * 2 ** 30 },
    ],
  };
  it("the best one this phone can hold, or none", () => {
    assert.equal(chooseVariant(manifest, 8 * 2 ** 30)?.label, "AIMM 1.7B");
    assert.equal(chooseVariant(manifest, 4 * 2 ** 30)?.label, "AIMM 0.5B");
    assert.equal(chooseVariant(manifest, 2 * 2 ** 30), null);
    assert.equal(chooseVariant(manifest, 2 * 2 ** 30, "0.5B")?.label, "AIMM 0.5B", "forced for a test build");
  });
});
