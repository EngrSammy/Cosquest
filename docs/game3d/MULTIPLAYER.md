# Two or three players in one 3D fight (cq 019): design, plan and a proof

**Scope.** Not committed (SCOPE-CHECK.md: build item B9 is a listed stretch item, never promised to
Mark). What exists is a design, a server-authoritative plan, and a working two-player proof on the test
stack, behind the server knob `coop3d` (off everywhere). Turning it into a feature is Subomi's call.

## What the players see
You and a friend at the same Quest Point open the 3D fight together. Each of you sees your own hero, the
other's hero fighting the same Guardian beside you (with their name and bar), your AI ally, and one
Guardian whose HP bar is the squad's shared pool. When the pool runs out, both phones show VICTORY at
the same moment; each of you then gets your own reward for your own fight.

## Who owns what (server-authoritative where it matters)
| Thing | Owner | Why |
|---|---|---|
| The Guardian's HP pool, the round's clock, who is in, the end | **the game server** | the shared result must not depend on any phone |
| Each hit on the Guardian | the phone reports it, **the server checks it** as it arrives (`roam_fight3d.live_hit`: the damage range with only the multipliers the hit claims, swing and bolt rates, the crit dice) and refuses what the rules do not allow | a phone cannot invent damage |
| How fast a phone's fight runs | **the server**: a phone's fight clock may not run ahead of the wall's (x1.15 plus a second) | a sped-up fight would otherwise out-hit everyone (found by this proof: the movie recorder renders faster than real time and its hits were refused) |
| Each player's reward | the existing judged finish (`/v1/duel/finish` with the fight's record, docs/game3d/XP.md) | the same checks as a solo fight |
| Your hero's moves, your Guardian's AI against you, your ally | **your phone** (its own Godot fight) | nothing waits on the network: input to motion stays local |
| The other hero on your screen | drawn from the server's relay of their pose, 100 ms behind, placed against your Guardian | smooth, and they fight the Guardian you see |

This is the shared-pool model the backend already uses for duel raids (`roam_duel_modes` raid pool):
cheap on the server (no game simulation there), and it degrades well: a slow or lost phone only loses
its own hits.

## The proof (what was built)
- **Server** `costquest-backend app/coop3d.py` (knob `coop3d`):
  - `POST /v1/coop3d/join` (signed like every Roam call): a room id, a name, the squad size (2 or 3);
    the pool is one fight's Guardian HP per hero; returns a one-time ticket for the socket.
  - `WS /v1/coop3d/ws?ticket=`: the phone sends `pose` (10 Hz) and `hit` (the fight record's row); the
    server sends `hello`, `state` (pool, clock, every hero's pose, 10 Hz), `refused` (with why) and `end`.
  - Rooms live in the process (the test posture: one worker).
- **Godot** `app/game3d/coop.gd`, started by `fight.gd` when the config has `coop: {url, ticket,
  peer_glb, peer_name}`: sends hits and poses, applies the pool (the local Guardian never stands above
  it, and never falls until the server says so), follows the server's clock, draws the other hero
  outside the fight's rules (no hurtbox, not in the AI's list), and ends on the server's word.
- **In the app** (not wired in this proof): the React Native side would join (it holds the signing
  key) and pass the ticket to Godot in the fight config, as the judged solo fight does with its seed.

## Proof results (local test stack, two Godot fights on this box)
See the cq 019 REPORT for the numbers of the recorded run; in short:
- both phones saw the same pool at the same moments and ended on the server's VICTORY together;
- both players' hits counted (no refusals in real-time play);
- the other hero's pose was 70 to 80 ms old at the median, under 150 ms at the 95th percentile;
- a phone dropped mid-fight: the other kept fighting, the pool kept its damage;
- tests: `tests/test_coop3d.py` (shared pool, both told of the win, a forged hit refused, a sped-up fight
  refused, a full room, one-time tickets, unsigned joins and the knob off refused) and
  `tests/test_roam_fight3d.py` (every honest hit of 120 recorded fights passes the live check).

## What a real feature still needs (the plan)
1. **App:** a co-op lobby on the point (the raid lobby's pattern: players who are actually there), the
   signed join in React Native, the ticket into the fight config; a reconnect path.
2. **Server at scale:** rooms on the existing realtime hub with Redis pub/sub (rooms survive a worker
   and work with several), the knob per region, rate limits on the socket.
3. **Rewards:** a squad line on the reward screen (the pool's share each player took), paid once
   through the ledger with the solo judge's checks on each player's record.
4. **The judge, live:** buffs and staggers checked as they arrive (send casts and staggers as well as
   hits), as the solo judge does at the end.
5. **Later, if wanted:** one Guardian whose moves every phone sees the same (its target, telegraphs and
   strikes), which needs the boss AI on the server: a headless Godot per room (~150 MB and a core each)
   streaming the boss at 15 to 20 Hz, with prediction for your own hero. Far heavier; only worth it if
   Mark wants players to see the Guardian turn on their friend.
