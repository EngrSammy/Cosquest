// The game_invite chat card.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  inviteCallToAction,
  inviteJoinable,
  invitePreview,
  inviteTitle,
  inviteToTarget,
  inviteWhen,
  normalizeInvite,
  resultShareText,
  shareToInviteBody,
} from "../gameInvite.ts";

const raid = { type: "raid", targetId: "raid:abc", place: "Trafalgar Square", lat: 51.508, lng: -0.128, startsAt: null };

describe("normalizeInvite", () => {
  it("keeps a good card", () => {
    assert.deepEqual(normalizeInvite(raid), raid);
  });
  it("drops what the backend would never have sent", () => {
    assert.equal(normalizeInvite(null), null);
    assert.equal(normalizeInvite({ ...raid, type: "party" }), null);
    assert.equal(normalizeInvite({ ...raid, targetId: "has space" }), null);
    assert.equal(normalizeInvite({ ...raid, targetId: undefined }), null);
  });
  it("drops half a position and bad dates, keeps the card", () => {
    assert.deepEqual(normalizeInvite({ ...raid, lng: null }), { ...raid, lat: null, lng: null });
    assert.equal(normalizeInvite({ ...raid, startsAt: "soonish" })?.startsAt, null);
    assert.equal(normalizeInvite({ ...raid, startsAt: "2026-10-13T18:30:00Z" })?.startsAt, "2026-10-13T18:30:00.000Z");
  });
});

describe("what Join opens", () => {
  it("maps each type to its target", () => {
    const card = normalizeInvite(raid)!;
    assert.deepEqual(inviteToTarget(card), { raidId: "raid:abc", lat: 51.508, lng: -0.128, place: "Trafalgar Square" });
    assert.deepEqual(inviteToTarget({ ...card, type: "shrine", lat: null, lng: null, place: "" }), { shrineId: "raid:abc" });
    assert.deepEqual(inviteToTarget({ ...card, type: "duel" }).duelId, "raid:abc");
  });
});

describe("wording", () => {
  const card = normalizeInvite(raid)!;
  it("titles, previews and calls to action", () => {
    assert.equal(inviteTitle(card), "Raid at Trafalgar Square");
    assert.equal(inviteTitle({ ...card, place: "" }), "Raid invite");
    assert.equal(invitePreview(card), "🎮 Raid at Trafalgar Square");
    assert.equal(invitePreview(null), "🎮 Game invite");
    assert.equal(inviteCallToAction({ ...card, type: "duel" }), "Take the duel");
  });
  it("says when", () => {
    const now = new Date(2026, 9, 13, 12, 0);
    const at = (h: number, m = 0, d = 13) => new Date(2026, 9, d, h, m).toISOString();
    assert.equal(inviteWhen(null, now), "Now");
    assert.equal(inviteWhen(at(12, 1), now), "Now");
    assert.equal(inviteWhen(at(12, 25), now), "In 25 min");
    assert.equal(inviteWhen(at(18, 30), now), "Today 18:30");
    assert.equal(inviteWhen(at(9, 0, 14), now), "Tomorrow 09:00");
    assert.equal(inviteWhen(at(11, 0), now), "Now", "under two hours past still shows as on");
    assert.equal(inviteWhen(at(8, 0, 13), now), "Ended");
    assert.equal(inviteJoinable({ ...card, startsAt: at(8, 0, 13) }, now), false);
    assert.equal(inviteJoinable(card, now), true);
  });
});

describe("shareToInviteBody (the game's share action -> the API body)", () => {
  it("builds the body the backend accepts", () => {
    assert.deepEqual(
      shareToInviteBody({ type: "raid", targetId: "r1", place: " Big Ben ", lat: 51.5, lng: -0.12, endsAt: "x" }, " come! "),
      { type: "raid", targetId: "r1", place: "Big Ben", lat: 51.5, lng: -0.12, note: "come!" },
    );
  });
  it("refuses what the backend would refuse", () => {
    assert.equal(shareToInviteBody({ type: "party", targetId: "r1" }), null);
    assert.equal(shareToInviteBody({ type: "raid", targetId: "a b" }), null);
    assert.equal(shareToInviteBody({ type: "raid" }), null);
  });
  it("leaves out half positions and caps the note", () => {
    const body = shareToInviteBody({ type: "shrine", targetId: "p1", lat: 51.5 }, "n".repeat(400));
    assert.equal(body?.lat, undefined);
    assert.equal(body?.note?.length, 300);
  });
});

describe("sharing a game result to a chat", () => {
  it("says what happened, where, and the XP", () => {
    assert.equal(
      resultShareText({ headline: "Point taken!", pointName: "Test Trivia Stone", xp: 470, win: true }),
      "🏆 Point taken at Test Trivia Stone · +470 XP in CosQuest",
    );
  });
  it("still reads well for a loss with no XP and no place", () => {
    assert.equal(resultShareText({ headline: "The Guardian held", xp: 0, win: false }), "⚔️ The Guardian held in CosQuest");
  });
});
