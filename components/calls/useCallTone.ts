// Plays the call sounds on a loop while `active` is true:
//   "ringtone" - for the person being called (incoming call screen)
//   "ringback" - for the caller, the "brr-brr" while it's ringing
// Stops by itself as soon as `active` becomes false (answered, declined,
// cancelled, missed) or the screen closes. Works on phones and the website.
import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { useEffect } from "react";

const SOURCES = {
  ringtone: require("@/assets/sounds/ringtone.wav"),
  ringback: require("@/assets/sounds/ringback.wav"),
};

export type CallTone = keyof typeof SOURCES;

export function useCallTone(kind: CallTone, active: boolean) {
  useEffect(() => {
    if (!active) {
      return;
    }

    let player: AudioPlayer | null = null;

    try {
      player = createAudioPlayer(SOURCES[kind]);
      player.loop = true;
      player.volume = kind === "ringback" ? 0.7 : 1;
      player.play();
    } catch {
      // No sound available (e.g. a browser blocked it) - the call still works.
    }

    return () => {
      try {
        player?.pause();
        player?.remove();
      } catch {
        // Already released.
      }
    };
  }, [kind, active]);
}
