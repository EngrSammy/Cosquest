#!/usr/bin/env python3
"""Raw evdev touch packets for the emulator's virtio multi-touch screen (cq 061).

Writes down.bin / move.bin / up.bin / atk_down.bin / atk_up.bin into the given
folder. latency.sh cats them into /dev/input/event2 on the phone, so one write()
injects a whole packet, timed with the phone's own CLOCK_REALTIME (date +%s.%N),
the clock Godot's Time.get_unix_time_from_system() reads.

  mkevents.py OUTDIR [screen_w screen_h]   (1080 2400 for the journeys' AVD)
"""
import struct
import sys

out = sys.argv[1]
W, H = (int(sys.argv[2]), int(sys.argv[3])) if len(sys.argv) > 3 else (1080, 2400)
EV_SYN, EV_KEY, EV_ABS = 0, 1, 3
SYN_REPORT, BTN_TOUCH = 0, 330
ABS_MT_SLOT, ABS_MT_POSITION_X, ABS_MT_POSITION_Y, ABS_MT_TRACKING_ID = 0x2F, 0x35, 0x36, 0x39
ABS_MT_TOUCH_MAJOR, ABS_MT_PRESSURE = 0x30, 0x3A  # the device has a pressure axis: 0 reads as not touching


def ev(t, c, v):  # struct input_event on x86_64: timeval (2 x 8), type u16, code u16, value s32
    return struct.pack("<qqHHi", 0, 0, t, c, v)


def sx(x):
    return round(x * 32767 / (W - 1))


def sy(y):
    return round(y * 32767 / (H - 1))


def down(x, y, tid):
    return (ev(EV_ABS, ABS_MT_SLOT, 0) + ev(EV_ABS, ABS_MT_TRACKING_ID, tid) + ev(EV_ABS, ABS_MT_POSITION_X, sx(x))
            + ev(EV_ABS, ABS_MT_POSITION_Y, sy(y)) + ev(EV_ABS, ABS_MT_TOUCH_MAJOR, 8) + ev(EV_ABS, ABS_MT_PRESSURE, 512)
            + ev(EV_KEY, BTN_TOUCH, 1) + ev(EV_SYN, SYN_REPORT, 0))


def move(x, y):
    return ev(EV_ABS, ABS_MT_SLOT, 0) + ev(EV_ABS, ABS_MT_POSITION_X, sx(x)) + ev(EV_ABS, ABS_MT_POSITION_Y, sy(y)) + ev(EV_SYN, SYN_REPORT, 0)


def up():
    return ev(EV_ABS, ABS_MT_SLOT, 0) + ev(EV_ABS, ABS_MT_PRESSURE, 0) + ev(EV_ABS, ABS_MT_TRACKING_ID, -1) + ev(EV_KEY, BTN_TOUCH, 0) + ev(EV_SYN, SYN_REPORT, 0)


# Joystick: the HUD's floating stick takes any touch in the lower left; a
# 180 px push to the right (120 canvas px) is well past its 10% dead zone.
STICK = (300, 1950)
# Attack button: (-44, 50) pt from the bottom-right, 720 px canvas scaled 1.5.
ATK = (958, 2262)
# WHIRL, the real skill: slot 2 of the arc (135 degrees, 185 canvas px from Attack).
SKILL = (762, 2065)
files = {
    # a thumb landing on the drawn stick, right of its centre: steers at once.
    # cq 244: the stick now sits at (225, 2092) on the 1080x2400 screen, base ~125 px;
    # cq 061's spot (336, 2157) was 129 px out, past the rim, and most taps missed.
    "stick_tap.bin": down(225 + 120, 2092, 104),
    "up_push.bin": move(STICK[0], STICK[1] - 180),
    "left_push.bin": move(STICK[0] - 180, STICK[1]),
    "skill_down.bin": down(*SKILL, 103),
    "down.bin": down(*STICK, 101),
    "move.bin": move(STICK[0] + 180, STICK[1]),
    "up.bin": up(),
    "atk_down.bin": down(*ATK, 102),
    "atk_up.bin": up(),
}
for name, data in files.items():
    with open(f"{out}/{name}", "wb") as f:
        f.write(data)
print("wrote", ", ".join(files))
