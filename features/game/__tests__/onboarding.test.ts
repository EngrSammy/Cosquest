// The Warden's conversation (OnboardingView.swift): lines, pacing, beats.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BEATS, canSkip, type LineContext, lineFor, motes, nextNarrative, paceMs, pitch, startBeat, welcome, wordsOf } from "../onboarding.ts";

const ctx = (over: Partial<LineContext> = {}): LineContext => ({ name: "Ada", picked: null, joined: null, relicName: null, houseName: "Marvel", ...over });

describe("onboarding: lines", () => {
  it("has a line for every beat but the gift without a Relic", () => {
    for (const b of BEATS) {
      if (b === "gift") assert.equal(lineFor(b, ctx()), "");
      else assert.ok(lineFor(b, ctx({ joined: "dc" })).length > 0, b);
    }
  });
  it("speaks the pitch while choosing and the welcome after", () => {
    assert.equal(lineFor("askFaction", ctx({ picked: "gaming" })), pitch("gaming"));
    assert.match(lineFor("askFaction", ctx()), /^Every shrine belongs to one of five houses/);
    assert.equal(welcome("gaming", "Ada"), "Player Ada has joined Gaming. New quest unlocked.");
    assert.equal(lineFor("factionAck", ctx({ joined: "anime" })), "Anime it is! I can feel your fighting spirit already, Ada!");
    assert.equal(welcome("unknown", "Ada"), "Welcome, Ada.");
    assert.equal(lineFor("nameAck", ctx()), "Ada. I'll remember that.");
  });
  it("hands over the Relic by name and house", () => {
    assert.equal(lineFor("gift", ctx({ relicName: "Pixel Edge", houseName: "Gaming" })), "You'll need this. Pixel Edge. It's been waiting for someone from Gaming.");
  });
});

describe("onboarding: pacing", () => {
  it("waits words x 0.08 + 0.4 s, then words x 0.25 + 1.2 s", () => {
    const line = "one two three four five";
    assert.deepEqual(paceMs(line), { first: 800, rest: 2450 });
    assert.deepEqual(wordsOf("a b"), ["a", "b"]);
  });
  it("moves the telling beats on and stops at the questions", () => {
    assert.equal(nextNarrative("wake", 0), "hello");
    assert.equal(nextNarrative("shrines", 0), "askName");
    assert.equal(nextNarrative("shrines", 3), "nameAck");
    assert.equal(nextNarrative("nameAck", 3), "askFaction");
    assert.equal(nextNarrative("gift", 3), "askLocation");
    for (const b of ["askName", "askFaction", "askLocation", "factionAck", "farewell"] as const) assert.equal(nextNarrative(b, 3), null);
  });
  it("picks up where a player left", () => {
    assert.deepEqual(startBeat({ faction: "dc", nameLength: 0 }), { beat: "askLocation", awake: true });
    assert.deepEqual(startBeat({ faction: null, nameLength: 4 }), { beat: "askFaction", awake: true });
    assert.deepEqual(startBeat({ faction: null, nameLength: 1 }), { beat: "wake", awake: false });
  });
  it("offers Skip only before the name", () => {
    assert.equal(canSkip("hello"), true);
    assert.equal(canSkip("askName"), false);
    assert.equal(canSkip("askFaction"), false);
  });
  it("lays out 38 motes inside the unit square", () => {
    const m = motes();
    assert.equal(m.length, 38);
    for (const x of m) {
      assert.ok(x.x0 >= 0 && x.x0 < 1);
      assert.ok(x.speed >= 0.012 && x.speed <= 0.032);
    }
  });
});
