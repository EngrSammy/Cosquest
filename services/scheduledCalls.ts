// ==========================================
// SCHEDULED CALLS (group Calls tab · Schedule a call · Call details)
// ==========================================
// MOCK: the backend has no scheduled-call routes yet. Every function already
// has the signature the real API needs, with the endpoint in its comment,
// so wiring the backend only changes the function bodies (see the spec at
// the bottom). Calls live in memory and reset when the app reloads.
//
// Times: a call stores ONE moment, `startsAt` (UTC ISO string), plus
// `durationMin`. The end time, "Tomorrow", upcoming/past and the reminder
// are all worked out from those two, in each person's own time zone.
import type { GroupPerson } from "./groups";
import { getWebBaseUrl } from "@/utils/shareLinks";
import { apiRequest } from "./api";

export type CallRepeat = "none" | "daily" | "weekly" | "monthly";

// Who can join: only the people invited, or anyone in the group.
export type CallAudience = "invited" | "members";

export type RsvpStatus = "accepted" | "pending" | "declined";

export type ScheduledCallParticipant = GroupPerson & { status: RsvpStatus };

export type ScheduledCall = {
  id: string;
  conversationId: string;
  topic: string;
  description: string;
  // The Spark the call is about (optional), e.g. "Next CosQuest".
  spark: { id: string; subject: string } | null;
  startsAt: string;
  durationMin: number;
  // The host's time zone when they scheduled it (shown on the details page).
  timeZone: string;
  repeat: CallRepeat;
  host: GroupPerson;
  participants: ScheduledCallParticipant[];
  hostVideo: boolean;
  participantVideo: boolean;
  whoCanJoin: CallAudience;
  waitingRoom: boolean;
  meetingCode: string;
  passcode: string;
  inviteUrl: string;
  status: "scheduled" | "cancelled";
  createdAt: string;
  // From the server (not in the mock): when it ends, upcoming / ongoing /
  // past / cancelled, and what this viewer may do.
  endsAt?: string;
  timing?: "upcoming" | "ongoing" | "past" | "cancelled";
  canManage?: boolean;
  canJoin?: boolean;
};

// What the Schedule a call form sends.
export type ScheduledCallInput = {
  topic: string;
  description: string;
  spark: { id: string; subject: string } | null;
  startsAt: string;
  durationMin: number;
  timeZone: string;
  repeat: CallRepeat;
  // The real API only needs the ids; the mock keeps the names to show them.
  participants: GroupPerson[];
  hostVideo: boolean;
  participantVideo: boolean;
  whoCanJoin: CallAudience;
  waitingRoom: boolean;
};

// ---------------------------------------------------------------------
// Mock store
// ---------------------------------------------------------------------

const calls: ScheduledCall[] = [];
const seeded = new Set<string>();

const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

const digits = (count: number) =>
  Array.from({ length: count }, () => Math.floor(Math.random() * 10)).join("");

function makeId() {
  return `sc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function inviteUrlFor(id: string) {
  const base = getWebBaseUrl();
  return base ? `${base}/call/scheduled/${id}` : `cosquest://call/scheduled/${id}`;
}

