// The Warden speaking in the React Native game: the line for a moment (the
// on-device model's when it is loaded, else the authored one, instantly),
// the speech bubble's state, and the voice.
// costquest-ios Warden/WardenVoice.swift + WardenSpeaker.swift.
//
// The voice (Day 1, 3 Nov 2026): the server's ElevenLabs voice when it has
// one for the line within VOICE_WAIT_MS (features/game/wardenServerVoice.ts,
// backend app/warden_voice.py), else on-device speech (expo-speech) as
// before. The bubble never waits for either; mute and a call silence both.
// EXPO_PUBLIC_WARDEN_SERVER_VOICE=0 turns the server voice off in a build.
import { type AudioPlayer, createAudioPlayer } from "expo-audio";
import * as Speech from "expo-speech";
import { useSyncExternalStore } from "react";

import { gameStore } from "@/features/game/runtime";
import { fallbackLine, type LineWriter, type WardenMoment } from "@/features/game/warden";
import { ServerVoice, VOICE_WAIT_MS } from "@/features/game/wardenServerVoice";
import { store } from "@/store/store";
import { getPref, setPref } from "@/utils/prefsStorage";

import { callActive, prepareGameAudio } from "./sound";

export type Said = { id: number; text: string; moment: string; fromModel: boolean };

let said: Said | null = null;
let serial = 0;
let muted = false;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
/** The on-device model, when one is loaded (features/game/wardenModel). */
let writer: LineWriter | null = null;
/** Lines the model has written, by moment (written ahead, as on iOS). */
const written = new Map<string, string>();
const inFlight = new Map<string, Promise<string | null>>();
/** How long a moment waits for the model before the authored line (iOS: 2.5 s). */
const MODEL_WAIT_MS = 2500;
/** Log each line said (dev builds, and test builds with EXPO_PUBLIC_WORLD_TIMING=1). */
const TRACE = __DEV__ || process.env.EXPO_PUBLIC_WORLD_TIMING === "1";
/** The server's voice, unless this build turned it off. */
const SERVER_VOICE = process.env.EXPO_PUBLIC_WARDEN_SERVER_VOICE !== "0";
/** The moments whose line is fetched ahead (the player is walking up to the point). */
const PREFETCH = new Set(["arrive"]);
const PHONE_VOICE = { rate: 1.02, pitch: 0.95 };

const serverVoice = new ServerVoice({
  ask: (text, moment, style) => gameStore.client.wardenVoice(text, moment, style),
});

// ---------- the voice: server audio, else on-device speech ----------

let player: AudioPlayer | null = null;
/** Bumped by every new line and every stop: a late answer for an old line is dropped. */
let voiceSerial = 0;
/** Called when the line now playing from the server finishes. */
let playingDone: (() => void) | null = null;

function stopVoice(): Promise<void> {
  voiceSerial += 1;
  const stopped = Speech.stop().catch(() => {});
  try {
    player?.pause();
  } catch {
    // Nothing loaded: nothing to stop.
  }
  const done = playingDone;
  playingDone = null;
  done?.();
  return stopped;
}

function playUrl(url: string, done: () => void): boolean {
  try {
    prepareGameAudio();
    if (!player) {
      player = createAudioPlayer({ uri: url });
      player.addListener("playbackStatusUpdate", (status) => {
        if (status.didJustFinish) {
          const d = playingDone;
          playingDone = null;
          d?.();
        }
      });
    } else {
      player.replace({ uri: url });
    }
    playingDone = done;
    player.play();
    return true;
  } catch {
    playingDone = null;
    return false;
  }
}

/**
 * Say `text` aloud: the server's voice if it answers in time, else the phone's.
 * `done` runs once when it has been said (or given up on), so a caller that
 * waits for the end of a line (onboarding) never waits forever.
 */
function voice(text: string, moment: string, style: string, done?: () => void) {
  const stopped = stopVoice();
  const mine = ++voiceSerial;
  let finished = false;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (watchdog) clearTimeout(watchdog);
    done?.();
  };
  if (done) watchdog = setTimeout(finish, VOICE_WAIT_MS + 2000 + text.length * 90);
  // After the previous line's stop has landed, or the stop cuts this one too.
  const onPhone = () =>
    void stopped.finally(() => {
      if (mine === voiceSerial) Speech.speak(text, { ...PHONE_VOICE, onDone: finish, onStopped: finish, onError: finish });
      else finish();
    });
  if (!SERVER_VOICE || (!serverVoice.available && !serverVoice.known(text))) {
    onPhone();
    return;
  }
  void serverVoice.urlFor(text, moment, style).then((url) => {
    // Superseded by a newer line, a stop, mute or a call while waiting.
    if (mine !== voiceSerial || muted || callActive()) return finish();
    if (url && playUrl(url, finish)) return;
    onPhone();
  });
}

