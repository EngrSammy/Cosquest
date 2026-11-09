using System;
using CosQuest.Duel;
using static CosQuest.Duel.InputKind;

namespace DuelGolden
{
    /// <summary>
    /// A seeded pseudo-thumb for one human side. Only the generator runs these:
    /// golden.json stores what they produced as the side's wire log, and the
    /// TypeScript test replays that log, so the TS side never needs this code.
    /// </summary>
    internal abstract class Script
    {
        protected XorShift R;
        protected Script(ulong seed) { R = new XorShift(seed); }
        public abstract InputKind Next(DuelState s, int side);
        public abstract string Style { get; }

        public static Script Make(string style, ulong seed)
        {
            switch (style)
            {
                case "thumb": return new Thumb(seed, false);
                case "saver": return new Thumb(seed, true);
                case "chaos": return new Chaos(seed);
                case "masher": return new Masher(seed);
                case "turtle": return new Turtle(seed);
                case "idle": return new Idle();
                case "tap1": return new TapOnce();
                default: throw new ArgumentException("unknown script style " + style);
            }
        }
    }

    /// <summary>Does nothing: the AI (or the clock) decides.</summary>
    internal sealed class Idle : Script
    {
        public Idle() : base(1) { }
        public override string Style => "idle";
        public override InputKind Next(DuelState s, int side) => None;
    }

    /// <summary>One tap on the first tick, then nothing (a trade at point blank).</summary>
    internal sealed class TapOnce : Script
    {
        public TapOnce() : base(1) { }
        public override string Style => "tap1";
        public override InputKind Next(DuelState s, int side) => s.Tick + 1 == 1 ? Tap : None;
    }

    /// <summary>
    /// A plausible player that uses every input: walks in runs both ways, taps
    /// chains, blocks, holds long enough to charge and throw a heavy, dashes
    /// and strikes out of the dash, dodges, and presses both specials (with
    /// and without the meter for them).
    /// </summary>
    internal sealed class Thumb : Script
    {
        int _hold, _cool, _walk, _dashTap = -1;
        InputKind _walkKind;
        readonly bool _saver;
        /// <summary>A saver keeps the meter for the ultimate (Special2), pressing Special1 only when it cannot pay.</summary>
        public Thumb(ulong seed, bool saver) : base(seed) { _saver = saver; }
        public override string Style => _saver ? "saver" : "thumb";

        public override InputKind Next(DuelState s, int side)
        {
            var me = s.Fighter(side);
            var op = s.Fighter(1 - side);
            if (_hold > 0) { _hold--; return _hold == 0 ? HoldEnd : None; }
            if (_dashTap > 0) { _dashTap--; return None; }
            if (_dashTap == 0) { _dashTap = -1; _cool = 10; return Tap; }
            if (_walk > 0) { _walk--; return _walkKind; }
            if (_cool > 0) { _cool--; return None; }
            int gap = Math.Abs(op.X - me.X);
            if (gap > 1150)
            {
                if (R.Chance(150)) { _cool = 14; _dashTap = R.Chance(600) ? 2 + R.Next(8) : -1; return SwipeToward; }
                _walk = 3 + R.Next(25); _walkKind = MoveToward; return MoveToward;
            }
            int roll = R.Next(100);
            if (roll < 36) { _cool = 4 + R.Next(9); return Tap; }
            if (roll < 50)
            {
                // Half short blocks, half held past ChargeTicks to throw a heavy.
                _hold = R.Chance(450) ? 5 + R.Next(18) : 28 + R.Next(40);
                return HoldStart;
            }
            if (roll < 57) { _cool = 12 + R.Next(8); return SwipeAway; }
            if (roll < 63) { _cool = 6; _dashTap = R.Chance(700) ? 2 + R.Next(6) : -1; return SwipeToward; }
            if (roll < 70)
            {
                _cool = 8;
                if (_saver) return me.Meter >= 300 ? Special2 : (me.Meter < 100 ? Special1 : None);
                return me.Meter >= 300 && R.Chance(700) ? Special2 : Special1;
            }
            if (roll < 79) { _walk = R.Next(18); _walkKind = MoveAway; return MoveAway; }
            if (roll < 88) { _walk = R.Next(12); _walkKind = MoveToward; return MoveToward; }
            if (roll < 91) return R.Chance(500) ? HoldEnd : HoldStart; // a stray edge, as a thumb makes
            return None;
        }
    }

    /// <summary>The engine's own replay test thumb: random inputs, many walks.</summary>
    internal sealed class Chaos : Script
    {
        static readonly InputKind[] Kinds = { Tap, SwipeToward, SwipeAway, HoldStart, HoldEnd, Special1, Special2, MoveToward, MoveAway };
        public Chaos(ulong seed) : base(seed) { }
        public override string Style => "chaos";
        public override InputKind Next(DuelState s, int side) =>
            R.Chance(180) ? Kinds[R.Next(Kinds.Length)] : (R.Chance(300) ? MoveToward : None);
    }

    /// <summary>Walks in and taps as fast as a thumb can, with a special when it has the meter.</summary>
    internal sealed class Masher : Script
    {
        int _cool;
        public Masher(ulong seed) : base(seed) { }
        public override string Style => "masher";
        public override InputKind Next(DuelState s, int side)
        {
            var me = s.Fighter(side);
            var op = s.Fighter(1 - side);
            if (_cool > 0) { _cool--; return Math.Abs(op.X - me.X) > 1000 ? MoveToward : None; }
            if (Math.Abs(op.X - me.X) > 1000) return MoveToward;
            _cool = 3 + R.Next(10);
            if (me.Meter >= 300) return Special2;
            if (me.Meter >= 100 && R.Chance(200)) return Special1;
            return Tap;
        }
    }

    /// <summary>Blocks most of the time, lets go to throw charged heavies and to poke.</summary>
    internal sealed class Turtle : Script
    {
        int _hold, _cool;
        public Turtle(ulong seed) : base(seed) { }
        public override string Style => "turtle";
        public override InputKind Next(DuelState s, int side)
        {
            if (_hold > 0) { _hold--; return _hold == 0 ? HoldEnd : None; }
            if (_cool > 0) { _cool--; return R.Chance(150) ? MoveAway : None; }
            int roll = R.Next(10);
            if (roll < 6) { _hold = 15 + R.Next(70); return HoldStart; }
            if (roll < 8) { _cool = 8; return Tap; }
            if (roll < 9) { _cool = 15; return SwipeAway; }
            _cool = 4; return MoveToward;
        }
    }
}
