// The game's location watch (audit B8): 5 s / 5 m at high accuracy instead of
// 2 s / 3 m at the best the phone can do. These prove the in-reach checks stay
// right: a player who walks up to a point sees it open within one fix.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { distanceM, reachM, stepToward, type LatLng } from "../geo.ts";
import { LOCATION_WATCH, watchFixes, watchLagM } from "../locationWatch.ts";

const POINT: LatLng = { lat: 51.508, lng: -0.128 };
const START: LatLng = { lat: 51.5091, lng: -0.128 }; // about 122 m north

/** A walk straight at the point, one sample a second, stopping on it. */
function walk(speedMs: number, from = START, to = POINT): LatLng[] {
  const path: LatLng[] = [from];
  for (let i = 0; i < 600 && distanceM(path[path.length - 1], to) > 0.5; i++) path.push(stepToward(path[path.length - 1], to, speedMs));
  return path;
}

/** Seconds from the moment the player is truly inside `radius` to the first fix that says so. */
function delayToReach(path: LatLng[], radius: number, watch = LOCATION_WATCH): number {
  const crossed = path.findIndex((p) => distanceM(p, POINT) <= radius);
  const seen = watchFixes(path, watch).find((f) => distanceM(f.fix, POINT) <= radius);
  assert.ok(crossed >= 0 && seen, "the walk reaches the point");
  return seen.at / 1000 - crossed;
}

describe("location watch (audit B8)", () => {
  it("asks for a fix every 5 s or 5 m", () => {
    assert.deepEqual(LOCATION_WATCH, { timeIntervalMs: 5000, distanceIntervalM: 5 });
  });

  it("trails a walker by at most 7 m, well inside the 40 m open radius", () => {
    assert.equal(watchLagM(0), 5);
    assert.equal(watchLagM(1.4), 7);
    assert.ok(watchLagM(1.4) < reachM(40, 0) * 0.2);
  });

  it("a walker (1.4 m/s) or a jogger (3 m/s) sees a point open within 5 s of stepping into reach", () => {
    for (const speed of [1.4, 3]) {
      const reach = reachM(40, 10);
      const delay = delayToReach(walk(speed), reach);
      assert.ok(delay >= 0 && delay <= LOCATION_WATCH.timeIntervalMs / 1000, `speed ${speed}: ${delay} s`);
    }
  });

  it("a player who stops inside reach is seen inside reach (the last fix is where they stand)", () => {
    const path = walk(1.4);
    for (let i = 0; i < 10; i++) path.push(path[path.length - 1]);
    const fixes = watchFixes(path);
    const last = fixes[fixes.length - 1].fix;
    assert.ok(distanceM(last, POINT) <= reachM(40, 10));
  });

  it("on a walk: one fix per 5 s, where the old watch gave one per 3 s (its 3 m filter)", () => {
    const path = walk(1.4);
    const now = watchFixes(path).length;
    const before = watchFixes(path, { timeIntervalMs: 2000, distanceIntervalM: 3 }).length;
    assert.ok(now <= Math.ceil(path.length / 5) + 1, `${now} fixes over ${path.length} s`);
    assert.ok(now < before * 0.65, `${now} vs ${before}`);
  });
});
