#!/usr/bin/env python3
"""The live Forge find nearest a spot, from the LOCAL game backend, as
"<lng> <lat>|<name>|<metres away>|<expires_at>" (empty when there is none).

  e2e/forge/nearest_drop.py [lat lng] [--base http://127.0.0.1:8599]
"""
import json
import math
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

args = [a for a in sys.argv[1:] if not a.startswith("--")]
base = "http://127.0.0.1:8599"
if "--base" in sys.argv:
    base = sys.argv[sys.argv.index("--base") + 1]
    args = [a for a in args if a != base]
lat, lng = (float(args[0]), float(args[1])) if len(args) >= 2 else (51.5074, -0.1278)
with urllib.request.urlopen(f"{base}/v1/roam/forge/drops?lat={lat}&lng={lng}&radius_m=1000") as r:
    drops = json.load(r)["drops"]


def dist(x):
    return math.hypot((x["lat"] - lat) * 111320, (x["lng"] - lng) * 111320 * math.cos(math.radians(lat)))


# Long enough to walk up and claim it while a journey records.
soon = datetime.now(timezone.utc) + timedelta(minutes=8)
appeared = datetime.now(timezone.utc)
live = sorted((x for x in drops if not x.get("claimed")
               and datetime.fromisoformat(x["expires_at"]) > soon
               and datetime.fromisoformat(x["appears_at"]) <= appeared), key=dist)
if live:
    x = live[0]
    print("%s %s|%s|%.0f|%s" % (x["lng"], x["lat"], x["name"], dist(x), x["expires_at"]))
