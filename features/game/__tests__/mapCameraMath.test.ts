import assert from "node:assert/strict";
import { test } from "node:test";

import { keepFocal, panned, shortAngle, toBoard, toScreen } from "../mapCameraMath.ts";

const anchor = { x: 220, y: 535 };
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("the camera's board point sits on the anchor", () => {
  const cam = { x: 900, y: 900, zoom: 1.7, rot: 0.8 };
  const s = toScreen(cam, anchor, { x: 900, y: 900 });
  near(s.x, anchor.x);
  near(s.y, anchor.y);
});

test("screen and board round-trip at any zoom and turn", () => {
  for (const cam of [
    { x: 500, y: 700, zoom: 1, rot: 0 },
    { x: 1200, y: 300, zoom: 0.5, rot: -2.1 },
    { x: 10, y: 1790, zoom: 2.2, rot: 3.0 },
  ]) {
    const p = { x: 812, y: 455 };
    const b = toBoard(cam, anchor, toScreen(cam, anchor, p));
    near(b.x, p.x);
    near(b.y, p.y);
  }
});

test("a drag moves the board under the finger, turned or not", () => {
  const cam = { x: 900, y: 900, zoom: 1.4, rot: 1.1 };
  const finger = { x: 100, y: 300 };
  const grabbed = toBoard(cam, anchor, finger);
  const next = { ...cam, ...panned(cam, 37, -52) };
  const s = toScreen(next, anchor, grabbed);
  near(s.x, finger.x + 37);
  near(s.y, finger.y - 52);
});

test("a pinch or twist keeps the point under the fingers still", () => {
  const cam = { x: 900, y: 900, zoom: 1, rot: 0.3 };
  const focal = { x: 80, y: 700 };
  const grabbed = toBoard(cam, anchor, focal);
  const turned = { zoom: 1.9, rot: -0.4 };
  const next = { ...keepFocal(cam, anchor, focal, turned), ...turned };
  const s = toScreen(next, anchor, grabbed);
  near(s.x, focal.x);
  near(s.y, focal.y);
});

test("back to north goes the short way round", () => {
  near(shortAngle(2 * Math.PI + 0.2), 0.2);
  near(shortAngle(-0.2), -0.2);
  near(shortAngle(3 * Math.PI - 0.1), Math.PI - 0.1);
  near(shortAngle(4 * Math.PI + 3.3), 3.3 - 2 * Math.PI);
});
