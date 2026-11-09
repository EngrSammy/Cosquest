// The trivia front door's pure half (features/game/run.ts, duelFlow.ts):
// what a trivia start sends, the allowance and words, the share sheet's
// content per platform, and that a trivia tile is never fought.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runPlaysAsDuel } from "../duelFlow.ts";
import { endRunMessage, isTrivia, shareContent, startBody, triviaAllowance, triviaSub } from "../run.ts";
import type { RoamMe } from "../wire.ts";

const KEY = "ab".repeat(32);
const FIX = { lat: 51.5, lng: -0.12, accuracy: 8 };

describe("trivia start", () => {
  it("sends no location at all, even with a fix in hand", () => {
    const body = startBody(KEY, "trivia", FIX);
    assert.deepEqual(body, { device_key: KEY, mode: "pocket", trivia: true });
    assert.ok(!("lat" in body) && !("lng" in body) && !("accuracy_m" in body));
  });

  it("leaves the daily and pocket starts as they were", () => {
    assert.deepEqual(startBody(KEY, "daily", FIX), { device_key: KEY, mode: "daily", lat: 51.5, lng: -0.12, accuracy_m: 8 });
    assert.deepEqual(startBody(KEY, "pocket", null), { device_key: KEY, mode: "pocket" });
  });
});

describe("a trivia tile is never a fight", () => {
  const fights = { features: { duel: { run_mode: "duel" } } } as unknown as RoamMe;
  it("even when the server fights every other run point", () => {
    assert.equal(runPlaysAsDuel("trivia", fights, true), false);
    assert.equal(runPlaysAsDuel("rebus", fights, true), false);
  });
  it("while a normal run point still follows run_mode", () => {
    assert.equal(runPlaysAsDuel("trivia", fights), true);
    assert.equal(runPlaysAsDuel("trivia", null), false);
    assert.equal(runPlaysAsDuel("duel", null), true);
  });
});

describe("trivia words", () => {
  it("reads today's runs left from /me, null when the server does not say", () => {
    assert.equal(triviaAllowance({ features: { trivia: { runs_left: 7 } } }), 7);
    assert.equal(triviaAllowance({ features: {} }), null);
    assert.equal(triviaAllowance(null), null);
  });
  it("says when today's runs are done", () => {
    assert.match(triviaSub(0), /done/);
    assert.match(triviaSub(3), /No walking, no location\..* 3 left today\./);
    assert.match(triviaSub(null), /global board\.$/);
  });
  it("knows a trivia run, and ending one early puts it on the board", () => {
    assert.equal(isTrivia({ trivia: true }), true);
    assert.equal(isTrivia({ trivia: false }), false);
    assert.equal(isTrivia(null), false);
    assert.match(endRunMessage({ score: 300, mode: "pocket", trivia: true }), /today's board/);
    assert.equal(endRunMessage({ score: 300, mode: "pocket" }), "You keep the 300 points you have.");
  });
});

describe("the share sheet", () => {
  const s = { text: "I scored 1,240 in CosQuest trivia. Can you beat it?", url: "https://x.example/share/abc12345" };
  it("iOS: the link as its own item, never twice", () => {
    const c = shareContent(s, "ios");
    assert.equal(c.url, s.url);
    assert.ok(!c.message.includes(s.url));
  });
  it("Android: the link on the end of the message (it shares message only)", () => {
    const c = shareContent(s, "android");
    assert.equal(c.url, undefined);
    assert.ok(c.message.endsWith(s.url) && c.message.startsWith(s.text));
  });
});

describe("the public trivia web page (EXPO_PUBLIC_TRIVIA_WEB=1)", async () => {
  const { triviaOnlyWeb } = await import("../config.ts");
  it("is trivia-only on the web build that asks for it, and nowhere else", () => {
    assert.equal(triviaOnlyWeb("1", "web"), true);
    assert.equal(triviaOnlyWeb(" 1 ", "web"), true);
    // The app itself on the web, and every native build, keep the whole app.
    assert.equal(triviaOnlyWeb(undefined, "web"), false);
    assert.equal(triviaOnlyWeb("0", "web"), false);
    assert.equal(triviaOnlyWeb("1", "ios"), false);
    assert.equal(triviaOnlyWeb("1", "android"), false);
  });
});
