// ==========================================
// WHICH TRACKS THIS PHONE RECEIVES (big calls)
// ==========================================
// Used by both the phone and the website call screens.
//
// Small calls (the grid, up to 8 people) work exactly as before: LiveKit
// subscribes to everyone's microphone and camera by itself.
//
// Big calls show a "stage" with only a handful of video tiles. Receiving
// hundreds of cameras would melt the phone and the data plan, so here:
//   - cameras: only the people with a tile on screen are subscribed;
//     everyone else's camera is unsubscribed (the server stops sending it);
//   - microphones: everyone stays subscribed, like today. A silent
//     microphone costs almost nothing (DTX), and subscribing to a voice
//     only once its owner starts talking would cut off their first words.
//
// The stage tells this module who is on screen with setStageVisible();
// null means "no stage" (the normal grid), so every camera is wanted.
//
// Joining a call that is ALREADY big: the room is connected with
// autoSubscribe off (see shouldJoinWithoutAutoSubscribe), so the phone
// never downloads hundreds of cameras just to drop them a moment later.
// The manager below then subscribes every microphone and the visible
// cameras itself.
import type {
  RemoteParticipant,
  RemoteTrackPublication,
  Room,
} from "livekit-client";
import { RoomEvent, Track } from "livekit-client";
import { useState, useSyncExternalStore } from "react";

import type { Call } from "@/services/calls";

// Above this many people the call screen switches to the stage layout.
// The grid was designed for 1 to 8 tiles (see VideoGridTile).
export const STAGE_ENTER_ABOVE = 8;

// ...and back to the grid only once it is this small again, so a call
// hovering around 8 people doesn't flip between layouts.
export const STAGE_EXIT_AT_OR_BELOW = 6;

// The room options passed when connecting. Kept as constants so the
// object is the same every render (a new object makes LiveKit reconnect).
export const CONNECT_AUTO_SUBSCRIBE = { autoSubscribe: true } as const;
export const CONNECT_MANUAL_SUBSCRIBE = { autoSubscribe: false } as const;

// Joining a call that already has more people than the grid shows.
export function shouldJoinWithoutAutoSubscribe(joinedCount: number) {
  return joinedCount > STAGE_ENTER_ABOVE;
}

function connectOptionsFor(call: Call | null | undefined) {
  const joined = call
    ? call.members.filter((member) => member.status === "joined").length
    : 0;

  return {
    callId: call?.id ?? null,
    options: shouldJoinWithoutAutoSubscribe(joined)
      ? CONNECT_MANUAL_SUBSCRIBE
      : CONNECT_AUTO_SUBSCRIBE,
  };
}

// Decided ONCE per call, when it opens: changing connect options later
// would make LiveKit reconnect.
export function useJoinConnectOptions(call: Call | null | undefined) {
  const [choice, setChoice] = useState(() => connectOptionsFor(call));

  if (call && choice.callId !== call.id) {
    const next = connectOptionsFor(call);
    setChoice(next);
    return next.options;
  }

  return choice.options;
}

// ---------- who is on screen ----------

let visibleIds: ReadonlySet<string> | null = null;
const listeners = new Set<() => void>();

export function setStageVisible(ids: ReadonlySet<string> | null) {
  if (sameSet(visibleIds, ids)) {
    return;
  }

  visibleIds = ids;
  listeners.forEach((listener) => listener());
}

function sameSet(a: ReadonlySet<string> | null, b: ReadonlySet<string> | null) {
  if (a === b) return true;
  if (!a || !b || a.size !== b.size) return false;

  for (const id of a) {
    if (!b.has(id)) return false;
  }

  return true;
}

export function getStageVisible() {
  return visibleIds;
}

function subscribeVisible(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

// FOCUS MODE ("hear nobody, stay in the call"): every microphone
// unsubscribed while it's on. Kept here, not in the call screen, so this
// manager is the only thing that subscribes and unsubscribes: when the call
// screen did it, the manager could subscribe a microphone that started
// during focus mode again, and that person was heard.
let voicesMuted = false;

export function setVoicesMuted(muted: boolean) {
  if (voicesMuted === muted) {
    return;
  }

  voicesMuted = muted;
  listeners.forEach((listener) => listener());
}

// Who the stage currently shows (null = no stage). Used by the dev mock.
export function useStageVisible() {
  return useSyncExternalStore(subscribeVisible, getStageVisible, getStageVisible);
}

// ---------- the manager ----------

// Burst of joins (hundreds of people arriving at once) → one pass, not
// one pass per person.
const RECONCILE_DELAY_MS = 120;

function wants(
  publication: RemoteTrackPublication,
  participant: RemoteParticipant,
  visible: ReadonlySet<string> | null,
  allVideo: boolean,
) {
  if (publication.kind === Track.Kind.Audio) {
    return !voicesMuted;
  }

  // Video (camera, or a screen share if one is ever added).
  return visible ? visible.has(participant.identity) : allVideo;
}

// Starts managing a room's subscriptions. Returns the stop function.
// autoSubscribe must match what the room was connected with.
export function manageCallSubscriptions(room: Room, autoSubscribe: boolean) {
  // What this manager last asked for, per publication. Without an entry,
  // the publication is in the room's default state (autoSubscribe).
  const requested = new WeakMap<RemoteTrackPublication, boolean>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let stageSeen = false;

  const reconcile = () => {
    timer = null;

    if (stopped) {
      return;
    }

    const visible = visibleIds;

    if (visible) {
      stageSeen = true;
    }

    // No stage on screen → the grid, which shows every camera. One
    // exception: right after joining an already-big call (autoSubscribe
    // off) the stage hasn't mounted yet; wait for it instead of pulling
    // every camera for a moment.
    const allVideo =
      autoSubscribe ||
      stageSeen ||
      room.remoteParticipants.size <= STAGE_ENTER_ABOVE;

    // O(people x their tracks): a couple of tracks each, once per burst.
    room.remoteParticipants.forEach((participant) => {
      participant.trackPublications.forEach((publication) => {
        const want = wants(publication, participant, visible, allVideo);
        const current = requested.get(publication) ?? autoSubscribe;

        if (current !== want) {
          requested.set(publication, want);
          publication.setSubscribed(want);
        }
      });
    });
  };

  const schedule = () => {
    if (!stopped && timer === null) {
      timer = setTimeout(reconcile, RECONCILE_DELAY_MS);
    }
  };

  room
    .on(RoomEvent.Connected, schedule)
    .on(RoomEvent.Reconnected, schedule)
    .on(RoomEvent.ParticipantConnected, schedule)
    .on(RoomEvent.TrackPublished, schedule);

  listeners.add(schedule);
  schedule();

  return () => {
    stopped = true;

    if (timer !== null) {
      clearTimeout(timer);
    }

    listeners.delete(schedule);
    room
      .off(RoomEvent.Connected, schedule)
      .off(RoomEvent.Reconnected, schedule)
      .off(RoomEvent.ParticipantConnected, schedule)
      .off(RoomEvent.TrackPublished, schedule);
  };
}
