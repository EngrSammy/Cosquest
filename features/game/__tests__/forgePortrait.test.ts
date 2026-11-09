// Forge portraits (day1-ui, art direction 5 "Same characters everywhere"): the
// catalogue's `portrait` decoded, preferred over the concept thumbnail
// wherever the model is shown, the Guardian a point names for its pin, and the
// full re-read that brings a portrait rendered after the publish.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { forgeThumbnailUrl, parseForgeElement, parsePortrait } from "../forge.ts";
import { parseForgeEntry, pointForge, PORTRAIT_REREAD_MS, wantsFullRead } from "../forgeWorld.ts";

const BASE = "https://cq.example";
const raw = {
  id: "e2d4a66b-bacb-4309-adb0-81e702026691",
  type: "character",
  name: "Armstrong",
  version: 1,
  files: [],
  thumbnail: { file: "armstrong__thumb.png", url: "/v1/catalogue/files/e/1/armstrong__thumb.png" },
  portrait: {
    url: "/v1/catalogue/portraits/e/1/portrait.png",
    sha256: "7a6c",
    full: { url: "/v1/catalogue/portraits/e/1/full.png", sha256: "603a" },
  },
};

describe("Forge portraits", () => {
  it("decodes the portrait and its full-body sprite, and tolerates odd ones", () => {
    const el = parseForgeElement(raw);
    assert.deepEqual(el?.portrait, {
      url: "/v1/catalogue/portraits/e/1/portrait.png",
      sha256: "7a6c",
      full: { url: "/v1/catalogue/portraits/e/1/full.png", sha256: "603a" },
    });
    assert.equal(parsePortrait(null), null);
    assert.equal(parsePortrait({ url: 4 }), null);
    assert.deepEqual(parsePortrait({ url: "/p.png", full: { url: "" } }), { url: "/p.png", sha256: null, full: null });
    // An older server: no portrait key, nothing breaks.
    const { portrait: _p, ...old } = raw;
    assert.equal(parseForgeElement(old)?.portrait, null);
    assert.equal(parseForgeEntry(raw)?.portrait?.full?.url, "/v1/catalogue/portraits/e/1/full.png");
  });

  it("shows the portrait where the thumbnail was, at a width the server answers", () => {
    const el = parseForgeElement(raw)!;
    assert.equal(forgeThumbnailUrl(BASE, el, 256), `${BASE}/v1/catalogue/portraits/e/1/portrait.png?w=256`);
    assert.equal(forgeThumbnailUrl(BASE, el, 768), `${BASE}/v1/catalogue/portraits/e/1/portrait.png?w=512`);
    const noPortrait = parseForgeElement({ ...raw, portrait: undefined })!;
    assert.equal(forgeThumbnailUrl(BASE, noPortrait, 768), `${BASE}/v1/catalogue/files/e/1/armstrong__thumb.png?w=768`);
  });

  it("reads the Guardian a fight point names", () => {
    const p = { id: "L1", forge: { guardian: { element_id: "deac2c29", version: 1, name: "Hoof" } } };
    assert.deepEqual(pointForge(p).guardian, { element_id: "deac2c29", version: 1 });
    assert.equal(pointForge({ id: "L2" }).guardian, null);
    assert.equal(pointForge({ id: "L3", forge: { guardian: { version: 1 } } }).guardian, null);
  });

  it("re-reads the whole catalogue now and then while a model waits for its portrait", () => {
    const withP = [{ type: "character", portrait: { url: "/p" } }, { type: "station", portrait: null }];
    const without = [...withP, { type: "weapon", portrait: null }];
    assert.equal(wantsFullRead([], 0, 1), true, "nothing yet: the whole list");
    assert.equal(wantsFullRead(withP, 0, 1e12), false, "every model has one: deltas only");
    assert.equal(wantsFullRead(without, -Infinity, 5), true, "first poll of a session");
    assert.equal(wantsFullRead(without, 1000, 1000 + PORTRAIT_REREAD_MS - 1), false);
    assert.equal(wantsFullRead(without, 1000, 1000 + PORTRAIT_REREAD_MS), true);
  });
});
