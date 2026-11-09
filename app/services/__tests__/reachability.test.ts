// The web build's internet check (services/reachability.ts). Hosted at
// <game server>/play, NetInfo's default ("/" of the origin, the game API's 404)
// showed "You're offline" over a working page.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { webReachabilityUrl } from "../reachability.ts";

describe("web reachability check", () => {
  it("asks the build's own favicon under its base path", () => {
    assert.equal(webReachabilityUrl("/play"), "/play/favicon.ico");
    assert.equal(webReachabilityUrl("/play/"), "/play/favicon.ico");
    assert.equal(webReachabilityUrl("play"), "/play/favicon.ico");
  });
  it("is the site's own favicon when the build sits at the root", () => {
    assert.equal(webReachabilityUrl(undefined), "/favicon.ico");
    assert.equal(webReachabilityUrl(""), "/favicon.ico");
    assert.equal(webReachabilityUrl("/"), "/favicon.ico");
  });
  it("never asks the origin's root, which is not this app everywhere", () => {
    for (const b of [undefined, "", "/", "/play"]) assert.notEqual(webReachabilityUrl(b), "/");
  });
});
