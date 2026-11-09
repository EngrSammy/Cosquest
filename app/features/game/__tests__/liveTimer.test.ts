import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createLiveTimers,
  hpPercent,
  type LiveTimerNative,
  type LiveTimerState,
  raidFinal,
  raidSpec,
  refreshRaid,
  runFinal,
  runLine,
  runSpec,
  trackRaid,
  UPDATE_EVERY_MS,
} from "../liveTimer.ts";
import type { RunState } from "../run.ts";

const run = (over: Partial<RunState> = {}): RunState => ({
  run_id: "r1",
  mode: "daily",
  region: "gb",
  day: "2026-11-01",
  started_at: "2026-11-01T10:00:00Z",
  ends_at: "2026-11-01T10:15:00Z",
  remaining_s: 900,
  score: 420,
  finished: false,
  powers: { radar: 1, surge: 1 },
  surge_armed: false,
  points: [
    { idx: 0, id: "a", name: "A", value: 100, done: true, earned: 100, hidden: false, forbidden: false },
    { idx: 1, id: "b", name: "B", value: 100, done: false, earned: 0, hidden: false, forbidden: false },
  ],
  ...over,
});

type Call = [string, ...unknown[]];

function fakeNative(supported = true) {
  const calls: Call[] = [];
  let n = 0;
  const native: LiveTimerNative = {
    supported: () => supported,
    start: async (kind, title, subtitle, link, endsAtMs, state) => {
      calls.push(["start", kind, title, subtitle, link, endsAtMs, state]);
      n += 1;
      return `id${n}`;
    },
    update: async (id, state, endsAtMs) => {
      calls.push(["update", id, state, endsAtMs]);
      return true;
    },
    end: async (id, final) => {
      calls.push(["end", id, final]);
    },
  };
  return { native, calls };
}

