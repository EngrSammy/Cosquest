// VERBATIM COPY of costquest-unity (branch street-look, commit 47560e40567c5a0c92df1e69706a22bab351f463)
// Assets/Scripts/Duel/DuelWire.cs: how the Unity bridge maps the server setup JSON onto a DuelSetup
// and writes the finish body. Do not edit below this header; refresh it from the Unity repo, or build
// with -p:UnityDuelWire=/path/to/DuelWire.cs to compile the live file instead (see README.md).

using System;
using System.Collections.Generic;
using CosQuest.Duel;
using Newtonsoft.Json;

namespace CostQuest.DuelView
{
    /// <summary>
    /// The shapes that cross the bridge: the server's duel setup coming in (the
    /// "setup" object of POST /v1/duel/start, docs/API.md §11) and the finish
    /// body going out.
    ///
    /// The conversion from server numbers to sim numbers lives here and ONLY
    /// here, because a server-side replay has to make exactly the same
    /// conversion to reproduce the fight: floats in 0..1 become thousandths by
    /// rounding half away from zero, basis points of defence become
    /// thousandths by integer division.
    /// </summary>
    public static class DuelWire
    {
        public sealed class AiWire
        {
            public string stance;
            public string personality;
            public int? reaction_ticks;
            public double? aggression;
            public double? block_bias;
            public double? dodge_bias;
            public string special_use;
        }

        public sealed class FighterWire
        {
            public string name;
            public string faction;
            public string weapon_class;
            public int level;
            public int max_hp;
            public int attack;
            public int defence_bp;
            public AiWire ai;
        }

        public sealed class SetupWire
        {
            public ulong seed;
            public int round_ticks;
            public int tick_hz;
            public FighterWire p1;
            public FighterWire p2;
        }

        /// <summary>What the view needs beyond the sim: names and colours.</summary>
        public sealed class Presentation
        {
            public string P1Name, P2Name;
            public string P1Faction, P2Faction;
            public int P1Level, P2Level;
        }

        public static SetupWire Parse(string json)
        {
            var w = JsonConvert.DeserializeObject<SetupWire>(json);
            if (w == null || w.p1 == null || w.p2 == null)
                throw new FormatException("duel setup needs p1 and p2");
            return w;
        }

        public static DuelSetup ToSim(SetupWire w)
        {
            if (w.tick_hz != 0 && w.tick_hz != DuelSim.TicksPerSecond)
                throw new FormatException($"tick_hz {w.tick_hz} is not the engine's {DuelSim.TicksPerSecond}");
            var s = new DuelSetup
            {
                Seed = w.seed == 0 ? 1UL : w.seed,
                P1 = Fighter(w.p1),
                P2 = Fighter(w.p2),
            };
            if (w.round_ticks > 0) s.RoundTicks = w.round_ticks;
            return s;
        }

        public static Presentation Present(SetupWire w) => new Presentation
        {
            P1Name = string.IsNullOrEmpty(w.p1.name) ? "You" : w.p1.name,
            P2Name = string.IsNullOrEmpty(w.p2.name) ? "Guardian" : w.p2.name,
            P1Faction = w.p1.faction ?? "",
            P2Faction = w.p2.faction ?? "",
            P1Level = w.p1.level,
            P2Level = w.p2.level,
        };

        static FighterSetup Fighter(FighterWire f)
        {
            var fs = new FighterSetup
            {
                Name = f.name ?? "",
                Class = ClassOf(f.weapon_class),
                Stats = new FighterStats(
                    Math.Max(1, f.max_hp),
                    Math.Max(0, f.attack),
                    Math.Max(0, Math.Min(400, f.defence_bp / 10))),
            };
            if (f.ai != null && !string.IsNullOrEmpty(f.ai.stance))
            {
                var ai = AiParams.Create(StanceOf(f.ai.stance), FactionOf(f.ai.personality ?? f.faction));
                if (f.ai.reaction_ticks.HasValue) ai.ReactionTicks = f.ai.reaction_ticks.Value;
                if (f.ai.aggression.HasValue) ai.Aggression = Permille(f.ai.aggression.Value);
                if (f.ai.block_bias.HasValue) ai.BlockBias = Permille(f.ai.block_bias.Value);
                if (f.ai.dodge_bias.HasValue) ai.DodgeBias = Permille(f.ai.dodge_bias.Value);
                if (!string.IsNullOrEmpty(f.ai.special_use))
                    ai.SpecialUse = f.ai.special_use == "save" ? SpecialUse.SaveForTwo : SpecialUse.Greedy;
                fs.Ai = ai;
            }
            return fs;
        }

        public static int Permille(double v) =>
            (int)Math.Round(Math.Max(0.0, Math.Min(1.0, v)) * 1000.0, MidpointRounding.AwayFromZero);

        public static WeaponClass ClassOf(string s)
        {
            switch ((s ?? "").ToLowerInvariant())
            {
                case "fists": return WeaponClass.Fists;
                case "polearm": return WeaponClass.Polearm;
                case "blaster": return WeaponClass.Blaster;
                case "arcane": return WeaponClass.Arcane;
                default: return WeaponClass.Blade;
            }
        }

        public static Stance StanceOf(string s)
        {
            switch ((s ?? "").ToLowerInvariant())
            {
                case "aggressive": return Stance.Aggressive;
                case "turtle": return Stance.Turtle;
                default: return Stance.Counter;
            }
        }

        public static Faction FactionOf(string s)
        {
            switch ((s ?? "").ToLowerInvariant())
            {
                case "anime": return Faction.Anime;
                case "marvel": return Faction.Marvel;
                case "dc": return Faction.DC;
                case "movies": return Faction.Movies;
                case "gaming": return Faction.Gaming;
                default: return Faction.None;
            }
        }

        /// <summary>The /v1/duel/finish body, minus device_key and duel_id (Swift adds those).</summary>
        public static string FinishJson(DuelSim sim, InputLog log)
        {
            var st = sim.State;
            var body = new Dictionary<string, object>
            {
                ["result"] = new Dictionary<string, object>
                {
                    ["winner"] = st.Winner,
                    ["ticks"] = st.Tick,
                    ["p1_hp"] = st.P1.Hp,
                    ["p2_hp"] = st.P2.Hp,
                },
                ["inputs"] = log.ToWire(0),
                ["hash"] = sim.Hash().ToString("x16"),
            };
            return JsonConvert.SerializeObject(body);
        }
    }
}
