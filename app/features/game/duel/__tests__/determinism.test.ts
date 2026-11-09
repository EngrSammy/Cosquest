// The 64-bit maths done in 32-bit halves, against plain BigInt references
// written straight from Determinism.cs.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Fnv1a, XorShift, absDiff, hex16, u64ToHex } from "../determinism.ts";

const M = (1n << 64n) - 1n;

class RefXorShift {
  state: bigint;
  constructor(seed: bigint) {
    let z = (seed + 0x9e3779b97f4a7c15n) & M;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & M;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & M;
    z ^= z >> 31n;
    this.state = z === 0n ? 0x2545f4914f6cdd1dn : z;
  }
  nextU64(): bigint {
    let x = this.state;
    x ^= x >> 12n;
    x = (x ^ (x << 25n)) & M;
    x ^= x >> 27n;
    this.state = x;
    return (x * 0x2545f4914f6cdd1dn) & M;
  }
  next(n: number): number {
    return n <= 1 ? 0 : Number(this.nextU64() % BigInt(n));
  }
}

function refFnv(values: bigint[]): bigint {
  let v = 0xcbf29ce484222325n;
  for (const x of values)
    for (let i = 0n; i < 8n; i++) {
      v ^= (x >> (8n * i)) & 0xffn;
      v = (v * 0x100000001b3n) & M;
    }
  return v;
}

const SEEDS = [0n, 1n, 2n, 7n, 42n, 0xa5a5a5a5n, 0x5a5a5a5a00n, (1n << 62n) - 1n, 1266451243158746731n, 1n << 63n, M, M - 1n,
  // seed + golden ratio wraps to 0 before mixing
  (1n << 64n) - 0x9e3779b97f4a7c15n];

describe("XorShift (xorshift64* with a splitmix64 seed)", () => {
  it("matches the BigInt reference state and raw output, for edge seeds", () => {
    for (const seed of SEEDS) {
      const a = new XorShift(seed);
      const r = new RefXorShift(seed);
      assert.equal(a.state, r.state, `seed ${seed}`);
      for (let i = 0; i < 2000; i++) assert.equal(a.nextU64Big(), r.nextU64(), `seed ${seed} draw ${i}`);
      assert.equal(a.state, r.state);
    }
  });

  it("Next(n) is the unsigned 64-bit remainder for every n, including near 2^31", () => {
    const ns = [2, 3, 4, 6, 10, 14, 16, 40, 1000, 65535, 65536, 65537, 1_000_003, 2 ** 30, 2 ** 31 - 1];
    for (const seed of SEEDS.slice(0, 6)) {
      const a = new XorShift(seed);
      const r = new RefXorShift(seed);
      for (let i = 0; i < 3000; i++) {
        const n = ns[i % ns.length];
        assert.equal(a.next(n), r.next(n), `seed ${seed} draw ${i} n ${n}`);
      }
    }
  });

  it("Next(n <= 1) is 0 and consumes nothing, as in C#", () => {
    const a = new XorShift(9n);
    const s = a.state;
    assert.equal(a.next(1), 0);
    assert.equal(a.next(0), 0);
    assert.equal(a.next(-5), 0);
    assert.equal(a.state, s);
    assert.equal(a.chance(1000), true); // Next(1000) < 1000, and it does consume
    assert.notEqual(a.state, s);
  });

  it("the seed wraps like a ulong", () => {
    assert.equal(new XorShift(-1n).state, new XorShift(M).state);
    assert.equal(new XorShift(1n << 64n).state, new XorShift(0n).state);
  });
});

describe("Fnv1a 64", () => {
  it("matches the BigInt reference for ints, bools and ulongs", () => {
    const h = new Fnv1a();
    const ref: bigint[] = [];
    const rnd = new RefXorShift(5n);
    for (let i = 0; i < 500; i++) {
      const pick = i % 4;
      if (pick === 0) {
        const v = Number(rnd.nextU64() & 0xffffffffn) | 0; // any int, negative too
        h.addInt(v);
        ref.push(BigInt(v >>> 0));
      } else if (pick === 1) {
        const v = (i & 1) === 0;
        h.addBool(v);
        ref.push(v ? 1n : 0n);
      } else {
        const v = rnd.nextU64();
        h.addU64(Number(v >> 32n), Number(v & 0xffffffffn));
        ref.push(v);
      }
      assert.equal(h.value, refFnv(ref), `after ${i + 1} adds`);
    }
  });

  it("an int is its 32 bits zero-extended: -1 hashes as 0x00000000ffffffff", () => {
    const a = new Fnv1a();
    a.addInt(-1);
    assert.equal(a.value, refFnv([0xffffffffn]));
    assert.equal(new Fnv1a().hex, "cbf29ce484222325");
  });
});

describe("helpers", () => {
  it("hex16 and u64ToHex pad to 16 lowercase digits", () => {
    assert.equal(hex16(0, 1), "0000000000000001");
    assert.equal(hex16(0xffffffff, 0xabc), "ffffffff00000abc");
    assert.equal(u64ToHex(0xdeadn), "000000000000dead");
    assert.equal(u64ToHex(-1n), "ffffffffffffffff");
  });

  it("absDiff wraps like an unchecked int and throws where Math.Abs(int.MinValue) does", () => {
    assert.equal(absDiff(5, -7), 12);
    assert.equal(absDiff(-7, 5), 12);
    assert.equal(absDiff(2147483647, -2), 2147483647); // wraps to -2147483647
    assert.throws(() => absDiff(2147483647, -1), RangeError);
  });
});
