import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeResult, resultShareText } from "../gameInvite.ts";
import { routeForNotification, routeForUrl } from "../links.ts";

test("links: chats, people, the game, invites, posts", () => {
  assert.equal(routeForUrl("cosquest://chat/abc123"), "/chat/abc123");
  assert.equal(routeForUrl("https://cosquest.vercel.app/chat/abc123?x=1"), "/chat/abc123");
  assert.equal(routeForUrl("cosquest://user/ada"), "/user/ada");
  assert.equal(routeForUrl("https://cosquest.vercel.app/u/ada"), "/user/ada");
  assert.equal(routeForUrl("https://cosquest.vercel.app/@ada"), "/user/ada");
  assert.equal(routeForUrl("cosquest://play?raid=R1&place=Trafalgar"), "/play?raid=R1&place=Trafalgar");
  assert.equal(routeForUrl("cosquest://play"), "/play");
  assert.equal(routeForUrl("https://cosquest.vercel.app/group/join/Ab-12"), "/group/join/Ab-12");
  assert.equal(routeForUrl("cosquest://invite/Ab-12"), "/group/join/Ab-12");
  assert.equal(routeForUrl("cosquest://post/p1"), "/post/p1");
  assert.equal(routeForUrl("cosquest://notifications"), "/notifications");
  assert.equal(routeForUrl("/chat/abc"), "/chat/abc");
});

test("links: anything odd is left alone", () => {
  assert.equal(routeForUrl(""), null);
  assert.equal(routeForUrl(null), null);
  assert.equal(routeForUrl("cosquest://settings"), null);
  assert.equal(routeForUrl("cosquest://chat/"), null);
  assert.equal(routeForUrl("cosquest://chat/../../etc"), null);
  assert.equal(routeForUrl("cosquest://user/a b"), null);
  assert.equal(routeForUrl("cosquest://chat/abc/message/000000000000000000000000"), null);
  assert.equal(routeForUrl("https://evil.example/%E0%A4%A"), null);
});

test("notification taps: chat, person, game, centre", () => {
  assert.equal(routeForNotification({ type: "message", conversationId: "c1" }), "/chat/c1");
  assert.equal(routeForNotification({ type: "mention", conversationId: "c1" }), "/chat/c1");
  assert.equal(routeForNotification({ type: "follow", username: "ada" }), "/user/ada");
  assert.equal(routeForNotification({ type: "game", link: "cosquest://play?raid=R1" }), "/play?raid=R1");
  assert.equal(routeForNotification({ url: "cosquest://play?shrine=S1" }), "/play?shrine=S1");
  assert.equal(routeForNotification({ type: "game" }), "/play");
  assert.equal(routeForNotification({ type: "follow" }), "/notifications");
  assert.equal(routeForNotification({ type: "system" }), "/notifications");
  assert.equal(routeForNotification(null), "/notifications");
  assert.equal(routeForNotification({ type: "message", conversationId: "../x" }), "/notifications");
});

test("game result cards: cleaned, with a text fallback", () => {
  assert.equal(normalizeResult(null), null);
  assert.equal(normalizeResult({ headline: "  " }), null);
  const card = normalizeResult({ headline: "Won the duel!", pointName: "Trafalgar Square", win: true, xp: 120, coins: -3, level: 4 });
  assert.deepEqual(card, { headline: "Won the duel!", pointName: "Trafalgar Square", realm: "", win: true, xp: 120, coins: 0, level: 4, rank: "" });
  assert.equal(resultShareText({ headline: "Won the duel!", pointName: "Trafalgar Square", xp: 120, win: true }), "🏆 Won the duel at Trafalgar Square · +120 XP in CosQuest");
});