// Today + `days`, at hh:mm local time.
function at(days: number, hours: number, minutes = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

const MOCK_PEOPLE: GroupPerson[] = [
  { id: "mock_maya", username: "maya", name: "Maya Chen" },
  { id: "mock_diego", username: "diego", name: "Diego Ruiz" },
  { id: "mock_leo", username: "leo", name: "Leo Park" },
];

// A few calls per chat the first time it's opened, like the Figma.
function seed(conversationId: string) {
  if (seeded.has(conversationId)) return;
  seeded.add(conversationId);

  const [maya, diego, leo] = MOCK_PEOPLE;
  const base = {
    conversationId,
    description: "",
    spark: null,
    timeZone: deviceTimeZone(),
    repeat: "none" as CallRepeat,
    hostVideo: true,
    participantVideo: false,
    whoCanJoin: "invited" as CallAudience,
    waitingRoom: true,
    status: "scheduled" as const,
    createdAt: new Date().toISOString(),
  };

  const rows: Omit<ScheduledCall, "id" | "meetingCode" | "passcode" | "inviteUrl">[] = [
    {
      ...base,
      topic: "CosQuest planning call",
      description:
        "Let's confirm the route, costumes and Saturday's meetup at Chicano Park.",
      spark: { id: "mock_spark", subject: "Next CosQuest" },
      startsAt: at(1, 18),
      durationMin: 30,
      host: maya,
      participants: [
        { ...diego, status: "accepted" },
        { ...leo, status: "pending" },
      ],
    },
    {
      ...base,
      topic: "Mural walk debrief",
      spark: { id: "mock_spark", subject: "Next CosQuest" },
      startsAt: at(4, 19),
      durationMin: 45,
      host: maya,
      participants: [{ ...diego, status: "accepted" }],
    },
    {
      ...base,
      topic: "Community check-in",
      startsAt: at(6, 18, 30),
      durationMin: 30,
      repeat: "weekly",
      host: diego,
      participants: [
        { ...maya, status: "accepted" },
        { ...leo, status: "accepted" },
      ],
    },
    {
      ...base,
      topic: "Costume swap",
      startsAt: at(-3, 17),
      durationMin: 60,
      host: leo,
      participants: [{ ...maya, status: "accepted" }],
    },
  ];

  rows.forEach((row) => {
    const id = makeId();
    calls.push({
      ...row,
      id,
      meetingCode: `${digits(3)} ${digits(3)} ${digits(3)}`,
      passcode: digits(6),
      inviteUrl: inviteUrlFor(id),
    });
  });
}

function copy(call: ScheduledCall): ScheduledCall {
  return { ...call, participants: call.participants.map((p) => ({ ...p })) };
}

function find(callId: string) {
  const call = calls.find((item) => item.id === callId);
  if (!call) throw new Error("This call no longer exists.");
  return call;
}

/* =========================================================
   LIST A CHAT'S CALLS (upcoming and past)
   GET /api/chats/:conversationId/scheduled-calls
========================================================= */

async function mockListScheduledCalls(
  conversationId: string,
  _token: string,
): Promise<ScheduledCall[]> {
  await wait();
  seed(conversationId);
  return calls
    .filter((call) => call.conversationId === conversationId)
    .map(copy);
}

/* =========================================================
   GET ONE CALL
   GET /api/scheduled-calls/:callId
========================================================= */

async function mockGetScheduledCall(
  callId: string,
  _token: string,
): Promise<ScheduledCall> {
  await wait();
  return copy(find(callId));
}

/* =========================================================
   SCHEDULE A CALL
   POST /api/chats/:conversationId/scheduled-calls
   (the real API takes the host from the token, so `host` is mock-only)
========================================================= */

async function mockCreateScheduledCall(
  conversationId: string,
  input: ScheduledCallInput,
  host: GroupPerson,
  _token: string,
): Promise<ScheduledCall> {
  await wait(400);
  const id = makeId();
  const call: ScheduledCall = {
    ...input,
    id,
    conversationId,
    host,
    participants: input.participants
      .filter((person) => person.id !== host.id)
      .map((person) => ({ ...person, status: "pending" as const })),
    meetingCode: `${digits(3)} ${digits(3)} ${digits(3)}`,
    passcode: digits(6),
    inviteUrl: inviteUrlFor(id),
    status: "scheduled",
    createdAt: new Date().toISOString(),
  };
  calls.push(call);
  return copy(call);
}

/* =========================================================
   CANCEL (host only)
   POST /api/scheduled-calls/:callId/cancel
========================================================= */

async function mockCancelScheduledCall(
  callId: string,
  _token: string,
): Promise<ScheduledCall> {
  await wait();
  const call = find(callId);
  call.status = "cancelled";
  return copy(call);
}

/* =========================================================
   ACCEPT / DECLINE AN INVITATION
   POST /api/scheduled-calls/:callId/rsvp   { status }
   (the real API takes the person from the token)
========================================================= */

async function mockRespondToScheduledCall(
  callId: string,
  status: Exclude<RsvpStatus, "pending">,
  me: GroupPerson,
  _token: string,
): Promise<ScheduledCall> {
  await wait();
  const call = find(callId);
  const existing = call.participants.find((person) => person.id === me.id);
  if (existing) {
    existing.status = status;
  } else {
    call.participants.push({ ...me, status });
  }
  return copy(call);
}

// =========================================================
// REAL API (Emmanuel's backend, commit 681cac7)
// =========================================================
// Same functions as the mock above, on the real routes. Until they're
// deployed the server answers "Route not found": from then on this session
// uses the mock, so the Calls tab keeps working either way.
let mockOnly = false;

export function usingScheduledCallsMock() {
  return mockOnly;
}

export function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) return String((error as any).message || "");
  return "";
}

