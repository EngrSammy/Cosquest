// cosquest://play?... parsing.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildPlayUrl, isGameCoinsUrl, parsePlayUrl, urlFromParams } from "../deepLink.ts";

describe("parsePlayUrl", () => {
  it("reads a raid with a place and a position", () => {
    assert.deepEqual(parsePlayUrl("cosquest://play?raid=raid:abc-1&place=Trafalgar%20Square&lat=51.508&lng=-0.128"), {
      kind: "play",
      target: { raidId: "raid:abc-1", place: "Trafalgar Square", lat: 51.508, lng: -0.128 },
    });
  });
  it("reads shrines and duels, short or long names", () => {
    assert.deepEqual(parsePlayUrl("cosquest://play?shrine=p1")?.target, { shrineId: "p1" });
    assert.deepEqual(parsePlayUrl("cosquest://play?shrineId=p1")?.target, { shrineId: "p1" });
    assert.deepEqual(parsePlayUrl("cosquest://play?duel=p9")?.target, { duelId: "p9" });
  });
  it("opens the game with no target for a bare link", () => {
    assert.deepEqual(parsePlayUrl("cosquest://play"), { kind: "play", target: null });
    assert.deepEqual(parsePlayUrl("cosquest:///play/"), { kind: "play", target: null });
  });
  it("reads just a place", () => {
    assert.deepEqual(parsePlayUrl("cosquest://play?lat=51.5&lng=-0.12")?.target, { lat: 51.5, lng: -0.12 });
  });
  it("accepts the web form and an expo-router path", () => {
    assert.deepEqual(parsePlayUrl("https://cosquest.vercel.app/play?shrine=p1")?.target, { shrineId: "p1" });
    assert.deepEqual(parsePlayUrl("/play?raid=r1")?.target, { raidId: "r1" });
  });
  it("is not fooled by other links", () => {
    assert.equal(parsePlayUrl("cosquest://chat/123"), null);
    assert.equal(parsePlayUrl("cosquest://onboarding/oauthGoogle?oauthCode=x"), null);
    assert.equal(parsePlayUrl("cosquest://player"), null);
    assert.equal(parsePlayUrl("https://evil.example/display?raid=1"), null);
    assert.equal(parsePlayUrl(""), null);
    assert.equal(parsePlayUrl(null), null);
  });
  it("refuses a spot it cannot trust instead of guessing", () => {
    assert.equal(parsePlayUrl("cosquest://play?raid=bad%20id"), null, "spaces");
    assert.equal(parsePlayUrl("cosquest://play?raid=" + "x".repeat(81)), null, "too long");
    assert.equal(parsePlayUrl("cosquest://play?raid=r1&shrine=s1"), null, "two targets");
    assert.equal(parsePlayUrl("cosquest://play?lat=95&lng=0"), null, "not a latitude");
    assert.equal(parsePlayUrl("cosquest://play?lat=51.5"), null, "half a position");
  });
  it("keeps the id when only the position is broken", () => {
    assert.deepEqual(parsePlayUrl("cosquest://play?shrine=p1&lat=51.5")?.target, { shrineId: "p1" });
  });
  it("trims and caps the place name", () => {
    const place = parsePlayUrl("cosquest://play?shrine=p1&place=" + encodeURIComponent("  " + "y".repeat(100)))?.target?.place;
    assert.equal(place?.length, 80);
  });
});

describe("buildPlayUrl", () => {
  it("round-trips", () => {
    const target = { raidId: "raid:abc", lat: 1.5, lng: 2.5, place: "Big Ben" };
    assert.deepEqual(parsePlayUrl(buildPlayUrl(target))?.target, target);
    assert.equal(buildPlayUrl(null), "cosquest://play");
  });
});

describe("isGameCoinsUrl", () => {
  it("spots the game's Stripe return", () => {
    assert.equal(isGameCoinsUrl("cosquest://coins?order=o1&result=success"), true);
    assert.equal(isGameCoinsUrl("cosquest://play"), false);
  });
});

describe("urlFromParams (Expo Router params back into a link)", () => {
  it("rebuilds a play link the parser accepts", () => {
    const url = urlFromParams("play", { raid: "r-1", place: "Tate Modern", lat: "51.5", lng: "-0.1" });
    assert.deepEqual(parsePlayUrl(url)?.target, { raidId: "r-1", place: "Tate Modern", lat: 51.5, lng: -0.1 });
  });
  it("keeps repeated keys, so an ambiguous link stays refused", () => {
    assert.equal(parsePlayUrl(urlFromParams("play", { raid: ["a", "b"] })), null);
  });
  it("a bare route is a bare link", () => {
    assert.equal(urlFromParams("coins", {}), "cosquest://coins");
    assert.equal(urlFromParams("coins", { order: "o_1" }), "cosquest://coins?order=o_1");
  });
});
