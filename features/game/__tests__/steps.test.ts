// Walking rewards: the step ledger (readings, reboots, weeks, metres), the
// report the server gets, and one update against a fake server that keeps
// app/roam_steps.py's rules (week cap, speed limit, largest figure wins,
// milestones once).
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GameClient } from "../client.ts";
import { Identity, signingPayload, utf8ToBytes, verifySignature } from "../identity.ts";
import {
  advance,
  type CounterReading,
  describeRewards,
  EMPTY_STEPS_VIEW,
  emptyLedger,
  isoDay,
  LEDGER_KEY,
  markSent,
  metersFor,
  milestoneState,
  noteSteps,
  parseLedger,
  pedometerMeters,
  permissionName,
  progressTo,
  reportsDue,
  type SensorAnswer,
  splitByWeek,
  type StepLedger,
  type StepsMilestone,
  type StepsStatus,
  STRIDE_M,
  updateSteps,
  utcMonday,
} from "../steps.ts";

const H = 3_600_000;
const D = 24 * H;
// Monday 2026-10-12 00:00 UTC.
const MON = Date.UTC(2026, 9, 12);
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

/** A phone that booted at `bootMs` (wall clock), read at `wallMs`. */
const reading = (steps: number, bootMs: number, wallMs: number): CounterReading => ({ steps, elapsedRealtimeMs: wallMs - bootMs, wallClockMs: wallMs });

describe("steps: weeks", () => {
  it("the week is Monday 00:00 UTC, whatever the day", () => {
    assert.equal(isoDay(utcMonday(MON)), "2026-10-12");
    assert.equal(isoDay(utcMonday(MON + 3 * D + 5 * H)), "2026-10-12");
    assert.equal(isoDay(utcMonday(MON - 1)), "2026-10-05"); // Sunday 23:59:59.999
    assert.equal(isoDay(utcMonday(MON + 7 * D - 1)), "2026-10-12");
    assert.equal(isoDay(utcMonday(Date.UTC(2026, 0, 1))), "2025-12-29"); // a Thursday, across the year
  });

  it("a gap inside a week is all that week's; across Monday it is shared by time, never more than counted", () => {
    assert.deepEqual(splitByWeek(MON + D, MON + 2 * D, 1000), { "2026-10-12": 1000 });
    assert.deepEqual(splitByWeek(MON - 6 * H, MON + 2 * H, 800), { "2026-10-05": 600, "2026-10-12": 200 });
    const odd = splitByWeek(MON - 1 * H, MON + 2 * H, 1001);
    assert.ok(sum(odd) <= 1001);
    assert.deepEqual(splitByWeek(MON + D, MON + D, 50), { "2026-10-12": 50 });
    assert.deepEqual(splitByWeek(MON + 2 * D, MON + D, 50), { "2026-10-12": 50 }); // backwards: the end's week
    assert.deepEqual(splitByWeek(MON, MON + D, 0), {});
  });
});

