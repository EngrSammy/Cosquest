import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COMPASS_START,
  compassReduce,
  DEAD_BAND_DEG,
  HeadingFilter,
  lowPassDeg,
  needsCalibration,
  RATE_MS,
  readingDeg,
  rotForHeading,
  shortDeltaDeg,
  wrapDeg,
} from "../headingUp.ts";

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("the short turn goes the short way round through north", () => {
  near(shortDeltaDeg(350, 10), 20);
  near(shortDeltaDeg(10, 350), -20);
  near(shortDeltaDeg(0, 180), 180);
  near(shortDeltaDeg(90, 90), 0);
  near(shortDeltaDeg(-30, 30), 60);
  near(wrapDeg(-90), 270);
  near(wrapDeg(725), 5);
});

test("the low-pass never averages 350 and 10 into 180", () => {
  // A long step lands on the sample, via north.
  near(lowPassDeg(350, 10, 10_000), 10, 1e-3);
  // A partial step from 355 toward 5 stays near north.
  const half = lowPassDeg(355, 5, 100, 160);
  assert.ok(half > 355 || half < 5, `${half}`);
  // dt 0 keeps the value.
  near(lowPassDeg(120, 200, 0), 120);
});

test("true north first, magnetic when true north is unknown, nothing when neither", () => {
  near(readingDeg({ trueHeading: 12, magHeading: 30 })!, 12);
  near(readingDeg({ trueHeading: -1, magHeading: 30 })!, 30);
  assert.equal(readingDeg({ trueHeading: -1, magHeading: -1 }), null);
  assert.equal(readingDeg({ trueHeading: NaN, magHeading: NaN }), null);
});

test("the first reading moves the map at once", () => {
  const f = new HeadingFilter();
  near(f.push(42, 0)!, 42);
});

test("wobble inside the dead-band does not move the map", () => {
  const f = new HeadingFilter();
  f.push(100, 0);
  let t = 0;
  for (let i = 0; i < 200; i++) {
    t += 20;
    const wobble = (i % 2 ? 1 : -1) * (DEAD_BAND_DEG - 0.5);
    assert.equal(f.push(100 + wobble, t), null, `moved at ${i}`);
  }
});

test("a real turn comes through, smoothed, and rate limited", () => {
  const f = new HeadingFilter();
  f.push(0, 0);
  const out: { t: number; h: number }[] = [];
  for (let t = 10; t <= 2000; t += 10) {
    const h = f.push(90, t);
    if (h !== null) out.push({ t, h });
  }
  assert.ok(out.length > 3, "turned in steps");
  for (let i = 1; i < out.length; i++) {
    assert.ok(out[i].t - out[i - 1].t >= RATE_MS, "no faster than the rate limit");
    assert.ok(out[i].h > out[i - 1].h, "monotonic toward the target, no overshoot");
    assert.ok(out[i].h <= 90 + 1e-9);
  }
  // It gets within the dead-band of the target.
  assert.ok(90 - out[out.length - 1].h < DEAD_BAND_DEG);
});

test("a turn across north takes the short way (no spin through 180)", () => {
  const f = new HeadingFilter();
  f.push(350, 0);
  for (let t = 20; t < 1000; t += 20) {
    const h = f.push(20, t);
    if (h !== null) assert.ok(h >= 349 || h <= 20, `went the long way: ${h}`);
  }
});

test("a long silence starts the filter afresh at the new heading", () => {
  const f = new HeadingFilter();
  f.push(10, 0);
  near(f.push(200, 5000)!, 200);
});

test("the map turn puts the heading up the screen, nearest the current turn", () => {
  // Facing east: the board turns a quarter left (east goes to the top).
  near(rotForHeading(90, 0), -Math.PI / 2);
  near(rotForHeading(0, 0), 0);
  // Already wound round once: stays on that winding (no spin back).
  near(rotForHeading(10, -2 * Math.PI), -2 * Math.PI - (10 * Math.PI) / 180);
  // Crossing north from 359 to 1: a 2 degree step, not 358.
  const r0 = rotForHeading(359, 0);
  const r1 = rotForHeading(1, r0);
  near(Math.abs(r1 - r0), (2 * Math.PI) / 180);
});

test("calibration is asked for on a low accuracy only", () => {
  assert.equal(needsCalibration(0), true);
  assert.equal(needsCalibration(1), true);
  assert.equal(needsCalibration(2), false);
  assert.equal(needsCalibration(3), false);
  assert.equal(needsCalibration(null), false);
  assert.equal(needsCalibration(undefined), false);
});

test("compass button: tap toggles, a twist lets go of heading up", () => {
  let s = COMPASS_START;
  assert.equal(s.mode, "north");
  s = compassReduce(s, { t: "tap" });
  assert.equal(s.mode, "heading");
  s = compassReduce(s, { t: "twist" });
  assert.equal(s.mode, "north");
  // A twist in north up changes nothing.
  assert.equal(compassReduce(s, { t: "twist" }), s);
  s = compassReduce(compassReduce(s, { t: "tap" }), { t: "tap" });
  assert.equal(s.mode, "north");
});

test("a phone without a compass drops heading up and ignores the button", () => {
  let s = compassReduce(compassReduce(COMPASS_START, { t: "tap" }), { t: "unavailable" });
  assert.deepEqual(s, { mode: "north", available: false });
  s = compassReduce(s, { t: "tap" });
  assert.equal(s.mode, "north");
  // A reading later proves it has one after all.
  assert.equal(compassReduce(s, { t: "reading" }).available, true);
});
