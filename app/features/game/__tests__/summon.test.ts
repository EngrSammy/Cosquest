// "See it here" (features/game/summon.ts): the USDZ and LOD for AR, when the
// button shows (iOS only; Android waits for ARCore), the turntable fallback,
// true-scale height, pinch limits and the words.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseForgeEntry } from "../forgeWorld.ts";
import {
  arLod,
  pickUsdz,
  SUMMON_CLIP_S,
  summonHeight,
  summonHint,
  summonKind,
  summonLabel,
  summonMode,
  summonScaleLimits,
  summonShareText,
  summonShown,
} from "../summon.ts";

const ref = (file: string) => ({ file, url: `/v1/catalogue/files/a/1/${file}`, bytes: 10, sha256: "ab" });

// Armstrong as staging served him on 2026-11-01 (trimmed): USDZ at every LOD,
// a renderer [[min], [max]] box 1.8 m tall.
const ARMSTRONG = parseForgeEntry({
  id: "e2d4a66b",
  type: "character",
  name: "Armstrong",
  version: 1,
  role: "hero",
  rigged: true,
  bounds_m: [
    [-0.6221, 0, -0.3221],
    [0.6221, 1.8, 0.3221],
  ],
  pivot: "base-centre",
  skeleton: "humanoid-mixamo",
  animations: [
    { name: "celebrate", duration_s: 2, loop: false },
    { name: "idle", duration_s: 2, loop: true },
  ],
  lods: [0, 1, 2].map((lod) => ({ lod, glb: ref(`armstrong__lod${lod}.glb`), usdz: ref(`armstrong__lod${lod}.usdz`) })),
});

const ios = { platform: "ios", nativeView: true, islandOff: false };

describe("See it here: the file", () => {
  it("parses the staging entry", () => {
    assert.ok(ARMSTRONG);
  });
  it("uses the full mesh on a good phone and LOD 1 elsewhere", () => {
    assert.equal(arLod("high"), 0);
    assert.equal(arLod("mid"), 1);
    assert.equal(arLod("low"), 1);
    assert.equal(pickUsdz(ARMSTRONG!, arLod("high"))?.file, "armstrong__lod0.usdz");
    assert.equal(pickUsdz(ARMSTRONG!, arLod("mid"))?.file, "armstrong__lod1.usdz");
  });
  it("falls back to a lighter LOD, then a heavier one, and never to a GLB", () => {
    const only2 = { lods: [{ lod: 0, glb: ref("a.glb"), usdz: null }, { lod: 2, glb: ref("c.glb"), usdz: ref("c.usdz") }] };
    assert.deepEqual(pickUsdz(only2, 0), { ...ref("c.usdz"), lod: 2 });
    const only0 = { lods: [{ lod: 0, glb: null, usdz: ref("a.usdz") }, { lod: 2, glb: ref("c.glb"), usdz: null }] };
    assert.equal(pickUsdz(only0, 1)?.file, "a.usdz");
    assert.equal(pickUsdz({ lods: [{ lod: 0, glb: ref("a.glb"), usdz: null }] }, 0), null);
  });
});

describe("See it here: who gets the button", () => {
  it("shows on iOS with the native view and a USDZ", () => {
    assert.equal(summonShown(ARMSTRONG, ios), true);
  });
  it("is hidden on Android (ARCore later) and the web", () => {
    assert.equal(summonShown(ARMSTRONG, { ...ios, platform: "android" }), false);
    assert.equal(summonShown(ARMSTRONG, { ...ios, platform: "web" }), false);
  });
  it("is hidden without the native view, with the island off, or with no USDZ (a starter weapon)", () => {
    assert.equal(summonShown(ARMSTRONG, { ...ios, nativeView: false }), false);
    assert.equal(summonShown(ARMSTRONG, { ...ios, islandOff: true }), false);
    assert.equal(summonShown({ lods: [{ lod: 0, glb: ref("s.glb"), usdz: null }] }, ios), false);
    assert.equal(summonShown(null, ios), false);
  });
  it("falls back to the 3D turntable with no world tracking, a refused camera or a failed view", () => {
    assert.equal(summonMode(false, null), "turntable");
    assert.equal(summonMode(true, null), "ar");
    assert.equal(summonMode(true, "looking"), "ar");
    assert.equal(summonMode(true, "placed"), "ar");
    assert.equal(summonMode(true, "denied"), "turntable");
    assert.equal(summonMode(true, "failed"), "turntable");
  });
});

describe("See it here: size", () => {
  it("stands a character at the catalogue's height (true scale)", () => {
    assert.equal(summonHeight(ARMSTRONG!), 1.8);
  });
  it("lets the phone size weapons and ignores absurd heights", () => {
    assert.equal(summonHeight({ type: "weapon", bounds_m: [0.1, 1.1, 0.1], height_m: 1.1 }), 0);
    assert.equal(summonHeight({ type: "character", bounds_m: [60, 180, 30], height_m: 180 }), 0);
    assert.equal(summonHeight({ type: "character", bounds_m: null, height_m: null }), 0);
  });
  it("pinches a character down to tabletop and a little past life size", () => {
    const c = summonScaleLimits(summonKind({ type: "character" }));
    assert.ok(c.min * 1.8 < 0.25 && c.min > 0);
    assert.ok(c.max >= 1.2 && c.max <= 2);
    assert.equal(summonKind({ type: "weapon" }), "weapon");
    assert.equal(summonKind({ type: "station" }), "object");
  });
});

describe("See it here: words", () => {
  it("names the thing for VoiceOver and the share sheet, never the place", () => {
    assert.equal(summonLabel("Armstrong"), "See Armstrong in your room");
    assert.equal(summonShareText("Armstrong"), "Armstrong, summoned with CosQuest");
  });
  it("gives one line of help per moment", () => {
    assert.match(summonHint("character", null, false), /floor/);
    assert.match(summonHint("character", "placed", false), /Double tap/);
    assert.doesNotMatch(summonHint("weapon", "placed", false), /celebrate/);
    assert.match(summonHint("character", "denied", false), /Settings/);
    assert.match(summonHint("character", "placed", true), /Let go/);
    assert.equal(SUMMON_CLIP_S, 10);
  });
});