describe("steps: the ledger", () => {
  it("the first reading counts everything since boot", () => {
    const boot = MON + 2 * H;
    const a = advance(emptyLedger(), reading(4000, boot, MON + 10 * H));
    assert.equal(a.kind, "first");
    assert.deepEqual(a.added, { "2026-10-12": 4000 });
    assert.deepEqual(a.ledger.last, { steps: 4000, elapsedMs: 8 * H, wallMs: MON + 10 * H, bootMs: boot });
  });

  it("between two readings of one boot, exactly the rise", () => {
    const boot = MON + 2 * H;
    let l = advance(emptyLedger(), reading(4000, boot, MON + 10 * H)).ledger;
    const b = advance(l, reading(9500, boot, MON + D));
    assert.equal(b.kind, "same-boot");
    assert.deepEqual(b.added, { "2026-10-12": 5500 });
    l = b.ledger;
    assert.equal(l.weeks["2026-10-12"], 9500);
    // The same reading again adds nothing.
    assert.deepEqual(advance(l, reading(9500, boot, MON + D)).added, {});
  });

  it("a reboot (the counter went down) counts only what was walked since", () => {
    const l = advance(emptyLedger(), reading(9000, MON + H, MON + 20 * H)).ledger;
    const newBoot = MON + D;
    const r = advance(l, reading(1200, newBoot, MON + D + 3 * H));
    assert.equal(r.kind, "reboot");
    assert.deepEqual(r.added, { "2026-10-12": 1200 });
    assert.equal(r.ledger.weeks["2026-10-12"], 10_200);
    assert.equal(r.ledger.last?.bootMs, newBoot);
  });

  it("a reboot whose uptime is shorter than before, even with a higher count", () => {
    const l = advance(emptyLedger(), reading(100, MON + 10 * H, MON + 12 * H)).ledger; // uptime 2 h
    const r = advance(l, reading(300, MON + 13 * H, MON + 14 * H)); // uptime 1 h: rebooted
    assert.equal(r.kind, "reboot");
    assert.deepEqual(r.added, { "2026-10-12": 300 });
  });

  it("a boot time that moved without anything going down never counts a walk twice (clock set forward)", () => {
    const boot = MON + H;
    const l = advance(emptyLedger(), reading(5000, boot, MON + 2 * H)).ledger;
    // Ten minutes later by elapsed time, but the wall clock now reads 3 days on.
    const r = advance(l, { steps: 5100, elapsedRealtimeMs: H + 10 * 60_000, wallClockMs: MON + 3 * D + 2 * H });
    assert.equal(r.kind, "boot-moved");
    assert.equal(sum(r.added), 100);
    // And again: still only the rise.
    const again = advance(r.ledger, { steps: 5100, elapsedRealtimeMs: H + 11 * 60_000, wallClockMs: MON + 5 * D });
    assert.equal(sum(again.added), 0);
  });

  it("a clock set back is dated by elapsed time, not the wall clock", () => {
    const boot = MON + 2 * D;
    const l = advance(emptyLedger(), reading(0, boot, MON + 2 * D + H)).ledger;
    // Two hours of uptime later, but the clock now says one hour earlier than before.
    const r = advance(l, { steps: 700, elapsedRealtimeMs: 3 * H, wallClockMs: MON + 2 * D });
    assert.equal(r.kind, "same-boot");
    assert.deepEqual(r.added, { "2026-10-12": 700 });
  });

  it("a walk over Sunday midnight is shared between the weeks; older weeks are dropped", () => {
    const boot = MON - 10 * D;
    const l = advance(emptyLedger(), reading(0, boot, MON - 2 * H)).ledger;
    const r = advance(l, reading(1000, boot, MON + 2 * H));
    assert.deepEqual(r.added, { "2026-10-05": 500, "2026-10-12": 500 });
    // Uptime since three weeks ago: only last week and this week are kept.
    const first = advance(emptyLedger(), reading(21_000, MON - 14 * D, MON + 7 * D - 1));
    assert.deepEqual(Object.keys(first.added).sort(), ["2026-10-05", "2026-10-12"]);
    assert.ok(sum(first.added) <= 21_000 * (14 / 21) + 1);
    // A week later, last week's entries age out.
    const later = advance(r.ledger, reading(1000, boot, MON + 14 * D + H));
    assert.deepEqual(later.ledger.weeks, {});
  });

  it("survives a bad save", () => {
    assert.deepEqual(parseLedger(null), emptyLedger());
    assert.deepEqual(parseLedger("{nope"), emptyLedger());
    assert.deepEqual(parseLedger('{"v":2}'), emptyLedger());
    const l = parseLedger('{"v":1,"last":{"steps":-1},"weeks":{"2026-10-12":12.7,"x":5,"2026-10-05":-3},"sent":{},"asked":true}');
    assert.equal(l.last, null);
    assert.deepEqual(l.weeks, { "2026-10-12": 12 });
    assert.equal(l.asked, true);
  });
});

describe("steps: what the server is told", () => {
  it("steps become metres at a short stride, rounded down", () => {
    assert.equal(STRIDE_M, 0.7);
    assert.equal(metersFor(7143), 5000);
    assert.equal(metersFor(10), 7);
    assert.equal(metersFor(-5), 0);
  });

  it("this week always (as iOS); last week only when it grew past what the server took", () => {
    const now = MON + 2 * H;
    const l: StepLedger = { ...emptyLedger(), weeks: { "2026-10-05": 1000, "2026-10-12": 100 } };
    assert.deepEqual(reportsDue(l, now), [
      { week_start: "2026-10-05", meters: 700 },
      { week_start: "2026-10-12", meters: 70 },
    ]);
    const sent = markSent(l, "2026-10-05", 700);
    assert.deepEqual(reportsDue(sent, now), [{ week_start: "2026-10-12", meters: 70 }]);
    assert.deepEqual(reportsDue(emptyLedger(), now), [{ week_start: "2026-10-12", meters: 0 }]);
  });
});

// ---------- against a fake server with app/roam_steps.py's rules ----------

const MILESTONES: StepsMilestone[] = [
  { km: 5, coins: 20, xp: 0, items: { fifty: 1 } },
  { km: 25, coins: 60, xp: 150, items: { retry: 1 } },
  { km: 50, coins: 150, xp: 400, items: { retry: 2 } },
];

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

