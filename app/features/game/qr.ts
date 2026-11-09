// A small QR encoder for the friend code (FriendsFeature.swift draws the code
// with CIFilter.qrCodeGenerator, correction level "M"): byte mode, error
// correction M, versions 1 to 4 (up to 62 bytes), which is far more than the
// six-letter code needs. Pure, so it is tested against known vectors
// (__tests__/qr.test.ts) and against an independent encoder.
//
// The steps are ISO/IEC 18004: the bit stream (mode 0100, 8-bit count, bytes,
// terminator, padding 0xEC 0x11), Reed-Solomon over GF(256) (x^8+x^4+x^3+x^2+1),
// the blocks interleaved, the codewords laid in the zigzag round the finder,
// timing and alignment patterns, the best of the eight masks by the standard
// penalty score, and the 15-bit format information.

/** [data codewords, EC codewords per block, blocks] of each version at level M. */
const BLOCKS_M: Record<number, [number, number, number]> = {
  1: [16, 10, 1],
  2: [28, 16, 1],
  3: [44, 26, 1],
  4: [32, 18, 2],
};
/** Alignment pattern centre (versions 2 to 4 have one). */
const ALIGN: Record<number, number | null> = { 1: null, 2: 18, 3: 22, 4: 26 };

export const QR_MAX_BYTES = 62;

// ---------- Reed-Solomon ----------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

/** The generator polynomial of `degree`, highest power first (leading 1 included). */
function generator(degree: number): number[] {
  let g = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = next;
  }
  return g;
}

/** The `ecCount` error-correction codewords of `data`. */
export function reedSolomon(data: readonly number[], ecCount: number): number[] {
  const g = generator(ecCount);
  const rem = new Array<number>(ecCount).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.shift();
    rem.push(0);
    if (factor) for (let i = 0; i < ecCount; i++) rem[i] ^= mul(g[i + 1], factor);
  }
  return rem;
}

// ---------- the bit stream ----------

/** The smallest version at level M that holds `n` bytes, or null. */
export function versionFor(n: number): number | null {
  for (let v = 1; v <= 4; v++) {
    const [data, , blocks] = BLOCKS_M[v];
    // 4 mode bits + 8 count bits, then n bytes.
    if (12 + n * 8 <= data * blocks * 8) return v;
  }
  return null;
}

/** Data codewords of `bytes` for `version`: header, bytes, terminator, padding. */
export function dataCodewords(bytes: readonly number[], version: number): number[] {
  const [per, , blocks] = BLOCKS_M[version];
  const total = per * blocks;
  const bits: number[] = [];
  const put = (value: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, 8);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, total * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; out.length < total; pad = pad === 0xec ? 0x11 : 0xec) out.push(pad);
  return out;
}

/** Data and EC codewords interleaved as they are laid in the symbol. */
export function interleave(data: readonly number[], version: number): number[] {
  const [per, ec, blocks] = BLOCKS_M[version];
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  for (let b = 0; b < blocks; b++) {
    const d = data.slice(b * per, (b + 1) * per);
    dataBlocks.push(d);
    ecBlocks.push(reedSolomon(d, ec));
  }
  const out: number[] = [];
  for (let i = 0; i < per; i++) for (const d of dataBlocks) out.push(d[i]);
  for (let i = 0; i < ec; i++) for (const e of ecBlocks) out.push(e[i]);
  return out;
}

// ---------- the matrix ----------

/** The 15 format bits for level M and `mask` (BCH(15,5), masked with 101010000010010). */
export function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask; // level M is 00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | (rem & 0x3ff)) ^ 0x5412;
}

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

type Grid = { size: number; dark: boolean[][]; fixed: boolean[][] };

function newGrid(size: number): Grid {
  return { size, dark: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)), fixed: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)) };
}

function setFixed(g: Grid, r: number, c: number, dark: boolean) {
  if (r < 0 || c < 0 || r >= g.size || c >= g.size) return;
  g.dark[r][c] = dark;
  g.fixed[r][c] = true;
}

function finder(g: Grid, top: number, left: number) {
  // The 7x7 finder and its one-module separator ring.
  for (let dr = -1; dr <= 7; dr++) {
    for (let dc = -1; dc <= 7; dc++) {
      const inside = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
      const ring = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
      setFixed(g, top + dr, left + dc, inside && ring !== 2);
    }
  }
}

