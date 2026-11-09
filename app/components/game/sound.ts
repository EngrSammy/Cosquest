// The game's sound effects (costquest-ios UI/GameKit.swift GameSound): short
// chiptune cues at the moments the native game plays them. The native game
// synthesises them at run time; here they are the same recipe rendered to
// WAV (scripts/game-sfx.py) and played through expo-audio.
//
// The audio session follows GameAudio in GameKit.swift: playback mixed with
// whatever else is playing, so a phone on silent still hears the game (the
// common case), and never while a CosQuest call holds the session: changing
// it then would cut the call's microphone. During a call the effects stay
// quiet rather than risk the call's audio.
import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from "expo-audio";

import { store } from "@/store/store";

const SOURCES = {
  tap: require("@/assets/sounds/game/tap.wav"),
  coin: require("@/assets/sounds/game/coin.wav"),
  reward: require("@/assets/sounds/game/reward.wav"),
  fanfare: require("@/assets/sounds/game/fanfare.wav"),
  hit: require("@/assets/sounds/game/hit.wav"),
  whoosh: require("@/assets/sounds/game/whoosh.wav"),
  pulse1: require("@/assets/sounds/game/pulse1.wav"),
  pulse2: require("@/assets/sounds/game/pulse2.wav"),
  pulse3: require("@/assets/sounds/game/pulse3.wav"),
} as const;

export type GameSoundEffect = keyof typeof SOURCES;

/** Two players per effect, so a quick double tap is two clicks, not one cut short. */
const PER_EFFECT = 2;
const players = new Map<GameSoundEffect, { list: AudioPlayer[]; next: number }>();
let sessionSet = false;
let broken = false;

const inCall = () => store.getState().call?.active != null;

/** A CosQuest call is on: the game keeps quiet (GameKit's call-safe audio, patch 0004). */
export const callActive = inCall;

/** The game's session, once: playback, mixed with others (GameAudio.play). */
export function prepareGameAudio() {
  if (sessionSet || inCall()) return;
  sessionSet = true;
  setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "mixWithOthers", allowsRecording: false }).catch(() => {
    sessionSet = false;
  });
}

/** Something else (voice answers, a call) took the session over: set it again next time. */
export function invalidateGameAudio() {
  sessionSet = false;
}

export function playSound(effect: GameSoundEffect) {
  if (broken || inCall()) return;
  prepareGameAudio();
  try {
    let slot = players.get(effect);
    if (!slot) {
      slot = { list: [], next: 0 };
      for (let i = 0; i < PER_EFFECT; i++) slot.list.push(createAudioPlayer(SOURCES[effect]));
      players.set(effect, slot);
    }
    const player = slot.list[slot.next % slot.list.length];
    slot.next += 1;
    player.seekTo(0).catch(() => {});
    player.play();
  } catch {
    // No audio here (a browser that blocks it, a missing asset): the game is silent, not broken.
    broken = true;
  }
}

/** The three rising pulses of the Strike (pulse1-3), as GameSound plays them. */
export const PULSES: readonly GameSoundEffect[] = ["pulse1", "pulse2", "pulse3"];
