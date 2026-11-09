// ==========================================
// DEV ONLY: a fake LiveKit room with hundreds of people
// ==========================================
// Used by app/dev/big-call.tsx (only reachable in development builds) to
// show and test the big-call stage without a real LiveKit room. It fakes
// just the parts of livekit-client's Room that the stage reads: the
// participant map, the local participant, and the room/participant events.
//
// Cameras: a few fake people have their camera "on". Like the real
// subscription manager, a fake camera only "arrives" while that person is
// on screen (callSubscriptions' visible set), so the dev screen also shows
// how many cameras are being received.
import type { Room } from "livekit-client";
import { ParticipantEvent, RoomEvent, Track } from "livekit-client";

import { AVATARS } from "@/constants/avatars";
import type { Call, CallMember } from "@/services/calls";

import { getStageVisible } from "./callSubscriptions";

type Listener = (...args: any[]) => void;

class Emitter {
  private listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return this;
  }

  off(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, ...args: unknown[]) {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }
}

const FIRST = [
  "Ada", "Bola", "Chidi", "Dami", "Efe", "Funke", "Gbenga", "Halima", "Ife",
  "Jide", "Kemi", "Lola", "Musa", "Ngozi", "Obi", "Pelumi", "Rotimi", "Sade",
  "Tunde", "Uche", "Vera", "Wale", "Yemi", "Zara", "Mark", "Sam", "Priya",
  "Liam", "Emma", "Noah", "Olivia", "Aisha", "Hannah", "Tom", "Grace",
];
const LAST = [
  "Adeyemi", "Okafor", "Bello", "Smith", "Jones", "Brown", "Ibrahim", "Taylor",
  "Okoro", "Williams", "Clarke", "Hughes", "Evans", "Nwosu", "Patel", "Khan",
];

class FakeParticipant extends Emitter {
  isSpeaking = false;
  isMicrophoneEnabled: boolean;
  isCameraEnabled: boolean;
  receivingCamera = false;

  constructor(
    public identity: string,
    public name: string,
    public isLocal: boolean,
    micOn: boolean,
    cameraOn: boolean,
  ) {
    super();
    this.isMicrophoneEnabled = micOn;
    this.isCameraEnabled = cameraOn;
  }

  getTrackPublication(source: Track.Source) {
    if (source !== Track.Source.Camera || !this.isCameraEnabled) {
      return undefined;
    }

    const receiving = this.isLocal || this.receivingCamera;

    return {
      trackSid: `${this.identity}-cam`,
      isMuted: false,
      track: receiving ? { fake: true } : undefined,
    };
  }
}

export type MockBigCall = {
  room: Room;
  call: Call;
  // Cameras currently "received" (on screen and camera on).
  receivingCount: () => number;
  // Starts the fake activity; returns the stop function.
  start: () => () => void;
};

export function createMockBigCall(count: number): MockBigCall {
  const room = new Emitter() as Emitter & {
    remoteParticipants: Map<string, FakeParticipant>;
    localParticipant: FakeParticipant;
  };

  const members: CallMember[] = [];
  let made = 0;

  const makePerson = () => {
    made += 1;
    const identity = `user-${made}`;
    const name = `${FIRST[made % FIRST.length]} ${LAST[Math.floor(made / FIRST.length) % LAST.length]}`;
    const avatarKey = AVATARS[made % Math.min(25, AVATARS.length)]?.id;

    members.push({
      user: { id: identity, name, username: name.toLowerCase().replace(" ", "."), avatarKey },
      status: "joined",
      invitedBy: null,
    });

    return new FakeParticipant(
      identity,
      name,
      false,
      made % 3 !== 0, // a third muted
      made % 5 === 0, // a fifth with camera on
    );
  };

  room.localParticipant = new FakeParticipant("me", "You", true, true, false);
  members.push({
    user: { id: "me", name: "You", avatarKey: AVATARS[0]?.id },
    status: "joined",
    invitedBy: null,
  });

  room.remoteParticipants = new Map();

  for (let i = 0; i < count - 1; i += 1) {
    const person = makePerson();
    room.remoteParticipants.set(person.identity, person);
  }

  const call: Call = {
    id: "dev-big-call",
    conversationId: "dev",
    type: "video",
    status: "accepted",
    caller: members[1].user,
    isGroup: true,
    members,
    maxParticipants: 1000,
    maxInvitesPerRequest: 50,
  };

  // A pool of regular talkers, so the stage behaves like a real meeting.
  const ids = Array.from(room.remoteParticipants.keys());
  const talkers = [
    ...ids.filter((_, index) => index % 23 === 0).slice(0, 7),
    // ...and a few of them with their camera on.
    ...ids.filter((_, index) => (index + 1) % 5 === 0).slice(0, 5),
  ];

  // People who talk have their mic on.
  talkers.forEach((id) => {
    const person = room.remoteParticipants.get(id);
    if (person) person.isMicrophoneEnabled = true;
  });
  let speaking: FakeParticipant[] = [];

  const tickSpeakers = () => {
    speaking.forEach((person) => {
      person.isSpeaking = false;
      person.emit(ParticipantEvent.IsSpeakingChanged, false);
    });

    const howMany = 1 + Math.floor(Math.random() * 2);
    speaking = [];

    for (let i = 0; i < howMany; i += 1) {
      const pool = Math.random() < 0.85 ? talkers : ids;
      const person = room.remoteParticipants.get(
        pool[Math.floor(Math.random() * pool.length)],
      );

      if (person && !speaking.includes(person)) {
        person.isSpeaking = true;
        person.emit(ParticipantEvent.IsSpeakingChanged, true);
        speaking.push(person);
      }
    }

    room.emit(RoomEvent.ActiveSpeakersChanged, speaking);
  };

  // Like the real manager: only on-screen cameras arrive.
  const syncCameras = () => {
    const visible = getStageVisible();

    room.remoteParticipants.forEach((person) => {
      if (!person.isCameraEnabled) return;

      const want = !!visible?.has(person.identity);

      if (want !== person.receivingCamera) {
        person.receivingCamera = want;
        person.emit(
          want
            ? ParticipantEvent.TrackSubscribed
            : ParticipantEvent.TrackUnsubscribed,
        );
      }
    });
  };

  // Someone joins every few seconds (the count ticks up).
  const join = () => {
    const person = makePerson();
    room.remoteParticipants.set(person.identity, person);
    ids.push(person.identity);
    room.emit(RoomEvent.ParticipantConnected, person);
  };

  return {
    room: room as unknown as Room,
    call,
    receivingCount: () => {
      let receiving = 0;
      room.remoteParticipants.forEach((person) => {
        if (person.receivingCamera) receiving += 1;
      });
      return receiving;
    },
    start: () => {
      const timers = [
        setInterval(tickSpeakers, 1300),
        setInterval(syncCameras, 150),
        setInterval(join, 4000),
      ];

      return () => timers.forEach(clearInterval);
    },
  };
}
