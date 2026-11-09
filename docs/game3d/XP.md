# XP from the 3D fight (cq 019)

> **battle-3d-only (1 Nov 2026): the 3D fight is the one battle style.** Every fight entry (a Quest
> Point's "Fight", "Fight the boss", Siege, Guardian Trials rungs, Quest Run duel points) opens the
> judged 3D fight directly: no briefing, no versus card, no second button. `DuelScreen` starts the duel
> with `fight3d: true`; the server's knob per mode (`point_fight3d`, `raid_fight3d`, `siege_fight3d`,
> `trial_fight3d`, `run_fight3d`) hands out a `fight3d` setup. A phone that cannot run Godot sends
> `fallback2d: true` and plays the 2D duel (judged and paid as before). Quest Point quizzes stay, as a
> challenge, not a battle; Boss Trivia, the quiz Siege, Unity and the SwiftUI game are out of the app;
> Rooms is hidden (`EXPO_PUBLIC_ROOMS=1`). See "Modifiers" below for how the modes differ.

Until cq 019 the Godot fight paid nothing and the reward screen said "Practice": the game server judges
a 2D duel by checking its inputs and could not judge a 3D fight. Now, at a Quest Point that plays as a
fight, the 3D fight is a real point fight. The server sets it up, the fight records what happened, the
server checks the record, and a win or a loss pays through the same ledger, level bar, dailies and holds
as the 2D duel.

## The flow
1. **Is it judged?** `/v1/roam/me` says `features.duel.fight3d: true` when the server's knob
   `point_fight3d` is on (and `point_duel` is on). The app judges a fight only at a duel point, never a
   raid or the test arena (`fight3d.ts judgedFight`). Otherwise the fight is practice, as before.
2. **Start.** `Fight3D.tsx` calls `POST /v1/duel/start` with `mode: "point"` and `fight3d: true` before
   anything loads. The same checks as any point fight apply (reach, travel speed, the point resting), and a
   refusal shows on the loading card. The setup comes back as `kind: "fight3d"`, with the seed, the rules
   id and the round length.
3. **Fight.** Godot fights on the duel's seed folded to 31 bits (`fightSeed(seed_text)`, the server's
   `fight_seed`). The fight records every hit, cast, heal, stagger, skill press and guard change
   (`fight.gd judge_log`, under `judge` in the result). Recording draws no random numbers and changes
   nothing: the seeded review fights are byte-identical with and without it.
4. **Finish.** `POST /v1/duel/finish` carries the duel's usual result block and the whole Godot result in
   `fight3d` (`finishFrom3D`). The server (`costquest-backend app/roam_fight3d.py`) judges it and the reward
   screen shows the server's pay (XP, faction points, the level bar) above the fight's own numbers.
   A held fight shows "Checking the score" and pays nothing.

## What the server checks
It does not re-run the fight. It checks that:
- the fight ran on the rules the server holds and on the seed it handed out;
- every hit on the Guardian is in its damage range, with only the multipliers that were earned (a RALLY
  buff after a RALLY, a staggered hit after a parry or a SPLIT, crits no more often than the dice give);
- skills respect their cooldowns, were pressed, and strike no more often than they can; swings, the ally's
  bolts and the Guardian's strikes come no faster than the moves allow;
- the Guardian's HP, your HP (with RALLY's heals) and the totals add up to the result;
- the fight took real time (no faster than real time, not long after it ended).

A forged win would have to be a fight the rules allow, hit by hit. The seed and the record are kept with
the duel, so a replay check (headless Godot on the same seed and inputs) can be added later without
changing the app.

**Two clocks.** Every record row starts `[t, lt]`: `t` is the round's clock (the timer; skill cooldowns
run on it) and `lt` the moves' clock, which stops during hit-stop (swings, skills, buffs, staggers, the
guard and the AI run on it). The first judge used one clock and held an honest fight whose RALLY buff
outlasted six seconds of round time by the hit-stops in between; the fix was to record both.

**A cast's frame.** A skill cast after the clocks moved on in that frame (the autoplay bot's casts) starts
its cooldown one frame short and lands its effect one frame sooner. Each cast row records its frame's
length (`[t, lt, slot, frame]`) and the judge allows exactly that, capped at 0.5 s. Found by recording
fights at 15 fps and at an uncapped frame rate: the judge held honest ones before the fix.

## Changing the combat numbers
`fight.gd rules_table()` (whole numbers) is hashed into `rules_id()` (`f3d-1-21d2cde61ab2` today), and the
server's `RULES` must hash to the same id, or every 3D fight is held. `tests/judge_test.gd` pins the id.
To change a number: change `fight.gd`, update `PINNED_RULES` in `judge_test.gd`, update `RULES` in
`roam_fight3d.py`, regenerate the backend's fight corpus (`tests/fixtures/fight3d_corpus.jsonl.gz`), and
deploy the server before the app.

## Tests
- Godot: `tests/judge_test.gd` (rules id pinned; a seeded fight's record adds up).
- App: `features/game3d/__tests__/fight3d.test.ts` (seed folding, the finish body, which fights are judged).
- Server: `tests/test_roam_fight3d.py`: the verdict on every recorded bot fight equals the fight's own
  (337 fights: wins, losses, timeouts; 30, 15 and 60 fps and uncapped); tampered records are held (a loss called a
  win, inflated hits, every hit a crit, buffs and staggers from nowhere, skills under their cooldown or
  never pressed, impossible swing rates, HP that does not add up, a sped-up fight, a malformed record);
  end to end, a 3D point win pays XP once and a forged one pays nothing.

## Modifiers (battle-3d-only)
The modes need different Guardians: a raid boss with more HP and heavier strikes over 60 s, a 30 s
Quest Run round, a Trials rung's own strength, a Siege Guardian as sturdy as its hold. None of that goes
in the rules table (that would change `f3d-1-21d2cde61ab2` and hold every fight until both sides ship).
It goes in the stored setup, beside `duration_s`:
- `mods.boss_hp_permille`: the Guardian's HP is `ENEMY_HP` x this (`fight.gd boss_hp()`, the server's
  `roam_fight3d.boss_hp`); `mods.boss_dmg_permille`: each boss strike's damage range x this, each end
  rounded (`boss_dmg()` / `_boss_range`). Bounds 200..5000 and 200..3000.
- `guardian_look` (cosmetic, never judged): `size_permille` (the boss's height) and `title` (the intro
  banner). Each mode's values come from server knobs (`fight3d_*` in `roam_rules.py`).

Godot records the mods in its log (`judge.mods`). The judge holds a record whose mods are not the
setup's ("the fight ran on other modifiers") and judges HP and strikes at the modded numbers. Identity
mods, and setups stored before mods existed, judge exactly as before: the seeded review fights are
byte-identical with identity mods, and the old corpus still passes. Tests: `tests/judge_mods_test.gd`
(Godot) and the backend's `tests/test_battle_3d_only.py` with `fixtures/fight3d_mods_corpus.jsonl.gz`.

Raid pool damage and Quest Run scores are taken from the judged record, not the phone's summary. Old
builds (2D only) keep the 2D duel for `duel_2d_grace_days` after `fight3d_since`, then get 426 "update".
