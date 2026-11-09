// The live feature's pure part: the calendar by the phone's clock (the banner
// flipping on the minute), the words it uses, the stamp card, the calendar
// call and its state. Time is injected everywhere; no network.
// Live staging check: live.staging.test.ts.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { GameClient } from "../client.ts";
import { Identity } from "../identity.ts";
import {
  bannerAt,
  clockTime,
  createLiveCalendarStore,
  fetchLiveCalendar,
  isLive,
  type LiveCalendar,
  type LiveClock,
  type LiveEvent,
  liveAt,
  nextChange,
  parseCalendar,
  soonText,
  stampRow,
  stampsFrom,
  timeLeft,
  times,
  upcomingAfter,
  whenText,
} from "../live.ts";
import type { RoamMe } from "../wire.ts";

const T = (iso: string) => Date.parse(iso);
const MIN = 60000;

// What roam_live.calendar() returns for London on Wednesday 14 Oct 2026 (BST):
// Quest Hour 18:00-19:00 local is 17:00-18:00 UTC; Landmark Day is the first
// Saturday of November, 14:00-17:00 GMT.
const QUEST_HOUR: LiveEvent = {
  key: "quest_hour",
  title: "Quest Hour",
  multiplier: 2.0,
  starts_at: "2026-10-14T17:00:00+00:00",
  ends_at: "2026-10-14T18:00:00+00:00",
};
const NEXT_QUEST_HOUR: LiveEvent = { ...QUEST_HOUR, starts_at: "2026-10-21T17:00:00+00:00", ends_at: "2026-10-21T18:00:00+00:00" };
const LANDMARK: LiveEvent = {
  key: "landmark_day",
  title: "Landmark Day",
  multiplier: 3.0,
  starts_at: "2026-11-07T14:00:00+00:00",
  ends_at: "2026-11-07T17:00:00+00:00",
};
/** Fetched at 12:00 UTC: nothing on yet. */
const CAL: LiveCalendar = { region: "london", tz: "Europe/London", now: null, next: [QUEST_HOUR, NEXT_QUEST_HOUR, LANDMARK] };

const BST: LiveClock = { offsetMin: () => 60, hour12: true };
const GMT24: LiveClock = { offsetMin: () => 0, hour12: false };
/** Europe/London with its real change on 25 Oct 2026, 01:00 UTC. */
const LONDON: LiveClock = { offsetMin: (ms) => (ms < T("2026-10-25T01:00:00Z") ? 60 : 0), hour12: true };

describe("live: wire", () => {
  it("reads the server's calendar, tolerating missing and malformed parts", () => {
    const cal = parseCalendar({
      region: "london",
      tz: "Europe/London",
      server_now: "2026-10-14T12:00:00.123456+00:00",
      now: null,
      next: [QUEST_HOUR, { key: "broken" }, null, { ...LANDMARK, multiplier: "x", title: "" }],
    });
    assert.equal(cal.region, "london");
    assert.deepEqual(cal.next.map((e) => e.key), ["quest_hour", "landmark_day"]);
    assert.equal(cal.next[1].multiplier, 1);
    assert.equal(cal.next[1].title, "landmark_day");
    assert.deepEqual(parseCalendar(null), { region: "world", tz: null, server_now: null, now: null, next: [] });
    assert.deepEqual(parseCalendar({ now: { ...QUEST_HOUR, key: "override", title: "Launch Party" } }).now?.title, "Launch Party");
  });

  it("writes multipliers as iOS does", () => {
    assert.equal(times(2), "2×");
    assert.equal(times(3.0), "3×");
    assert.equal(times(1.5), "1.5×");
  });

  it("parses Python's isoformat with and without microseconds", () => {
    const frac = { ...QUEST_HOUR, starts_at: "2026-10-14T17:00:00.250000+00:00" };
    assert.equal(isLive(frac, T("2026-10-14T17:00:00.200Z")), false);
    assert.equal(isLive(frac, T("2026-10-14T17:00:00.300Z")), true);
    assert.equal(isLive({ ...QUEST_HOUR, starts_at: "nonsense" }, T("2026-10-14T17:30:00Z")), false);
  });
});

