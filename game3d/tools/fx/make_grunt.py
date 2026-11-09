#!/usr/bin/env python3
"""make_grunt.py <out.wav>: the Guardian's grunt layer (look-fight), synthesised here, so it is the
project's own sound (CC0 1.0): a low glottal buzz gliding down, two vocal formants, a growl
(amplitude roughness), a breathy onset, 0.42 s, peak -3 dBFS. sfx.gd varies its pitch per play.
Run with any Python that has numpy; encode with ffmpeg -c:a libvorbis -q:a 4."""
import sys, wave
import numpy as np

sr = 44100
n = int(0.42 * sr)
t = np.arange(n) / sr
f0 = 108.0 * (1.0 - 0.28 * (t / t[-1]) ** 0.8)            # glides down
phase = 2 * np.pi * np.cumsum(f0) / sr
src = np.zeros(n)
for k in range(1, 30):                                       # a glottal-ish buzz: harmonics falling off
    src += np.sin(k * phase) / k ** 1.15
growl = 1.0 + 0.45 * np.sin(2 * np.pi * 31.0 * t) * np.sin(2 * np.pi * 7.0 * t)
src *= growl
rng = np.random.default_rng(14)
src += 0.25 * rng.standard_normal(n) * np.exp(-t / 0.06)    # breathy onset

def resonate(x, fc, bw):
    # a two-pole resonator (formant)
    r = np.exp(-np.pi * bw / sr)
    c = 2 * r * np.cos(2 * np.pi * fc / sr)
    y = np.zeros_like(x)
    for i in range(2, len(x)):
        y[i] = x[i] + c * y[i - 1] - r * r * y[i - 2]
    return y

y = 1.0 * resonate(src, 520.0, 120.0) + 0.55 * resonate(src, 1150.0, 160.0) + 0.25 * resonate(src, 2400.0, 250.0)
env = np.minimum(1.0, t / 0.035) * np.exp(-np.maximum(0.0, t - 0.12) / 0.11)
y *= env
y /= np.max(np.abs(y)) / 0.7                                 # -3 dBFS peak
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes((y * 32767).astype(np.int16).tobytes())
