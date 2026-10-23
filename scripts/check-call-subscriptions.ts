// Quick check of the big-call subscription manager (components/calls/
// callSubscriptions.ts) against a fake room of 1,000+ people. No LiveKit
// server needed. Run:  npx tsx scripts/check-call-subscriptions.ts
import { RoomEvent, Track } from "livekit-client";

import {
  manageCallSubscriptions,
  setStageVisible,
  setVoicesMuted,
} from "../components/calls/callSubscriptions";

type Pub = { kind: string; calls: boolean[]; setSubscribed: (v: boolean) => void };
type Listener = (...args: unknown[]) => void;

function makePerson(index: number) {
  const pubs = new Map<string, Pub>();
  const make = (kind: string): Pub => {
    const pub: Pub = { kind, calls: [], setSubscribed: (v) => pub.calls.push(v) };
    return pub;
  };

  pubs.set("mic", make(Track.Kind.Audio));
  if (index % 5 === 0) pubs.set("camera", make(Track.Kind.Video)); // a fifth on camera

  return { identity: `u${index}`, trackPublications: pubs };
}

function makeRoom(size: number) {
  const listeners = new Map<string, Set<Listener>>();
  const room = {
    remoteParticipants: new Map<string, ReturnType<typeof makePerson>>(),
    on(event: string, fn: Listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
      return room;
    },
    off(event: string, fn: Listener) {
      listeners.get(event)?.delete(fn);
      return room;
    },
    emit(event: string, ...args: unknown[]) {
      listeners.get(event)?.forEach((fn) => fn(...args));
    },
  };

  for (let i = 0; i < size; i++) room.remoteParticipants.set(`u${i}`, makePerson(i));

  return room;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function count(room: ReturnType<typeof makeRoom>, kind: string, test: (calls: boolean[]) => boolean) {
  let n = 0;
  room.remoteParticipants.forEach((person) =>
    person.trackPublications.forEach((pub) => {
      if (pub.kind === kind && test(pub.calls)) n++;
    }),
  );
  return n;
}

const on = (calls: boolean[]) => calls.at(-1) === true;
let failures = 0;

function expect(label: string, actual: number, expected: number) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${actual} (expected ${expected})`);
}

(async () => {
  // 1. Small call, autoSubscribe on, no stage: the manager changes nothing.
  let room = makeRoom(6);
  let stop = manageCallSubscriptions(room as never, true);
  await wait(200);
  expect("small call, subscription calls made", count(room, Track.Kind.Audio, (c) => c.length > 0) + count(room, Track.Kind.Video, (c) => c.length > 0), 0);
  stop();

  // 2. Joining an already-big call (autoSubscribe off), stage not up yet.
  room = makeRoom(1000);
  stop = manageCallSubscriptions(room as never, false);
  await wait(200);
  expect("big join: microphones subscribed", count(room, Track.Kind.Audio, on), 1000);
  expect("big join: cameras subscribed before the stage reports", count(room, Track.Kind.Video, on), 0);

  // 3. Stage shows 4 people (3 of them have a camera on).
  setStageVisible(new Set(["u0", "u5", "u10", "u1"]));
  await wait(200);
  expect("stage: cameras subscribed", count(room, Track.Kind.Video, on), 3);
  expect("stage: microphones still subscribed", count(room, Track.Kind.Audio, on), 1000);

  // 4. 300 people join in a burst.
  for (let i = 1000; i < 1300; i++) {
    const person = makePerson(i);
    room.remoteParticipants.set(person.identity, person);
    room.emit(RoomEvent.ParticipantConnected, person);
  }
  await wait(200);
  expect("after burst: microphones subscribed", count(room, Track.Kind.Audio, on), 1300);
  expect("after burst: cameras subscribed", count(room, Track.Kind.Video, on), 3);
  expect("microphones touched more than once", count(room, Track.Kind.Audio, (c) => c.length > 1), 0);

  // 5. Back to the grid: every camera wanted again.
  setStageVisible(null);
  await wait(200);
  expect("grid again: cameras subscribed", count(room, Track.Kind.Video, on), 260);
  stop();

  // 6. Focus mode in a big call (autoSubscribe off): every microphone off,
  // including one that starts while focus is on; all back when it ends.
  room = makeRoom(20);
  stop = manageCallSubscriptions(room as never, false);
  await wait(200);
  setVoicesMuted(true);
  await wait(200);
  expect("focus on: microphones subscribed", count(room, Track.Kind.Audio, on), 0);
  const late = makePerson(20);
  room.remoteParticipants.set(late.identity, late);
  room.emit(RoomEvent.TrackPublished);
  await wait(200);
  expect("focus on, a new microphone: subscribed", count(room, Track.Kind.Audio, on), 0);
  setVoicesMuted(false);
  await wait(200);
  expect("focus off: microphones subscribed", count(room, Track.Kind.Audio, on), 21);
  stop();

  // 7. One pass over 5,000 people.
  room = makeRoom(5000);
  const started = Date.now();
  stop = manageCallSubscriptions(room as never, true);
  setStageVisible(new Set(["u0"]));
  await wait(130);
  console.log(`5,000-person pass finished within ${Date.now() - started} ms (includes the 120 ms batching delay)`);
  stop();
  setStageVisible(null);

  process.exitCode = failures ? 1 : 0;
})();
