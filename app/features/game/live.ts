// Live ops: the events calendar (weekly Quest Hour, monthly Landmark Day), the
// banner's countdown, and the stamp card. The TypeScript twin of
// costquest-ios Features/LiveFeature.swift (server: app/roam_live.py).
//
// The server owns the calendar and pays the multiplier on the answer (it
// arrives as one more reward line, "Quest Hour ×2"); the phone only reads
// GET v1/roam/live/calendar and counts down to what it says. Every clock
// below is injected, so the date logic is tested without waiting for a
// Wednesday (features/game/__tests__/live.test.ts).
// Pure: no React Native imports.
import { GameError, type GameClient } from "./client.ts";
import { distanceM } from "./geo.ts";
import { parseServerDate, type RoamMe } from "./wire.ts";

// ---------- wire ----------

export type LiveEvent = {
  key: string;
  title: string;
  multiplier: number;
  starts_at: string;
  ends_at: string;
};

export type LiveCalendar = {
  region: string;
  /** The region's clock ("Europe/London"); shown nowhere, times are the phone's. */
  tz?: string | null;
  server_now?: string | null;
  now: LiveEvent | null;
  next: LiveEvent[];
};

/** me.features.live (roam_live.me). `now` is there too; the banner reads the calendar. */
export type LiveStamps = { stamps: number; cards_done: number; card_size: number };

export const DEFAULT_CARD_SIZE = 7;
/** How often the calendar is fetched again (LiveCalendarModel.run). */
export const CALENDAR_REFRESH_MS = 300_000;
/** The "starting soon" card shows for events under a day away. */
export const SOON_WINDOW_MS = 86_400_000;

function eventFrom(raw: unknown): LiveEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.key !== "string" || typeof r.starts_at !== "string" || typeof r.ends_at !== "string") return null;
  const multiplier = typeof r.multiplier === "number" && Number.isFinite(r.multiplier) ? r.multiplier : 1;
  return { key: r.key, title: typeof r.title === "string" && r.title ? r.title : r.key, multiplier, starts_at: r.starts_at, ends_at: r.ends_at };
}

/** The calendar as the server sent it, tolerating missing or malformed parts. */
export function parseCalendar(raw: unknown): LiveCalendar {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    region: typeof r.region === "string" ? r.region : "world",
    tz: typeof r.tz === "string" ? r.tz : null,
    server_now: typeof r.server_now === "string" ? r.server_now : null,
    now: eventFrom(r.now),
    next: Array.isArray(r.next) ? r.next.map(eventFrom).filter((e): e is LiveEvent => e !== null) : [],
  };
}

/** The stamp card from GET v1/roam/me. Null when the server said nothing about
 * it (the live feature is off there, or its hook failed): unknown, not zero. */
export function stampsFrom(me: RoamMe | null | undefined): LiveStamps | null {
  const live = me?.features?.live;
  if (!live || typeof live !== "object") return null;
  const l = live as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  return {
    stamps: num(l.stamps),
    cards_done: num(l.cards_done),
    card_size: Math.max(1, typeof l.card_size === "number" && l.card_size > 0 ? Math.floor(l.card_size) : DEFAULT_CARD_SIZE),
  };
}

/** The row of stamps: how many circles, how many filled. */
export function stampRow(s: LiveStamps): { size: number; have: number } {
  return { size: s.card_size, have: Math.min(s.stamps, s.card_size) };
}

// ---------- calls ----------

/** What is on around a place now and in the next 30 days. Public (a poster): unsigned, no key. */
export async function fetchLiveCalendar(client: GameClient, lat: number, lng: number): Promise<LiveCalendar> {
  const raw = await client.retrying(() => client.request<unknown>("GET", "v1/roam/live/calendar", { query: { lat, lng } }));
  return parseCalendar(raw);
}

// ---------- the calendar by the phone's clock ----------

export function eventStart(e: LiveEvent): number | null {
  return parseServerDate(e.starts_at);
}

