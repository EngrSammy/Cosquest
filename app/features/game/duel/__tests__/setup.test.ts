// Setups: the engine's validation, AiParams, the exact JSON parser and the
// server-setup mapping's edges (the golden cases cover the happy paths
// against the Unity bridge's own code).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { DuelSim } from "../duelSim.ts";
import { DuelFormatError, DuelSetupError } from "../errors.ts";
import { parseJsonExact } from "../json.ts";
import {
  AiParams,
  DuelSetup,
  FighterStats,
  permille,
  presentationFromServer,
  setupFromServer,
} from "../setup.ts";
import { Difficulty, Faction, SpecialUse, Stance, WeaponClass } from "../types.ts";

describe("DuelSetup validation (DuelSetup.Validate)", () => {
  const cases: [string, (s: DuelSetup) => void, RegExp][] = [
    ["MaxHp 0", (s) => { s.p1.stats = new FighterStats(0, 1, 0); }, /MaxHp must be positive/],
    ["negative attack", (s) => { s.p2.stats = new FighterStats(10, -1, 0); }, /Attack must not be negative/],
    ["mitigation 401", (s) => { s.p1.stats = new FighterStats(10, 1, 401); }, /MitigationPermille must be 0 to 400/],
    ["RoundTicks 0", (s) => { s.roundTicks = 0; }, /RoundTicks must be positive/],
    ["gap under 400", (s) => { s.startGapMm = 399; }, /StartGapMm out of range/],
    ["gap wider than the arena", (s) => { s.startGapMm = 10_001; }, /StartGapMm out of range/],
    ["a fractional stat", (s) => { s.p1.stats = new FighterStats(1000.5, 1, 0); }, /32-bit integer/],
    ["a numeric seed", (s) => { (s as unknown as { seed: number }).seed = 5; }, /bigint/],
    ["an unknown class", (s) => { s.p1.class = 9 as WeaponClass; }, /32-bit|weapon class/],
  ];
  for (const [what, change, msg] of cases)
    it(`refuses ${what}`, () => {
      const s = new DuelSetup();
      change(s);
      assert.throws(() => new DuelSim(s), (e: Error) => e instanceof DuelSetupError && msg.test(e.message));
    });

  it("2 * ArenaHalfWidthMm wraps like a C# int", () => {
    const s = new DuelSetup();
    s.arenaHalfWidthMm = 1_200_000_000; // 2 * w overflows: every gap is then out of range
    assert.throws(() => new DuelSim(s), /StartGapMm out of range/);
  });

  it("clamps the AI in place, as C# does", () => {
    const s = new DuelSetup();
    const ai = new AiParams();
    ai.reactionTicks = 500;
    ai.aggression = -3;
    ai.mistakePermille = 4000;
    s.p2.ai = ai;
    new DuelSim(s);
    assert.deepEqual([ai.reactionTicks, ai.aggression, ai.mistakePermille], [120, 0, 1000]);
  });

  it("places the fighters as C# does (an odd gap)", () => {
    const s = new DuelSetup();
    s.startGapMm = 2401;
    const sim = new DuelSim(s);
    assert.deepEqual([sim.state.p1.x, sim.state.p2.x], [-1200, 1201]);
    assert.deepEqual([sim.state.p1.facing, sim.state.p2.facing], [1, -1]);
  });
});

describe("AiParams.create", () => {
  it("matches the C# presets", () => {
    const a = AiParams.create(Stance.Aggressive, Faction.Anime, Difficulty.Hard);
    assert.deepEqual(
      [a.aggression, a.blockBias, a.dodgeBias, a.chainChance, a.reactionTicks, a.mistakePermille, a.specialUse],
      [740, 340, 240, 950, 10, 45, SpecialUse.Greedy],
    );
    const t = AiParams.create(Stance.Turtle, Faction.DC);
    assert.deepEqual([t.aggression, t.blockBias, t.dodgeBias, t.reactionTicks], [300, 640, 280, 16]);
  });
});

