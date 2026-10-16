// ==========================================
// BIG CALLS: who is on the stage, and the participant list
// ==========================================
// Plain livekit-client Room events, so the same code runs on phones
// (@livekit/react-native wraps livekit-client) and on the website.
//
// Everything here is built for rooms with hundreds of people:
//   - room events update refs; React state is only touched by a throttled
//     "commit", so a burst of joins or speaker changes is one re-render;
//   - each pass is O(people) at most, never O(people²);
//   - the full participant list is only built while the list is open.
import type { Participant, Room, TrackPublication } from "livekit-client";
import { ParticipantEvent, RoomEvent, Track } from "livekit-client";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Call, CallPerson } from "@/services/calls";

import { STAGE_ENTER_ABOVE, STAGE_EXIT_AT_OR_BELOW } from "./callSubscriptions";

// Re-exported for the stage files.
export { formatCount } from "@/services/calls";

// ==========================================
// GRID OR STAGE?
// ==========================================

// Stage above 8 people; back to the grid only at 6 or fewer.
export function useStageMode(peopleInRoom: number) {
  const [stage, setStage] = useState(peopleInRoom > STAGE_ENTER_ABOVE);

  // Adjusting state while rendering (React's "derived state" pattern):
  // no extra effect pass, no flash of the wrong layout.
  if (!stage && peopleInRoom > STAGE_ENTER_ABOVE) {
    setStage(true);
  } else if (stage && peopleInRoom <= STAGE_EXIT_AT_OR_BELOW) {
    setStage(false);
  }

  return stage;
}

// ==========================================
// PEOPLE: user id → name + avatar, built once per call update
// ==========================================

export function usePeopleById(call: Call) {
  return useMemo(() => {
    const map = new Map<string, CallPerson>();
    call.members.forEach((member) => map.set(member.user.id, member.user));
    return map;
  }, [call.members]);
}

export function personFor(
  people: Map<string, CallPerson>,
  participant: Pick<Participant, "identity" | "name">,
): CallPerson {
  return (
    people.get(participant.identity) || {
      id: participant.identity,
      name: participant.name || null,
    }
  );
}

// ==========================================
// THROTTLE (leading + trailing)
// ==========================================