// A call starting mid-line: the Warden stops talking at once (GameKit's call-safe audio).
let wasInCall = false;
store.subscribe(() => {
  const now = callActive();
  if (now && !wasInCall) void stopVoice();
  wasInCall = now;
});

function ask(m: WardenMoment): Promise<string | null> {
  const key = m.key;
  const cached = written.get(key);
  if (cached) return Promise.resolve(cached);
  const running = inFlight.get(key);
  if (running) return running;
  if (!writer) return Promise.resolve(null);
  const job = writer(m)
    .then((text) => {
      if (text) {
        if (written.size > 200) written.clear();
        written.set(key, text);
      }
      return text;
    })
    .catch(() => null)
    .finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

const MUTE_PREF = "game.warden.muted";
getPref(MUTE_PREF)
  .then((v) => {
    muted = v === "1";
    notify();
  })
  .catch(() => {});

export const wardenVoice = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  get: () => said,
  isMuted: () => muted,

  setWriter(next: LineWriter | null) {
    writer = next;
  },

  setMuted(next: boolean) {
    muted = next;
    setPref(MUTE_PREF, next ? "1" : "0").catch(() => {});
    if (next) void stopVoice();
    notify();
  },

  /** Start writing a line now so it is ready when wanted; the arrive line's audio too. */
  prepare(moment: WardenMoment) {
    const audio = (text: string | null) => {
      if (!SERVER_VOICE || muted || !PREFETCH.has(moment.kind)) return;
      serverVoice.prefetch(text || fallbackLine(moment), moment.kind, moment.style);
    };
    // A fixed line (a Warden site's own words) is said as written: no model, audio only.
    if (moment.fixed) { audio(moment.fixed); return; }
    void ask(moment).then(audio);
  },

  /** Say a moment's line: the model's if it is ready in time, the authored one otherwise. */
  async speak(moment: WardenMoment, holdMs = 6000): Promise<string> {
    const fromModel = writer && !moment.fixed
      ? await Promise.race([ask(moment), new Promise<null>((r) => setTimeout(() => r(null), MODEL_WAIT_MS))])
      : null;
    const line = fromModel ? { text: fromModel, fromModel: true } : { text: fallbackLine(moment), fromModel: false };
    said = { id: ++serial, text: line.text, moment: moment.kind, fromModel: line.fromModel };
    if (TRACE) console.log(`[warden] ${moment.kind}${line.fromModel ? " (model)" : ""}: ${line.text}`);
    notify();
    // Not over a call, and through the game's own session so the silent
    // switch does not swallow it (GameKit.swift: .playback, call-safe).
    if (!muted && !callActive()) {
      prepareGameAudio();
      voice(line.text, moment.kind, moment.style);
    }
    if (hideTimer) clearTimeout(hideTimer);
    const id = said.id;
    hideTimer = setTimeout(() => {
      if (said?.id === id) {
        said = null;
        notify();
      }
    }, holdMs);
    return line.text;
  },

  /**
   * Say any Warden line aloud with no bubble (onboarding, the coach, Ask the
   * Warden's answers), unless muted or on a call. `done` runs once when it has
   * been said, stopped or given up on.
   */
  say(text: string, opts: { moment?: string; style?: string; done?: () => void } = {}) {
    if (!text || muted || callActive()) {
      opts.done?.();
      return;
    }
    prepareGameAudio();
    voice(text, opts.moment ?? "line", opts.style ?? "neutral", opts.done);
  },

  /** Stop talking (the bubble stays). */
  hush() {
    void stopVoice();
  },

  /** A moment's line without saying it (the point card's legend): the model's if it comes within `waitMs`. */
  async line(moment: WardenMoment, waitMs = 8000): Promise<string> {
    const fromModel = writer ? await Promise.race([ask(moment), new Promise<null>((r) => setTimeout(() => r(null), waitMs))]) : null;
    return fromModel || fallbackLine(moment);
  },

  quiet() {
    void stopVoice();
    if (hideTimer) clearTimeout(hideTimer);
    said = null;
    notify();
  },
};

export function useWardenSaid(): Said | null {
  return useSyncExternalStore(wardenVoice.subscribe, wardenVoice.get, wardenVoice.get);
}

export function useWardenMuted(): boolean {
  return useSyncExternalStore(wardenVoice.subscribe, wardenVoice.isMuted, wardenVoice.isMuted);
}
