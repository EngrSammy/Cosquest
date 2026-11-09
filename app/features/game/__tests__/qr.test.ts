// The friend code's QR encoder (qr.ts), against ISO/IEC 18004 vectors and an
// independent encoder. The golden symbol below is bit-for-bit what segno 1.6.6
// makes for the same text at level M, version 2, mask 3; every symbol in the
// "scans" list was also decoded back to its text with OpenCV 5.0.0's
// QRCodeDetector when this file was written (2026-10-20). segno pads one zero
// byte more after the terminator for short texts, so it is not compared there:
// both are valid and decode the same.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { dataCodewords, encodeQr, formatBits, qrRows, reedSolomon, versionFor } from "../qr.ts";

describe("QR encoder (friend code, FriendsFeature.swift qrImage)", () => {
  it("Reed-Solomon matches the standard's version 1-M example", () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    assert.deepEqual(reedSolomon(data, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });

  it("format bits for level M, all eight masks (ISO 18004 table C.1)", () => {
    const want = ["101010000010010", "101000100100101", "101111001111100", "101101101001011", "100010111111001", "100000011001110", "100111110010111", "100101010100000"];
    assert.deepEqual(
      want.map((_, m) => formatBits(m).toString(2).padStart(15, "0")),
      want,
    );
  });

  it("byte mode: mode, count, bytes, terminator, then 0xEC 0x11", () => {
    assert.deepEqual(dataCodewords([...new TextEncoder().encode("ABC234")], 1), [64, 100, 20, 36, 51, 35, 51, 64, 236, 17, 236, 17, 236, 17, 236, 17]);
    assert.equal(versionFor(6), 1);
    assert.equal(versionFor(14), 1);
    assert.equal(versionFor(15), 2);
    assert.equal(versionFor(62), 4);
    assert.equal(versionFor(63), null);
    assert.throws(() => encodeQr("x".repeat(63)));
  });

  it("draws the same symbol as an independent encoder (segno), format bits included", () => {
    assert.deepEqual(qrRows(encodeQr("HELLO-COSQUEST-FRIEND-1234", 3)), [
      "1111111010000101101111111",
      "1000001010011010001000001",
      "1011101001011111101011101",
      "1011101010001011101011101",
      "1011101000100010101011101",
      "1000001001010110101000001",
      "1111111010101010101111111",
      "0000000011011001100000000",
      "1011011100011110101001011",
      "1011010001101101111100101",
      "0110111111001100110100000",
      "1001110001110100010101110",
      "1111111011101010011101011",
      "0101000001110011000111110",
      "0100001101000110110010110",
      "1011100110100001111110001",
      "0010011000011110111110011",
      "0000000010010001100011000",
      "1111111010100011101010111",
      "1000001011000001100010011",
      "1011101001101000111110001",
      "1011101010111010111000111",
      "1011101010110010010111010",
      "1000001000110111110011100",
      "1111111010000100011001011",
    ]);
  });

  it("puts the format bits where a reader looks: column 8 down from the top, row 8 from the right", () => {
    for (const mask of [0, 2, 5, 7]) {
      const q = encodeQr("ABC234", mask);
      const f = formatBits(mask);
      const bit = (i: number) => ((f >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) assert.equal(q.modules[i][8], bit(i), `mask ${mask} bit ${i}`);
      assert.equal(q.modules[8][q.size - 1], bit(0));
      assert.equal(q.modules[q.size - 1][8], bit(14));
      assert.equal(q.modules[q.size - 8][8], true, "the dark module");
    }
  });

  it("scans: versions 1 to 4 (decoded with OpenCV when written)", () => {
    const scans: [string, number][] = [
      ["ABC234", 1],
      ["XK7QPZ", 1],
      ["HELLO-COSQUEST-FRIEND-1234", 2],
      ["https://costquest.example/friend?code=ABC234&x=1", 4],
      ["x".repeat(62), 4],
    ];
    for (const [text, version] of scans) {
      const q = encodeQr(text);
      assert.equal(q.version, version, text);
      assert.equal(q.size, 17 + 4 * version);
    }
  });
});