function fakeStepsServer(clock: () => number) {
  const rows = new Map<string, { meters: number; updated: number }>();
  const claimed = new Map<string, number[]>();
  const calls: Call[] = [];
  const status = (week: string) => {
    const meters = rows.get(week)?.meters ?? 0;
    const got = claimed.get(week) ?? [];
    const next = MILESTONES.find((m) => !got.includes(m.km) && meters < m.km * 1000)?.km ?? null;
    return { week_start: week, meters, km: Math.round(meters / 100) / 10, next_milestone_km: next, claimed: [...got].sort((a, b) => a - b), milestones: MILESTONES };
  };
  const reply = (status: number, body: unknown) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
  const fetch = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    const thisWeek = isoDay(utcMonday(clock()));
    if (init.method === "GET" && url.includes("/v1/roam/steps?")) return reply(200, status(thisWeek));
    if (init.method === "POST" && url.endsWith("/v1/roam/steps/report")) {
      const req = JSON.parse(init.body ?? "{}") as { week_start: string; meters: number };
      const lastWeek = isoDay(utcMonday(clock()) - 7 * D);
      if (req.week_start !== thisWeek && req.week_start !== lastWeek) return reply(422, { detail: { reason: "That week is over." } });
      const row = rows.get(req.week_start) ?? { meters: 0, updated: Date.parse(`${req.week_start}T00:00:00Z`) };
      const want = Math.min(req.meters, 100_000);
      if (want > row.meters) {
        const hours = Math.max(0, (clock() - row.updated) / H);
        if (want - row.meters > 20 * 1000 * hours + 50) return reply(422, { detail: { reason: "That's faster than walking." } });
        row.meters = want;
        row.updated = clock();
      }
      rows.set(req.week_start, row);
      const newly = [];
      for (const m of MILESTONES) {
        const got = claimed.get(req.week_start) ?? [];
        if (row.meters >= m.km * 1000 && !got.includes(m.km)) {
          claimed.set(req.week_start, [...got, m.km]);
          newly.push({ km: m.km, rewards: { xp: m.xp, coins: m.coins, items: m.items } });
        }
      }
      return reply(200, { ...status(req.week_start), newly });
    }
    return reply(404, { detail: "Not Found" });
  };
  return { fetch, calls, rows };
}

function harness(start: number) {
  let now = start;
  const id = new Identity("22".repeat(32), "device");
  const server = fakeStepsServer(() => now);
  const client = new GameClient({ baseUrl: "https://g.example", identity: () => id, fetch: server.fetch, sleep: async () => {} });
  const saved = new Map<string, string>();
  let answer: SensorAnswer = { kind: "unavailable" };
  const asks: boolean[] = [];
  const deps = {
    client,
    sense: async (ask: boolean) => {
      asks.push(ask);
      return answer;
    },
    load: async () => saved.get(LEDGER_KEY) ?? null,
    save: async (text: string) => void saved.set(LEDGER_KEY, text),
    now: () => now,
  };
  return {
    id,
    server,
    deps,
    asks,
    saved,
    setNow: (ms: number) => (now = ms),
    setAnswer: (a: SensorAnswer) => (answer = a),
  };
}

