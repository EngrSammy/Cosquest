// The Guardian reveal before a fight (features/game/reveal.ts): when it shows,
// which Guardian stands in the room, its nameplate, the moment's steps and the
// timings that keep it inside the judge's lead.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pickOpponent } from "../../game3d/fight3d.ts";
import { parseForgeEntry, type ForgeEntry } from "../forgeWorld.ts";
import {
  REVEAL_AUTO_MS,
  REVEAL_FIND_MS,
  REVEAL_HANDOFF_MS,
  REVEAL_MAX_MS,
  revealGuardian,
  revealHint,
  revealHoldsFight,
  revealPlate,
  type RevealEvent,
  revealRole,
  revealSettingShown,
  type RevealState,
  revealStep,
  revealShareText,
  revealWanted,
} from "../reveal.ts";
import type { DuelStart } from "../wire.ts";

const ref = (file: string) => ({ file, url: `/v1/catalogue/files/a/1/${file}`, bytes: 10, sha256: "ab" });

function character(id: string, role: string, usdz = true): ForgeEntry {
  const e = parseForgeEntry({
    id,
    type: "character",
    name: id.toUpperCase(),
    version: 1,
    role,
    rigged: true,
    lods: [0, 1].map((lod) => ({ lod, glb: ref(`${id}__lod${lod}.glb`), usdz: usdz ? ref(`${id}__lod${lod}.usdz`) : null })),
  });
  assert.ok(e);
  return e;
}

const G1 = character("g1", "guardian");
const G2 = character("g2", "guardian");
const G3 = character("g3", "guardian");
const BOSS = character("boss", "boss");
const HERO = character("hero", "hero");
const NO_USDZ = character("g0", "guardian", false);
const CAST = [G1, G2, G3, BOSS, HERO, NO_USDZ];

const ios = { platform: "ios", nativeView: true, arSupported: true, islandOff: false, pref: true, fight3d: true };

describe("AR reveal: when it shows", () => {
  it("shows on an AR iPhone with the setting on, before a 3D fight", () => {
    assert.equal(revealWanted(ios), true);
  });
  it("never shows on Android or the web (ARCore later)", () => {
    assert.equal(revealWanted({ ...ios, platform: "android" }), false);
    assert.equal(revealWanted({ ...ios, platform: "web" }), false);
  });
  it("goes straight to the fight without AR, the native view, the island, the setting or the 3D fight", () => {
    assert.equal(revealWanted({ ...ios, arSupported: false }), false);
    assert.equal(revealWanted({ ...ios, nativeView: false }), false);
    assert.equal(revealWanted({ ...ios, islandOff: true }), false);
    assert.equal(revealWanted({ ...ios, pref: false }), false);
    assert.equal(revealWanted({ ...ios, fight3d: false }), false);
  });
  it("offers the Profile setting only where the reveal could happen", () => {
    assert.equal(revealSettingShown(ios), true);
    assert.equal(revealSettingShown({ ...ios, arSupported: false }), false);
    assert.equal(revealSettingShown({ ...ios, platform: "android" }), false);
  });
});

describe("AR reveal: which Guardian", () => {
  it("stands the character the duel named", () => {
    assert.equal(revealGuardian(CAST, { enemyId: "g2", role: "guardian", key: "p1" })?.id, "g2");
  });
  it("otherwise the one the fight picks for this place (the same rule as fightCast)", () => {
    const want = pickOpponent(CAST, "guardian", "point-42");
    assert.ok(want);
    const got = revealGuardian(CAST, { role: "guardian", key: "point-42" });
    if (want.lods.some((l) => l.usdz)) assert.equal(got?.id, want.id);
    else assert.ok(got && got.lods.some((l) => l.usdz));
  });
  it("skips a named character with no USDZ and falls back to a cast character", () => {
    const got = revealGuardian(CAST, { enemyId: "g0", role: "guardian", key: null });
    assert.equal(got?.id, "g1");
  });
  it("a raid stands the boss", () => {
    assert.equal(revealGuardian(CAST, { role: "boss", key: "raid-1" })?.id, "boss");
    assert.equal(revealRole("raid"), "boss");
    assert.equal(revealRole("point", "raid"), "boss");
    assert.equal(revealRole("trial"), "guardian");
  });
  it("any character with a USDZ when no Guardian has one; null when none has", () => {
    assert.equal(revealGuardian([NO_USDZ, HERO], { role: "guardian", key: "x" })?.id, "hero");
    assert.equal(revealGuardian([NO_USDZ], { role: "guardian", key: "x" }), null);
    assert.equal(revealGuardian([], { role: "guardian", key: "x" }), null);
  });
});

