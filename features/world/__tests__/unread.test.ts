// The chat bubble over the game: unread count and previews.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { badgeText, chatTitle, sameSummary, unreadSummary, type UnreadChat } from "../unread.ts";

const chats: UnreadChat[] = [
  { id: "a", type: "dm", otherParticipant: { username: "ada" }, unreadCount: 2,
    lastMessage: { senderName: "ada", preview: "you up?", createdAt: "2026-10-13T10:00:00Z" } },
  { id: "b", type: "group", title: "Raid crew", unreadCount: 5,
    lastMessage: { senderName: "tunde", preview: "🎮 Raid at Tate", createdAt: "2026-10-13T11:00:00Z" } },
  { id: "c", type: "group", title: "Quiet", unreadCount: 0,
    lastMessage: { preview: "old", createdAt: "2026-10-13T12:00:00Z" } },
  { id: "d", type: "faction", title: "Celestials", unreadCount: 1,
    lastMessage: { preview: "hi", createdAt: "2026-10-13T09:00:00Z" } },
  { id: "e", type: "dm", otherParticipant: { username: "bo" }, unreadCount: 1,
    lastMessage: { preview: "later", createdAt: "2026-10-13T08:00:00Z" } },
];

describe("unreadSummary", () => {
  it("adds up every unread message", () => {
    assert.equal(unreadSummary(chats).count, 9);
  });
  it("previews the three newest chats with something unread", () => {
    const { previews } = unreadSummary(chats);
    assert.deepEqual(previews.map((p) => p.chatId), ["b", "a", "d"]);
    assert.equal(previews[0].text, "tunde: 🎮 Raid at Tate", "groups say who");
    assert.equal(previews[1].text, "you up?", "a DM does not repeat the name");
    assert.equal(previews[1].title, "ada");
  });
  it("ignores junk counts and an empty list", () => {
    assert.deepEqual(unreadSummary([]), { count: 0, previews: [] });
    assert.equal(unreadSummary([{ id: "x", unreadCount: -3 }, { id: "y", unreadCount: NaN }]).count, 0);
  });
});

describe("chatTitle / badgeText / sameSummary", () => {
  it("names chats the way the chat list does", () => {
    assert.equal(chatTitle({ id: "1", type: "dm", otherParticipant: { name: "Ada L", username: "ada" } }), "Ada L");
    assert.equal(chatTitle({ id: "2", type: "group", title: " Crew " }), "Crew");
    assert.equal(chatTitle({ id: "3" }), "Chat");
  });
  it("caps the badge", () => {
    assert.equal(badgeText(0), "");
    assert.equal(badgeText(7), "7");
    assert.equal(badgeText(120), "99+");
  });
  it("spots an unchanged summary", () => {
    const a = unreadSummary(chats);
    assert.equal(sameSummary(a, unreadSummary(chats)), true);
    assert.equal(sameSummary(null, a), false);
    assert.equal(sameSummary(a, unreadSummary(chats.slice(1))), false);
  });
});