describe("live: the calendar by the phone's clock", () => {
  it("an event live by the phone's clock is live without a refetch; the end is exclusive", () => {
    assert.equal(liveAt(CAL, T("2026-10-14T16:59:59Z")), null);
    assert.equal(liveAt(CAL, T("2026-10-14T17:00:00Z"))?.key, "quest_hour");
    assert.equal(liveAt(CAL, T("2026-10-14T17:59:59Z"))?.key, "quest_hour");
    assert.equal(liveAt(CAL, T("2026-10-14T18:00:00Z")), null);
    // The server's own "now" wins while it is on.
    const override: LiveEvent = { key: "override", title: "Launch Party", multiplier: 2, starts_at: "2026-10-14T17:00:00+00:00", ends_at: "2026-10-14T18:00:00+00:00" };
    assert.equal(liveAt({ ...CAL, now: override }, T("2026-10-14T17:10:00Z"))?.key, "override");
  });

  it("upcoming is what has not started yet", () => {
    assert.deepEqual(upcomingAfter(CAL, T("2026-10-14T17:00:00Z")).map((e) => e.starts_at), [NEXT_QUEST_HOUR.starts_at, LANDMARK.starts_at]);
    assert.equal(upcomingAfter(CAL, T("2026-10-14T16:00:00Z")).length, 3);
  });

  it("counts down in whole minutes, rounding up", () => {
    const end = T("2026-10-14T18:00:00Z");
    assert.equal(timeLeft(end, end - 30_000), "1 min left");
    assert.equal(timeLeft(end, end - MIN), "1 min left");
    assert.equal(timeLeft(end, end - 90_000), "2 min left");
    assert.equal(timeLeft(end, end - 59 * MIN), "59 min left");
    assert.equal(timeLeft(end, end - 59.5 * MIN), "1 h left");
    assert.equal(timeLeft(end, end - 60 * MIN), "1 h left");
    assert.equal(timeLeft(end, end - 65 * MIN), "1 h 5 min left");
    assert.equal(timeLeft(end, end - 180 * MIN), "3 h left");
  });

  it("the banner: on now, else soon within a day, else nothing", () => {
    assert.equal(bannerAt(null, 0), null);
    // A week away: nothing on the map.
    assert.equal(bannerAt({ ...CAL, next: [NEXT_QUEST_HOUR] }, T("2026-10-14T12:00:00Z")), null);
    const soon = bannerAt(CAL, T("2026-10-14T12:00:00Z"));
    assert.equal(soon?.kind, "soon");
    assert.equal(soon?.kind === "soon" && soon.start, T("2026-10-14T17:00:00Z"));
    const live = bannerAt(CAL, T("2026-10-14T17:15:20Z"));
    assert.equal(live?.kind, "live");
    assert.equal(live?.kind === "live" && live.left, "45 min left");
    // Just under a day before Landmark Day it shows; just over, it does not.
    const lm = { ...CAL, next: [LANDMARK] };
    assert.equal(bannerAt(lm, T(LANDMARK.starts_at) - 24 * 60 * MIN - 1), null);
    assert.equal(bannerAt(lm, T(LANDMARK.starts_at) - 24 * 60 * MIN + 1)?.kind, "soon");
  });

  it("wakes exactly when the banner's words change, so it flips on the minute", () => {
    // Before: the next change is the start (sooner than midnight).
    const before = T("2026-10-14T16:58:10Z");
    assert.equal(nextChange(CAL, before, BST), T("2026-10-14T17:00:00Z"));
    assert.equal(bannerAt(CAL, before)?.kind, "soon");
    assert.equal(bannerAt(CAL, T("2026-10-14T17:00:00Z"))?.kind, "live");
    // During: each minute boundary of the countdown, and the end.
    const during = T("2026-10-14T17:15:20Z");
    const tick = nextChange(CAL, during, BST)!;
    assert.equal(tick, T("2026-10-14T17:16:00Z"));
    const left = (t: number) => {
      const b = bannerAt(CAL, t);
      return b?.kind === "live" ? b.left : null;
    };
    assert.equal(left(tick - 1), "45 min left");
    assert.equal(left(tick), "44 min left");
    assert.equal(nextChange(CAL, T("2026-10-14T17:16:00Z"), BST), T("2026-10-14T17:17:00Z"));
    assert.equal(nextChange(CAL, T("2026-10-14T17:59:30Z"), BST), T("2026-10-14T18:00:00Z"));
    assert.equal(bannerAt(CAL, T("2026-10-14T18:00:00Z")), null);
    // After: the next thing is the following Quest Hour coming within a day.
    assert.equal(nextChange(CAL, T("2026-10-14T18:00:00Z"), BST), T(NEXT_QUEST_HOUR.starts_at) - 24 * 60 * MIN);
    assert.equal(nextChange(null, 0, BST), null);
    assert.equal(nextChange({ ...CAL, next: [] }, 0, BST), null);
  });

  it("a soon card says Tomorrow until the phone's midnight, then Today", () => {
    const start = T("2026-10-21T17:00:00Z"); // 18:00 BST on the 21st
    const cal = { ...CAL, next: [NEXT_QUEST_HOUR] };
    const evening = T("2026-10-20T20:00:00Z"); // 21:00 BST on the 20th
    assert.equal(soonText(start, evening, BST), "Tomorrow at 6:00 PM");
    // Local midnight is 23:00 UTC, before the start: that is the next change.
    const midnight = T("2026-10-20T23:00:00Z");
    assert.equal(nextChange(cal, evening, BST), midnight);
    assert.equal(soonText(start, midnight - 1, BST), "Tomorrow at 6:00 PM");
    assert.equal(soonText(start, midnight, BST), "Today at 6:00 PM");
    // A UTC phone in 24-hour time turns its day an hour later.
    assert.equal(soonText(start, midnight, GMT24), "Tomorrow at 17:00");
    assert.equal(soonText(start, midnight + 60 * MIN, GMT24), "Today at 17:00");
  });
});

