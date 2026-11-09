# duel-golden: golden vectors for the TypeScript duel port

`features/game/duel/` is a TypeScript port of the C# Guardian Duel engine
(`CosQuest.Duel` in the `costquest-duel` repo). The port must be bit-exact:
the server's replay verifier will rerun Android fights with the C# engine and
compare the 64-bit state hash. This console program runs the real C# engine
and writes `features/game/duel/__tests__/golden.json`. The TypeScript tests
(`golden.test.ts`) replay every case and compare every checkpoint hash, the
final state, the event stream, the wire log, the verifier's replay and (for
some cases) the finish body byte for byte.

## Regenerate

You need a .NET 8 SDK and a checkout of `costquest-duel`. The engine is
compiled from its sources (`src/CosQuest.Duel/Runtime/*.cs`), so the vectors
always come from the engine you point at:

```sh
# from the app folder (cosquest/app)
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_CLI_USE_MSBUILD_SERVER=0
dotnet run -c Release --project scripts/duel-golden/DuelGolden.csproj
# or name the engine checkout explicitly (either form):
dotnet run -c Release --project scripts/duel-golden/DuelGolden.csproj -p:DuelEngineDir=/path/to/costquest-duel
COSQUEST_DUEL_DIR=/path/to/costquest-duel dotnet run -c Release --project scripts/duel-golden/DuelGolden.csproj
dotnet build-server shutdown

# then check the port against them
node --test "features/game/duel/__tests__/*.test.ts"
```

- **Engine location.** `-p:DuelEngineDir=...` wins. Otherwise the
  `COSQUEST_DUEL_DIR` environment variable. Otherwise
  `../../../../costquest-duel` from this folder, which is the cosquest-merge
  workspace layout (`cosquest-merge/cosquest/app/scripts/duel-golden` next to
  `cosquest-merge/costquest-duel`). The build stops with a clear error if
  `src/CosQuest.Duel/Runtime/DuelSim.cs` is not there.
- **No build output in the app checkout.** `bin/` and `obj/` go to
  `$TMPDIR/cosquest-duel-golden/`. Override this with `-p:DuelGoldenOut=/some/dir/`.
- **Options** (after `--`):
  - `--out <file>` writes the vectors somewhere else.
  - `--list` prints the case names.
  - `--trace <case> [--from t] [--to t]` prints the hash and both fighters'
    state on every tick. When the port diverges, compare that output with
    the TS side's state on the first failing checkpoint.
- **Network.** Restore needs NuGet once (Newtonsoft.Json 13.0.2, the
  version Unity's `com.unity.nuget.newtonsoft-json` 3.2.1 ships).

The output is deterministic. If you regenerate without changing the engine,
`golden.json` should come out unchanged. If it does change, the engine (or a
case) changed, and the TS port must be updated until the tests pass again.
`golden.json` records the engine sources' SHA-256 and their last commit under
`engine`.

## What the cases cover (about 85 fights, about 470 KiB)

- **AI matrix.** Every Guardian stance x faction x difficulty (54 cases)
  against a scripted player. The scripts include a pseudo-thumb that walks in
  runs both ways, taps chains, blocks, holds past the 25-tick charge to throw
  heavies, dashes and strikes out of the dash, dodges, and presses both
  specials. There are also random, masher, turtle, meter-saving and idle
  players.
- **Weapon classes.** All five: Blade and Fists, which are complete, and the
  Polearm, Blaster and Arcane stubs.
- **Other fights.**
  - AI against AI, including the engine's own 10k-tick determinism test and
    long SaveForTwo fights that reach the AI's neutral Special2.
  - Human against human, which gives both sides' wire logs. These run in
    narrow and tiny arenas and wall to wall.
  - P1 as AI against a human P2.
- **Every ending.** KO wins for either side, timeouts both ways, a timeout
  draw and a double-KO draw.
- **Edge values.**
  - Raw AI numbers that `Validate` clamps.
  - Seeds 0, 2^63 and 2^64-1.
  - Attack 2e9 against MaxHp `int.MaxValue`, and attack 0.
- **The server path.** These cases take a setup JSON in the shape `roam_duel.py`
  writes and map it with the Unity bridge's own `DuelWire` (`UnityDuelWire.cs`).
  - The three real staging setups in `fixtures/staging-duel-starts.jsonl`.
    Their `setup.seed` was rounded by a JS parse, so the exact `seed_text` is
    patched back in, as Swift hands Unity the exact 64-bit seed.
  - Synthetic setups for each conversion rule:
    - permille rounding half away from zero (0.2345 gives 235 and 0.0025
      gives 3);
    - defence basis points divided by 10, clamped to 0..400;
    - `personality` falling back to the fighter's faction;
    - an AI with no stance counting as no AI;
    - seed 0 becoming 1;
    - unknown names falling back to their defaults;
    - `round_ticks` 1800.

Each case stores:

- the setup as built (before `DuelSim` clamps the AI);
- the `AiParams.Create` arguments when used;
- the server JSON and `seed_text`;
- each human side's `InputLog.ToWire` output, which is also its script: the
  TS test feeds it back tick by tick and checks that its own log comes out
  identical;
- the hash at ticks 0 to 3 and then every 60;
- the final state of both fighters;
- an FNV-1a hash over every event;
- what `InputLog.Replay(setup, FromWire(0, wire))` returns;
- for some cases, `DuelWire.FinishJson`.

## Files

- `DuelGolden.csproj`: compiles the engine sources plus `UnityDuelWire.cs`
  plus the generator.
- `Program.cs`: the cases, the runner and the JSON writer.
- `Scripts.cs`: the seeded pseudo-players. Only the generator uses them; the
  golden stores what they pressed.
- `UnityDuelWire.cs`: a verbatim copy of `costquest-unity`
  `Assets/Scripts/Duel/DuelWire.cs` (branch `street-look`, commit
  `47560e40`). To compile the live file instead, build with
  `-p:UnityDuelWire=/path/to/costquest-unity/Assets/Scripts/Duel/DuelWire.cs`.
  If Unity's mapping changes, refresh the copy and regenerate.
- `fixtures/staging-duel-starts.jsonl`: real `/v1/duel/start` setups from
  staging, each with its exact `seed_text`.
