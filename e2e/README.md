# CosQuest journeys (Android, Maestro)

Twelve end-to-end journeys of the merged app, run on an Android emulator
against backends on the same machine, each recorded. Findings and results:
`docs/journeys/FINDINGS.md`.

## Pieces

| What | Where | Port |
|---|---|---|
| Chat backend (MCJ-events/COSQUEST, in-memory Mongo/Redis, seeded) | `e2e/seed/chat-local.js` (see `e2e/seed/README.md`) | 4120 |
| The other people (send, call, vote, start Sparks, join LiveKit) | `e2e/seed/peer.js`, served to Maestro by `e2e/seed/peer-server.js` | 4130 |
| Timed game taps (quiz answers, strikes) | `e2e/seed/phone.js` (through the peer server) | |
| Game backend (ubmids/costquest-backend `integration-20261016`, Postgres, Trafalgar Square test world) | on the farm: `~/cq-work/cx-journeys/e2e-game/game-up.sh` / `game-down.sh` (not in git: its env file holds local-only secrets) | 8399 |
| LiveKit | `docker run -d --name cx054-livekit --network host livekit/livekit-server --dev --bind 0.0.0.0 --node-ip 10.0.2.2` | 7880 |
| Emulator, install, tunnels, GPS at Trafalgar Square | `e2e/emu.sh up <apk>` / `e2e/emu.sh down` | |
| One journey, recorded | `e2e/journey.sh maestro/<flow>.yaml <label>` | |
| A clean world before each journey | `e2e/reset.sh` (new chat seed, game players cleared) | |
| All (or some) journeys | `e2e/run-all.sh <run> [flow ...]` | |
| The test servers (API only, read-mostly) | `CQ_TEST_PASSWORD=... node e2e/testserver/smoke.js` | |

## Run

```sh
# build for the emulator, pointed at the local backends
cd app && SKIP_PREBUILD=1 GAME_SERVER=http://localhost:8399 UNLOCK_ALL=1 \
  JAVA_HOME=... ANDROID_HOME=... scripts/android-emulator-build.sh && cd ..

~/cq-work/cx-journeys/e2e-game/game-up.sh           # game backend
e2e/emu.sh up app/android/app/build/outputs/apk/release/app-release.apk

export OUT=$PWD/../e2e-out VIDEOS=$PWD/../e2e-out/videos   # absolute paths
e2e/run-all.sh after                                 # all 12, about 20 minutes
e2e/run-all.sh after 06-messaging 07-calls           # some
cat $OUT/results-after.txt
e2e/emu.sh down
```

Videos are 540 px H.264 with a silent audio track (so players treat them as
videos, not GIFs). Maestro's screenshots and logs go to `$OUT/<label>/`.

## Perf and fit (task 058)

`e2e/perf/`: phone profiles (`profile.sh small|large|large-a11y|game-ref`), a
recorded fit tour with screenshots (`flows/tour.yaml`), the measurements
(`measure.py`: cold start, feed, a 2,000-message chat, map, duel, quiz), one
runner per profile (`run-profile.sh <run> <profile> [tour|measure|game|only:a,b]`)
and the before/after table (`report.py`). Needs a build with
`EXPO_PUBLIC_PERF_MARKS=1` and the AVD `cx058` (1440x3120, 560 dpi):
`AVD=cx058 EMU_MEM=2048 e2e/emu.sh up <apk>`. Results: `docs/polish/BASELINE.md`.

## Things to know

- The emulator uses about 6 GB on this farm; stop it while Gradle builds.
- With gesture navigation a swipe from the screen edge is Back; the flows
  swipe into the game from the edge handle (98%, 42%) instead.
- Maestro's `hideKeyboard` presses Back when no keyboard is up (it can leave
  the screen); the game's name step submits with Enter.
- Each game journey needs a new player (one boss fight per hour, cooldowns):
  `reset.sh` clears the local game DB's players.
- Maestro waits for the screen to settle after each step; the quiz and fight
  screens never do, so timed taps go through `phone.js`.
- `journey.sh` renews the adb tunnels and the GPS fix every 5 s.

## Cohesion journeys and shots (task 059)

- J13-J18 (`maestro/13-...` to `18-...`): delete account, report, block from
  anywhere, offline send, push tap routing, error boundary. They need a build
  with `EXPO_PUBLIC_E2E=1` (the emulator build script sets it: it enables the
  test-only routes `app/dev/crash` and `app/dev/push-test`) and this branch's
  `cosquest-backend` as `CHAT_BACKEND_DIR` (delete account and reports are new
  routes there). `seed/phone.js net off|on` and `phone.js shade` drive the
  network and the notification shade.
- `polish/shots.sh <run> [light|dark]`: the key screens for
  `docs/polish/PALETTE.md` (`FLOW=shots-board` for the six-screen board only).
- On a shared, loaded machine: restart the emulator every 9 journeys or so
  (qemu grew to 8.8 GB resident over a few hours here, and the task's cgroup
  was throttled and once OOM-killed it); `journey.sh` gives up on a video join
  after 5 minutes, `reset.sh` waits up to 3 minutes for the seed and turns the
  phone's network back on.
