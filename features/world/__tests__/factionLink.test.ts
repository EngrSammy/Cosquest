import assert from "node:assert/strict";
import { test } from "node:test";

import { chatFactionFor, gameRealmFor, linkAction, resolveLinkMode, suggestedRealms } from "../factionLink.ts";

test("faction link: off unless asked", () => {
  assert.equal(resolveLinkMode(undefined), "off");
  assert.equal(resolveLinkMode("nonsense"), "off");
  assert.equal(resolveLinkMode("chat"), "chat");
  assert.equal(resolveLinkMode("1"), "chat");
  assert.equal(resolveLinkMode("game"), "game");
  assert.equal(linkAction("off", "ascendants", null), null);
});

test("faction link: chat drives the game where the mapping is one-to-one", () => {
  assert.equal(gameRealmFor("ascendants"), "anime");
  assert.equal(gameRealmFor("icons"), null);
  assert.deepEqual(suggestedRealms("icons"), ["marvel", "dc"]);
  assert.equal(gameRealmFor("celestials"), null);
  assert.deepEqual(linkAction("chat", "controllers", null), { joinRealm: "gaming" });
  assert.equal(linkAction("chat", "icons", null), null);
  assert.equal(linkAction("chat", "controllers", "anime"), null);
});

test("faction link: the game drives the chat", () => {
  assert.equal(chatFactionFor("dc"), "icons");
  assert.deepEqual(linkAction("game", "ascendants", "movies"), { setChatFaction: "blockbusters" });
  assert.equal(linkAction("game", "icons", "marvel"), null);
  assert.equal(linkAction("game", "icons", null), null);
});
