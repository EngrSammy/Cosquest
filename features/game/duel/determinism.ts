// Determinism.cs: the seeded xorshift64* RNG and FNV-1a 64, bit for bit.
//
// Both are 64-bit unsigned in C#. Here a 64-bit value is two unsigned 32-bit
// halves (hi, lo) held in plain numbers, so the per-tick path (the AI's dice)
// never touches BigInt. Every intermediate below stays under 2^53, so double
// arithmetic is exact. BigInt is used only once per RNG, for the seed mixing.

const TWO32 = 4294967296;
const TWO64 = 1n << 64n;
const U64_MASK = TWO64 - 1n;

/** Normalise any integer to a C# ulong (wraps like an unchecked cast). */
export function toU64(v: bigint | number): bigint {
  // Plain BigInt arithmetic (no BigInt.asUintN), for any engine with BigInt.
  let b = (typeof v === "bigint" ? v : BigInt(v)) % TWO64;
  if (b < 0n) b += TWO64;
  return b;
}

/** 16 lowercase hex digits, as C#'s `ulong.ToString("x16")`. */
export function hex16(hi: number, lo: number): string {
  const h = (hi >>> 0).toString(16);
  const l = (lo >>> 0).toString(16);
  return "00000000".slice(h.length) + h + "00000000".slice(l.length) + l;
}

export function u64ToHex(v: bigint): string {
  const s = toU64(v).toString(16);
  return "0000000000000000".slice(s.length) + s;
}

/**
 * xorshift64*, seeded through splitmix64 so nearby seeds diverge at once
 * (C# `XorShift`). The state is public as two halves for hashing.
 */
export class XorShift {
  hi: number;
  lo: number;

  constructor(seed: bigint) {
    let z = (toU64(seed) + 0x9e3779b97f4a7c15n) & U64_MASK;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & U64_MASK;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & U64_MASK;
    z ^= z >> 31n;
    if (z === 0n) z = 0x2545f4914f6cdd1dn;
    this.hi = Number(z >> 32n);
    this.lo = Number(z & 0xffffffffn);
  }

  /** The state as a ulong (for tests and debugging). */
  get state(): bigint {
    return (BigInt(this.hi) << 32n) | BigInt(this.lo);
  }

  // The last NextU64 result, as halves (no allocation per call).
  private rHi = 0;
  private rLo = 0;

  /** Advance and leave x * 0x2545F4914F6CDD1D (mod 2^64) in rHi/rLo. */
  private nextU64(): void {
    let hi = this.hi;
    let lo = this.lo;
    // x ^= x >> 12
    lo = (lo ^ ((lo >>> 12) | (hi << 20))) >>> 0;
    hi = (hi ^ (hi >>> 12)) >>> 0;
    // x ^= x << 25
    hi = (hi ^ ((hi << 25) | (lo >>> 7))) >>> 0;
    lo = (lo ^ (lo << 25)) >>> 0;
    // x ^= x >> 27
    lo = (lo ^ ((lo >>> 27) | (hi << 5))) >>> 0;
    hi = (hi ^ (hi >>> 27)) >>> 0;
    this.hi = hi;
    this.lo = lo;
    // x * 0x2545F4914F6CDD1D mod 2^64, with 16-bit limbs for the low product.
    const bH = 0x2545f491;
    const bL = 0x4f6cdd1d;
    const a0 = lo & 0xffff;
    const a1 = lo >>> 16;
    const b0 = bL & 0xffff;
    const b1 = bL >>> 16;
    const mid = a0 * b1 + a1 * b0; // < 2^33
    const low = a0 * b0 + (mid % 65536) * 65536; // < 2^33
    const carry = Math.floor(low / TWO32);
    this.rLo = low >>> 0;
    this.rHi = (a1 * b1 + Math.floor(mid / 65536) + carry + Math.imul(hi, bL) + Math.imul(lo, bH)) >>> 0;
  }

  /** The next raw 64-bit output as a BigInt (tests only; the sim uses next()). */
  nextU64Big(): bigint {
    this.nextU64();
    return (BigInt(this.rHi) << 32n) | BigInt(this.rLo);
  }

  /** 0 to n-1. Consumes nothing when n <= 1, exactly like C#. */
  next(n: number): number {
    if (n <= 1) return 0;
    this.nextU64();
    // (hi * 2^32 + lo) % n, in steps that stay exact (n < 2^31).
    let r = this.rHi % n;
    r = (r * 65536 + (this.rLo >>> 16)) % n;
    r = (r * 65536 + (this.rLo & 0xffff)) % n;
    return r;
  }

  /** True with probability permille/1000. */
  chance(permille: number): boolean {
    return this.next(1000) < permille;
  }
}

/** FNV-1a over 64 bits, fed integers little-endian (C# `Fnv1a`). */
export class Fnv1a {
  hi = 0xcbf29ce4;
  lo = 0x84222325;

  private byte(b: number): void {
    const lo = (this.lo ^ b) >>> 0;
    const hi = this.hi;
    // value *= 0x100000001b3 = value * 0x1b3 + (value << 40)
    const p = lo * 0x1b3; // < 2^41
    this.lo = p >>> 0;
    this.hi = (Math.imul(hi, 0x1b3) + Math.floor(p / TWO32) + (lo << 8)) >>> 0;
  }

  /** Add(ulong) given as halves. */
  addU64(hi: number, lo: number): void {
    this.byte(lo & 0xff);
    this.byte((lo >>> 8) & 0xff);
    this.byte((lo >>> 16) & 0xff);
    this.byte(lo >>> 24);
    this.byte(hi & 0xff);
    this.byte((hi >>> 8) & 0xff);
    this.byte((hi >>> 16) & 0xff);
    this.byte(hi >>> 24);
  }

  /** Add(int): the int's 32 bits, zero-extended to 8 bytes ((ulong)(uint)v). */
  addInt(v: number): void {
    this.addU64(0, v >>> 0);
  }

  addBool(v: boolean): void {
    this.addU64(0, v ? 1 : 0);
  }

  get value(): bigint {
    return (BigInt(this.hi) << 32n) | BigInt(this.lo);
  }

  get hex(): string {
    return hex16(this.hi, this.lo);
  }
}

/**
 * C# Math.Abs(int) of a difference of two ints: the difference wraps to 32
 * bits (unchecked), and Abs(int.MinValue) throws, as in .NET. Only absurd
 * arena widths (> 2^30 mm) could get there.
 */
export function absDiff(a: number, b: number): number {
  const d = (a - b) | 0;
  if (d === -2147483648) throw new RangeError("Negating the minimum value of a twos complement number is invalid.");
  return d < 0 ? -d : d;
}