function createThrottle(run: () => void, intervalMs: number) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const fire = () => {
    timer = null;
    last = Date.now();
    run();
  };

  return {
    schedule() {
      if (timer !== null) return;

      const wait = Math.max(0, intervalMs - (Date.now() - last));
      timer = setTimeout(fire, wait);
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}

// ==========================================
// THE STAGE
// ==========================================

// Stage updates at most this often (speaker changes can arrive several
// times a second in a big room).
const STAGE_COMMIT_MS = 400;

// How many past speakers we remember for the strip.
const RECENT_MEMORY = 24;

export type StageState = {
  // Everyone in the room, including you.
  count: number;
  // Identities on the main area: pinned first, then the people talking.
  main: string[];
  // The next few recent speakers.
  strip: string[];
};

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export function useStage(
  room: Room,
  {
    pinnedId,
    mainMax,
    stripMax,
  }: { pinnedId: string | null; mainMax: number; stripMax: number },
): StageState {
  const [state, setState] = useState<StageState>(() => ({
    count: room.remoteParticipants.size + 1,
    main: [],
    strip: [],
  }));

  // Mutable working state: changed by room events, read by commit().
  const work = useRef({
    recent: [] as string[], // most recent speaker first
    speakingNow: new Set<string>(),
    lastSpoke: new Map<string, number>(),
    main: [] as string[], // sticky slots (without the pinned person)
  });

  const settings = useRef({ pinnedId, mainMax, stripMax });

  const throttleRef = useRef<ReturnType<typeof createThrottle> | null>(null);

  useEffect(() => {
    const w = work.current;

    const commit = () => {
      const remotes = room.remoteParticipants;
      const { pinnedId: pinned, mainMax: max, stripMax: stripCount } =
        settings.current;

      const pinnedHere = !!pinned && remotes.has(pinned);
      const capacity = Math.max(0, max - (pinnedHere ? 1 : 0));

      // People who left drop out of everything.
      w.recent = w.recent.filter((id) => remotes.has(id));
      let slots = w.main.filter((id) => remotes.has(id) && id !== pinned);
      const inSlots = new Set(slots);

      // 1. Whoever is talking gets a main tile. Slots are "sticky": a new
      //    speaker replaces the quiet tile that spoke longest ago, so the
      //    others don't jump around.
      for (const id of w.recent) {
        if (!w.speakingNow.has(id) || inSlots.has(id) || id === pinned) {
          continue;
        }

        if (slots.length < capacity) {
          slots.push(id);
          inSlots.add(id);
          continue;
        }

        let replace = -1;
        let oldest = Infinity;

        slots.forEach((slotId, index) => {
          if (w.speakingNow.has(slotId)) return;
          const spokeAt = w.lastSpoke.get(slotId) ?? 0;
          if (spokeAt < oldest) {
            oldest = spokeAt;
            replace = index;
          }
        });

        if (replace >= 0) {
          inSlots.delete(slots[replace]);
          slots[replace] = id;
          inSlots.add(id);
        }
      }

      // 2. Empty slots: recent speakers, then cameras that are on, then
      //    anyone (so the stage is never empty at the start of a call).
      const fill = (id: string) => {
        if (slots.length < capacity && !inSlots.has(id) && id !== pinned) {
          slots.push(id);
          inSlots.add(id);
        }
      };

      w.recent.forEach(fill);

      if (slots.length < capacity) {
        for (const participant of remotes.values()) {
          if (slots.length >= capacity) break;
          if (participant.isCameraEnabled) fill(participant.identity);
        }
      }

      if (slots.length < capacity) {
        for (const id of remotes.keys()) {
          if (slots.length >= capacity) break;
          fill(id);
        }
      }

      slots = slots.slice(0, capacity);
      w.main = slots;

      const main = pinnedHere ? [pinned!, ...slots] : slots;
      const onMain = new Set(main);

      // 3. The strip: the next recent speakers, topped up with anyone.
      const strip: string[] = [];

      for (const id of w.recent) {
        if (strip.length >= stripCount) break;
        if (!onMain.has(id)) strip.push(id);
      }

      if (strip.length < stripCount) {
        const inStrip = new Set(strip);

        for (const id of remotes.keys()) {
          if (strip.length >= stripCount) break;
          if (!onMain.has(id) && !inStrip.has(id)) strip.push(id);
        }
      }

      const count = remotes.size + 1;

      setState((previous) =>
        previous.count === count &&
        sameList(previous.main, main) &&
        sameList(previous.strip, strip)
          ? previous
          : { count, main, strip },
      );
    };

    const throttle = createThrottle(commit, STAGE_COMMIT_MS);
    throttleRef.current = throttle;

    const onSpeakers = (speakers: Participant[]) => {
      const now = Date.now();
      w.speakingNow = new Set();

      // Loudest last, so the loudest ends up first in "recent".
      for (let i = speakers.length - 1; i >= 0; i -= 1) {
        const speaker = speakers[i];
        if (speaker.isLocal) continue;

        w.speakingNow.add(speaker.identity);
        w.lastSpoke.set(speaker.identity, now);

        const at = w.recent.indexOf(speaker.identity);
        if (at >= 0) w.recent.splice(at, 1);
        w.recent.unshift(speaker.identity);
      }

      if (w.recent.length > RECENT_MEMORY) {
        w.recent.length = RECENT_MEMORY;
      }

      throttle.schedule();
    };

    const onLeft = (participant: Participant) => {
      w.lastSpoke.delete(participant.identity);
      w.speakingNow.delete(participant.identity);
      throttle.schedule();
    };

    room
      .on(RoomEvent.ActiveSpeakersChanged, onSpeakers)
      .on(RoomEvent.ParticipantConnected, throttle.schedule)
      .on(RoomEvent.ParticipantDisconnected, onLeft)
      .on(RoomEvent.Connected, throttle.schedule);

    throttle.schedule();

    return () => {
      throttle.cancel();
      throttleRef.current = null;
      room
        .off(RoomEvent.ActiveSpeakersChanged, onSpeakers)
        .off(RoomEvent.ParticipantConnected, throttle.schedule)
        .off(RoomEvent.ParticipantDisconnected, onLeft)
        .off(RoomEvent.Connected, throttle.schedule);
    };
  }, [room]);

  // Pinning or a different screen size: rebuild straight away.
  useEffect(() => {
    settings.current = { pinnedId, mainMax, stripMax };
    throttleRef.current?.schedule();
  }, [pinnedId, mainMax, stripMax]);

  return state;
}

// ==========================================
// ONE PERSON'S LIVE STATE (for a tile)
// ==========================================
// Each tile listens to its own participant only, so one person muting
// re-renders one tile, not the whole stage.
//
// The values are copied into state inside the event handler (a snapshot)
// rather than read off the participant while rendering: the participant
// object is mutated in place by LiveKit, and the React Compiler (on in
// this app) would otherwise keep showing memoised, stale values.

const PARTICIPANT_EVENTS = [
  ParticipantEvent.IsSpeakingChanged,
  ParticipantEvent.TrackMuted,
  ParticipantEvent.TrackUnmuted,
  ParticipantEvent.TrackSubscribed,
  ParticipantEvent.TrackUnsubscribed,
  ParticipantEvent.TrackPublished,
  ParticipantEvent.TrackUnpublished,
  ParticipantEvent.LocalTrackPublished,
  ParticipantEvent.LocalTrackUnpublished,
  ParticipantEvent.ParticipantNameChanged,
] as const;

type LiveState = {
  speaking: boolean;
  micOff: boolean;
  // Only a camera that is on AND actually being received.
  camera: TrackPublication | undefined;
  cameraTrack: unknown;
};

function liveSnapshot(participant: Participant): LiveState {
  const camera = participant.getTrackPublication(Track.Source.Camera);
  const receiving = camera && camera.track && !camera.isMuted;

  return {
    speaking: participant.isSpeaking,
    micOff: !participant.isMicrophoneEnabled,
    camera: receiving ? camera : undefined,
    cameraTrack: receiving ? camera.track : undefined,
  };
}

function sameLive(a: LiveState, b: LiveState) {
  return (
    a.speaking === b.speaking &&
    a.micOff === b.micOff &&
    a.camera === b.camera &&
    a.cameraTrack === b.cameraTrack
  );
}

export function useParticipantLive(participant: Participant) {
  const [live, setLive] = useState(() => liveSnapshot(participant));

  useEffect(() => {
    const update = () => {
      const next = liveSnapshot(participant);
      setLive((previous) => (sameLive(previous, next) ? previous : next));
    };

    PARTICIPANT_EVENTS.forEach((event) => participant.on(event, update));

    // Catch anything that changed between the first render and now.
    const catchUp = setTimeout(update, 0);

    return () => {
      clearTimeout(catchUp);
      PARTICIPANT_EVENTS.forEach((event) => participant.off(event, update));
    };
  }, [participant]);

  return live;
}

// ==========================================
// THE PARTICIPANT LIST (only while it's open)
// ==========================================

export type RosterEntry = {
  identity: string;
  name: string;
  isLocal: boolean;
  micOn: boolean;
  speaking: boolean;
};

const ROSTER_COMMIT_MS = 500;

const ROSTER_EVENTS = [
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.TrackPublished,
  RoomEvent.TrackUnpublished,
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
  RoomEvent.ActiveSpeakersChanged,
  RoomEvent.ParticipantNameChanged,
] as const;

export function useRoster(
  room: Room,
  enabled: boolean,
  people: Map<string, CallPerson>,
) {
  const [roster, setRoster] = useState<RosterEntry[]>([]);

  const peopleRef = useRef(people);

  useEffect(() => {
    peopleRef.current = people;
  }, [people]);

  useEffect(() => {
    if (!enabled) return;

    const nameOf = (participant: Participant) => {
      const person = peopleRef.current.get(participant.identity);
      return (
        person?.name ||
        person?.username ||
        participant.name ||
        "Someone"
      );
    };

    const build = () => {
      const entries: RosterEntry[] = [];

      room.remoteParticipants.forEach((participant) => {
        entries.push({
          identity: participant.identity,
          name: nameOf(participant),
          isLocal: false,
          micOn: participant.isMicrophoneEnabled,
          speaking: participant.isSpeaking,
        });
      });

      // Speaking first, then A→Z. Keys are computed once per entry.
      const keyed = entries.map((entry) => ({
        entry,
        key: `${entry.speaking ? 0 : 1}${entry.name.toLowerCase()}`,
      }));
      keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

      const me = room.localParticipant;

      setRoster([
        {
          identity: me.identity,
          name: "You",
          isLocal: true,
          micOn: me.isMicrophoneEnabled,
          speaking: me.isSpeaking,
        },
        ...keyed.map((item) => item.entry),
      ]);
    };

    const throttle = createThrottle(build, ROSTER_COMMIT_MS);

    ROSTER_EVENTS.forEach((event) => room.on(event, throttle.schedule));
    throttle.schedule();

    return () => {
      throttle.cancel();
      ROSTER_EVENTS.forEach((event) => room.off(event, throttle.schedule));
    };
  }, [room, enabled]);

  return roster;
}
