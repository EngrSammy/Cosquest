#!/usr/bin/env python3
"""Render the game's sound effects as WAV files for the React Native game.

The native game synthesises them at run time (costquest-ios UI/GameKit.swift,
GameSound.synth). This is the same recipe, note for note, written to
assets/sounds/game/<effect>.wav (44.1 kHz, mono, 16-bit) so expo-audio can
play them on both platforms. Re-run after changing a recipe:

    python3 scripts/game-sfx.py
"""
import math
import os
import struct
import wave

RATE = 44_100
EFFECTS = {
    "tap": ([(880, 0.04)], False),
    "coin": ([(988, 0.06), (1319, 0.14)], False),
    "reward": ([(784, 0.07), (988, 0.07), (1175, 0.07), (1568, 0.18)], False),
    "fanfare": ([(523, 0.1), (659, 0.1), (784, 0.1), (1047, 0.3)], False),
    "hit": ([(220, 0.05), (140, 0.16)], True),
    "whoosh": ([(400, 0.18)], True),
    "pulse1": ([(523, 0.09)], False),
    "pulse2": ([(659, 0.09)], False),
    "pulse3": ([(784, 0.11)], False),
}
# GameSound's mixer volume.
VOLUME = 0.55


def render(notes, noise):
    out = []
    seed = 12345
    for freq, dur in notes:
        n = int(dur * RATE)
        for k in range(n):
            t = k / RATE
            env = math.exp(-t * (18 if noise else 9)) * min(1.0, k / 60)
            phase = math.sin(2 * math.pi * freq * t)
            v = (0.6 if phase > 0 else -0.6) * 0.5 + phase * 0.5
            if noise:
                seed = (seed * 1_664_525 + 1_013_904_223) & 0xFFFFFFFF
                v = v * 0.5 + ((seed >> 9) / float(1 << 23) - 0.5) * 0.9
            out.append(v * env * 0.4 * VOLUME)
    return out


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    dest = os.path.join(here, "..", "assets", "sounds", "game")
    os.makedirs(dest, exist_ok=True)
    for name, (notes, noise) in EFFECTS.items():
        samples = render(notes, noise)
        with wave.open(os.path.join(dest, f"{name}.wav"), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(b"".join(struct.pack("<h", max(-32767, min(32767, int(s * 32767)))) for s in samples))
        print(name, len(samples))


if __name__ == "__main__":
    main()
