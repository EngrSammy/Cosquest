// The map lit by the hour (mapStyle.ts), against Map/TimeOfDay.swift and
// UI/Preferences.swift WorldClock.
import assert from "node:assert/strict";
import { describe, it, test } from "node:test";

import { contrast } from "../lookTokens.ts";
import { effectiveHour, hourForScheme, isWorldClock, mapStyle, timeOfDay, WORLD_CLOCKS } from "../mapStyle.ts";

describe("the map by the hour (TimeOfDay.swift)", () => {
  it("buckets the hour as TimeOfDay.now does", () => {
    assert.deepEqual(
      [0, 4, 5, 7, 8, 12, 16, 17, 19, 20, 23].map(timeOfDay),
      ["night", "night", "dawn", "dawn", "day", "day", "day", "dusk", "dusk", "night", "night"],
    );
    assert.equal(timeOfDay(18.4), "dusk");
    assert.equal(timeOfDay(-1), "night");
  });

  it("follows the clock unless Time in town is fixed (Preferences.WorldClock)", () => {
    const at = new Date(2026, 9, 20, 21, 30);
    assert.equal(effectiveHour("real", at), 21.5);
    assert.equal(timeOfDay(effectiveHour("morning", at)), "day");
    assert.equal(timeOfDay(effectiveHour("noon", at)), "day");
    assert.equal(timeOfDay(effectiveHour("dusk", at)), "dusk");
    assert.equal(timeOfDay(effectiveHour("night", new Date(2026, 9, 20, 12))), "night");
    assert.deepEqual(WORLD_CLOCKS.map((c) => c.label), ["Follow the clock", "Morning", "Midday", "Dusk", "Night"]);
    assert.equal(isWorldClock("dusk"), true);
    assert.equal(isWorldClock("evening"), false);
  });

  it("is the art direction's day map by day and dusk map after it (tokens.json map)", () => {
    const day = mapStyle(12);
    assert.equal(day.dark, false);
    assert.equal(day.land, "#E9E2D2");
    assert.equal(day.park, "#A9D08A");
    assert.equal(day.roadMajor, "#FFE7B0");
    assert.equal(day.windows, null);
    const night = mapStyle(23);
    assert.equal(night.dark, true);
    assert.equal(night.land, "#2B3552");
    assert.equal(night.windows, "#FFC27A");
    assert.deepEqual(mapStyle(18), { ...night, hour: "dusk" });
    // Dawn is the day map.
    assert.deepEqual(mapStyle(6), { ...day, hour: "dawn" });
    // The streets read over the land: minor roads lighter than the land, majors set apart by their casing.
    const lum = (h: string) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
    for (const s of [day, night]) {
      assert.ok(lum(s.roadMinor) > lum(s.land), `${s.hour} minor road over land`);
      assert.notEqual(s.roadMajor, s.land);
      assert.notEqual(s.roadMajorCasing, s.roadMajor);
      // A building's side is darker than its top: it stands up off the ground.
      assert.ok(lum(s.buildingSide) < lum(s.buildingTop), `${s.hour} building side darker than top`);
    }
  });

  it("labels pass AA against their halo", () => {
    for (const s of [mapStyle(12), mapStyle(23)]) assert.ok(contrast(s.label, s.labelHalo) >= 4.5, `${s.hour} ${contrast(s.label, s.labelHalo)}`);
  });
});

test("dark mode lights the town as at night when the world follows the clock (task 059)", () => {
  assert.equal(hourForScheme("real", 13, false), 13);
  assert.equal(hourForScheme("real", 13, true), 22);
  assert.equal(hourForScheme("real", 23, true), 23);
  assert.equal(hourForScheme("noon", 13, true), 13);
});