describe("AR reveal: the nameplate", () => {
  const point = { name: "Tafawa Balewa Square", tier: "rare", extra: { guardian: "Oba of Stone" } };
  const start = (setup: Record<string, unknown>) => ({ setup }) as Pick<DuelStart, "setup">;
  it("before the duel starts: the point's Guardian and tier", () => {
    assert.deepEqual(revealPlate(null, point), { kicker: "RARE GUARDIAN", name: "Oba of Stone" });
    assert.deepEqual(revealPlate(null, { name: "Somewhere" }), { kicker: "GUARDIAN", name: "The Guardian" });
  });
  it("after: the server's name and the fight's kind, as the fight's card says", () => {
    assert.deepEqual(revealPlate(start({ kind: "fight3d", guardian_name: "Sango", point: { tier: "epic" } }), point), { kicker: "EPIC GUARDIAN", name: "Sango" });
    assert.equal(revealPlate(start({ kind: "fight3d", guardian_name: "Rung boss", trial: { rung: 3, rungs: 8 } }), point).kicker, "GUARDIAN TRIAL · RUNG 3 OF 8");
    assert.equal(revealPlate(start({ kind: "fight3d", guardian_name: "Big", raid: { hp_left: 50, hp_max: 100 } }), point).kicker, "RAID BOSS");
    assert.equal(revealPlate(start({ kind: "fight3d", siege: {} }), point).kicker, "SIEGE");
    assert.equal(revealPlate(start({ kind: "fight3d", run: { value: 3 } }), point).kicker, "QUEST RUN");
  });
  it("a Siege the holder's own hero guards says so on the nameplate", () => {
    const siege = (holder_hero: boolean) => start({ kind: "fight3d", guardian_name: "Ada", siege: { faction_attacked_name: "DC", holder_name: "Ada", holder_hero } });
    assert.deepEqual(revealPlate(siege(true), point), { kicker: "SIEGE", name: "Ada", holds: "Ada's hero holds this point" });
    assert.deepEqual(revealPlate(siege(false), point), { kicker: "SIEGE", name: "Ada" });
  });
  it("a start with no name keeps the point's Guardian", () => {
    assert.equal(revealPlate(start({ kind: "fight3d" }), point).name, "Oba of Stone");
  });
});

describe("AR reveal: the moment", () => {
  const run = (events: RevealEvent[], from: RevealState = "coming") => events.reduce(revealStep, from);
  it("comes, stands, and leaves into the fight on Fight", () => {
    assert.equal(run(["placed"]), "standing");
    assert.equal(run(["placed", "go"]), "leaving");
    assert.equal(run(["placed", "go", "fightShown"]), "done");
  });
  it("can be skipped before the Guardian stands", () => {
    assert.equal(run(["go"]), "leaving");
  });
  it("a failed AR goes straight to the fight, with no bloom", () => {
    assert.equal(run(["failed"]), "done");
    assert.equal(run(["placed", "failed"]), "done");
    // Already leaving: the fight is on its way, keep the bloom until it shows.
    assert.equal(run(["go", "failed"]), "leaving");
  });
  it("the fight failing or showing ends it whatever the step", () => {
    assert.equal(run(["fightShown"]), "done");
    assert.equal(run(["placed", "fightShown"]), "done");
  });
  it("done is final, and a late placed changes nothing", () => {
    assert.equal(run(["go", "fightShown", "placed", "go", "failed"]), "done");
    assert.equal(run(["go", "placed"]), "leaving");
  });
  it("holds the prepared fight only while the reveal is being watched", () => {
    assert.equal(revealHoldsFight("coming"), true);
    assert.equal(revealHoldsFight("standing"), true);
    assert.equal(revealHoldsFight("leaving"), false);
    assert.equal(revealHoldsFight("done"), false);
  });
});

describe("AR reveal: timings and words", () => {
  it("is a 5 to 10 second moment that never comes near the judge's 90 s lead", () => {
    assert.ok(REVEAL_AUTO_MS >= 5000 && REVEAL_AUTO_MS <= 10000);
    assert.ok(REVEAL_FIND_MS <= 10000);
    assert.ok(REVEAL_MAX_MS + REVEAL_HANDOFF_MS < 90000 / 2);
  });
  it("says what to do at each step", () => {
    assert.match(revealHint("coming", false), /Finding/);
    assert.match(revealHint("coming", true), /ground/);
    assert.match(revealHint("standing", true), /Fight/);
    assert.match(revealHint("leaving", true), /fight/);
  });
  it("shares the Guardian's name, never the place", () => {
    assert.equal(revealShareText("Sango"), "Sango, met in CosQuest");
  });
});
