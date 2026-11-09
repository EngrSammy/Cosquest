// The game's UI kit (lookTokens.ts) against WCAG AA, as the art direction's
// acceptance table asks: body text >= 4.5:1 in both schemes, large text and
// buttons >= 3:1, and no white label on Sun, coins or Celestials.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ACCENT, contrast, edgeColor, FACTION, labelOn, rarityOf, SURFACES, TEXT_ON_DARK, TEXT_ON_LIGHT } from "../lookTokens.ts";

describe("the game's UI kit passes AA", () => {
  it("body and muted text on every surface, light and dark", () => {
    for (const scheme of ["light", "dark"] as const) {
      const s = SURFACES[scheme];
      for (const bg of [s.screen, s.surface, s.surfaceAlt]) {
        assert.ok(contrast(s.text, bg) >= 4.5, `${scheme} text on ${bg}: ${contrast(s.text, bg).toFixed(2)}`);
        assert.ok(contrast(s.textMuted, bg) >= 4.5, `${scheme} muted on ${bg}: ${contrast(s.textMuted, bg).toFixed(2)}`);
      }
    }
  });

  it("status words on light and dark paper", () => {
    for (const c of Object.values(TEXT_ON_LIGHT)) assert.ok(contrast(c, SURFACES.light.surface) >= 4.5, c);
    for (const c of Object.values(TEXT_ON_DARK)) assert.ok(contrast(c, SURFACES.dark.surface) >= 4.5, c);
  });

  it("button labels: >= 4.5 for ink labels, >= 3 (large, bold) for white", () => {
    for (const [name, a] of Object.entries(ACCENT)) {
      const min = a.label === "#FFFFFF" ? 3 : 4.5;
      assert.ok(contrast(a.label, a.fill) >= min, `${name}: ${contrast(a.label, a.fill).toFixed(2)}`);
    }
  });

  it("faction labels read on their fills", () => {
    for (const [name, f] of Object.entries(FACTION)) assert.ok(contrast(f.label, f.fill) >= 3, `${name}: ${contrast(f.label, f.fill).toFixed(2)}`);
  });

  it("never puts a white label on Sun, coins or Celestials", () => {
    for (const fill of [ACCENT.sun.fill, ACCENT.coin.fill, FACTION.celestials.fill, FACTION.blockbusters.fill, "#FFE08A"]) {
      assert.notEqual(labelOn(fill), "#FFFFFF", fill);
    }
    assert.equal(labelOn(ACCENT.berry.fill), "#FFFFFF");
    assert.equal(labelOn("#1C2B3A"), "#FFFDF8");
  });
});

describe("the kit's helpers", () => {
  it("edges are the accent's own, or the fill darkened", () => {
    assert.equal(edgeColor(ACCENT.sun.fill), "#B8650A");
    assert.equal(edgeColor("#808080"), "#575757");
  });

  it("maps any server tier to a rarity", () => {
    assert.deepEqual(["common", "rare", "epic", "legendary", "mythic", null].map(rarityOf), ["common", "rare", "epic", "legendary", "common", "common"]);
  });
});