export function eventEnd(e: LiveEvent): number | null {
  return parseServerDate(e.ends_at);
}

/** "2×", "1.5×": multipliers are whole numbers nearly always. */
export function times(multiplier: number): string {
  return `${Math.round(multiplier) === multiplier ? multiplier.toFixed(0) : String(multiplier)}×`;
}

export function isLive(e: LiveEvent, now: number): boolean {
  const start = eventStart(e);
  const end = eventEnd(e);
  return start !== null && end !== null && start <= now && now < end;
}

/** What is on at `now` by the phone's clock. The server's "now" is only as
 * fresh as the last fetch; an upcoming event that has started since then is
 * live too, so the banner flips on the minute without a refetch. */
export function liveAt(cal: LiveCalendar, now: number): LiveEvent | null {
  if (cal.now && isLive(cal.now, now)) return cal.now;
  return cal.next.find((e) => isLive(e, now)) ?? null;
}

export function upcomingAfter(cal: LiveCalendar, now: number): LiveEvent[] {
  return cal.next.filter((e) => (eventStart(e) ?? -Infinity) > now);
}

/** "1 min left", "45 min left", "2 h left", "1 h 5 min left". Minutes round up. */
export function timeLeft(end: number, now: number): string {
  const mins = Math.ceil((end - now) / 60000);
  if (mins <= 1) return "1 min left";
  if (mins < 60) return `${mins} min left`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h left` : `${h} h ${m} min left`;
}

export type LiveBannerState =
  | { kind: "live"; event: LiveEvent; end: number; left: string }
  | { kind: "soon"; event: LiveEvent; start: number }
  | null;

/** The map banner: what is on now, else the next event if it starts within a day. */
export function bannerAt(cal: LiveCalendar | null, now: number): LiveBannerState {
  if (!cal) return null;
  const live = liveAt(cal, now);
  const end = live ? eventEnd(live) : null;
  if (live && end !== null) return { kind: "live", event: live, end, left: timeLeft(end, now) };
  const soon = upcomingAfter(cal, now)[0];
  const start = soon ? eventStart(soon) : null;
  if (soon && start !== null && start - now < SOON_WINDOW_MS) return { kind: "soon", event: soon, start };
  return null;
}

// ---------- the phone's clock, for words ----------

/** The phone's time zone and 12/24-hour habit, injected so tests are fixed. */
export type LiveClock = {
  /** Minutes east of UTC at that instant (London summer: 60). */
  offsetMin: (ms: number) => number;
  hour12: boolean;
};

export function phoneClock(): LiveClock {
  let hour12 = true;
  try {
    const h = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12;
    if (typeof h === "boolean") hour12 = h;
  } catch {
    // No Intl: 12-hour, as most English phones.
  }
  return { offsetMin: (ms) => -new Date(ms).getTimezoneOffset(), hour12 };
}

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The instant as a Date whose UTC fields read as the phone's wall clock. */
function wall(ms: number, clock: LiveClock): Date {
  return new Date(ms + clock.offsetMin(ms) * 60000);
}

function localDay(ms: number, clock: LiveClock): number {
  return Math.floor(wall(ms, clock).getTime() / DAY_MS);
}

/** "6:00 PM" or "18:00", as the phone writes times. */
export function clockTime(ms: number, clock: LiveClock): string {
  const w = wall(ms, clock);
  const h = w.getUTCHours();
  const m = String(w.getUTCMinutes()).padStart(2, "0");
  if (!clock.hour12) return `${String(h).padStart(2, "0")}:${m}`;
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

/** "Wed 14 Oct · 6:00 PM–7:00 PM" (LiveDates.when). */
export function whenText(e: LiveEvent, clock: LiveClock): string {
  const start = eventStart(e);
  if (start === null) return "";
  const w = wall(start, clock);
  const day = `${WEEKDAYS[w.getUTCDay()]} ${w.getUTCDate()} ${MONTHS[w.getUTCMonth()]}`;
  const end = eventEnd(e);
  const from = clockTime(start, clock);
  return end === null ? `${day} · ${from}` : `${day} · ${from}–${clockTime(end, clock)}`;
}

/** "Today at 6:00 PM" / "Tomorrow at 6:00 PM": the soon card is under a day away. */
export function soonText(start: number, now: number, clock: LiveClock): string {
  const today = localDay(start, clock) === localDay(now, clock);
  return `${today ? "Today at " : "Tomorrow at "}${clockTime(start, clock)}`;
}

/** The next instant anything the banner or the calendar says could change:
 * an event starting or ending, the countdown's minute ticking over, an event
 * coming within a day, or midnight turning "Tomorrow" into "Today". The
 * screens wake then, so the banner flips on the minute by the phone's clock. */
export function nextChange(cal: LiveCalendar | null, now: number, clock: LiveClock): number | null {
  if (!cal) return null;
  let best = Infinity;
  const consider = (t: number | null) => {
    if (t !== null && t > now && t < best) best = t;
  };
  for (const e of cal.now ? [cal.now, ...cal.next] : cal.next) {
    const start = eventStart(e);
    consider(start);
    consider(eventEnd(e));
    consider(start === null ? null : start - SOON_WINDOW_MS);
  }
  const banner = bannerAt(cal, now);
  if (banner?.kind === "live") {
    const rem = (banner.end - now) % 60000;
    consider(now + (rem > 0 ? rem : 60000));
  } else if (banner?.kind === "soon") {
    const w = wall(now, clock).getTime();
    const midnight = (Math.floor(w / DAY_MS) + 1) * DAY_MS;
    consider(now + (midnight - w));
  }
  return best === Infinity ? null : best;
}

// ---------- the calendar's state ----------

export type LiveCalendarState = {
  calendar: LiveCalendar | null;
  /** Why the last fetch failed (the server's or the client's words); the last good calendar stays. */
  error: string | null;
  loading: boolean;
  /** When the calendar was last fetched (ms), 0 for never. */
  fetchedAt: number;
};

/** The calendar shared by the banner and the sheet (LiveCalendarModel). A
 * dropped request keeps the last good calendar: it should not hide a Quest
 * Hour that is still on. Snapshots are immutable (read with useSyncExternalStore). */
/** A move this far makes the calendar stale whatever its age. */
export const MOVED_FAR_M = 25_000;

export function createLiveCalendarStore(deps: { fetchCalendar: (lat: number, lng: number) => Promise<LiveCalendar>; now?: () => number }) {
  const now = deps.now ?? (() => Date.now());
  let state: LiveCalendarState = { calendar: null, error: null, loading: false, fetchedAt: 0 };
  let inFlight: Promise<void> | null = null;
  /** Where the calendar in hand was asked for: its region's clock. */
  let place: { lat: number; lng: number } | null = null;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<LiveCalendarState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };

  const store = {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Fetch now (one at a time). */
    load(lat: number, lng: number): Promise<void> {
      if (inFlight) return inFlight;
      set({ loading: true });
      inFlight = (async () => {
        try {
          const calendar = await deps.fetchCalendar(lat, lng);
          place = { lat, lng };
          set({ calendar, error: null, loading: false, fetchedAt: now() });
        } catch (error) {
          set({ error: error instanceof GameError ? error.message : "Check your connection.", loading: false });
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    },
    /** Fetch if never fetched, or the last good one is older than the refresh period. */
    refreshIfStale(lat: number, lng: number): Promise<void> {
      // Fresh, and still for this place. A phone's first fix can be a stale
      // last-known one far away; the calendar is per region, so a move of
      // more than a city's width asks again at once.
      const moved = place ? distanceM(place, { lat, lng }) > MOVED_FAR_M : true;
      if (state.calendar && !moved && now() - state.fetchedAt < CALENDAR_REFRESH_MS) return Promise.resolve();
      return store.load(lat, lng);
    },
  };
  return store;
}

export type LiveCalendarStore = ReturnType<typeof createLiveCalendarStore>;