function fakeClock(start = 1_000_000) {
  let t = start;
  const timers: { at: number; fn: () => void; id: number }[] = [];
  let seq = 0;
  return {
    now: () => t,
    setTimer: (fn: () => void, ms: number) => {
      const id = ++seq;
      timers.push({ at: t + ms, fn, id });
      return id;
    },
    clearTimer: (id: unknown) => {
      const i = timers.findIndex((x) => x.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    advance(ms: number) {
      t += ms;
      for (const x of [...timers].sort((a, b) => a.at - b.at)) {
        if (x.at <= t) {
          timers.splice(timers.indexOf(x), 1);
          x.fn();
        }
      }
    },
  };
}

describe("run clock", () => {
  it("shows the score and progress, to the phone's deadline", () => {
    assert.equal(runLine(run()), "420 pts · 1 of 2 points");
    assert.equal(runLine(run({ score: 1 })), "1 pt · 1 of 2 points");
    const s = runSpec(run(), 5_000);
    assert.deepEqual(s, {
      kind: "run",
      key: "r1",
      title: "Quest Run",
      subtitle: "Daily run",
      link: "cosquest://play",
      endsAt: 5_000,
      state: { line: "420 pts · 1 of 2 points" },
    });
  });

  it("falls back to the server's end, calls a pocket run by its name, and has none once over", () => {
    assert.equal(runSpec(run(), null)?.endsAt, Date.parse("2026-11-01T10:15:00Z"));
    assert.equal(runSpec(run({ mode: "pocket" }), 1)?.title, "Pocket Run");
    assert.equal(runSpec(run({ finished: true }), 1), null);
    assert.equal(runSpec(null, 1), null);
    assert.deepEqual(runFinal(run()), { line: "420 pts · 1 of 2 points", finished: true, headline: "Run over · 420 pts" });
  });
});

describe("raid clock", () => {
  const point = { id: "raid:x", name: "Trafalgar Square", extra: { raid_until: "2026-11-01T10:30:00Z", raid_hp: "620", raid_hp_max: "1000", raid_players: "4" } };

  it("tracks a boss from the duel start, else from the point", () => {
    const t = trackRaid(point, { boss_name: "Armstrong", hp_left: 500, hp_max: 1000, ends_at: "2026-11-01T10:20:00Z", fighters: 3 });
    assert.deepEqual(t, { pointId: "raid:x", name: "Armstrong", place: "Trafalgar Square", endsAt: Date.parse("2026-11-01T10:20:00Z"), hpLeft: 500, hpMax: 1000, fighters: 3 });
    const fromPoint = trackRaid(point, null);
    assert.equal(fromPoint?.endsAt, Date.parse("2026-11-01T10:30:00Z"));
    assert.equal(fromPoint?.hpLeft, 620);
    assert.equal(fromPoint?.fighters, 4);
    assert.equal(trackRaid({ id: "p", name: "P", extra: {} }, null), null);
  });

  it("shows HP and crew, links back to the boss, and ends when it falls or leaves", () => {
    const t = trackRaid(point, null)!;
    const s = raidSpec(t, 0)!;
    assert.equal(s.title, "Trafalgar Square");
    assert.equal(s.subtitle, "Boss raid");
    assert.equal(s.link, "cosquest://play?raid=raid%3Ax");
    assert.deepEqual(s.state, { line: "Boss 62% HP", hpPercent: 62, fighters: 4 });
    assert.equal(raidSpec(t, t.endsAt), null);
    assert.equal(raidSpec({ ...t, hpLeft: 0 }, 0), null);
    assert.equal(raidFinal({ ...t, hpLeft: 0 }).headline, "Boss down!");
    assert.equal(raidFinal(t).headline, "The boss got away");
    const named = raidSpec({ ...t, name: "Armstrong" }, 0)!;
    assert.equal(named.subtitle, "Boss raid · Trafalgar Square");
  });

  it("takes fresh HP, crew and leaving time from the map", () => {
    const t = trackRaid(point, null)!;
    const r = refreshRaid(t, { id: "raid:x", extra: { raid_hp: "100", raid_players: "6" } });
    assert.equal(r.hpLeft, 100);
    assert.equal(r.fighters, 6);
    assert.equal(r.hpMax, 1000);
    assert.equal(refreshRaid(t, { id: "other", extra: { raid_hp: "1" } }), t);
    assert.equal(refreshRaid(t, null), t);
  });

  it("rounds HP up and clamps it", () => {
    assert.equal(hpPercent(4, 1000), 1);
    assert.equal(hpPercent(-5, 100), 0);
    assert.equal(hpPercent(150, 100), 100);
    assert.equal(hpPercent(null, 100), null);
    assert.equal(hpPercent(1, 0), null);
  });
});

describe("createLiveTimers", () => {
  const spec = (score: number, key = "r1", endsAt = 9_000_000) => runSpec(run({ run_id: key, score }), endsAt)!;

  it("starts once, then updates only on change, throttled, the last change always landing", async () => {
    const { native, calls } = fakeNative();
    const clock = fakeClock();
    const lt = createLiveTimers({ native, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
    lt.sync("run", spec(420));
    await lt.settled();
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], "start");
    lt.sync("run", spec(420));
    await lt.settled();
    assert.equal(calls.length, 1, "the same state sends nothing");
    clock.advance(UPDATE_EVERY_MS);
    lt.sync("run", spec(500));
    await lt.settled();
    assert.deepEqual(calls[1], ["update", "id1", { line: "500 pts · 1 of 2 points" }, 9_000_000]);
    lt.sync("run", spec(510));
    lt.sync("run", spec(520));
    await lt.settled();
    assert.equal(calls.length, 2, "too soon: held");
    clock.advance(UPDATE_EVERY_MS);
    await lt.settled();
    assert.equal(calls.length, 3);
    assert.equal((calls[2][2] as LiveTimerState).line, "520 pts · 1 of 2 points");
  });

  it("sends a moved end at once", async () => {
    const { native, calls } = fakeNative();
    const clock = fakeClock();
    const lt = createLiveTimers({ native, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
    lt.sync("run", spec(1, "r1", 9_000_000));
    lt.sync("run", spec(1, "r1", 9_000_500));
    await lt.settled();
    assert.equal(calls.length, 1, "jitter under the slack is the same end");
    lt.sync("run", spec(1, "r1", 9_060_000));
    await lt.settled();
    assert.deepEqual(calls[1].slice(0, 2), ["update", "id1"]);
  });

  it("replaces the clock for a different run, and ends with the result or at once", async () => {
    const { native, calls } = fakeNative();
    const lt = createLiveTimers({ native });
    lt.sync("run", spec(1, "r1"));
    await lt.settled();
    lt.sync("run", spec(1, "r2"));
    await lt.settled();
    assert.deepEqual(
      calls.map((c) => c.slice(0, 2)),
      [["start", "run"], ["end", "id1"], ["start", "run"]],
    );
    lt.sync("run", null, runFinal(run()));
    await lt.settled();
    assert.deepEqual(calls[3], ["end", "id2", runFinal(run())]);
    lt.sync("run", null);
    await lt.settled();
    assert.equal(calls.length, 4, "nothing left to end");
  });

  it("starts only the latest when a run is replaced before its clock started", async () => {
    const { native, calls } = fakeNative();
    const lt = createLiveTimers({ native });
    lt.sync("run", spec(1, "r1"));
    lt.sync("run", spec(1, "r2"));
    await lt.settled();
    assert.deepEqual(calls.map((c) => c.slice(0, 2)), [["start", "run"]]);
    assert.equal(lt.peek().run?.key, "r2");
  });

  it("never leaves a clock behind when it was left before the start landed", async () => {
    const { native, calls } = fakeNative();
    const lt = createLiveTimers({ native });
    lt.sync("raid", raidSpec({ pointId: "p", name: "Boss", endsAt: 9e12 }, 0));
    lt.sync("raid", null);
    await lt.settled();
    assert.deepEqual(calls, [], "the start never went out");
  });

  it("keeps run and raid apart", async () => {
    const { native, calls } = fakeNative();
    const lt = createLiveTimers({ native });
    lt.sync("run", spec(1));
    lt.sync("raid", raidSpec({ pointId: "p", name: "Boss", endsAt: 9e12 }, 0));
    await lt.settled();
    assert.deepEqual(calls.map((c) => [c[0], c[1]]), [["start", "run"], ["start", "raid"]]);
    assert.equal(lt.peek().run?.id, "id1");
    assert.equal(lt.peek().raid?.id, "id2");
  });

  it("does nothing without the module, and starts nothing where unsupported or refused", async () => {
    createLiveTimers({ native: null }).sync("run", spec(1));
    const off = fakeNative(false);
    const a = createLiveTimers({ native: off.native });
    a.sync("run", spec(1));
    await a.settled();
    assert.deepEqual(off.calls, []);
    const refused = fakeNative();
    let asks = 0;
    const b = createLiveTimers({
      native: refused.native,
      askPermission: async () => {
        asks += 1;
        return false;
      },
    });
    b.sync("run", spec(1, "r1"));
    b.sync("run", spec(1, "r2"));
    await b.settled();
    assert.deepEqual(refused.calls, []);
    assert.equal(asks, 1, "asked once");
  });

  it("clears what a killed app left, once", async () => {
    const { native, calls } = fakeNative();
    const lt = createLiveTimers({ native });
    lt.clearLeftovers();
    lt.clearLeftovers();
    lt.sync("run", spec(1));
    await lt.settled();
    assert.deepEqual(calls.map((c) => [c[0], c[1]]), [["end", "run"], ["end", "raid"], ["start", "run"]]);
  });

  it("survives a failing module", async () => {
    const logs: string[] = [];
    const native: LiveTimerNative = {
      supported: () => true,
      start: async () => {
        throw new Error("boom");
      },
      update: async () => true,
      end: async () => {},
    };
    const lt = createLiveTimers({ native, log: (m) => logs.push(m) });
    lt.sync("run", spec(1));
    await lt.settled();
    assert.match(logs[0], /boom/);
    lt.endAll();
    await lt.settled();
  });
});