describe("parseJsonExact", () => {
  it("parses like JSON.parse", () => {
    const docs = [
      '{"a":1,"b":[true,false,null],"c":"x\\"y\\\\z\\n\\u00e9","d":-0.25,"e":1e3,"f":{}}',
      "[]",
      ' { "k" : [ 1 , 2 ] } ',
      '"Caffè Nero"',
      '{"dup":1,"dup":2}',
      "12345678901234",
    ];
    for (const d of docs) assert.deepEqual(parseJsonExact(d), JSON.parse(d), d);
  });

  it("keeps integers past 2^53 exact as BigInt", () => {
    const v = parseJsonExact('{"seed":1266451243158746731,"small":9007199254740991,"neg":-9223372036854775808,"f":1266451243158746731.0}') as Record<string, unknown>;
    assert.equal(v.seed, 1266451243158746731n);
    assert.equal(v.small, 9007199254740991);
    assert.equal(v.neg, -9223372036854775808n);
    assert.equal(typeof v.f, "number");
  });

  it("refuses broken JSON", () => {
    for (const bad of ["{", '{"a":}', "[1,]", "tru", '{"a":1} x', "01", '"\\x"', "{'a':1}"])
      assert.throws(() => parseJsonExact(bad), DuelFormatError, bad);
  });
});

describe("setupFromServer edges", () => {
  const base = () => ({
    seed: 5,
    round_ticks: 3600,
    tick_hz: 60,
    p1: { name: "P", faction: "dc", weapon_class: "blade", level: 1, max_hp: 1000, attack: 460, defence_bp: 0, ai: null },
    p2: {
      name: "G", faction: "anime", weapon_class: "fists", level: 2, max_hp: 1012, attack: 466, defence_bp: 20,
      ai: { stance: "aggressive", personality: "anime", reaction_ticks: 22 },
    },
  });

  it("maps a plain siege setup", () => {
    const s = setupFromServer(base());
    assert.equal(s.seed, 5n);
    assert.equal(s.p2.class, WeaponClass.Fists);
    assert.equal(s.p2.stats.mitigationPermille, 2);
    assert.equal(s.p2.ai?.reactionTicks, 22);
    assert.equal(s.p2.ai?.chainChance, 950);
    assert.equal(s.p1.ai, null);
  });

  it("seedText wins over setup.seed, and must be digits", () => {
    assert.equal(setupFromServer(base(), "4611686018427387903").seed, 4611686018427387903n);
    assert.throws(() => setupFromServer(base(), "-5"), DuelFormatError);
    assert.throws(() => setupFromServer(base(), "12x"), DuelFormatError);
    assert.throws(() => setupFromServer(base(), (1n << 64n).toString()), DuelFormatError);
  });

  it("refuses a rounded 62-bit seed rather than fighting a different fight", () => {
    const s = { ...base(), seed: 1266451243158746600 };
    assert.throws(() => setupFromServer(s), /not exact/);
    assert.equal(setupFromServer(s, "1266451243158746731").seed, 1266451243158746731n);
  });

  it("refuses another tick rate, and a setup without both fighters", () => {
    assert.throws(() => setupFromServer({ ...base(), tick_hz: 30 }), /tick_hz 30/);
    assert.throws(() => setupFromServer({ ...base(), p2: null }), /needs p1 and p2/);
    assert.throws(() => setupFromServer("[]"), /needs p1 and p2/);
    assert.throws(() => setupFromServer({ ...base(), round_ticks: 1.5 }), DuelFormatError);
  });

  it("matches field names case-insensitively, as Newtonsoft does", () => {
    const { round_ticks: _drop, ...rest } = base();
    const s = setupFromServer({ ...rest, Round_Ticks: 1800, P2: rest.p2, p2: undefined });
    assert.equal(s.roundTicks, 1800);
    assert.equal(s.p2.class, WeaponClass.Fists);
  });

  it("rounds permille half away from zero, after clamping", () => {
    assert.deepEqual(
      [0.7, 0.2345, 0.0005, 0.0025, 0.0015, 1.5, -0.2, 0, 1, 0.9995].map(permille),
      [700, 235, 1, 3, 2, 1000, 0, 0, 1000, 1000],
    );
  });

  it("reads the staging fixtures with their seed_text", () => {
    const lines = readFileSync(new URL("../../../../scripts/duel-golden/fixtures/staging-duel-starts.jsonl", import.meta.url), "utf8")
      .split("\n").filter((l) => l.trim());
    assert.ok(lines.length >= 3);
    for (const line of lines) {
      const { seed_text, setup } = JSON.parse(line) as { seed_text: string; setup: Record<string, unknown> };
      const s = setupFromServer(setup, seed_text);
      assert.equal(s.seed.toString(), seed_text);
      assert.equal(s.roundTicks, 3600);
      assert.ok(s.p2.ai);
      assert.equal(presentationFromServer(setup).p1Name, "Fixture");
    }
  });
});