function patterns(version: number): Grid {
  const size = 17 + 4 * version;
  const g = newGrid(size);
  finder(g, 0, 0);
  finder(g, 0, size - 7);
  finder(g, size - 7, 0);
  for (let i = 8; i < size - 8; i++) {
    setFixed(g, 6, i, i % 2 === 0);
    setFixed(g, i, 6, i % 2 === 0);
  }
  const a = ALIGN[version];
  if (a !== null) {
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) setFixed(g, a + dr, a + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }
  // The format areas are reserved (drawn per mask), and the one dark module.
  for (let i = 0; i < 9; i++) {
    if (!g.fixed[8][i]) setFixed(g, 8, i, false);
    if (!g.fixed[i][8]) setFixed(g, i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    setFixed(g, 8, size - 1 - i, false);
    setFixed(g, size - 1 - i, 8, false);
  }
  setFixed(g, size - 8, 8, true);
  return g;
}

function placeData(g: Grid, codewords: readonly number[]) {
  const bits: boolean[] = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) bits.push(((cw >>> i) & 1) === 1);
  let k = 0;
  let up = true;
  for (let right = g.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let n = 0; n < g.size; n++) {
      const r = up ? g.size - 1 - n : n;
      for (let c = right; c >= right - 1; c--) {
        if (g.fixed[r][c]) continue;
        g.dark[r][c] = k < bits.length ? bits[k] : false;
        k++;
      }
    }
    up = !up;
  }
}

function drawFormat(dark: boolean[][], size: number, mask: number) {
  const f = formatBits(mask);
  const bit = (i: number) => ((f >>> i) & 1) === 1;
  // dark[row][column]. First copy: down column 8 from the top (bits 0-8),
  // then left along row 8 (bits 9-14). Second copy: along row 8 from the
  // right edge (bits 0-7), then down column 8 near the bottom (bits 8-14).
  for (let i = 0; i <= 5; i++) dark[i][8] = bit(i);
  dark[7][8] = bit(6);
  dark[8][8] = bit(7);
  dark[8][7] = bit(8);
  for (let i = 9; i < 15; i++) dark[8][14 - i] = bit(i);
  for (let i = 0; i < 8; i++) dark[8][size - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) dark[size - 15 + i][8] = bit(i);
  dark[size - 8][8] = true;
}

/** The standard penalty score (ISO 18004 section 8.8.2): lower is better. */
export function penalty(dark: boolean[][]): number {
  const n = dark.length;
  let score = 0;
  const run = (line: boolean[]) => {
    let s = 0;
    let len = 1;
    for (let i = 1; i <= line.length; i++) {
      if (i < line.length && line[i] === line[i - 1]) len++;
      else {
        if (len >= 5) s += 3 + (len - 5);
        len = 1;
      }
    }
    return s;
  };
  const finderLike = (line: boolean[]) => {
    let s = 0;
    const a = [true, false, true, true, true, false, true, false, false, false, false];
    const b = [false, false, false, false, true, false, true, true, true, false, true];
    for (let i = 0; i + 11 <= line.length; i++) {
      let ma = true;
      let mb = true;
      for (let j = 0; j < 11; j++) {
        if (line[i + j] !== a[j]) ma = false;
        if (line[i + j] !== b[j]) mb = false;
      }
      if (ma) s += 40;
      if (mb) s += 40;
    }
    return s;
  };
  for (let r = 0; r < n; r++) {
    const row = dark[r];
    const col = dark.map((x) => x[r]);
    score += run(row) + run(col) + finderLike(row) + finderLike(col);
  }
  for (let r = 0; r + 1 < n; r++) {
    for (let c = 0; c + 1 < n; c++) {
      const v = dark[r][c];
      if (v === dark[r][c + 1] && v === dark[r + 1][c] && v === dark[r + 1][c + 1]) score += 3;
    }
  }
  let count = 0;
  for (const row of dark) for (const v of row) if (v) count++;
  const percent = (count * 100) / (n * n);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

export type QrCode = { version: number; size: number; mask: number; modules: boolean[][] };

/**
 * `text` (UTF-8) as a QR symbol, byte mode, level M. Throws when it is longer
 * than 62 bytes (this encoder stops at version 4). `forceMask` skips the
 * penalty search (tests).
 */
export function encodeQr(text: string, forceMask?: number): QrCode {
  const bytes = Array.from(new TextEncoder().encode(text));
  const version = versionFor(bytes.length);
  if (version === null) throw new Error(`QR: ${bytes.length} bytes does not fit versions 1 to 4`);
  const codewords = interleave(dataCodewords(bytes, version), version);
  const base = patterns(version);
  placeData(base, codewords);
  let best: { mask: number; dark: boolean[][]; score: number } | null = null;
  for (let mask = 0; mask < 8; mask++) {
    if (forceMask !== undefined && mask !== forceMask) continue;
    const dark = base.dark.map((row) => row.slice());
    for (let r = 0; r < base.size; r++) for (let c = 0; c < base.size; c++) if (!base.fixed[r][c] && MASKS[mask](r, c)) dark[r][c] = !dark[r][c];
    drawFormat(dark, base.size, mask);
    const score = penalty(dark);
    if (!best || score < best.score) best = { mask, dark, score };
  }
  const chosen = best as { mask: number; dark: boolean[][]; score: number };
  return { version, size: base.size, mask: chosen.mask, modules: chosen.dark };
}

/** The dark modules as rows of "1" and "0", for tests. */
export function qrRows(code: QrCode): string[] {
  return code.modules.map((row) => row.map((v) => (v ? "1" : "0")).join(""));
}
