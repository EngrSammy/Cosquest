import assert from "node:assert/strict";
import { test } from "node:test";

import { buildFightConfig } from "../fight3d.ts";
import {
  HAPTIC_KINDS,
  HAPTIC_KO_QUIET_MS,
  HAPTIC_MAX_PER_S,
  HAPTIC_MIN_GAP_MS,
  HapticThrottle,
  hapticPlan,
  routeBridgeMessage,
} from "../haptics.ts";

function clock(start = 1000) {
  let t = start;
  return { now: () => t, set: (v: number) => (t = v), add: (d: number) => (t += d) };
}

test("each kind has its own feel: light hit, heavy thud, rigid block, double-tap parry, KO rumble", () => {
  assert.deepEqual(hapticPlan("hit"), [{ at: 0, call: { type: "impact", style: "light" } }]);
  assert.deepEqual(hapticPlan("hit_heavy", 1), [{ at: 0, call: { type: "impact", style: "heavy" } }]);
  assert.deepEqual(hapticPlan("hit_heavy", 0.4), [{ at: 0, call: { type: "impact", style: "medium" } }]);
  assert.deepEqual(hapticPlan("block"), [{ at: 0, call: { type: "impact", style: "rigid" } }]);
  assert.deepEqual(hapticPlan("parry"), [{ at: 0, call: { type: "notify", kind: "success" } }]);
  assert.deepEqual(hapticPlan("hurt"), [{ at: 0, call: { type: "impact", style: "medium" } }]);
  assert.deepEqual(hapticPlan("cast"), [{ at: 0, call: { type: "selection" } }]);
  assert.equal(hapticPlan("slam", 0.9)[0].call.type, "impact");
  const ko = hapticPlan("ko");
  assert.ok(ko.length >= 3, "the KO is a rumble");
  assert.ok(ko.every((s, i) => i === 0 || s.at > ko[i - 1].at), "its steps run in order");
  assert.ok(ko[ko.length - 1].at < HAPTIC_KO_QUIET_MS, "and end inside the KO's quiet");
  for (const k of HAPTIC_KINDS) assert.ok(hapticPlan(k).length >= 1, k);
});

test("Reduce motion keeps haptics but turns the KO rumble into one tap", () => {
  assert.deepEqual(hapticPlan("ko", 1, true), [{ at: 0, call: { type: "impact", style: "heavy" } }]);
  assert.deepEqual(hapticPlan("hit", 1, true), hapticPlan("hit"));
});

test("throttle: a minimum gap between touches, but a heavier one may cut in", () => {
  const c = clock();
  const th = new HapticThrottle(c.now);
  assert.equal(th.allow("hit"), true);
  c.add(HAPTIC_MIN_GAP_MS - 20);
  assert.equal(th.allow("hit"), false, "a light hit inside the gap is dropped");
  assert.equal(th.allow("hit_heavy"), true, "a heavy hit inside the gap passes");
  c.add(10);
  assert.equal(th.allow("hit_heavy"), false, "the same weight inside the gap is dropped");
  c.add(HAPTIC_MIN_GAP_MS);
  assert.equal(th.allow("hit"), true);
});

test("throttle: a 60 fps storm of hits is capped at a few touches a second, never a continuous buzz", () => {
  const c = clock();
  const th = new HapticThrottle(c.now);
  let sent = 0;
  for (let i = 0; i < 60; i++) {
    if (th.allow(i % 3 === 0 ? "hit_heavy" : "hit")) sent++;
    c.add(16);
  }
  assert.ok(sent <= HAPTIC_MAX_PER_S, `sent ${sent}`);
  assert.ok(sent >= 4, `still feels every few hits (sent ${sent})`);
});

test("throttle: a KO always lands, then quiet; the victory right after is the same KO", () => {
  const c = clock();
  const th = new HapticThrottle(c.now);
  for (let i = 0; i < HAPTIC_MAX_PER_S; i++) {
    th.allow("parry");
    c.add(HAPTIC_MIN_GAP_MS);
  }
  assert.equal(th.allow("ko"), true, "past the per-second cap, a KO still lands");
  c.add(16);
  assert.equal(th.allow("ko"), false, "one rumble");
  assert.equal(th.allow("parry"), false, "quiet after a KO");
  c.add(HAPTIC_KO_QUIET_MS);
  assert.equal(th.allow("hurt"), true, "touches again after the quiet");
});

test("routing: touches, state and the result are told apart, and only for the open fight", () => {
  assert.deepEqual(routeBridgeMessage('{"event":"haptic","k":"hit_heavy","s":0.8,"fight_id":3}', 3), {
    to: "haptic",
    haptic: { kind: "hit_heavy", strength: 0.8, reduceMotion: false },
  });
  assert.deepEqual(routeBridgeMessage('{"event":"haptic","k":"ko","s":5,"rm":1,"fight_id":3}', 3), {
    to: "haptic",
    haptic: { kind: "ko", strength: 1, reduceMotion: true },
  });
  assert.deepEqual(routeBridgeMessage('{"event":"haptic","k":"hit","fight_id":2}', 3), { to: "drop" }, "a replaced fight's touch");
  assert.deepEqual(routeBridgeMessage('{"event":"haptic","k":"explode","fight_id":3}', 3), { to: "drop" });
  assert.deepEqual(routeBridgeMessage('{"event":"state","state":"fighting","fight_id":3}', 3), { to: "state", state: "fighting" });
  // An event this build does not know is never taken for the result (which would end the fight).
  assert.deepEqual(routeBridgeMessage('{"event":"future","fight_id":3}', 3), { to: "drop" });
  const result = '{"outcome":"win","fight_id":3}';
  assert.deepEqual(routeBridgeMessage(result, 3), { to: "result", json: result });
  assert.deepEqual(routeBridgeMessage("not json", 3), { to: "drop" });
});

test("the fight config carries the player's haptics choice (on unless off)", () => {
  const base = { hero: { path: null, name: null }, ally: { path: null, name: null }, enemy: { path: null, name: null }, pointName: "p", mode: "full" as const, seed: 1, autoplay: false };
  assert.equal(buildFightConfig(base).haptics, true);
  assert.equal(buildFightConfig({ ...base, haptics: true }).haptics, true);
  assert.equal(buildFightConfig({ ...base, haptics: false }).haptics, false);
});