describe("live: words in the phone's time", () => {
  it("formats times the way the phone does", () => {
    assert.equal(clockTime(T("2026-10-14T17:00:00Z"), BST), "6:00 PM");
    assert.equal(clockTime(T("2026-10-14T23:05:00Z"), BST), "12:05 AM");
    assert.equal(clockTime(T("2026-10-14T11:30:00Z"), BST), "12:30 PM");
    assert.equal(clockTime(T("2026-10-14T17:00:00Z"), GMT24), "17:00");
    assert.equal(clockTime(T("2026-10-14T07:05:00Z"), GMT24), "07:05");
  });

  it("says when an event is (LiveDates.when), across the clocks going back", () => {
    assert.equal(whenText(QUEST_HOUR, LONDON), "Wed 14 Oct · 6:00 PM–7:00 PM");
    // After 25 Oct London is on GMT: the server's 18:00 local is 18:00 UTC.
    assert.equal(whenText({ ...QUEST_HOUR, starts_at: "2026-10-28T18:00:00+00:00", ends_at: "2026-10-28T19:00:00+00:00" }, LONDON), "Wed 28 Oct · 6:00 PM–7:00 PM");
    assert.equal(whenText(LANDMARK, GMT24), "Sat 7 Nov · 14:00–17:00");
    // A phone in Lagos (UTC+1) reading London's Quest Hour sees its own clock.
    assert.equal(whenText(QUEST_HOUR, { offsetMin: () => 60, hour12: false }), "Wed 14 Oct · 18:00–19:00");
    assert.equal(whenText({ ...QUEST_HOUR, starts_at: "bad" }, BST), "");
  });
});