async function withFallback<T>(real: () => Promise<T>, mock: () => Promise<T>): Promise<T> {
  if (mockOnly) return mock();
  try {
    return await real();
  } catch (error) {
    if (/^Route not found/i.test(messageOf(error))) {
      mockOnly = true;
      return mock();
    }
    throw error;
  }
}

// The server's call JSON -> ScheduledCall (it also keeps older field names:
// durationMinutes, participants[].response, cancelledAt).
export function normalizeScheduledCall(raw: any): ScheduledCall {
  const person = (p: any) => ({
    id: String(p?.id ?? p?.userId ?? ""),
    username: p?.username ?? "",
    name: p?.name ?? null,
    avatarKey: p?.avatarKey ?? null,
    avatarPhotoUrl: p?.avatarPhotoUrl ?? null,
  });
  return {
    ...raw,
    id: String(raw?.id ?? ""),
    conversationId: String(raw?.conversationId ?? ""),
    topic: raw?.topic ?? "",
    description: raw?.description ?? "",
    spark: raw?.spark?.id ? { id: String(raw.spark.id), subject: raw.spark.subject ?? "" } : null,
    durationMin: Number(raw?.durationMin ?? raw?.durationMinutes ?? 30),
    host: person(raw?.host),
    participants: (raw?.participants || []).map((p: any) => ({
      ...person(p),
      status: (p?.status || p?.response || "pending") as RsvpStatus,
    })),
    meetingCode: raw?.meetingCode ?? "",
    passcode: raw?.passcode ?? "",
    inviteUrl: raw?.inviteUrl ?? "",
    status: raw?.status === "cancelled" || raw?.cancelledAt ? "cancelled" : "scheduled",
    createdAt: raw?.createdAt ?? "",
  } as ScheduledCall;
}

// GET /api/chats/:conversationId/scheduled-calls -> { calls }
export async function listScheduledCalls(conversationId: string, token: string): Promise<ScheduledCall[]> {
  return withFallback(
    async () => {
      const r = await apiRequest<any>(`/api/chats/${encodeURIComponent(conversationId)}/scheduled-calls`, { token });
      return (r?.calls || []).map(normalizeScheduledCall);
    },
    () => mockListScheduledCalls(conversationId, token),
  );
}

// GET /api/scheduled-calls/:callId -> { call, people }
export async function getScheduledCall(callId: string, token: string): Promise<ScheduledCall> {
  return withFallback(
    async () => normalizeScheduledCall((await apiRequest<any>(`/api/scheduled-calls/${encodeURIComponent(callId)}`, { token }))?.call),
    () => mockGetScheduledCall(callId, token),
  );
}

// POST /api/chats/:conversationId/scheduled-calls -> 201 { call, occurrences }
// (the host comes from the token; `host` is only for the mock)
export async function createScheduledCall(
  conversationId: string,
  input: ScheduledCallInput,
  host: GroupPerson,
  token: string,
): Promise<ScheduledCall> {
  return withFallback(
    async () => {
      const { participants, ...rest } = input;
      const r = await apiRequest<any>(`/api/chats/${encodeURIComponent(conversationId)}/scheduled-calls`, {
        method: "POST",
        token,
        body: { ...rest, participantIds: participants.map((person) => person.id).filter(Boolean) },
      });
      return normalizeScheduledCall(r?.call);
    },
    () => mockCreateScheduledCall(conversationId, input, host, token),
  );
}

// POST /api/scheduled-calls/:callId/cancel (host only) -> { call }
export async function cancelScheduledCall(callId: string, token: string): Promise<ScheduledCall> {
  return withFallback(
    async () =>
      normalizeScheduledCall(
        (await apiRequest<any>(`/api/scheduled-calls/${encodeURIComponent(callId)}/cancel`, { method: "POST", token }))?.call,
      ),
    () => mockCancelScheduledCall(callId, token),
  );
}

// POST /api/scheduled-calls/:callId/rsvp { status } -> { call }
// (the person comes from the token; `me` is only for the mock)
export async function respondToScheduledCall(
  callId: string,
  status: Exclude<RsvpStatus, "pending">,
  me: GroupPerson,
  token: string,
): Promise<ScheduledCall> {
  return withFallback(
    async () =>
      normalizeScheduledCall(
        (await apiRequest<any>(`/api/scheduled-calls/${encodeURIComponent(callId)}/rsvp`, { method: "POST", token, body: { status } }))?.call,
      ),
    () => mockRespondToScheduledCall(callId, status, me, token),
  );
}

