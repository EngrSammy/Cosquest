# Scope check: XP from fights, a real place for fights, multiplayer fights (cq 019, 31 Oct 2026)

The CosQuest matrix lists three game items as not started: XP/progress from fights, multiplayer fights,
and a real place for fights. This page checks each one against what the agreement covers and what
already exists, and says who owns it.

## Sources
- **The agreement's CosQuest scope:** the game, Forge, the Forge-to-game bridge and Game Warden
  (agreement section 3 item 1), as written up in `SCOPE-COSQUEST-GAME.md` (23 Oct), with its gap list
  (section 3) and build list B1 to B10 (section 4).
- **Mark's answers of 24 Oct:** these are about ALM (models, editions, servers). None of them changes
  the game's scope.
- **What exists:** `ubmids/costquest-backend` `game-trunk` (5141e75) and `ubmids/cosquest-merged`
  `game-quality/r3-final` (57fae2e), read file by file.
- **The team's work:** the dev team's own repo could not be read from this box. Their commits inside
  `cosquest-merged` (EngrSammy, Fatunsin Damilare, Omoniyi47, Samuel Oyewade, Temitayo10, Wemida
  Emmanuel; 109 of 472 commits) touch the chat app, its Node backend (`cosquest-backend/`), onboarding,
  profiles, expertise and voice rooms. None of them touch game XP, the game map or fights.
- `GAMEPLAY_GAP.md` and the matrix itself are not on this box. The gap list in the scope doc
  (section 3) is used in their place.

## The table

| Item | What already exists | What is missing | Scope reference | Owner | Classification |
|---|---|---|---|---|---|
| **XP and progress from fights** | Server-judged XP, coins, faction points, levels, ranks, dailies and the level bar for every 2D fight: point, siege, trial, raid and run duels (`roam_duel.py`, `roam_duel_modes.close_point`, `roam.pay_graded`) and the reward screen (`Reward.tsx`). Rooms pay Roam XP when they settle. | **The 3D Godot fight, which is the fight Mark will see, pays nothing.** It is labelled "Practice" because the server cannot judge it (`fight3d.ts` `rewardFrom3D`: xp 0, practice true). | Gap 3, last bullet ("the fight pays no XP"). Build list B7 ("Server-judged 3D fight, real XP"). | Ours. The game server and the app are Subomi's work under the agreement. | **Ours and committed** |
| **A real place for fights** | The 3D fight's arena is a generic night street from cq 016 (Kenney shop fronts, a cross street, lamps), the same for every point. The map is ours: the 2D board lit by the hour, `ground.py` (OpenStreetMap roads, water, green space, buildings and trees in metres around a point, from PMTiles archives), and the Forge stations and environment packs that dress points. | **A fight does not happen where the point is.** The street is the same at every point; nothing of the real place around the player reaches the fight. | Gap 3 ("the arena is a flat plate, not a recognisable place"). Build list B4 ("A recognisable real place: OSM + Forge arena for one landmark"). Mark on 30 Sep: players should "roll through a city"; "3D rendering of the maps" is one of his milestones. | Ours. | **Ours and committed.** One open question for Mark (scope doc section 5, Mark item 2): photoreal everywhere (Google 3D Tiles: a billed key, about 4 weeks, no iOS yet) or recognisable and stylised (OpenStreetMap). The build assumes recognisable and stylised. |
| **Multiplayer fights** | Ours, in 2D: Rooms (a live Events battle any player starts, many phones, websocket, server-run engine, pays XP), boss raids (co-op, shared rounds, server-judged), live events at scale (2,000 bots tested in `game-sim`). The team's voice rooms are calls, not fights. | **The 3D fight is single player.** Its squad pill says "2/3 players", but the ally is an AI; nobody else is in the fight. | Build list B9 ("Two players in one fight"), marked **stretch** and ranked last, "highest risk". Not in the gap list and not in Mark's asks (section 2.1); Mark has not asked for co-op 3D fights. | Ours (game server and app), if it is done. | **Not committed** (a listed stretch item, never promised to Mark). Done here only as a design, a server-authoritative plan and a minimal 2-player proof on the test stack (see `docs/game3d/MULTIPLAYER.md`). |

Nothing in the three is the team's. Nothing in the three needs Forge or the Warden to change.

## What gets built, in order
1. **XP from the 3D fight** (B7, the biggest change to what Mark sees: the reward screen after the 3D
   fight shows real XP, coins and the level bar moving, instead of "Practice"). The server starts the
   fight (seed, both fighters, the clock), the fight reports what happened, the server checks it and pays
   through the same ledger and reward as every other point fight.
2. **The place for fights** (B4): the fight's street laid out from the real streets and buildings round
   the point, from OpenStreetMap.
3. **Multiplayer:** the design and a 2-player proof on the test stack only (not committed scope).

## Decisions this needs (for Subomi or Mark)
- Mark: photoreal or recognisable-stylised places (above).
- Subomi: whether co-op 3D fights become committed scope. Until then the "2/3 players" pill is
  misleading; the build changes it to say what it is (you and an AI ally) unless a real second player
  is in the fight.
- Subomi: turning the 3D fight's XP on (`point_fight3d` knob, off by default) on staging and later
  production; no deploy is done by this task.

## Outcome (cq 019, 31 Oct)
- **XP from the 3D fight: built** (docs/game3d/XP.md). Behind the server knob `point_fight3d` (off):
  the server starts the fight, judges the fight's record hit by hit and pays like any point fight.
- **The place for fights: built** (docs/game3d/PLACE.md). When the map has the ground round the point,
  the fight happens in the real place (OpenStreetMap), turned to face the nearest landmark; else the
  street. Stylised, not photoreal.
- **Multiplayer: designed, with a working 2-player proof on the test stack** (docs/game3d/MULTIPLAYER.md).
  Behind the server knob `coop3d` (off); not wired into the app's screens.
- The squad pill reads 2/2 (you and the AI ally).