describe("steps: one update (StepsModel.update)", () => {
  it("reports the week's total, signed like iOS, and shows what it paid", async () => {
    const h = harness(MON + 20 * H);
    const boot = MON + H;
    h.setAnswer({ kind: "reading", reading: reading(8000, boot, MON + 20 * H) });
    const v = await updateSteps(h.deps, EMPTY_STEPS_VIEW, false);
    assert.equal(v.note, null);
    assert.equal(v.status?.meters, 5600);
    assert.deepEqual(v.newly.map((n) => n.km), [5]);
    assert.equal(v.justPaid, true);
    const post = h.server.calls.find((c) => c.method === "POST");
    assert.ok(post);
    assert.deepEqual(JSON.parse(post.body ?? ""), { device_key: h.id.publicKeyHex, week_start: "2026-10-12", meters: 5600 });
    const nonce = Number(post.headers["X-Nonce"]);
    assert.ok(verifySignature(h.id.publicKeyHex, signingPayload("POST", "/v1/roam/steps/report", utf8ToBytes(post.body ?? ""), nonce), post.headers["X-Signature"]));
    // The first update on this phone may ask for the permission; later ones only when pressed.
    assert.deepEqual(h.asks, [true]);

    // Opening again with no new steps: the same total, nothing paid twice.
    const again = await updateSteps(h.deps, v, false);
    assert.equal(again.justPaid, false);
    assert.deepEqual(again.newly.map((n) => n.km), [5]); // still shown, as iOS keeps `newly`
    assert.deepEqual(h.asks, [true, false]);
  });

  it("iOS: the pedometer's distance since Monday is reported as it is, with no ledger", async () => {
    const h = harness(MON + 20 * H);
    h.setAnswer({ kind: "distance", meters: 5321.7 });
    const v = await updateSteps(h.deps, EMPTY_STEPS_VIEW, false);
    assert.equal(v.note, null);
    assert.equal(v.status?.meters, 5321);
    assert.deepEqual(v.newly.map((n) => n.km), [5]);
    assert.equal(v.justPaid, true);
    const posts = h.server.calls.filter((c) => c.method === "POST").map((c) => JSON.parse(c.body ?? "{}"));
    assert.deepEqual(posts, [{ device_key: h.id.publicKeyHex, week_start: "2026-10-12", meters: 5321 }]);
    // Again with the same figure: nothing paid twice.
    const again = await updateSteps(h.deps, v, false);
    assert.equal(again.justPaid, false);
    // A quiet reading on open does nothing on iOS (the history is Apple's).
    await noteSteps(h.deps);
    assert.equal(h.server.calls.filter((c) => c.method === "POST").length, 2);
  });

  it("a walk over Sunday midnight: last week is sent too, then this week", async () => {
    const h = harness(MON - 3 * H);
    const boot = MON - 3 * D;
    h.setAnswer({ kind: "reading", reading: reading(0, boot, MON - 3 * H) });
    await updateSteps(h.deps, EMPTY_STEPS_VIEW, false);
    h.setNow(MON + 3 * H);
    h.setAnswer({ kind: "reading", reading: reading(12_000, boot, MON + 3 * H) });
    const v = await updateSteps(h.deps, EMPTY_STEPS_VIEW, true);
    const posts = h.server.calls.filter((c) => c.method === "POST").map((c) => JSON.parse(c.body ?? "{}"));
    assert.deepEqual(posts.slice(-2), [
      { device_key: h.id.publicKeyHex, week_start: "2026-10-05", meters: 4200 },
      { device_key: h.id.publicKeyHex, week_start: "2026-10-12", meters: 4200 },
    ]);
    assert.equal(v.status?.week_start, "2026-10-12");
    // Sent once: the next update does not send last week again.
    await updateSteps(h.deps, v, false);
    const after = h.server.calls.filter((c) => c.method === "POST").map((c) => JSON.parse(c.body ?? "{}"));
    assert.deepEqual(after.slice(posts.length), [{ device_key: h.id.publicKeyHex, week_start: "2026-10-12", meters: 4200 }]);
  });

  it("the server's refusal is shown in its own words, and the steps are kept for later", async () => {
    // 30,000 steps (21 km) half an hour into the week: faster than walking.
    const h = harness(MON + H / 2);
    h.setAnswer({ kind: "reading", reading: reading(30_000, MON + H / 4, MON + H / 2) });
    const v = await updateSteps(h.deps, EMPTY_STEPS_VIEW, false);
    assert.equal(v.note, "That's faster than walking.");
    assert.equal(v.noteIsProblem, true);
    assert.equal(parseLedger(h.saved.get(LEDGER_KEY)).weeks["2026-10-12"], 30_000);
    // Later in the week the same figure is plausible and is taken.
    h.setNow(MON + 2 * D);
    h.setAnswer({ kind: "reading", reading: reading(30_000, MON + H / 4, MON + 2 * D) });
    const w = await updateSteps(h.deps, v, false);
    assert.equal(w.note, null);
    assert.equal(w.status?.meters, 21_000);
    assert.deepEqual(w.newly.map((n) => n.km), [5]);
  });

  it("no sensor or no permission: the server's figure still shows, with iOS's notes", async () => {
    const h = harness(MON + D);
    h.setAnswer({ kind: "unavailable" });
    const v = await updateSteps(h.deps, EMPTY_STEPS_VIEW, false);
    assert.equal(v.note, "This phone can't count walking distance.");
    assert.equal(v.noteIsProblem, false);
    assert.equal(v.status?.meters, 0);
    assert.equal(h.server.calls.every((c) => c.method === "GET"), true);

    h.setAnswer({ kind: "denied" });
    const d = await updateSteps(h.deps, v, true);
    assert.equal(d.motionDenied, true);
    assert.equal(d.noteIsProblem, true);
    assert.match(d.note ?? "", /Physical activity/);

    h.setAnswer({ kind: "error" });
    const e = await updateSteps(h.deps, d, false);
    assert.equal(e.note, "Couldn't read your steps just now.");
    assert.equal(e.motionDenied, false);
  });

  it("iOS: denied says Motion & Fitness; never asked is quiet (no note, no Settings button)", async () => {
    const h = harness(MON + D);
    const ios = { ...h.deps, platform: "ios" as const };
    h.setAnswer({ kind: "denied" });
    const d = await updateSteps(ios, EMPTY_STEPS_VIEW, true);
    assert.equal(d.note, "Allow Motion & Fitness in Settings to count your walks.");
    assert.equal(d.noteIsProblem, true);
    assert.equal(d.motionDenied, true);

    h.setAnswer({ kind: "undetermined" });
    const q = await updateSteps(ios, d, false);
    assert.equal(q.note, null);
    assert.equal(q.noteIsProblem, false);
    assert.equal(q.motionDenied, false);
    assert.equal(q.status?.meters, 0);
    assert.equal(h.server.calls.filter((c) => c.method === "POST").length, 0);
    assert.equal(permissionName("ios"), "Motion & Fitness");
    assert.equal(permissionName("android"), "Physical activity");
    assert.equal(permissionName(undefined), "Physical activity");
  });

  it("the first explicit read asks (the prompt on first appearance, as Swift), later quiet reads do not", async () => {
    const h = harness(MON + D);
    h.setAnswer({ kind: "distance", meters: 100 });
    await updateSteps({ ...h.deps, platform: "ios" }, EMPTY_STEPS_VIEW, false);
    await updateSteps({ ...h.deps, platform: "ios" }, EMPTY_STEPS_VIEW, false);
    assert.deepEqual(h.asks, [true, false]);
  });

  it("pedometer metres fall back to steps when the distance is 0", () => {
    assert.equal(pedometerMeters(5321.7, 7000), 5321.7);
    assert.equal(pedometerMeters(0, 1000), 700);
    assert.equal(pedometerMeters(0, 0), 0);
    assert.equal(pedometerMeters(0, undefined), 0);
    assert.equal(pedometerMeters(-1, 10), null);
    assert.equal(pedometerMeters(Number.NaN, 10), null);
    assert.equal(pedometerMeters(undefined, 10), null);
  });

  it("nobody signed in: a note, no call", async () => {
    const h = harness(MON);
    const client = new GameClient({ baseUrl: "https://g.example", identity: () => null, fetch: h.server.fetch });
    const v = await updateSteps({ ...h.deps, client }, EMPTY_STEPS_VIEW, false);
    assert.equal(v.note, "Sign in to play.");
    assert.equal(h.server.calls.length, 0);
  });

  it("a quiet reading on game open keeps gaps short and never asks", async () => {
    const h = harness(MON - H);
    const boot = MON - 3 * D;
    h.setAnswer({ kind: "reading", reading: reading(100, boot, MON - H) });
    await noteSteps(h.deps);
    h.setAnswer({ kind: "reading", reading: reading(600, boot, MON - H / 2) });
    await noteSteps(h.deps);
    assert.deepEqual(h.asks, [false, false]);
    assert.equal(h.server.calls.length, 0);
    const l = parseLedger(h.saved.get(LEDGER_KEY));
    assert.equal(l.weeks["2026-10-05"], 600);
  });
});

describe("steps: drawing", () => {
  const status: StepsStatus = { week_start: "2026-10-12", meters: 7300, next_milestone_km: 25, claimed: [5], milestones: MILESTONES };
  it("the bar runs from the last milestone to the next", () => {
    const p = progressTo(status);
    assert.equal(p.line, "17.7 km to 25 km");
    assert.ok(Math.abs(p.value - 2300 / 20000) < 1e-9);
    assert.deepEqual(progressTo({ ...status, meters: 52000, claimed: [5, 25, 50], next_milestone_km: null }), { value: 1, line: "Every milestone done this week!", allDone: true });
  });
  it("tiles and rewards read as on iOS (no coins: they are bought, not earned)", () => {
    assert.deepEqual(MILESTONES.map((m) => milestoneState(status, m.km)), ["done", "next", "locked"]);
    assert.equal(describeRewards(MILESTONES[1]), "+150 XP, 1 × Second chance");
    assert.equal(describeRewards(MILESTONES[0], true), "1 50/50");
    assert.equal(describeRewards({ xp: 400, items: { retry: 2, time: 0 } }, true), "+400 XP\n2 Second chance");
  });
});
