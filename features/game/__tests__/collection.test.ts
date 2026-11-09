import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { collectionCount, collectionLabel, collectionOpen, collectionTabFor, collectionTabs, type CollectionOpener } from "../collection.ts";

const both = { relicsOn: true, forgeOn: true };

describe("the Collection (Relics and Forge in one sheet)", () => {
  it("routes every old Forge-bag opener to the Forge tab", () => {
    for (const o of ["forge", "forge-claim", "more-forge"] as CollectionOpener[]) assert.equal(collectionTabFor(o, both), "forge", o);
  });
  it("routes the rail and the old Relics openers to the Relics tab", () => {
    for (const o of ["rail", "relics", "coach-relics"] as CollectionOpener[]) assert.equal(collectionTabFor(o, both), "relics", o);
  });
  it("never dead-ends: a tab the player lacks falls back to the one they have", () => {
    assert.equal(collectionTabFor("forge-claim", { relicsOn: true, forgeOn: false }), "relics");
    assert.equal(collectionTabFor("rail", { relicsOn: false, forgeOn: true }), "forge");
    assert.equal(collectionTabFor("relics", { relicsOn: false, forgeOn: false }), null);
  });
  it("shows the tabs the player has, Relics first, and the button only when there is one", () => {
    assert.deepEqual(collectionTabs(both), ["relics", "forge"]);
    assert.deepEqual(collectionTabs({ relicsOn: false, forgeOn: true }), ["forge"]);
    assert.equal(collectionOpen({ relicsOn: false, forgeOn: false }), false);
    assert.equal(collectionOpen({ relicsOn: false, forgeOn: true }), true);
  });
  it("rolls both counts up to the one button", () => {
    assert.equal(collectionCount(3, 2), 5);
    assert.equal(collectionCount(null, undefined), 0);
    assert.equal(collectionLabel(3, 1, both), "Collection, 3 Relics, 1 Forge find");
    assert.equal(collectionLabel(0, 0, both), "Collection");
  });
});
