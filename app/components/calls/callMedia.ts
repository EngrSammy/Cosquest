// ==========================================
// CALL MEDIA SETTINGS (phones): calls and voice chats
// ==========================================
// LiveKit room options and camera-track helpers shared by CallSession and
// VoiceRoomSession, plus two small hooks that keep group-call screens from
// re-rendering (or re-sending LiveKit messages) more often than needed.
import { RoomEvent, Track, type Participant, type RoomOptions } from "livekit-client";
import { useRef } from "react";

import type { OrbitPerson } from "@/components/calls/OrbitCall";

// Echo cancellation / noise suppression / auto gain are on by default in
// LiveKit; they're listed explicitly so they can never be switched off by
// accident. dtx saves data when nobody speaks; red adds a little redundancy
// so a lost packet doesn't cut a word.
//
// Camera: LiveKit's default (1280x720, sent as 720p + 360p + 180p). Every
// phone camera opens 720p natively. (A 960x540 request was tried: many
// cameras have no such mode, so they opened twice at odd 4:3 sizes and
// LiveKit could no longer switch layers - "encodings mismatch".) dynacast
// already stops encoding any layer nobody is watching: in a group call
// everyone sees small circles, so phones only encode the small layers.
//
// adaptiveStream: each picture is requested at the size it is shown, at
// LiveKit's default density (2x on 3x phones). "screen" (3x on iPhones)
// asked for half as many pixels again as the default, so every tile pulled
// a bigger layer than it needed.
export const CALL_ROOM_OPTIONS: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  audioCaptureDefaults: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  publishDefaults: {
    dtx: true,
    red: true,
  },
};

// The camera lists below only need to change when a camera does (someone
// joins or leaves, a camera turns on or off, a picture arrives). By default
// LiveKit's useTracks also updates on every active-speaker and connection-
// quality change, which re-rendered every video on screen several times a
// second in a group call.
const CAMERA_EVENTS = [
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.TrackPublished,
  RoomEvent.TrackUnpublished,
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
];
export const CAMERA_TRACKS_OPTIONS = { onlySubscribed: false, updateOnlyOn: CAMERA_EVENTS };
export const CAMERA_SOURCES = [Track.Source.Camera];
export const CAMERA_SLOTS = [{ source: Track.Source.Camera, withPlaceholder: true as const }];

// Who is in the room and which microphones they publish, as one string.
// Effects that act on everyone's microphone (focus mode, private-call
// volume) depend on this instead of the participant list: that list changes
// on every active-speaker / connection-quality update, several times a
// second in a group call.
export function useMicKey(participants: Participant[]) {
  return participants
    .map((p) => `${p.identity}:${[...p.audioTrackPublications.keys()].join("+")}`)
    .join(",");
}

// The orbit's people, keeping the same object for a person (and the same
// array) while nothing about them changed, so the memoized orbit and its
// circles skip the re-renders the call timer and captions cause.
export function useStablePeople(list: OrbitPerson[]) {
  const cache = useRef(new Map<string, { key: string; person: OrbitPerson }>());
  const last = useRef(list);
  const people = list.map((next) => {
    const key = JSON.stringify(next);
    const cached = cache.current.get(next.id);
    if (cached?.key === key) return cached.person;
    cache.current.set(next.id, { key, person: next });
    return next;
  });
  if (people.length !== last.current.length || people.some((person, index) => person !== last.current[index])) {
    last.current = people;
  }
  return last.current;
}