describe("live: the stamp card", () => {
  const me = (live: unknown) => ({ standing: { level: 1 }, features: live === undefined ? {} : { live } }) as unknown as RoamMe;

  it("reads me.features.live, and nothing when the server said nothing", () => {
    assert.equal(stampsFrom(null), null);
    assert.equal(stampsFrom(me(undefined)), null);
    assert.deepEqual(stampsFrom(me({ stamps: 3, card_size: 7, cards_done: 1, now: null })), { stamps: 3, cards_done: 1, card_size: 7 });
    assert.deepEqual(stampsFrom(me({ stamps: 2 })), { stamps: 2, cards_done: 0, card_size: 7 });
    assert.deepEqual(stampsFrom(me({ stamps: -1, card_size: 0, cards_done: "x" })), { stamps: 0, cards_done: 0, card_size: 7 });
  });

  it("never fills more circles than the card has", () => {
    assert.deepEqual(stampRow({ stamps: 3, cards_done: 0, card_size: 7 }), { size: 7, have: 3 });
    assert.deepEqual(stampRow({ stamps: 9, cards_done: 0, card_size: 7 }), { size: 7, have: 7 });
  });
});

type Call = { url: string; method: string; headers: Record<string, string> };

function fakeFetch(answer: (call: Call, n: number) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const fetch = async (url: string, init: { method: string; headers: Record<string, string> }) => {
    const call = { url, method: init.method, headers: init.headers };
    calls.push(call);
    const a = answer(call, calls.length);
    const status = a.status ?? 200;
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(a.body) };
  };
  return { fetch, calls };
}

describe("live: the calendar call and its state", () => {
  const id = new Identity("22".repeat(32), "device");

  it("GETs v1/roam/live/calendar unsigned, with the place, and retries a 503 once", async () => {
    const { fetch, calls } = fakeFetch((_c, n) => (n === 1 ? { status: 503, body: { detail: "busy" } } : { body: { ...CAL, server_now: "x" } }));
    const client = new GameClient({ baseUrl: "https://g.example", identity: () => id, fetch, sleep: async () => {} });
    const cal = await fetchLiveCalendar(client, 51.5074, -0.1278);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].method, "GET");
    assert.equal(calls[1].url, "https://g.example/v1/roam/live/calendar?lat=51.5074&lng=-0.1278");
    assert.equal(calls[1].headers["X-Signature"], undefined);
    assert.equal(cal.next.length, 3);
  });

  it("keeps the last good calendar when a fetch fails, and says why in the server's words", async () => {
    let clock = 1_000_000;
    let fail = false;
    let fetched = 0;
    const store = createLiveCalendarStore({
      now: () => clock,
      fetchCalendar: async () => {
        fetched++;
        if (fail) {
          const { fetch } = fakeFetch(() => ({ status: 422, body: { detail: "lat out of range" } }));
          return fetchLiveCalendar(new GameClient({ baseUrl: "https://g", identity: () => null, fetch }), 0, 0);
        }
        return CAL;
      },
    });
    const seen: unknown[] = [];
    store.subscribe(() => seen.push(store.get()));
    await Promise.all([store.load(1, 2), store.load(1, 2)]);
    assert.equal(fetched, 1, "one request at a time");
    assert.equal(store.get().calendar, CAL);
    assert.equal(store.get().fetchedAt, 1_000_000);
    // Fresh for five minutes.
    clock += 299_000;
    await store.refreshIfStale(1, 2);
    assert.equal(fetched, 1);
    // ...unless the player is now somewhere else entirely (a stale first fix).
    await store.refreshIfStale(51.5, -0.12);
    assert.equal(fetched, 2, "a far move asks again at once");
    await store.refreshIfStale(51.5, -0.12);
    assert.equal(fetched, 2);
    clock += 2_000;
    clock += 299_000;
    fail = true;
    await store.refreshIfStale(51.5, -0.12);
    assert.equal(fetched, 3);
    assert.equal(store.get().calendar, CAL, "a dropped request does not hide a Quest Hour");
    assert.equal(store.get().error, "lat out of range");
    assert.equal(store.get().loading, false);
    // Snapshots are new objects (useSyncExternalStore).
    assert.notEqual(seen[seen.length - 1], seen[seen.length - 2]);
  });

  it("a network failure says so plainly", async () => {
    const store = createLiveCalendarStore({ fetchCalendar: () => Promise.reject(new Error("boom")) });
    await store.load(0, 0);
    assert.equal(store.get().calendar, null);
    assert.equal(store.get().error, "Check your connection.");
  });
});
