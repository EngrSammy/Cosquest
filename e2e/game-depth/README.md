# cq 019 harness: the judged 3D fight, the real place, the co-op proof

Scripts used for the cq 019 numbers and recordings, kept so the runs can be repeated. They were run on
mm1 from `/home/engineer/cq-work/019-game-depth-scope-and-build` (W at the top of each): `app/` this
repo, `backend/` costquest-backend `game-depth`, `base/` a worktree at 57fae2e, `cap/` fight configs
(cq 016's review cast), a private Postgres on :55419 and the backend on :55420 (knobs `point_duel`,
`point_fight3d`, `coop3d` on), Expo web on :8955 with `EXPO_PUBLIC_E2E=1` for the reward screen.

| Script | What it does |
|---|---|
| `seeded.sh <tag> <tree...>` | the three seeded review fights (headless, --fixed-fps 30); the fight's numbers without the judge log, to compare builds |
| `corpus.py <tree> <out.jsonl> <n> [fps]` | seeded bot fights with their judge logs (wins, losses, timeouts; with `fps`: 15, 60 fps and uncapped) for the server's tests |
| `e2e_fight3d.py <out> [--movie]` | a signed test device, a server-started 3D point fight, Godot on the server's seed, the server's verdict; then a lost fight sent as a win |
| `e2e_trafalgar.py <out>` | the same at Trafalgar Square, in the real place, recorded in real time |
| `coop_proof.py <out> [--drop-b S]` | two players in one co-op room: one recorded under xvfb in real time, one headless |
| `shot_reward.py <shot.json> <out> [--video]` | the app's real reward screen for a fight's result and verdict (Expo web, `/dev/reward`) |
| `lat.sh <cfg> <label>` | one real-time fight on a one-thread software GPU (frame time, input latency; cq 016's measure) |
| `compose.py`, `compose_place.py` | the captioned recordings |
| `osm_svg.py` | the OpenStreetMap ground drawn flat, turned as the fight turns it (the layout check) |
| `rec_run.sh` | Godot in real time with its window recorded (x11grab), inside xvfb-run |