// ---------------------------------------------------------------------
// Time helpers (used by the Calls tab, the form and the details page)
// ---------------------------------------------------------------------

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Local time";
  } catch {
    return "Local time";
  }
}

// "Africa/Lagos (UTC+01:00)"
export function timeZoneLabel(timeZone = deviceTimeZone(), date = new Date()) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "−";
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${timeZone.replace(/_/g, " ")} (UTC${sign}${hh}:${mm})`;
}

export function callEnd(call: Pick<ScheduledCall, "startsAt" | "durationMin">) {
  return new Date(new Date(call.startsAt).getTime() + call.durationMin * 60_000);
}

// Upcoming until it ends; cancelled calls count as past.
export function isPastCall(call: ScheduledCall, now = new Date()) {
  return call.status === "cancelled" || callEnd(call) <= now;
}

export function isLiveCall(call: ScheduledCall, now = new Date()) {
  return (
    call.status === "scheduled" &&
    new Date(call.startsAt) <= now &&
    callEnd(call) > now
  );
}

// "6:00 PM"
export function formatClock(date: Date) {
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours % 12 || 12}:${minutes} ${hours < 12 ? "AM" : "PM"}`;
}

// "6:00–6:30 PM" (one AM/PM when both match)
export function formatTimeRange(call: Pick<ScheduledCall, "startsAt" | "durationMin">) {
  const start = formatClock(new Date(call.startsAt));
  const end = formatClock(callEnd(call));
  const [startTime, startHalf] = start.split(" ");
  const [, endHalf] = end.split(" ");
  return startHalf === endHalf ? `${startTime}–${end}` : `${start}–${end}`;
}

// "Friday, October 9, 2026"
export function formatLongDate(date: Date) {
  const month = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ][date.getMonth()];
  return `${WEEKDAYS[date.getDay()]}, ${month} ${date.getDate()}, ${date.getFullYear()}`;
}

// "Friday, Oct 9"
export function formatShortDate(date: Date) {
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

// "MON" / "12" for the date tile
export function dateTile(date: Date) {
  return { weekday: WEEKDAYS[date.getDay()].slice(0, 3).toUpperCase(), day: String(date.getDate()) };
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourText = `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return rest ? `${hourText} ${rest} min` : hourText;
}

export const REPEAT_LABELS: Record<CallRepeat, string> = {
  none: "Does not repeat",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

function startOfDay(date: Date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

// Whole days from today: 0 today, 1 tomorrow, -1 yesterday.
export function daysFromToday(date: Date, now = new Date()) {
  return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
}

// "Today · Friday, Oct 9", "Tomorrow · …", "This week", "Next week", "Later"
export function sectionTitle(date: Date, now = new Date()) {
  const days = daysFromToday(date, now);
  if (days === 0) return `Today · ${formatShortDate(date)}`;
  if (days === 1) return `Tomorrow · ${formatShortDate(date)}`;

  // Weeks start on Monday.
  const weekStart = startOfDay(now);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weeksAhead = Math.floor((startOfDay(date).getTime() - weekStart.getTime()) / (7 * 86_400_000));

  if (weeksAhead === 0) return "This week";
  if (weeksAhead === 1) return "Next week";
  return "Later";
}

// =========================================================
// API SPEC for the backend (Dammy)
// =========================================================
// ScheduledCall JSON = the ScheduledCall type above.
//
// GET  /api/chats/:conversationId/scheduled-calls
//        -> { calls: ScheduledCall[] }   upcoming + past (or ?when=upcoming|past)
// POST /api/chats/:conversationId/scheduled-calls
//        body: ScheduledCallInput with participantIds: string[] instead of participants
//        -> { call }   host = the signed-in user; sends each participant an
//                       invitation (notification + chat message)
// GET  /api/scheduled-calls/:callId                    -> { call }
// PATCH /api/scheduled-calls/:callId                   (host) partial input -> { call }
// POST /api/scheduled-calls/:callId/cancel             (host) -> { call }, notifies participants
// POST /api/scheduled-calls/:callId/rsvp  { status: "accepted" | "declined" } -> { call }
// At startsAt: the call becomes joinable through the existing voice room /
// call flow, honouring hostVideo, participantVideo, whoCanJoin, waitingRoom.
